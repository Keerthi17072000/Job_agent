// End-to-end test on the BUILT site (npm run build first). Every job source is mocked with fixtures that live only in this file;
// nothing here is ever shipped or shown as a real job. Run: npm run e2e   (CHROMIUM=/path/to/chrome to use a specific browser)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import JSZip from 'jszip';
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
  catch (e) { failed++; console.log('FAIL-', name, '\n    ', e.message.split('\n').slice(0, process.env.E2E_VERBOSE ? 80 : 6).join(' | ')); await page.screenshot({ path: `e2e-fail-${failed}.png` }).catch(() => {}); }
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
  const pick = async (cat, name) => { await page.getByRole('tab', { name: cat }).click(); await page.getByRole('radio', { name, exact: true }).click(); };
  let total = 0;
  for (const cat of ['Simple', 'Modern', 'Bold header', 'Two-column', 'With photo']) {                                     // every preview applies its template when clicked
    await page.getByRole('tab', { name: cat }).click(); const n = await page.getByRole('radio').count(); assert.ok(n >= 6, `${cat}: ${n}`); total += n;
    for (let i = 0; i < n; i++) { const r = page.getByRole('radio').nth(i); await r.click(); assert.equal(await r.getAttribute('aria-checked'), 'true'); assert.equal(await page.locator('article [role=textbox]').first().innerText(), 'Asha R Rao'); }
  }
  assert.ok(total >= 31, `templates: ${total}`);
  // photo template: upload a photo, the ATS check drops, the suggested ATS template restores it in one click
  await pick('With photo', 'Portrait'); await page.waitForSelector('article[data-photo="round"] label.r-photo');
  const withPhoto = await score();
  await page.setInputFiles('#photo', { name: 'me.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64') });
  await page.waitForSelector('article img.r-photo'); assert.match(await page.locator('article img.r-photo').getAttribute('src'), /^data:image\/jpeg/);
  await page.setInputFiles('#photo', file('not-image.txt', 'hello')); await toast(page).filter({ hasText: 'Choose an image file' }).waitFor();
  assert.match(await page.locator('li', { hasText: 'Template layout' }).innerText(), /6\/10/);
  assert.equal(await page.locator('article [role=textbox]').first().innerText(), 'Asha R Rao'); // adding a photo does not discard unsaved edits
  await page.click('button:has-text("Use Classic")'); await page.waitForSelector('article[data-tpl="classic"]');
  assert.ok(await score() > withPhoto, 'suggested template raises the score'); await page.getByText('is already ATS-friendly').waitFor();
  if (process.env.KEEP_EXPORTS) { for (const n of ['Portrait', 'Studio', 'Coral']) { await pick('With photo', n); await page.locator('article').screenshot({ path: path.join(process.env.KEEP_EXPORTS, 'photo-' + n + '.png') }); } await page.locator('aside').screenshot({ path: path.join(process.env.KEEP_EXPORTS, 'aside.png') }); }
  await pick('Bold header', 'Banner'); await page.waitForSelector('article[data-tpl="banner"][data-head="band"]');
  assert.match(await page.getByRole('radio', { name: 'Banner' }).locator('.tpl-thumb').innerText(), /Asha R Rao/);  // previews show your own resume
  await pick('Two-column', 'Sidebar'); await page.waitForSelector('article[data-layout="left"] .r-cols .r-side');
  const box = async sel => page.locator(sel).boundingBox(); const sideBox = await box('article .r-side'), mainBox = await box('article .r-main');
  assert.ok(sideBox.x + sideBox.width <= mainBox.x + 1, 'sidebar sits to the left of the main column');
  const sidePdf = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ja-')), 'sidebar.pdf'); fs.writeFileSync(sidePdf, await page.pdf({ format: 'A4', printBackground: true }));
  if (process.env.KEEP_EXPORTS) { for (const [c, n] of [['Two-column', 'Navy column'], ['Two-column', 'Lilac'], ['Bold header', 'Emerald'], ['Modern', 'Slate']]) { await pick(c, n); await page.locator('article').screenshot({ path: path.join(process.env.KEEP_EXPORTS, n.replace(' ', '-') + '.png') }); } await page.getByRole('tab', { name: 'Two-column' }).click(); await page.locator('[role=radiogroup]').screenshot({ path: path.join(process.env.KEEP_EXPORTS, 'thumbs.png') }); fs.copyFileSync(sidePdf, path.join(process.env.KEEP_EXPORTS, 'sidebar.pdf')); }
  await pick('Modern', 'Modern'); await page.waitForSelector('article[data-tpl="modern"]');
  assert.equal(await page.locator('article h1').innerText(), 'Asha R Rao');                                  // edits survive template switches

  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Download Word")')]);
  assert.equal(dl.suggestedFilename(), 'Asha_R_Rao.docx');
  const docx = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ja-')), 'out.docx'); await dl.saveAs(docx);
  const pdf = docx.replace('.docx', '.pdf'); fs.writeFileSync(pdf, await page.pdf({ format: 'A4' }));
  if (process.env.KEEP_EXPORTS) { fs.copyFileSync(docx, path.join(process.env.KEEP_EXPORTS, 'out.docx')); fs.copyFileSync(pdf, path.join(process.env.KEEP_EXPORTS, 'out.pdf')); await page.screenshot({ path: path.join(process.env.KEEP_EXPORTS, 'resume.png') }); }

  await page.click('button:has-text("Save changes")'); await toast(page).filter({ hasText: 'Profile confirmed' }).waitFor();
  for (const f of [docx, pdf, sidePdf]) {                                                                            // what we export can be uploaded again
    await page.setInputFiles('#resume', f); await toast(page).filter({ hasText: 'Search complete' }).waitFor({ timeout: 60000 });
    await page.goto(BASE + '#/resume'); await page.waitForSelector('article.resume-page');
    assert.equal(await page.locator('article h1').innerText(), 'Asha R Rao', f); assert.match(await page.locator('article .r-contact').first().innerText(), /98765/, f);
    assert.match(await page.locator('article').innerText(), /Frontend Developer/, f); assert.match(await page.locator('article').innerText(), /react/i, f);
    assert.match(await page.locator('article .r-bullets').first().innerText(), /Built dashboards/, f);
    assert.doesNotMatch(await page.locator('article .r-bullets').first().innerText(), /Remove role|Add role/, f); // editor buttons are not printed
  }
});

