// One adapter per job portal, all behind the same Adapter interface.
//
// policy 'manual'  : the portal has no public search API and either forbids automated access in its
//                    terms or sits behind login/bot protection. The server never opens it. Jobs arrive
//                    only through the browser extension, which reads the page YOU are viewing when you click.
// policy 'checked' : the adapter checks robots.txt, loads the page with Playwright and reads schema.org
//                    JobPosting data. If it meets a login wall, CAPTCHA or error page it STOPS and reports
//                    'blocked'. It never tries to get past one.
//
// Nothing here has been run against the live sites yet: policies reflect what is publicly known and must
// be re-verified (terms, robots.txt, search URL) before relying on them.
import { robotsAllows } from '../robots.ts';
import type { Adapter, AdapterResult, Query, RawJob, WorkMode } from '../types.ts';

export interface Portal { id: string; name: string; policy: 'manual' | 'checked'; note: string; searchUrl?: (role: string, loc: string) => string }
const q = encodeURIComponent;

export const PORTALS: Portal[] = [
  { id: 'naukri', name: 'Naukri', policy: 'manual', note: 'Terms prohibit automated access and the site uses bot protection. Use the browser extension.' },
  { id: 'linkedin', name: 'LinkedIn Jobs', policy: 'manual', note: 'No public job-search API and the terms prohibit automation. Use the browser extension.' },
  { id: 'indeed', name: 'Indeed', policy: 'manual', note: 'No public search API (Publisher API retired) and the terms prohibit scraping. Use the browser extension.' },
  { id: 'glassdoor', name: 'Glassdoor', policy: 'manual', note: 'Login wall and terms prohibit scraping. Use the browser extension.' },
  { id: 'wellfound', name: 'Wellfound', policy: 'manual', note: 'Login and bot protection. Use the browser extension.' },
  { id: 'instahyre', name: 'Instahyre', policy: 'manual', note: 'Jobs are visible only after login. Use the browser extension.' },
  { id: 'cutshort', name: 'Cutshort', policy: 'manual', note: 'Jobs are visible only after login. Use the browser extension.' },
  { id: 'hirist', name: 'Hirist', policy: 'checked', note: 'Search URL pattern unverified.', searchUrl: (r) => `https://www.hirist.tech/search/${q(r)}` },
  { id: 'iimjobs', name: 'iimjobs', policy: 'checked', note: 'Search URL pattern unverified.', searchUrl: (r) => `https://www.iimjobs.com/search/${q(r)}` },
  { id: 'foundit', name: 'Foundit', policy: 'checked', note: 'Search URL pattern unverified.', searchUrl: (r, l) => `https://www.foundit.in/srp/results?query=${q(r)}&locations=${q(l)}` },
  { id: 'shine', name: 'Shine', policy: 'checked', note: 'Search URL pattern unverified.', searchUrl: (r) => `https://www.shine.com/job-search/${r.trim().replace(/\s+/g, '-')}-jobs` },
];
export const portalName = (id: string) => PORTALS.find(p => p.id === id)?.name ?? id;

const BLOCK_PAGE = /captcha|verify you are human|are you a robot|access denied|unusual traffic|datadome|cf-chl|attention required/i;

/** schema.org JobPosting objects out of JSON-LD blocks (also walks @graph and ItemList). */
export function extractJobPostings(jsonLd: string[]): any[] {
  const out: any[] = [];
  const walk = (n: any) => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!n || typeof n !== 'object') return;
    const t = [n['@type']].flat();
    if (t.includes('JobPosting')) out.push(n);
    walk(n['@graph']); walk(n.itemListElement); walk(n.item);
  };
  for (const s of jsonLd) { try { walk(JSON.parse(s)); } catch { /* malformed block: ignore */ } }
  return out;
}
export function postingToJob(p: any, source: string): RawJob | null {
  const addr = [p.jobLocation].flat()[0]?.address;
  const sal = p.baseSalary?.value;
  return {
    source, sourceKind: 'portal', title: p.title ?? '', company: p.hiringOrganization?.name ?? '',
    location: [addr?.addressLocality, addr?.addressRegion, addr?.addressCountry?.name ?? addr?.addressCountry].filter(x => typeof x === 'string').join(', '),
    // no per-job URL means no verifiable source: the pipeline rejects it
    url: p.url ?? p.sameAs ?? '', description: p.description ?? '',
    workMode: (p.jobLocationType === 'TELECOMMUTE' ? 'remote' : undefined) as WorkMode | undefined,
    postedAt: p.datePosted ?? '', deadline: p.validThrough ?? '',
    salary: sal ? `${p.baseSalary.currency ?? ''} ${sal.minValue ?? sal.value ?? ''}${sal.maxValue ? `-${sal.maxValue}` : ''}`.trim() : '',
  };
}

function portalAdapter(p: Portal): Adapter {
  return {
    id: p.id, name: p.name,
    async search(query: Query): Promise<AdapterResult> {
      const base = { adapter: p.id, name: p.name };
      if (p.policy === 'manual') return { ...base, status: 'manual', reason: p.note, jobs: [] };
      const role = query.roles[0], loc = query.locations[0] ?? '';
      if (!role) return { ...base, status: 'not_configured', reason: 'No target role set.', jobs: [] };
      const url = p.searchUrl!(role, loc);
      try {
        const robots = await fetch(new URL('/robots.txt', url), { signal: AbortSignal.timeout(15000) });
        if (robots.ok && !robotsAllows(await robots.text(), new URL(url).pathname + new URL(url).search))
          return { ...base, status: 'blocked', reason: `robots.txt disallows automated access to ${new URL(url).pathname}. Use the browser extension.`, jobs: [] };
        const { chromium } = await import('playwright');
        const browser = await chromium.launch({ headless: true });
        try {
          const page = await browser.newPage();
          const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
          const html = (await page.content()).slice(0, 20000);
          if (!res || res.status() >= 400 || BLOCK_PAGE.test(html) || /login|signin|sign-in/i.test(page.url()))
            return { ...base, status: 'blocked', reason: `Needs manual access (HTTP ${res?.status() ?? '?'}, login wall or bot check). Stopped; use the browser extension.`, jobs: [] };
          const blocks = await page.$$eval('script[type="application/ld+json"]', els => els.map(e => e.textContent ?? ''));
          const jobs = extractJobPostings(blocks).map(x => postingToJob(x, p.name)).filter((j): j is RawJob => !!j && !!j.url);
          if (!jobs.length) return { ...base, status: 'error', reason: 'Page loaded but exposes no structured job data, so nothing was read. Confirm the search URL and add selectors for this site, or use the browser extension.', jobs };
          return { ...base, status: 'ok', reason: `Read ${jobs.length} listings.`, jobs };
        } finally { await browser.close(); }
      } catch (e) { return { ...base, status: 'error', reason: `${(e as Error).message}`, jobs: [] }; }
    },
  };
}
export const portalAdapters: Adapter[] = PORTALS.map(portalAdapter);
