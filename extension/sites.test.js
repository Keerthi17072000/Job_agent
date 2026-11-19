// Fixtures are small hand-written pages shaped like what each portal is believed to serve. They test the
// extraction logic only; none of this data is ever stored or shown as a real job.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { extract, diagnose, blocked } = require('./sites.js');

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

test('blocked(): login walls and verification pages are recognised so the extension stops instead of continuing', () => {
  const a = run('https://www.linkedin.com/authwall?trk=x', '<p>Join now</p>'); assert.match(blocked(a.doc, a.loc), /login or verification/);
  const b = run('https://www.naukri.com/react-jobs', '<h1>Please verify you are human to continue</h1>'); assert.match(blocked(b.doc, b.loc), /login or verification/);
  const c = run('https://www.naukri.com/react-jobs', '<p>No jobs matched your search.</p>'); assert.equal(blocked(c.doc, c.loc), '');
});

test('any company careers page: panel is offered by address, menu links are skipped, jobs get the company from the host', () => {
  const { siteFor } = require('./sites.js');
  assert.ok(siteFor('www.zoho.com', '/careers/')); assert.ok(siteFor('careers.acme.com', '/')); assert.equal(siteFor('www.example.com', '/blog'), null);
  const { doc, loc } = run('https://www.zoho.com/careers/', `<nav><a href="/careers/">Careers</a><a href="/about">About</a></nav><div class="c"><a href="/careers/jobs/sales-exec-1">Sales Executives</a><span>INDIA</span></div><div class="c"><a href="/careers/jobs/support-eng-2">Technical Support Engineers</a><span>INDIA</span></div>`);
  const { jobs } = extract(doc, loc);
  assert.equal(jobs.length, 2); assert.equal(jobs[0].company, 'Zoho'); assert.equal(jobs[0].source, 'careers'); assert.equal(jobs[0].location, 'INDIA');
});

test('careers page whose cards are not links: repeated heading blocks become jobs, menus and filters do not', () => {
  const { doc, loc } = run('https://www.zoho.com/careers/', `<header><a href="/signup.html">Sign up</a><a href="/cpaas/">CPaaS</a></header><h2>Let's work together</h2><div class="filters"><button>All (3)</button></div>
    <div class="grid"><div class="card"><h3>TH Solution Consultant - EBS</h3><span>BANGKOK NOI, THAILAND</span><p>We are seeking a Solution Consultant to map customer requirements with product capabilities.</p></div>
    <div class="card"><h3>Technical Support Engineers</h3><span>INDIA</span><p>Provide voice-based support to international and domestic customers over the phone.</p></div>
    <div class="card"><h3>Sales Executives</h3><span>INDIA</span><p>Build rapport with contacts and understand where the prospect is in the buying process.</p></div></div><footer><h3>Zoho</h3></footer>`);
  const { jobs, via } = extract(doc, loc);
  assert.equal(via.structure, 3); assert.equal(jobs.length, 3);
  assert.deepEqual(jobs.map(j => j.title), ['TH Solution Consultant - EBS', 'Technical Support Engineers', 'Sales Executives']);
  assert.equal(jobs[0].location, 'BANGKOK NOI, THAILAND'); assert.equal(jobs[1].company, 'Zoho'); assert.match(jobs[1].description, /voice-based support/);
  assert.equal(new Set(jobs.map(j => j.url)).size, 3); assert.ok(jobs.every(j => j.url.startsWith('https://www.zoho.com/careers/?job=')));
});

test('careers page: slogan blocks that repeat more often than the jobs are ignored; titles may be plain divs', () => {
  const { doc, loc } = run('https://www.zoho.com/careers/', `<section class="values">${['Putting customers first', 'Redefining capital', 'The long-term approach', 'Personalized professionalism', 'Strength in variety'].map(v => `<div class="v"><h3>${v}</h3><p>We believe in doing the right thing for the people we work with every single day.</p></div>`).join('')}</section>
    <div class="jobs"><div class="job"><div class="t">TH Implementation Lead - Enterprise Business Solutions (EBS)</div><div class="loc"><svg></svg><span>BANGKOK NOI, THAILAND</span></div><p>The Lead - Enterprise Business Solutions (EBS) will effectively cross-collaborate with multiple stakeholders.</p></div>
    <div class="job"><div class="t">Technical Support Engineers</div><div class="loc"><svg></svg><span>INDIA</span></div><p>Provide voice-based support to international and domestic customers over the phone.</p></div>
    <div class="job"><div class="t">Sales Executives</div><div class="loc"><svg></svg><span>INDIA</span></div><p>Build rapport with contacts and understand where the prospect is in the buying process.</p></div></div>`);
  const { jobs } = extract(doc, loc);
  assert.deepEqual(jobs.map(j => j.title), ['TH Implementation Lead - Enterprise Business Solutions (EBS)', 'Technical Support Engineers', 'Sales Executives']);
  assert.equal(jobs[0].location, 'BANGKOK NOI, THAILAND'); assert.ok(!jobs.some(j => /customers first|Redefining/.test(j.title)));
  const none = run('https://www.example.com/careers/', `<div class="v"><h3>Putting customers first</h3><p>We believe in doing the right thing for people.</p></div><div class="v"><h3>Redefining capital</h3><p>We believe in doing the right thing for people.</p></div>`);
  assert.equal(extract(none.doc, none.loc).jobs.length, 0);
});

