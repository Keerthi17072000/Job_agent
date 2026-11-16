// Career-page adapters built on the public JSON endpoints that Greenhouse, Lever, Ashby and
// SmartRecruiters publish for job boards. These are the vendors' supported feeds, not scraping.
// Workday has no stable public API (per-tenant, undocumented), so it is reported as not implemented.
import { htmlToText } from '../text.ts';
import { getJson } from '../http.ts';
import { makeAdapter } from './base.ts';
import type { Adapter, Company, Query, RawJob, SearchCtx } from '../types.ts';

export { getJson };
export const nameOf = (c: Company) => c.name ?? c.token;
export const iso = (v: unknown) => { const d = new Date(v as string); return isNaN(+d) ? '' : d.toISOString(); };

export const mapGreenhouse = (json: any, c: Company): RawJob[] => (json.jobs ?? []).map((j: any) => ({
  source: 'Greenhouse', sourceKind: 'career' as const, title: j.title, company: nameOf(c), location: j.location?.name ?? '',
  url: j.absolute_url, description: j.content ?? '', postedAt: iso(j.updated_at), externalId: String(j.id ?? ''),
}));
export const mapLever = (json: any, c: Company): RawJob[] => (Array.isArray(json) ? json : []).map((j: any) => ({
  source: 'Lever', sourceKind: 'career' as const, title: j.text, company: nameOf(c), location: j.categories?.location ?? '',
  url: j.hostedUrl, postedAt: iso(j.createdAt), externalId: String(j.id ?? ''), workMode: j.workplaceType === 'remote' ? 'remote' as const : j.workplaceType === 'hybrid' ? 'hybrid' as const : undefined,
  description: [j.descriptionPlain, ...(j.lists ?? []).map((l: any) => `${l.text}\n${htmlToText(l.content)}`), j.additionalPlain].filter(Boolean).join('\n'),
}));
export const mapAshby = (json: any, c: Company): RawJob[] => (json.jobs ?? []).map((j: any) => ({
  source: 'Ashby', sourceKind: 'career' as const, title: j.title, company: nameOf(c), location: j.location ?? '',
  url: j.jobUrl, externalId: String(j.id ?? ''), description: j.descriptionPlain ?? htmlToText(j.descriptionHtml ?? ''), postedAt: iso(j.publishedAt),
  workMode: j.isRemote ? 'remote' as const : /hybrid/i.test(j.workplaceType ?? '') ? 'hybrid' as const : undefined,
  salary: j.compensation?.compensationTierSummary ?? '',
}));
export const mapSmartRecruiters = (list: any, detail: any, c: Company): RawJob => ({
  source: 'SmartRecruiters', sourceKind: 'career', title: list.name, company: nameOf(c),
  location: list.location?.fullLocation ?? [list.location?.city, list.location?.country].filter(Boolean).join(', '),
  url: detail.postingUrl ?? detail.applyUrl, externalId: String(list.id ?? ''), postedAt: iso(list.releasedDate), workMode: list.location?.remote ? 'remote' : undefined,
  description: Object.values(detail.jobAd?.sections ?? {}).map((s: any) => s?.text ?? '').join('\n'),
});

export const GENERIC = new Set(['senior', 'junior', 'lead', 'staff', 'principal', 'sr', 'jr', 'associate', 'the', 'and', 'of', 'ii', 'iii']);
// Role nouns shared by thousands of unrelated jobs; a title must match something more specific than these when a role has one.
const ROLE_NOUNS = new Set(['engineer', 'developer', 'programmer', 'manager', 'analyst', 'specialist', 'executive', 'consultant', 'officer', 'head', 'assistant', 'coordinator', 'administrator', 'intern', 'trainee', 'software', 'engineering', 'technical']);
const words = (s: string) => s.toLowerCase().split(/[^a-z0-9+#]+/).filter(w => w && !GENERIC.has(w));
const distinctive = (role: string) => { const w = words(role), d = w.filter(x => !ROLE_NOUNS.has(x)); return d.length ? d : w; };
/** Cheap pre-filter so we do not score a whole company board: the title must contain a distinctive word of a target role or query (e.g. "frontend" or "nurse", not just "engineer"). */
export const titleRelevant = (title: string, roles: string[]) => { const t = new Set(words(title)); return roles.some(r => distinctive(r).some(w => t.has(w))); };

async function board(c: Company, q: Query, ctx: SearchCtx): Promise<RawJob[]> {
  const t = encodeURIComponent(c.token), g = (u: string) => getJson(u, { ...ctx, source: `${c.ats}:${c.token}` });
  if (c.ats === 'greenhouse') return mapGreenhouse(await g(`https://boards-api.greenhouse.io/v1/boards/${t}/jobs?content=true`), c);
  if (c.ats === 'lever') return mapLever(await g(`https://api.lever.co/v0/postings/${t}?mode=json`), c);
  if (c.ats === 'ashby') return mapAshby(await g(`https://api.ashbyhq.com/posting-api/job-board/${t}?includeCompensation=true`), c);
  const roles = [...q.roles, ...q.queries];
  const list = (await g(`https://api.smartrecruiters.com/v1/companies/${t}/postings?limit=100`)).content ?? [];
  const out: RawJob[] = [];
  for (const p of list.filter((p: any) => titleRelevant(p.name, roles)).slice(0, 40)) // detail call per posting: capped
    out.push(mapSmartRecruiters(p, await g(`https://api.smartrecruiters.com/v1/companies/${t}/postings/${p.id}`), c));
  return out;
}

export const careerPages: Adapter = makeAdapter({
  id: 'career-pages', name: 'Company career pages', note: 'Greenhouse, Lever, Ashby and SmartRecruiters boards you list in Preferences. Workday is not supported.',
  needs: q => q.companies.length ? null : 'No companies configured. Add Greenhouse/Lever/Ashby/SmartRecruiters board tokens in Preferences.',
  keep: (j, q) => titleRelevant(j.title, [...q.roles, ...q.queries]),
  async fetch(q, ctx) {
    const jobs: RawJob[] = [], failed: string[] = [];
    await Promise.all(q.companies.map(async c => {
      try { jobs.push(...await board(c, q, ctx)); }
      catch (e) { const m = (e as Error).message; failed.push(`${c.ats}:${c.token} (${/fetch/i.test(m) ? 'unreachable or blocked (CORS)' : m})`); ctx.log?.({ at: new Date().toISOString(), source: `${c.ats}:${c.token}`, level: 'error', msg: m }); }
    }));
    if (failed.length === q.companies.length) throw new Error(`No board could be read. Failed: ${failed.join(', ')}.`);
    if (failed.length) ctx.log?.({ at: new Date().toISOString(), source: 'career-pages', level: 'warn', msg: `Some boards failed: ${failed.join(', ')}` });
    return jobs;
  },
});
