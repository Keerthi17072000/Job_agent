// End-to-end test on the BUILT site (npm run build first). Every job source is mocked with fixtures that live only in this file;
// nothing here is ever shipped or shown as a real job. Run: npm run e2e   (CHROMIUM=/path/to/chrome to use a specific browser)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const DIST = path.resolve('web/dist');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.zip': 'application/zip' };
const server = http.createServer((req, res) => {
  const f = path.join(DIST, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
  if (!f.startsWith(DIST) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] ?? 'application/octet-stream' }); res.end(fs.readFileSync(f));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

const JD = '<p>Requirements: React, TypeScript. 3-8 years of experience. Bachelor degree. Build dashboards.</p>';
const json = body => ({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
async function mockSources(page, { nurse = false } = {}) {
  await page.route(/remotive\.com/, r => r.fulfill(json({ jobs: nurse ? [] : [{ id: 1, url: 'https://remotive.com/remote-jobs/fe-1', title: 'Frontend Developer', company_name: 'RemoCo', candidate_required_location: 'Remote', publication_date: '2026-11-10T00:00:00', description: JD, salary: '$60k' }] })));
  await page.route(/arbeitnow\.com/, r => r.fulfill(json({ links: {}, data: nurse ? [] : [{ slug: 'fe-x', title: 'Frontend Developer', company_name: 'RemoCo', location: 'Remote', remote: true, url: 'https://www.arbeitnow.com/jobs/fe-x', description: JD, created_at: 1762700000 }] })));
  await page.route(/jobicy\.com/, r => r.fulfill({ status: 500, body: 'boom' }));            // one source failing must not stop the others
  await page.route(/remoteok\.com/, r => r.fulfill(json([{ legal: 'x' }, { id: 9, url: 'https://remoteok.com/remote-jobs/9', position: 'Staff Nurse Educator', company: 'MedCo', description: 'Patient care and training. 5+ years.', location: 'Remote' }])));
  await page.route(/boards-api\.greenhouse\.io/, r => r.fulfill(json({ jobs: [{ id: 1, title: 'Frontend Engineer', absolute_url: 'https://boards.greenhouse.io/testco/jobs/1', location: { name: 'Pune' }, content: '' }] }))); // no description
}

const RESUME_DEV = `Asha Rao\nBangalore | asha@example.com\nSummary\nFrontend developer.\nSkills\nReact, TypeScript, CSS\nExperience\nFrontend Developer, Acme   Jan 2019 - Present\n- Built dashboards\nEducation\nB.Tech Computer Science, Anna University 2018`;
const RESUME_NURSE = `Priya Nair\nKochi, Kerala\nSKILLS\nPatient care, IV cannulation, Infection control\nWORK EXPERIENCE\nStaff Nurse - City Hospital  Mar 2018 - Present\nEDUCATION\nB.Sc Nursing, Kerala University 2017`;
const file = (name, text, mimeType = 'text/plain') => ({ name, mimeType, buffer: Buffer.from(text) });

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
let failed = 0;
const test = async (name, fn) => {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } }), page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  try { await mockSources(page); await fn(page, ctx); assert.deepEqual(errors, [], 'console errors'); console.log('ok  -', name); }
  catch (e) { failed++; console.log('FAIL-', name, '\n    ', e.message.split('\n').slice(0, 6).join(' | ')); await page.screenshot({ path: `e2e-fail-${failed}.png` }).catch(() => {}); }
  finally { await ctx.close(); }
};
const toast = page => page.locator('[role=status]');
const upload = async (page, f) => page.setInputFiles('#resume', f);
const uploadAndSearch = async (page, f, who) => { await upload(page, f); await page.waitForSelector(`text=Hello, ${who}`); await toast(page).filter({ hasText: 'Search complete' }).waitFor({ timeout: 60000 }); }; // an upload searches by itself
const home = async page => { await page.goto(BASE); await page.waitForSelector('h1'); };

await test('invalid, empty and unsupported resumes are rejected with a clear message', async page => {
  await home(page);
  await upload(page, file('empty.txt', '')); await toast(page).filter({ hasText: 'empty' }).waitFor();
  await upload(page, file('old.doc', 'x')); await toast(page).filter({ hasText: 'Old .doc' }).waitFor();
  await upload(page, file('fake.pdf', 'not a pdf')); await toast(page).filter({ hasText: 'not a valid PDF' }).waitFor();
  await upload(page, file('tiny.txt', 'hi')); await toast(page).filter({ hasText: 'No readable text' }).waitFor();
  await page.waitForSelector('text=Upload your resume, get matched');
});

