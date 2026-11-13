// Unit tests use small hand-written inputs shaped like each vendor's documented response.
// They test parsing and scoring only; none of this data is ever stored or shown as a real job.
import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.DB = ':memory:';
const { match, category, parseExp, expLevel } = await import('./match.ts');
const { robotsAllows } = await import('./robots.ts');
const { canonicalUrl, htmlToText } = await import('./text.ts');
const { toJob } = await import('./pipeline.ts');
const db = await import('./db.ts');
const { mapGreenhouse, mapLever, mapAshby, mapSmartRecruiters, titleRelevant } = await import('./adapters/ats.ts');
const { extractJobPostings, postingToJob } = await import('./adapters/portals.ts');
const { normalizeProfile } = await import('./resume.ts');
const { parseLocal } = await import('./localResume.ts');

const profile = normalizeProfile({
  name: 'T', totalExperienceYears: 4, currentDesignation: 'Frontend Developer', previousDesignations: ['Web Developer'],
  skills: { frontend: ['React', 'TypeScript', 'CSS'], backend: ['Node.js'], databases: ['PostgreSQL'], cloud: ['AWS'] },
  targetRoles: ['Frontend Engineer'], summary: 'Builds React dashboards and Node.js APIs.', projects: [{ name: 'Dash', description: 'React dashboard', tech: ['React'] }],
});
const prefs = { roles: ['Frontend Engineer'], locations: ['Bangalore'], workModes: [], minScore: 60, blocklist: ['acme'], companies: [] } as any;