/** A minimal .docx with the constructs real Word files use: tab columns, soft line breaks (Shift+Enter) and a layout table. Built here, never shipped. */
async function wordFile(name, blocks) {
  const run = t => t.split('\n').map(line => line.split('\t').map(x => `<w:r><w:t xml:space="preserve">${x.replace(/&/g, '&amp;')}</w:t></w:r>`).join('<w:r><w:tab/></w:r>')).join('<w:r><w:br/></w:r>');
  const p = t => `<w:p>${run(t)}</w:p>`, cell = t => `<w:tc>${p(t)}</w:tc>`; // a table cell holds one paragraph whose lines are soft breaks
  const body = blocks.map(b => Array.isArray(b) ? `<w:tbl><w:tr>${b.map(cell).join('')}</w:tr></w:tbl>` : p(b)).join('');
  const z = new JSZip();
  z.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  z.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  z.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`);
  return { name, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: await z.generateAsync({ type: 'nodebuffer' }) };
}

await test('Word layouts: tab columns, soft line breaks and layout tables are read into the right fields', async page => {
  await home(page);
  await upload(page, await wordFile('tabbed.docx', ['ASHA RANI  K\t +91-9876543210', ' asha.rani@example.com', 'Carrier Objectives', 'To secure a challenging position in a reputable organization.',
    'EDucation\t', 'Sunrise Engineering College,Salem\t2021-2025', 'BE.Computer Science And Engineering\tCGPA/Percentage: 8.5/85', 'St.Marys.Matriculation Higher Secondary School,Salem\t2021', 'HSLC,TamilNadu\tPercentage: 87',
    'Personal Projects\t', 'Voting Application Using Django', 'Description:A web platform for polls.', 'Tools & technologies used:HTML,CSS,PYTHON,DJANGO',
    'Technical Skills anD Interests\t', 'Languages:Python,JavaScript,C', 'Soft Skills:Communication,Teamwork', 'Area of interest:Data Analysis,Software Development',
    'Internships\t', 'Training Program in Cloud Computing\tJuly-Aug', 'SD Pro Solutions\t2024', 'Extra-Curricular Activities', 'NSS Student Volunteer\t2021-2025', 'Declaration', 'I hereby declare that the information is true.']));
  await page.waitForSelector('text=Hello, ASHA'); await toast(page).filter({ hasText: 'Search complete' }).waitFor({ timeout: 60000 });
  await page.goto(BASE + '#/resume'); await page.waitForSelector('article.resume-page');
  const art = page.locator('article'), text = await art.innerText();
  assert.equal(await art.locator('h1').innerText(), 'ASHA RANI K'); assert.match(text, /98765/); assert.match(text, /asha\.rani@example\.com/);
  assert.match(text, /Sunrise Engineering College, Salem/); assert.match(text, /8\.5\/85/); assert.match(text, /St\. Marys\. Matriculation Higher Secondary School, Salem/); assert.match(text, /Percentage: 87/);
  assert.match(text, /Voting Application Using Django/); assert.match(text, /Tools: HTML, CSS, Python, Django/); assert.match(text, /Training Program in Cloud Computing/); assert.match(text, /SD Pro Solutions/);
  assert.match(text, /Extra-Curricular Activities/i); assert.match(text, /NSS Student Volunteer \| 2021-2025/); assert.match(text, /Areas of Interest/i); assert.match(text, /Data Analysis, Software Development/);
  assert.doesNotMatch(text, /declare|true\./i);
  await page.goto(BASE + '#/overview'); await page.getByText('Searching for:').waitFor(); assert.match(await page.locator('text=Searching for:').locator('..').innerText(), /Data Analyst/); // a fresher still gets search titles
  // soft line breaks and a layout table (name, title and contact glued together by naive extraction)
  await upload(page, await wordFile('table.docx', [['PRIYA NAIR\nStaff Nurse\npriya.nair@example.com\n+91 98450 12345\nKochi, Kerala', 'PROFESSIONAL SUMMARY\nStaff nurse with 6 years of patient care.\nWORK EXPERIENCE\nStaff Nurse\nCity Hospital, Kochi\nMar 2018 - Present\n• Managed a 12-bed ward']]));
  await page.waitForSelector('text=Hello, PRIYA'); await toast(page).filter({ hasText: 'Search complete' }).waitFor({ timeout: 60000 });
  await page.goto(BASE + '#/resume'); await page.waitForSelector('article.resume-page');
  assert.equal(await page.locator('article h1').innerText(), 'PRIYA NAIR'); assert.match(await page.locator('article').innerText(), /Staff Nurse/); assert.match(await page.locator('article').innerText(), /City Hospital/); assert.match(await page.locator('article').innerText(), /98450/);
});

await test('phone layout has no horizontal overflow; theme toggle works', async page => {
  await page.setViewportSize({ width: 400, height: 800 }); await home(page); await upload(page, file('asha.txt', RESUME_DEV)); await page.waitForSelector('text=Hello, Asha');
  for (const r of ['overview', 'jobs', 'profile', 'sources', 'settings', 'applications', 'resume']) { await page.goto(BASE + '#/' + r); await page.waitForTimeout(300); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `overflow on ${r}`); }
  await page.click('button[aria-label^="Switch to"]'); assert.ok(await page.evaluate(() => !!document.documentElement.dataset.theme));
});

await browser.close(); server.close();
if (failed) { console.log(`${failed} e2e test(s) failed`); process.exit(1); }
console.log('all e2e tests passed');
