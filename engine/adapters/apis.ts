// Job boards that publish a free public JSON API callable from a browser. Each was probed live
// from a web page (CORS and response shape) before being added. The Muse failed that probe and is left out.
import { getJson, iso, titleRelevant } from './ats.ts';
import type { Adapter, AdapterResult, Query, RawJob } from '../types.ts';

const money = (cur?: string, lo?: number, hi?: number) => lo || hi ? `${cur ?? ''} ${lo ?? ''}${lo && hi ? '-' : ''}${hi ?? ''}`.trim() : '';

export const mapRemotive = (j: any): RawJob[] => (j.jobs ?? []).map((x: any) => ({
  source: 'Remotive', sourceKind: 'portal' as const, title: x.title, company: x.company_name, location: x.candidate_required_location || 'Remote',
  url: x.url, description: x.description ?? '', postedAt: iso(x.publication_date), salary: x.salary ?? '', workMode: 'remote' as const,
}));
export const mapJobicy = (j: any): RawJob[] => (j.jobs ?? []).map((x: any) => ({
  source: 'Jobicy', sourceKind: 'portal' as const, title: x.jobTitle, company: x.companyName, location: [].concat(x.jobGeo ?? 'Remote').join(', '),
  url: x.url, description: x.jobDescription ?? x.jobExcerpt ?? '', postedAt: iso(x.pubDate), salary: money(x.salaryCurrency, x.salaryMin, x.salaryMax), workMode: 'remote' as const,
}));
export const mapArbeitnow = (j: any): RawJob[] => (j.data ?? []).map((x: any) => ({
  source: 'Arbeitnow', sourceKind: 'portal' as const, title: x.title, company: x.company_name, location: x.location ?? '',
  url: x.url, description: x.description ?? '', postedAt: x.created_at ? iso(x.created_at * 1000) : '', workMode: x.remote ? 'remote' as const : undefined,
}));
export const mapRemoteOk = (j: any): RawJob[] => (Array.isArray(j) ? j : []).filter((x: any) => x?.position).map((x: any) => ({
  source: 'RemoteOK', sourceKind: 'portal' as const, title: x.position, company: x.company, location: x.location || 'Remote',
  url: x.url, description: x.description ?? '', postedAt: iso(x.date), salary: money('USD', x.salary_min, x.salary_max), workMode: 'remote' as const,
}));
// Adzuna field names are from its documentation; not verified live (needs the user's own free key).
export const mapAdzuna = (j: any): RawJob[] => (j.results ?? []).map((x: any) => ({
  source: 'Adzuna', sourceKind: 'portal' as const, title: x.title, company: x.company?.display_name ?? '', location: x.location?.display_name ?? '',
  url: x.redirect_url, description: x.description ?? '', postedAt: iso(x.created), salary: money('INR', x.salary_min, x.salary_max),
}));

function api(id: string, name: string, note: string, fetchRaw: (q: Query) => Promise<RawJob[]>, needs?: (q: Query) => string | null): Adapter {
  return {
    id, name, note,
    async search(q): Promise<AdapterResult> {
      const base = { adapter: id, name };
      if (!q.roles.length) return { ...base, status: 'not_configured', reason: 'Add at least one target role in Preferences.', jobs: [] };
      const missing = needs?.(q);
      if (missing) return { ...base, status: 'not_configured', reason: missing, jobs: [] };
      try {
        const jobs = (await fetchRaw(q)).filter(j => j.title && j.url && titleRelevant(j.title, q.roles));
        return { ...base, status: 'ok', reason: `Read ${jobs.length} matching listings.`, jobs };
      } catch (e) {
        const m = (e as Error).message;
        return { ...base, status: 'error', reason: /fetch/i.test(m) ? 'Unreachable, or blocked by the browser (CORS).' : m, jobs: [] };
      }
    },
  };
}
const roles = (q: Query) => q.roles.slice(0, 3);

export const apiSources: Adapter[] = [
  api('remotive', 'Remotive', 'Remote jobs worldwide. Free public API.',
    async q => (await Promise.all(roles(q).map(r => getJson(`https://remotive.com/api/remote-jobs?limit=50&search=${encodeURIComponent(r)}`)))).flatMap(mapRemotive)),
  api('jobicy', 'Jobicy', 'Remote jobs worldwide. Free public API.',
    async q => (await Promise.all(roles(q).map(r => getJson(`https://jobicy.com/api/v2/remote-jobs?count=50&tag=${encodeURIComponent(r)}`)))).flatMap(mapJobicy)),
  api('arbeitnow', 'Arbeitnow', 'Mostly Europe, many English-language and remote roles. Free public API.',
    async () => mapArbeitnow(await getJson('https://www.arbeitnow.com/api/job-board-api'))),
  api('remoteok', 'RemoteOK', 'Remote jobs worldwide. Free public API (links go back to remoteok.com).',
    async () => mapRemoteOk(await getJson('https://remoteok.com/api'))),
  api('adzuna', 'Adzuna India', 'Indian job listings. Needs your own free key from developer.adzuna.com (Preferences).',
    async q => (await Promise.all(roles(q).map(r => getJson(`https://api.adzuna.com/v1/api/jobs/in/search/1?app_id=${encodeURIComponent(q.adzuna!.id)}&app_key=${encodeURIComponent(q.adzuna!.key)}&results_per_page=50&what=${encodeURIComponent(r)}&where=${encodeURIComponent(q.locations[0] ?? '')}`)))).flatMap(mapAdzuna),
    q => q.adzuna?.id && q.adzuna.key ? null : 'Add a free Adzuna app id and key in Preferences to search Indian listings.'),
];