await test('upload, edit profile, search with a failing source, dedupe, save, track, persist', async page => {
  await home(page); await uploadAndSearch(page, file('asha.txt', RESUME_DEV), 'Asha');
  await page.goto(BASE + '#/profile'); await page.waitForSelector('text=Review your profile');
  assert.equal(await page.locator('label', { hasText: /^Name/ }).locator('input').inputValue(), 'Asha Rao');
  await page.locator('[aria-label="Add item"]').last().fill('Figma'); await page.keyboard.press('Enter');
  await page.click('button:has-text("Confirm and update matches")'); await toast(page).filter({ hasText: 'Profile confirmed' }).waitFor();
  await page.goto(BASE + '#/settings'); await page.waitForSelector('text=Matching and search');
  await page.locator('textarea').first().fill('greenhouse:testco'); await page.click('button:has-text("Save settings")'); await toast(page).filter({ hasText: 'Preferences saved' }).waitFor();
  await page.goto(BASE + '#/overview'); await page.click('button:has-text("Search")'); await toast(page).filter({ hasText: 'Searching all sources' }).waitFor(); await toast(page).filter({ hasText: 'Search complete' }).waitFor({ timeout: 60000 }); // the first search's message must not satisfy this wait
  await page.goto(BASE + '#/sources'); await page.waitForSelector('text=Job sources');
  const card = n => page.locator('section[aria-label="Automatic sources"] > div').filter({ hasText: n });
  await card('Jobicy').locator('text=Error').waitFor(); assert.match(await card('Jobicy').innerText(), /HTTP 500/);   // failure reported, not hidden
  await card('Remotive').getByText(/^\d+ listings?$/).waitFor(); await card('Company career pages').getByText(/^\d+ listings?$/).waitFor();
  await card('Adzuna').locator('text=Needs setup').waitFor();                                                          // unconfigured source is not pretended to work
  await page.goto(BASE + '#/jobs'); await page.waitForSelector('a:has-text("Apply")');
  await page.locator('select[aria-label="Minimum match"]').selectOption('0');
  assert.equal(await page.locator('a:has-text("Frontend Developer")').count(), 1, 'same vacancy from two sources must collapse');
  const href = await page.locator('a:has-text("Apply")').first().getAttribute('href');
  assert.ok(/^https:\/\//.test(href), 'original link is https');
  await page.locator('a.font-extrabold', { hasText: 'Frontend Developer' }).first().click(); await page.waitForSelector('text=Resume suitability');
  assert.ok(await page.locator('a:has-text("Remotive")').count() && await page.locator('a:has-text("Arbeitnow")').count(), 'both source links kept');
  await page.click('button:has-text("Save job")'); await page.waitForSelector('button:has-text("Saved")');
  await page.selectOption('select[aria-label=Status]', 'applied'); await page.fill('textarea[aria-label=Notes]', 'Call HR'); await page.locator('textarea[aria-label=Notes]').blur(); await page.waitForTimeout(300);
  await page.reload(); await page.goto(BASE + '#/applications'); await page.waitForSelector('text=Call HR');
  await page.goto(BASE + '#/saved'); await page.waitForSelector('text=Saved jobs'); assert.ok(await page.locator('a.font-extrabold').count() >= 1);
  await page.goto(BASE + '#/jobs'); await page.locator('select[aria-label="Minimum match"]').selectOption('0');
  await page.waitForSelector('text=Frontend Engineer'); // the posting with no description still shows, with a clear message in its details
  await page.locator('a.font-extrabold', { hasText: 'Frontend Engineer' }).first().click(); await page.waitForSelector('text=did not provide a description');
});

await test('different profession: a nurse resume produces nurse queries, no developer terms', async page => {
  await home(page); await uploadAndSearch(page, file('priya.txt', RESUME_NURSE), 'Priya');
  const q = await page.locator('text=Searching for:').locator('..').innerText();
  assert.match(q, /Staff Nurse/); assert.doesNotMatch(q, /developer|react|engineer/i);
  await page.goto(BASE + '#/jobs'); await page.locator('select[aria-label="Minimum match"]').selectOption('0'); await page.waitForSelector('text=Staff Nurse Educator');
});

await test('uploading a different resume replaces roles and results, keeps tracked jobs, names the profile, and searches by itself', async page => {
  await home(page); await uploadAndSearch(page, file('asha.txt', RESUME_DEV), 'Asha');
  assert.match(await page.locator('header').innerText(), /Asha Rao/);                    // profile is named after the person, not "My profile"
  await page.goto(BASE + '#/jobs'); await page.locator('select[aria-label="Minimum match"]').selectOption('0'); await page.waitForSelector('a:has-text("Frontend Developer")');
  await page.locator('a.font-extrabold', { hasText: 'Frontend Developer' }).first().click(); await page.waitForSelector('text=Resume suitability');
  await page.click('button:has-text("Save job")'); await page.waitForSelector('button:has-text("Saved")');           // tracked job must survive
  await page.goto(BASE + '#/overview'); await uploadAndSearch(page, file('priya.txt', RESUME_NURSE), 'Priya');
  assert.match(await page.locator('header').innerText(), /Priya Nair/);
  const q = await page.locator('text=Searching for:').locator('..').innerText(); assert.match(q, /Staff Nurse/); assert.doesNotMatch(q, /Frontend|React/i);
  await page.goto(BASE + '#/jobs'); await page.locator('select[aria-label="Minimum match"]').selectOption('0'); await page.waitForSelector('text=Staff Nurse Educator');
  assert.equal(await page.locator('a.font-extrabold', { hasText: 'Frontend Engineer' }).count(), 0, 'untracked results of the old resume are gone');
  await page.goto(BASE + '#/saved'); await page.waitForSelector('a.font-extrabold:has-text("Frontend Developer")');
});

await test('two profiles on one browser are isolated; switching restores each', async page => {
  await home(page); await uploadAndSearch(page, file('asha.txt', RESUME_DEV), 'Asha');
  await page.goto(BASE + '#/settings'); await page.waitForSelector('text=Profiles on this browser');
  await page.fill('input[aria-label="New profile name"]', 'Second person'); await page.click('button:has-text("Add")'); await page.waitForSelector('text=Second person');
  await page.goto(BASE + '#/overview'); await page.waitForSelector('text=Upload your resume, get matched'); // fresh slot: no resume, no jobs
  await page.goto(BASE + '#/jobs'); await page.waitForSelector('text=Upload your resume first');
  await page.goto(BASE + '#/settings'); await page.locator('li', { hasText: 'Asha Rao' }).locator('button:has-text("Switch")').click();
  await page.goto(BASE + '#/overview'); await page.waitForSelector('text=Hello, Asha');
});

await test('data saved by an older version of the app loads without errors and is upgraded', async page => {
  await home(page);
  await page.evaluate(() => {   // the shapes the first version stored in localStorage
    localStorage.setItem('ja.profile', JSON.stringify({ name: 'Old User', totalExperienceYears: 4, currentDesignation: 'Dev', previousDesignations: [], skills: { frontend: ['react'], backend: [], frameworks: [], libraries: [], databases: [], cloud: [], aiMl: [], other: [] }, allSkills: ['react'], projects: [], education: [], certifications: [], location: 'Pune', targetRoles: ['Frontend Developer'], summary: '' }));
    localStorage.setItem('ja.prefs', JSON.stringify({ roles: ['Frontend Developer'], locations: ['Pune'], workModes: [], minScore: 60, blocklist: [], companies: [] }));
    localStorage.setItem('ja.jobs', JSON.stringify([{ id: 'abc123', fingerprint: 'x', canonicalUrl: 'https://a.co/1', url: 'https://a.co/1', source: 'Remotive', sourceKind: 'portal', title: 'Frontend Developer', company: 'Co', location: 'Remote', workMode: 'remote', expMin: 3, expMax: 5, expLevel: 'Mid (3-5 yrs)', salary: '', summary: 's', description: 'React', requiredSkills: ['react'], matchedSkills: ['react'], missingSkills: [], score: 80, category: 'Strong match', reasons: ['r'], breakdown: { skills: 1, title: 1, experience: 1, responsibilities: 1, location: 1 }, postedAt: '', deadline: '', status: 'new', firstSeen: new Date().toISOString() }]));
  });
  await page.reload(); await page.waitForSelector('text=Hello, Old');
  for (const r of ['overview', 'jobs', 'profile', 'sources', 'settings', 'applications']) { await page.goto(BASE + '#/' + r); await page.waitForTimeout(300); assert.equal(await page.locator('text=Something went wrong').count(), 0, r); assert.doesNotMatch(await page.locator('body').innerText(), /Cannot read properties/); }
  await page.goto(BASE + '#/jobs'); await page.locator('select[aria-label="Minimum match"]').selectOption('0'); await page.waitForSelector('a:has-text("Frontend Developer")');
  await page.locator('a.font-extrabold', { hasText: 'Frontend Developer' }).first().click(); await page.waitForSelector('text=Resume suitability');
});

await test('without the extension, portals say so and their search buttons are disabled', async page => {
  await home(page); await uploadAndSearch(page, file('asha.txt', RESUME_DEV), 'Asha');
  await page.goto(BASE + '#/sources'); await page.getByText('Extension not detected').waitFor({ timeout: 8000 });
  assert.ok(await page.locator('li', { hasText: 'Naukri' }).locator('button:has-text("Search")').isDisabled());
  await page.goto(BASE + '#/profile'); await page.locator('summary', { hasText: 'Text read from your resume' }).click(); await page.waitForSelector('pre:has-text("Frontend developer")');
});

await test('ATS section: score, edit on the template, switch template, download Word and PDF, re-upload both', async page => {
  await home(page); await uploadAndSearch(page, file('asha.txt', RESUME_DEV), 'Asha');
  await page.goto(BASE + '#/resume'); await page.waitForSelector('text=ATS score');
  const score = async () => +(await page.locator('[aria-label$="percent match"]').first().getAttribute('aria-label')).split(' ')[0];
  const before = await score(); assert.ok(before > 0 && before < 100, `score ${before}`);
  assert.match(await page.locator('li', { hasText: 'Contact details' }).innerText(), /phone/);               // the missing phone is called out
  const edit = async (label, text) => { const f = page.getByRole('textbox', { name: label, exact: true }).first(); await f.click(); await page.keyboard.press('Control+A'); await page.keyboard.type(text); await f.blur(); };
  await edit('Phone', '+91 98765 43210'); await edit('Your name', 'Asha R Rao');
  await page.waitForFunction(b => +document.querySelector('[aria-label$="percent match"]').getAttribute('aria-label').split(' ')[0] > b, before); // score rises live
  assert.equal(await page.getByRole('radio').count(), 6);
  for (const t of ['Banner', 'Elegant', 'Compact', 'Minimal', 'Classic', 'Modern']) { await page.getByRole('radio', { name: t }).click(); await page.waitForSelector(`article.tpl-${t.toLowerCase()}`); } // clicking a preview applies it
  assert.match(await page.getByRole('radio', { name: 'Banner' }).locator('.tpl-thumb').innerText(), /Asha R Rao/);  // previews show your own resume
  assert.equal(await page.locator('article.tpl-modern h1').innerText(), 'Asha R Rao');                       // edits survive a template switch

  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Download Word")')]);
  assert.equal(dl.suggestedFilename(), 'Asha_R_Rao.docx');
  const docx = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ja-')), 'out.docx'); await dl.saveAs(docx);
  const pdf = docx.replace('.docx', '.pdf'); fs.writeFileSync(pdf, await page.pdf({ format: 'A4' }));
  if (process.env.KEEP_EXPORTS) { await page.getByRole('radio', { name: 'Banner' }).click(); await page.screenshot({ path: path.join(process.env.KEEP_EXPORTS, 'banner.png') }); fs.writeFileSync(path.join(process.env.KEEP_EXPORTS, 'banner.pdf'), await page.pdf({ format: 'A4', printBackground: true })); await page.getByRole('radio', { name: 'Modern' }).click(); }
  if (process.env.KEEP_EXPORTS) { fs.copyFileSync(docx, path.join(process.env.KEEP_EXPORTS, 'out.docx')); fs.copyFileSync(pdf, path.join(process.env.KEEP_EXPORTS, 'out.pdf')); await page.screenshot({ path: path.join(process.env.KEEP_EXPORTS, 'resume.png') }); }

  await page.click('button:has-text("Save changes")'); await toast(page).filter({ hasText: 'Profile confirmed' }).waitFor();
  for (const f of [docx, pdf]) {                                                                            // what we export can be uploaded again
    await page.setInputFiles('#resume', f); await toast(page).filter({ hasText: 'Search complete' }).waitFor({ timeout: 60000 });
    await page.goto(BASE + '#/resume'); await page.waitForSelector('article.resume-page');
    assert.equal(await page.locator('article h1').innerText(), 'Asha R Rao', f); assert.match(await page.locator('article .r-contact').innerText(), /98765/, f);
    assert.match(await page.locator('article').innerText(), /Frontend Developer/, f); assert.match(await page.locator('article').innerText(), /react/i, f);
    assert.match(await page.locator('article .r-bullets').first().innerText(), /Built dashboards/, f);
    assert.doesNotMatch(await page.locator('article .r-bullets').first().innerText(), /Remove role|Add role/, f); // editor buttons are not printed
  }
});

await test('phone layout has no horizontal overflow; theme toggle works', async page => {
  await page.setViewportSize({ width: 400, height: 800 }); await home(page); await upload(page, file('asha.txt', RESUME_DEV)); await page.waitForSelector('text=Hello, Asha');
  for (const r of ['overview', 'jobs', 'profile', 'sources', 'settings', 'applications', 'resume']) { await page.goto(BASE + '#/' + r); await page.waitForTimeout(300); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `overflow on ${r}`); }
  await page.click('button[aria-label^="Switch to"]'); assert.ok(await page.evaluate(() => !!document.documentElement.dataset.theme));
});

await browser.close(); server.close();
if (failed) { console.log(`${failed} e2e test(s) failed`); process.exit(1); }
console.log('all e2e tests passed');