test('score categories follow the spec', () => {
  assert.equal(category(95), 'Excellent match'); assert.equal(category(80), 'Strong match'); assert.equal(category(70), 'Good match');
  assert.equal(category(60), 'Moderate match'); assert.equal(category(59), 'Low match');
});
test('strong match scores high, unrelated job scores low, no skill is invented', () => {
  const good = match(profile, prefs, { title: 'Senior Frontend Developer', location: 'Bangalore', workMode: '', text: 'Build React and TypeScript dashboards with Node.js APIs. 3-6 years experience. Kubernetes a plus.' });
  assert.ok(good.score >= 80, `got ${good.score}`);
  assert.deepEqual(good.matched.sort(), ['node.js', 'react', 'typescript']);
  assert.deepEqual(good.missing, ['kubernetes']);
  const bad = match(profile, prefs, { title: 'Embedded Firmware Engineer', location: 'Berlin', workMode: '', text: 'C++ and Rust firmware for microcontrollers. 10+ years experience.' });
  assert.ok(bad.score < 40, `got ${bad.score}`);
});
test('experience parsing', () => {
  assert.deepEqual(parseExp('3-5 years'), { min: 3, max: 5 }); assert.deepEqual(parseExp('5+ yrs'), { min: 5, max: null });
  assert.deepEqual(parseExp('none'), { min: null, max: null }); assert.equal(expLevel(4), 'Mid (3-5 yrs)');
});
test('robots.txt: longest rule wins, other agents ignored', () => {
  const r = 'User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /search\nAllow: /search/public\n';
  assert.equal(robotsAllows(r, '/search?q=x'), false); assert.equal(robotsAllows(r, '/search/public/1'), true); assert.equal(robotsAllows(r, '/jobs'), true);
  assert.equal(robotsAllows('User-agent: *\nDisallow: /', '/anything'), false);
});
test('canonical url strips tracking and fragments but keeps job ids', () => {
  assert.equal(canonicalUrl('https://Jobs.Co/careers/1/?utm_source=x&gh_jid=77#apply'), 'https://jobs.co/careers/1?gh_jid=77');
});
test('pipeline rejects jobs without a verifiable https url or company', () => {
  const raw = { source: 'S', sourceKind: 'career' as const, title: 'Frontend Engineer', company: 'Co', location: 'Bangalore', url: 'https://x.co/j/1', description: 'React' };
  assert.equal(typeof toJob(raw, profile, prefs), 'object');
  assert.equal(toJob({ ...raw, url: '' }, profile, prefs), 'no verifiable https url');
  assert.equal(toJob({ ...raw, url: 'javascript:alert(1)' }, profile, prefs), 'no verifiable https url');
  assert.equal(toJob({ ...raw, company: '' }, profile, prefs), 'missing title/company');
  assert.equal(toJob({ ...raw, company: 'Acme Inc' }, profile, prefs), 'blocklisted');
});
test('dedupe by company+title+location and by canonical url', () => {
  const mk = (url: string, title = 'Frontend Engineer') => toJob({ source: 'S', sourceKind: 'career', title, company: 'Co', location: 'Pune', url, description: 'React' }, profile, prefs) as any;
  assert.equal(db.addJob(mk('https://a.co/j/1')), 'added');
  assert.equal(db.addJob(mk('https://other-portal.com/x/9')), 'duplicate'); // same company/title/location, different url
  assert.equal(db.addJob(mk('https://a.co/j/1?utm_source=z', 'Different Title')), 'duplicate'); // same canonical url
  assert.equal(db.listJobs().length, 1);
  db.setStatus(db.listJobs()[0].id, 'applied'); assert.equal(db.listJobs()[0].status, 'applied');
});
test('career-page mappers', () => {
  const c = { ats: 'greenhouse', token: 't', name: 'Co' } as const;
  const g = mapGreenhouse({ jobs: [{ title: 'FE', absolute_url: 'https://g/1', location: { name: 'Pune' }, content: '&lt;p&gt;React&lt;/p&gt;', updated_at: '2026-01-02T00:00:00Z' }] }, c)[0];
  assert.equal(g.url, 'https://g/1'); assert.equal(htmlToText(g.description), 'React');
  const l = mapLever([{ text: 'BE', hostedUrl: 'https://l/1', categories: { location: 'Remote' }, descriptionPlain: 'Node', createdAt: 1700000000000 }], c)[0];
  assert.equal(l.url, 'https://l/1'); assert.ok(l.postedAt!.startsWith('2023'));
  const a = mapAshby({ jobs: [{ title: 'ML', jobUrl: 'https://a/1', location: 'Remote', isRemote: true, descriptionPlain: 'py' }] }, c)[0];
  assert.equal(a.workMode, 'remote');
  const s = mapSmartRecruiters({ name: 'QA', location: { fullLocation: 'Pune, IN' }, releasedDate: '2026-01-01T00:00:00Z' }, { postingUrl: 'https://s/1', jobAd: { sections: { jobDescription: { text: 'Selenium' } } } }, c);
  assert.equal(s.url, 'https://s/1'); assert.equal(s.description, 'Selenium');
  assert.ok(titleRelevant('Senior Frontend Engineer', ['Frontend Developer'])); assert.ok(!titleRelevant('Accountant', ['Frontend Developer']));
});
test('portal JSON-LD extraction', () => {
  const ld = JSON.stringify({ '@graph': [{ '@type': 'JobPosting', title: 'FE', url: 'https://p/1', hiringOrganization: { name: 'Co' }, jobLocation: { address: { addressLocality: 'Pune', addressCountry: 'IN' } }, datePosted: '2026-01-01', validThrough: '2026-02-01', description: 'x' }, { '@type': 'Organization' }] });
  const [p] = extractJobPostings([ld, '{bad json']);
  const j = postingToJob(p, 'Foundit')!;
  assert.equal(j.company, 'Co'); assert.equal(j.location, 'Pune, IN'); assert.equal(j.deadline, '2026-02-01');
  assert.equal(postingToJob({ title: 'x', hiringOrganization: { name: 'c' } }, 'F')!.url, '');
});

test('free local resume parser extracts only what the text contains', () => {
  const p = parseLocal(`Asha Rao\nBangalore | asha@x.com\nSenior Frontend Developer, Acme   Jan 2019 - Present\nWeb Developer, Beta   2017 - 2018\nReact, TypeScript, Node.js, PostgreSQL, AWS\nB.Tech Computer Science 2013 - 2017\nCertifications\nAWS Cloud Practitioner`, new Date('2024-01-01'));
  assert.equal(p.name, 'Asha Rao'); assert.equal(p.location, 'Bangalore');
  assert.equal(p.currentDesignation, 'Senior Frontend Developer'); assert.deepEqual(p.previousDesignations, ['Web Developer']);
  assert.equal(p.totalExperienceYears, 7); // 2017 to 2024, education range ignored
  assert.deepEqual([...p.allSkills].sort(), ['aws', 'node.js', 'postgresql', 'react', 'typescript']);
  assert.ok(!p.allSkills.includes('python')); // nothing invented
  assert.deepEqual(p.certifications, ['AWS Cloud Practitioner']);
});
