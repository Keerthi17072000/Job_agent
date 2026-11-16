// Career-page adapters built on the public JSON endpoints that Greenhouse, Lever, Ashby and
// SmartRecruiters publish for job boards. These are the vendors' supported feeds, not scraping.
// Workday has no stable public API (per-tenant, undocumented), so it is reported as not implemented.
import { htmlToText } from '../text.ts';
import type { Adapter, AdapterResult, Company, Query, RawJob } from '../types.ts';

const getJson = async (url: string) => {
  const r = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json() as Promise<any>;
};
const nameOf = (c: Company) => c.name ?? c.token;
const iso = (v: unknown) => { const d = new Date(v as string); return isNaN(+d) ? '' : d.toISOString(); };

export const mapGreenhouse = (json: any, c: Company): RawJob[] => (json.jobs ?? []).map((j: any) => ({
  source: 'Greenhouse', sourceKind: 'career' as const, title: j.title, company: nameOf(c), location: j.location?.name ?? '',
  url: j.absolute_url, description: j.content ?? '', postedAt: iso(j.updated_at),
}));
export const mapLever = (json: any, c: Company): RawJob[] => (Array.isArray(json) ? json : []).map((j: any) => ({
  source: 'Lever', sourceKind: 'career' as const, title: j.text, company: nameOf(c), location: j.categories?.location ?? '',
  url: j.hostedUrl, postedAt: iso(j.createdAt), workMode: j.workplaceType === 'remote' ? 'remote' as const : j.workplaceType === 'hybrid' ? 'hybrid' as const : undefined,
  description: [j.descriptionPlain, ...(j.lists ?? []).map((l: any) => `${l.text}\n${htmlToText(l.content)}`), j.additionalPlain].filter(Boolean).join('\n'),
}));
export const mapAshby = (json: any, c: Company): RawJob[] => (json.jobs ?? []).map((j: any) => ({
  source: 'Ashby', sourceKind: 'career' as const, title: j.title, company: nameOf(c), location: j.location ?? '',
  url: j.jobUrl, description: j.descriptionPlain ?? htmlToText(j.descriptionHtml ?? ''), postedAt: iso(j.publishedAt),
  workMode: j.isRemote ? 'remote' as const : /hybrid/i.test(j.workplaceType ?? '') ? 'hybrid' as const : undefined,
  salary: j.compensation?.compensationTierSummary ?? '',
}));
export const mapSmartRecruiters = (list: any, detail: any, c: Company): RawJob => ({
  source: 'SmartRecruiters', sourceKind: 'career', title: list.name, company: nameOf(c),
  location: list.location?.fullLocation ?? [list.location?.city, list.location?.country].filter(Boolean).join(', '),
  url: detail.postingUrl ?? detail.applyUrl, postedAt: iso(list.releasedDate), workMode: list.location?.remote ? 'remote' : undefined,
  description: Object.values(detail.jobAd?.sections ?? {}).map((s: any) => s?.text ?? '').join('\n'),
});

const GENERIC = new Set(['senior', 'junior', 'lead', 'staff', 'principal', 'sr', 'jr', 'associate', 'the', 'and', 'of']);
const words = (s: string) => s.toLowerCase().split(/[^a-z0-9+#]+/).filter(w => w && !GENERIC.has(w));
/** Cheap pre-filter so we do not score a whole company board: title must share a word with a target role. */
export const titleRelevant = (title: string, roles: string[]) => { const t = new Set(words(title)); return roles.some(r => words(r).some(w => t.has(w))); };

async function board(c: Company, q: Query): Promise<RawJob[]> {
  const t = encodeURIComponent(c.token);
  if (c.ats === 'greenhouse') return mapGreenhouse(await getJson(`https://boards-api.greenhouse.io/v1/boards/${t}/jobs?content=true`), c);
  if (c.ats === 'lever') return mapLever(await getJson(`https://api.lever.co/v0/postings/${t}?mode=json`), c);
  if (c.ats === 'ashby') return mapAshby(await getJson(`https://api.ashbyhq.com/posting-api/job-board/${t}?includeCompensation=true`), c);
  const list = (await getJson(`https://api.smartrecruiters.com/v1/companies/${t}/postings?limit=100`)).content ?? [];
  const out: RawJob[] = [];
  for (const p of list.filter((p: any) => titleRelevant(p.name, q.roles)).slice(0, 40)) // detail call per posting: capped
    out.push(mapSmartRecruiters(p, await getJson(`https://api.smartrecruiters.com/v1/companies/${t}/postings/${p.id}`), c));
  return out;
}

export const careerPages: Adapter = {
  id: 'career-pages', name: 'Company career pages (Greenhouse, Lever, Ashby, SmartRecruiters)',
  async search(q): Promise<AdapterResult> {
    const base = { adapter: this.id, name: this.name };
    if (!q.companies.length) return { ...base, status: 'not_configured', reason: 'No companies configured. Add Greenhouse/Lever/Ashby/SmartRecruiters board tokens in Preferences.', jobs: [] };
    const jobs: RawJob[] = [], failed: string[] = [];
    let reached = 0;
    await Promise.all(q.companies.map(async c => {
      try { const all = await board(c, q); reached++; jobs.push(...all.filter(j => titleRelevant(j.title, q.roles))); }
      catch (e) { const m = (e as Error).message; failed.push(`${c.ats}:${c.token} (${/fetch/i.test(m) ? 'unreachable, or blocked by the browser (CORS)' : m})`); }
    }));
    const note = failed.length ? ` Failed: ${failed.join(', ')}.` : '';
    if (!reached) return { ...base, status: 'error', reason: `No board could be read.${note}`, jobs };
    return { ...base, status: 'ok', reason: `Read ${reached} of ${q.companies.length} boards.${note}`, jobs };
  },
};
