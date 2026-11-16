// End-to-end test of the portal search path: app page -> extension bridge -> extension opens the portal tab ->
// content script reads the listings -> results appear in the app. The portals are replaced by small fixture pages
// (defined here only), and every job source API is mocked. Needs a Chromium that can load extensions.
import http from 'node:http';
import https from 'node:https';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const DIST = path.resolve('web/dist'), EXT = path.resolve('extension');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const f = path.join(DIST, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
  if (!f.startsWith(DIST) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] ?? 'application/octet-stream' }); res.end(fs.readFileSync(f));
});
await new Promise((r, j) => { server.once('error', j); server.listen(5173, '127.0.0.1', r); }); // 5173 is allow-listed in the extension manifest
const BASE = 'http://127.0.0.1:5173/';

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'ja-ext-'));
// The portals are fixture pages served by a local HTTPS server; Chrome is told to resolve the portal hostnames to it. The tabs the
// extension opens are therefore real navigations (the extension is not mocked), and no real portal is ever contacted.
const key = path.join(userData, 'k.pem'), cert = path.join(userData, 'c.pem');
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '1', '-subj', '/CN=portal.test'], { stdio: 'ignore' });
const NAUKRI = ['Frontend Developer', 'React Engineer'].map((t, i) => `<div class="srp-jobtuple-wrapper"><a class="title" href="https://www.naukri.com/job-listings-${i}-testco-pune">${t}</a><a class="comp-name">TestCo</a><span class="loc-wrap">Pune</span><span class="exp-wrap">3-6 Yrs</span><ul class="tags-gt"><li>React</li><li>TypeScript</li></ul></div>`).join('');
const PAGES = { 'www.naukri.com': NAUKRI, 'www.linkedin.com': '<h1>Sign in to view more jobs</h1>', 'in.indeed.com': '<p>Nothing matched.</p>' };
const portals = https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) }, (req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' }); res.end(`<!doctype html><html><body>${PAGES[req.headers.host] ?? ''}</body></html>`);
});
await new Promise(r => portals.listen(8443, '127.0.0.1', r));
const args = [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--ignore-certificate-errors', '--no-proxy-server', `--host-resolver-rules=${Object.keys(PAGES).map(h => `MAP ${h} 127.0.0.1:8443`).join(', ')}`];
const ctx = await chromium.launchPersistentContext(userData, process.env.CHROMIUM
  ? { executablePath: process.env.CHROMIUM, headless: false, args: [...args, '--headless=new'] } : { channel: 'chromium', args });

const html = body => ({ status: 200, contentType: 'text/html', body: `<!doctype html><html><body>${body}</body></html>` });
const json = body => ({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
await ctx.route(/remotive|jobicy|arbeitnow|remoteok|greenhouse|lever\.co|ashbyhq|smartrecruiters|adzuna/, r => r.fulfill(json({ jobs: [], data: [], results: [], links: {} })));

let failed = 0;
const step = async (name, fn) => { try { await fn(); console.log('ok  -', name); } catch (e) { failed++; console.log('FAIL-', name, '\n    ', e.message.split('\n').slice(0, 5).join(' | ')); } };
const page = await ctx.newPage(); const errors = [];
page.on('pageerror', e => errors.push(e.message));
const toast = p => p.locator('[role=status]');

await step('the app detects the extension', async () => {
  await page.goto(BASE); await page.waitForSelector('h1');
  await page.setInputFiles('#resume', { name: 'asha.txt', mimeType: 'text/plain', buffer: Buffer.from('Asha Rao\nBangalore | asha@example.com\nSkills\nReact, TypeScript\nExperience\nFrontend Developer, Acme   Jan 2019 - Present\nEducation\nB.Tech Computer Science 2018') });
  await toast(page).filter({ hasText: 'Search complete' }).waitFor({ timeout: 60000 });
  await page.goto(BASE + '#/sources'); await page.getByText(/Extension connected/).waitFor({ timeout: 10000 });
});
const portal = n => page.locator('li', { hasText: n }).filter({ has: page.locator('button:has-text("Search")') });

await step('Naukri results are read through the extension and shown in the app, not by redirecting', async () => {
  const before = ctx.pages().length;
  await portal('Naukri').first().locator('button:has-text("Search")').click();
  await toast(page).filter({ hasText: 'Naukri: 2 listings read' }).waitFor({ timeout: 60000 });
  await page.waitForTimeout(500); assert.equal(ctx.pages().length, before, 'the helper tab closes itself when it is done');
  await page.goto(BASE + '#/jobs'); await page.locator('select[aria-label="Minimum match"]').selectOption('0');
  await page.waitForSelector('a.font-extrabold:has-text("Frontend Developer")'); await page.waitForSelector('text=via Naukri');
  const href = await page.locator('a:has-text("Apply")').first().getAttribute('href'); assert.match(href, /^https:\/\/www\.naukri\.com\/job-listings-/);
  await page.goto(BASE + '#/sources'); await page.waitForSelector('text=2 listings');
});

await step('a login wall stops the search, is reported, and the tab is left for the user', async () => {
  const before = ctx.pages().length;
  await portal('LinkedIn').first().locator('button:has-text("Search")').click();
  await toast(page).filter({ hasText: 'asked for a login or verification' }).waitFor({ timeout: 60000 });
  assert.equal(ctx.pages().length, before + 1, 'the portal tab stays open so the user can sign in');
  await page.locator('li', { hasText: 'LinkedIn' }).locator('text=Needs you').waitFor();
});

await step('a page with no listings is reported as such', async () => {
  await page.bringToFront();
  await portal('Indeed').first().locator('button:has-text("Search")').click();
  await toast(page).filter({ hasText: 'No listings were found' }).waitFor({ timeout: 60000 });
});

await step('no page errors', async () => assert.deepEqual(errors, []));
await ctx.close(); server.close(); portals.close(); fs.rmSync(userData, { recursive: true, force: true });
if (failed) { console.log(`${failed} extension e2e test(s) failed`); process.exit(1); }
console.log('all extension e2e tests passed');
