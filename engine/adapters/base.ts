import type { Adapter, AdapterResult, Query, RawJob, SearchCtx, SourceStatus } from '../types.ts';

/** Unusable listings (no title, company or https link) are dropped here, never shown. */
export function normalizeJob(raw: unknown): RawJob | null {
  const j = raw as Partial<RawJob> | null;
  if (!j || typeof j !== 'object') return null;
  const title = String(j.title ?? '').trim(), company = String(j.company ?? '').trim(), url = String(j.url ?? '').trim();
  if (!title || !company || !/^https:\/\//i.test(url)) return null;
  return { ...(j as RawJob), title, company, url, location: String(j.location ?? '').trim(), description: String(j.description ?? '') };
}

const msg = (e: unknown) => { const m = (e as Error).message; return /fetch/i.test(m) ? 'Unreachable, or blocked by the browser (CORS).' : m; };

export interface AdapterSpec {
  id: string; name: string; note: string;
  fetch(q: Query, ctx: SearchCtx): Promise<RawJob[]>;
  needs?(q: Query): string | null;                       // reason the source cannot run yet (setup missing)
  skip?(q: Query): string | null;                        // reason the source does not apply to this search (wrong region)
  keep?(job: RawJob, q: Query): boolean;                 // relevance filter applied after normalizing
  details?(job: RawJob, ctx: SearchCtx): Promise<RawJob>;
}

export function makeAdapter(spec: AdapterSpec): Adapter {
  let status: SourceStatus = { state: 'unknown', reason: spec.note, checkedAt: '' };
  const set = (state: SourceStatus['state'], reason: string) => { status = { state, reason, checkedAt: new Date().toISOString() }; };
  const a: Adapter = {
    id: spec.id, name: spec.name, note: spec.note,
    normalizeJob,
    getSourceStatus: () => status,
    getJobDetails: async (job, ctx = {}) => spec.details ? spec.details(job, ctx) : job,
    async searchJobs(q, ctx = {}) {
      const raw = await spec.fetch(q, { ...ctx });
      return raw.map(normalizeJob).filter((j): j is RawJob => !!j && (spec.keep?.(j, q) ?? true));
    },
    async search(q, ctx = {}): Promise<AdapterResult> {
      const base = { adapter: spec.id, name: spec.name };
      const log = (level: 'info' | 'warn' | 'error', m: string) => ctx.log?.({ at: new Date().toISOString(), source: spec.name, level, msg: m });
      if (!q.roles.length && !q.queries.length) { set('not_configured', 'Add at least one target role.'); return { ...base, status: 'not_configured', reason: status.reason, jobs: [] }; }
      const skipped = spec.skip?.(q);
      if (skipped) { set('skipped', skipped); return { ...base, status: 'skipped', reason: skipped, jobs: [] }; }
      const missing = spec.needs?.(q);
      if (missing) { set('not_configured', missing); return { ...base, status: 'not_configured', reason: missing, jobs: [] }; }
      try {
        log('info', 'searching');
        const jobs = await a.searchJobs(q, ctx);
        set('ok', `Read ${jobs.length} matching listings.`); log('info', `${jobs.length} listings`);
        return { ...base, status: 'ok', reason: status.reason, jobs };
      } catch (e) {
        set('error', msg(e)); log('error', msg(e));
        return { ...base, status: 'error', reason: status.reason, jobs: [] }; // one failing source never stops the others
      }
    },
  };
  return a;
}