test('careers list whose cards differ in class still yields every card; same title in two places stays two jobs; toolbar-forced mode works on any host', () => {
  const card = (cls, t, l) => `<div class="${cls}"><div class="t">${t}</div><div class="loc"><svg></svg><span>${l}</span></div><p>Build rapport with contacts and understand where the prospect is in the buying process.</p></div>`;
  const { doc, loc } = run('https://careers.acme.example/', `<div class="grid">${card('card a', 'Sales Executives', 'INDIA')}${card('card a', 'Sales Executives', 'THAILAND')}${card('card b', 'Technical Support Engineers', 'INDIA')}${card('card b last', 'Account Manager', 'INDIA')}</div>`);
  const { jobs } = extract(doc, loc);
  assert.equal(jobs.length, 4); assert.equal(new Set(jobs.map(j => j.url)).size, 4);
  const { siteFor } = require('./sites.js');
  assert.equal(siteFor('www.unknown-corp.example', '/en/home'), null);
  globalThis.JobAgentForce = true; assert.ok(siteFor('www.unknown-corp.example', '/en/home')); globalThis.JobAgentForce = false;
});

test('accordion careers list: titles ending in a colon are kept (colon removed), with no place and collapsed bodies', () => {
  const item = (t, body) => `<div class="acc"><div class="head"><span>${t}</span><b>+</b></div><div class="body" style="display:none"><p>${body}</p></div></div>`;
  const { doc, loc } = run('https://www.navabrind.example/careers/', `<div class="list">${[['Odoo Developer', 'Experience: 1.5 to 6 years. Odoo core modules, Python, XML and JavaScript.'], ['Freelancing Sr. Business Development Executive:', 'Remote freelance role for lead generation and client calls.'],
    ['Fresher Python/Odoo Developer:', 'Freshers with Python knowledge can apply to this opening.'], ['SEO Analyst', 'Five to seven years of SEO experience required.'], ['ERP/Odoo Functional Consultant:', 'Gather requirements and configure Odoo modules for clients.'],
    ['ERP/Odoo Business Analyst', 'Translate business needs into functional specifications.'], ['Business Development and Sales Manager -IT/ERP', 'Own the sales pipeline for IT and ERP services.']].map(([t, b]) => item(t, b)).join('')}</div>`);
  const { jobs } = extract(doc, loc);
  assert.equal(jobs.length, 7); assert.ok(jobs.some(j => j.title === 'Fresher Python/Odoo Developer') && jobs.some(j => j.title === 'Freelancing Sr. Business Development Executive'));
  assert.ok(jobs.every(j => j.description.length > 20));
});

test('"Job Title:" prefixes are dropped, other labelled lines are not titles, and a sentence fragment is not a location', () => {
  const item = (t, extra) => `<div class="acc"><div class="head">${t}</div><div class="body"><p>${extra}</p></div></div>`;
  const { doc, loc } = run('https://www.acme.example/careers/', `<div>${item('Job Title: Trainer Python/Odoo Developer', 'Teach Python and Odoo to freshers in batches.')}${item('SEO Analyst', 'rankings, traffic, and performance')}${item('Odoo Developer', 'Experience: Odoo Developer with 2 years of work in modules')}${item('Jr. Web developer', 'Build web pages for client projects with HTML and CSS.')}</div>`);
  const { jobs } = extract(doc, loc);
  assert.deepEqual(jobs.map(j => j.title), ['Trainer Python/Odoo Developer', 'SEO Analyst', 'Odoo Developer', 'Jr. Web developer']);
  assert.ok(jobs.every(j => j.location === ''));
});
