// Fixtures are small hand-written pages shaped like what each portal is believed to serve. They test the
// extraction logic only; none of this data is ever stored or shown as a real job.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { extract, diagnose } = require('./sites.js');

const run = (url, html) => { const d = new JSDOM(html, { url }); return { doc: d.window.document, loc: d.window.location }; };

test('portal selectors capture title, company, location, experience, skills and absolute url', () => {
  const { doc, loc } = run('https://www.naukri.com/react-jobs', `<div class="srp-jobtuple-wrapper"><a class="title" href="/job-listings-react-dev-acme-pune-1">React Dev</a><a class="comp-name">Acme</a><span class="loc-wrap">Pune</span><span class="exp-wrap">3-5 Yrs</span><ul class="tags-gt"><li>React</li><li>TypeScript</li></ul></div>`);
  const { jobs, via } = extract(doc, loc);
  assert.deepEqual(jobs[0], { source: 'naukri', title: 'React Dev', url: 'https://www.naukri.com/job-listings-react-dev-acme-pune-1', company: 'Acme', location: 'Pune', exp: '3-5 Yrs', salary: '', skills: ['React', 'TypeScript'], description: '' });
  assert.equal(via.cards, 1);
});
test('generic fallback finds job links when selectors miss, one job per card', () => {
  const { doc, loc } = run('https://www.hirist.tech/search/react', `<ul><li class="x"><a href="/j/react-dev-123">React Developer</a><div>Beta Corp</div><div>Bengaluru, India</div><div>2-4 yrs</div><button>Save</button></li><li class="x"><a href="/j/node-dev-456?utm=1">Node Developer</a><div>Gamma</div></li><li><a href="/about">About us</a></li></ul>`);
  const { jobs, via } = extract(doc, loc);
  assert.equal(via.generic, 2); assert.equal(jobs.length, 2);
  assert.equal(jobs[0].company, 'Beta Corp'); assert.equal(jobs[0].location, 'Bengaluru, India'); assert.equal(jobs[0].exp, '2-4 yrs');
  assert.equal(jobs[1].url, 'https://www.hirist.tech/j/node-dev-456?utm=1');
});
test('JSON-LD job posting on a detail page keeps the full description', () => {
  const ld = JSON.stringify({ '@type': 'JobPosting', title: 'SRE', description: '<p>Run things</p>', hiringOrganization: { name: 'Co' }, jobLocation: { address: { addressLocality: 'Pune' } }, validThrough: '2026-12-01' });
  const { doc, loc } = run('https://www.naukri.com/job-listings-sre-co-pune-9', `<script type="application/ld+json">${ld}</script>`);
  const j = extract(doc, loc).jobs[0];
  assert.equal(j.url, 'https://www.naukri.com/job-listings-sre-co-pune-9'); assert.equal(j.description, '<p>Run things</p>'); assert.equal(j.deadline, '2026-12-01');
});
test('unsupported host and empty page capture nothing; diagnose reports structure without page text', () => {
  const a = run('https://example.com/', '<p>hi</p>'); assert.equal(extract(a.doc, a.loc).jobs.length, 0);
  const b = run('https://www.naukri.com/x', `<div class="srp-jobtuple-wrapper"><a class="title" href="/job-listings-a-1">Secret Title</a></div>`);
  const d = diagnose(b.doc, b.loc);
  assert.match(d, /selector cards: 1/); assert.match(d, /\[12c\]/); assert.ok(!d.includes('Secret Title'));
});
