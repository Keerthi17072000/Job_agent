// Job boards that publish a free public JSON API callable from a browser. Each was probed live
// from a web page (CORS and response shape) before being added. The Muse failed that probe and is left out.
import { getJson } from '../http.ts';
import { makeAdapter } from './base.ts';
import { iso, titleRelevant } from './ats.ts';
import type { Adapter, Query, RawJob } from '../types.ts';

const money = (cur?: string, lo?: number, hi?: number) => lo || hi ? `${cur ?? ''} ${lo ?? ''}${lo && hi ? '-' : ''}${hi ?? ''}`.trim() : '';

export const mapRemotive = (j: any): RawJob[] => (j.jobs ?? []).map((x: any) => ({
  source: 'Remotive', sourceKind: 'portal' as const, title: x.title, company: x.company_name, location: x.candidate_required_location || 'Remote', externalId: String(x.id ?? ''),
  url: x.url, description: x.description ?? '', postedAt: iso(x.publication_date), salary: x.salary ?? '', workMode: 'remote' as const,
}));
export const mapJobicy = (j: any): RawJob[] => (j.jobs ?? []).map((x: any) => ({
  source: 'Jobicy', sourceKind: 'portal' as const, title: x.jobTitle, company: x.companyName, location: [].concat(x.jobGeo ?? 'Remote').join(', '), externalId: String(x.id ?? ''),
  url: x.url, description: x.jobDescription ?? x.jobExcerpt ?? '', postedAt: iso(x.pubDate), salary: money(x.salaryCurrency, x.salaryMin, x.salaryMax), workMode: 'remote' as const,
}));
export const mapArbeitnow = (j: any): RawJob[] => (j.data ?? []).map((x: any) => ({
  source: 'Arbeitnow', sourceKind: 'portal' as const, title: x.title, company: x.company_name, location: x.location ?? '', externalId: String(x.slug ?? ''),
  url: x.url, description: x.description ?? '', postedAt: x.created_at ? iso(x.created_at * 1000) : '', workMode: x.remote ? 'remote' as const : undefined,
}));
export const mapRemoteOk = (j: any): RawJob[] => (Array.isArray(j) ? j : []).filter((x: any) => x?.position).map((x: any) => ({
  source: 'RemoteOK', sourceKind: 'portal' as const, title: x.position, company: x.company, location: x.location || 'Remote', externalId: String(x.id ?? ''),
  url: x.url, description: x.description ?? '', postedAt: iso(x.date), salary: money('USD', x.salary_min, x.salary_max), workMode: 'remote' as const,
}));
// Adzuna field names are from its documentation; not verified live (needs the user's own free key).
export const mapAdzuna = (j: any): RawJob[] => (j.results ?? []).map((x: any) => ({
  source: 'Adzuna', sourceKind: 'portal' as const, title: x.title, company: x.company?.display_name ?? '', location: x.location?.display_name ?? '', externalId: String(x.id ?? ''),
  url: x.redirect_url, description: x.description ?? '', postedAt: iso(x.created), salary: money('INR', x.salary_min, x.salary_max),
}));

const queries = (q: Query) => (q.queries.length ? q.queries : q.roles).slice(0, 3);
const roles = (q: Query) => [...q.roles, ...q.queries];
const keep = (j: RawJob, q: Query) => titleRelevant(j.title, roles(q));
const e = encodeURIComponent;

export const apiSources: Adapter[] = [
  makeAdapter({ id: 'remotive', name: 'Remotive', note: 'Remote jobs worldwide. Free public API.', keep,
    fetch: async (q, ctx) => (await Promise.all(queries(q).map(r => getJson(`https://remotive.com/api/remote-jobs?limit=50&search=${e(r)}`, { ...ctx, source: 'Remotive' })))).flatMap(mapRemotive) }),
  makeAdapter({ id: 'jobicy', name: 'Jobicy', note: 'Remote jobs worldwide. Free public API.', keep,
    fetch: async (q, ctx) => (await Promise.all(queries(q).map(r => getJson(`https://jobicy.com/api/v2/remote-jobs?count=50&tag=${e(r)}`, { ...ctx, source: 'Jobicy' })))).flatMap(mapJobicy) }),
  makeAdapter({ id: 'arbeitnow', name: 'Arbeitnow', note: 'Mostly Europe, many English-language and remote roles. Free public API.', keep,
    async fetch(_q, ctx) { // paginated: first 3 pages
      const out: RawJob[] = [];
      for (let page = 1; page <= 3; page++) { const j = await getJson(`https://www.arbeitnow.com/api/job-board-api?page=${page}`, { ...ctx, source: 'Arbeitnow' }); out.push(...mapArbeitnow(j)); if (!j.links?.next) break; }
      return out;
    } }),
  makeAdapter({ id: 'remoteok', name: 'RemoteOK', note: 'Remote jobs worldwide. Free public API (links go back to remoteok.com).', keep,
    fetch: async (_q, ctx) => mapRemoteOk(await getJson('https://remoteok.com/api', { ...ctx, source: 'RemoteOK' })) }),
  makeAdapter({ id: 'adzuna', name: 'Adzuna India', note: 'Indian job listings. Needs your own free key from developer.adzuna.com (Preferences).', keep,
    needs: q => q.adzuna?.id && q.adzuna.key ? null : 'Add a free Adzuna app id and key in Preferences to search Indian listings.',
    async fetch(q, ctx) { // paginated: 2 pages per query
      const out: RawJob[] = [];
      for (const r of queries(q)) for (const page of [1, 2])
        out.push(...mapAdzuna(await getJson(`https://api.adzuna.com/v1/api/jobs/in/search/${page}?app_id=${e(q.adzuna!.id)}&app_key=${e(q.adzuna!.key)}&results_per_page=50&what=${e(r)}&where=${e(q.locations[0] ?? '')}`, { ...ctx, source: 'Adzuna' })));
      return out;
    } }),
];
