import { apiSources } from '../../engine/adapters/apis.ts';
import { careerPages } from '../../engine/adapters/ats.ts';
import { PORTALS, portalName } from '../../engine/adapters/portalList.ts';
import { makeAi } from '../../engine/ai.ts';
import { parseLocal } from '../../engine/localResume.ts';
import { resumeCorpus } from '../../engine/match.ts';
import { ingest, toJob } from '../../engine/pipeline.ts';
import { normalizeProfile } from '../../engine/profile.ts';
import { buildQueries } from '../../engine/queries.ts';
import { STATUSES } from '../../engine/types.ts';
import type { AdapterResult, Job, LogEntry, Prefs, Profile, Query, RawJob, Status } from '../../engine/types.ts';
import { dot, embed } from './embed.ts';
import { checkResume, fileText } from './resumeFile.ts';
import * as store from './store.ts';

export type { Job, LogEntry, Prefs, Profile, Status };
export { STATUSES };
export interface Run { adapter: string; name: string; status: string; reason: string; found: number; checked_at: string; cached?: boolean; added?: number; duplicate?: number }
export interface State { slot: store.Slot; slots: store.Slot[]; profile: Profile | null; prefs: Prefs | null; jobs: Job[]; runs: Run[]; logs: LogEntry[]; lastSearch: string; queries: string[] }
export const SOURCES = [careerPages, ...apiSources];
export { PORTALS };

const CACHE_TTL = 6 * 3600e3;
const DEFAULT_PREFS: Prefs = { roles: [], locations: [], workModes: [], minScore: 60, blocklist: [], companies: [] };

// Data saved by an older version of the app has fewer fields. Fill every field on read so no screen can hit "undefined".
const readProfile = async () => { const p = await store.get<Profile>('profile'); return p ? normalizeProfile(p) : null; };
const readPrefs = async (): Promise<Prefs | null> => { const p = await store.get<Prefs>('prefs'); return p ? { ...DEFAULT_PREFS, ...p, roles: p.roles ?? [], locations: p.locations ?? [], workModes: p.workModes ?? [], blocklist: p.blocklist ?? [], companies: p.companies ?? [] } : null; };
const hydrateJob = (j: Job): Job => ({
  ...j, externalId: j.externalId ?? '', sources: j.sources?.length ? j.sources : [{ source: j.source, url: j.url }], locationFit: j.locationFit ?? 'unknown', salary: j.salary ?? '', salaryValue: j.salaryValue ?? 0,
  summary: j.summary ?? '', description: j.description ?? '', requiredSkills: j.requiredSkills ?? [], optionalSkills: j.optionalSkills ?? [], matchedSkills: j.matchedSkills ?? [], missingSkills: j.missingSkills ?? [], missingOptional: j.missingOptional ?? [],
  reasons: j.reasons ?? [], breakdown: Object.assign({ skills: 0, experience: 0, responsibilities: 0, title: 0, education: 0 }, j.breakdown), postedAt: j.postedAt ?? '', deadline: j.deadline ?? '', status: j.status ?? 'new', firstSeen: j.firstSeen ?? new Date().toISOString(),
});
const readJobs = async () => ((await store.get<Job[]>('jobs')) ?? []).map(hydrateJob);

async function need() {
  const [profile, prefs] = await Promise.all([readProfile(), readPrefs()]);
  if (!profile || !prefs) throw new Error('Upload a resume first');
  return { profile, prefs };
}
const jobsOf = readJobs;
const rawOf = (j: Job): RawJob => ({ source: j.source, sourceKind: j.sourceKind, title: j.title, company: j.company, location: j.location, url: j.url, description: j.description, workMode: j.workMode || undefined, salary: j.salary, postedAt: j.postedAt, deadline: j.deadline, externalId: j.externalId, exp: j.expMin == null ? '' : `${j.expMin}${j.expMax != null ? '-' + j.expMax : '+'} years` });

/** Recompute every stored job against the current profile and preferences, keeping the user's own data on each job. */
async function rescore() {
  const { profile, prefs } = await need();
  const out: Job[] = [];
  for (const j of await jobsOf()) {
    const n = toJob(rawOf(j), profile, prefs, j.semantic);
    if (typeof n === 'string') continue;
    out.push({ ...n, id: j.id, sources: j.sources, status: j.status, firstSeen: j.firstSeen, saved: j.saved, notes: j.notes, appliedAt: j.appliedAt, semantic: j.semantic });
  }
  await store.set('jobs', out);
}

const pool = async <T,>(items: T[], n: number, f: (x: T) => Promise<void>) => { let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await f(items[i++]); })); };

export const api = {
  init: async () => {
    const slots = await store.initSlots();
    // one-time upgrade of data saved by an older version: store the complete shapes and recompute scores with the current rules
    const raw = (await store.get<Job[]>('jobs')) ?? [];
    if (raw.some(j => !Array.isArray(j.sources) || !j.breakdown || j.breakdown.education === undefined)) {
      try { const { profile, prefs } = await need(); await store.set('profile', profile); await store.set('prefs', prefs); await rescore(); }
      catch { await store.set('jobs', await readJobs()); } // no profile to score with: keep the jobs, filled in
    }
    return slots;
  },

  state: async (): Promise<State> => {
    const [slots, profile, prefs, jobs, runs, logs, lastSearch] = await Promise.all([store.slots(), readProfile(), readPrefs(), readJobs(), store.get<Run[]>('runs'), store.get<LogEntry[]>('logs'), store.get<string>('lastSearch')]);
    const slot = slots.find(s => s.id === store.slotId()) ?? slots[0];
    return { slot, slots, profile: profile ?? null, prefs: prefs ?? null, jobs: (jobs ?? []).sort((a, b) => b.score - a.score || b.firstSeen.localeCompare(a.firstSeen)), runs: runs ?? [], logs: logs ?? [], lastSearch: lastSearch ?? '',
      queries: profile && prefs ? buildQueries(profile, prefs) : [] };
  },

  /** Read a resume file, extract the profile (own AI key if configured, otherwise the free on-device parser), and keep existing preferences. */
  resume: async (f: File) => {
    await checkResume(f);
    const text = await fileText(f);
    const old = await readPrefs();
    let profile: Profile, note = '';
    if (old?.aiKey && old.aiProvider) {
      try { profile = await makeAi(old.aiProvider, old.aiKey).extractProfile(text); }
      catch (e) { profile = parseLocal(text); note = `AI extraction failed (${(e as Error).message}); used the on-device parser.`; }
    } else profile = parseLocal(text);
    await store.set('profile', profile);
    await store.set('prefs', {
      ...DEFAULT_PREFS, ...old,
      roles: old?.roles.length ? old.roles : profile.targetRoles,
      locations: old?.locations.length ? old.locations : profile.location ? [profile.location] : [],
    } satisfies Prefs);
    return note;
  },

  saveProfile: async (p: Profile) => { await store.set('profile', normalizeProfile(p)); await rescore(); },
  savePrefs: async (p: Prefs) => { await store.set('prefs', p); await rescore(); },
  suggestQueries: async () => { const { profile, prefs } = await need(); if (!prefs.aiKey || !prefs.aiProvider) return buildQueries(profile, prefs); return [...new Set([...(await makeAi(prefs.aiProvider, prefs.aiKey).suggestQueries(profile)), ...buildQueries(profile, prefs)])].slice(0, 8); },

  /** Search every source in the background: bounded concurrency, per-source status as each finishes, cancellable, cached for 6 hours. */
  search: async (o: { fresh?: boolean; signal?: AbortSignal; onSource?: (r: Run) => void; onPhase?: (s: string) => void } = {}) => {
    const { profile, prefs } = await need();
    const queries = buildQueries(profile, prefs);
    const query: Query = { roles: prefs.roles, queries, locations: prefs.locations, companies: prefs.companies, adzuna: prefs.adzuna };
    const sig = JSON.stringify([queries, prefs.locations, prefs.companies, !!prefs.adzuna?.id]);
    const cache = (await store.get<Record<string, { at: number; sig: string; jobs: RawJob[] }>>('cache')) ?? {};
    const logs: LogEntry[] = [], log = (e: LogEntry) => logs.push(e);
    const results: Run[] = [], raws: RawJob[] = [];

    await pool(SOURCES, 3, async a => {
      let r: AdapterResult, cached = false;
      const c = cache[a.id];
      if (!o.fresh && c && c.sig === sig && Date.now() - c.at < CACHE_TTL) { r = { adapter: a.id, name: a.name, status: 'ok', reason: `From cache (${Math.round((Date.now() - c.at) / 60000)} min old). Use "Fresh search" to refetch.`, jobs: c.jobs }; cached = true; }
      else { r = await a.search(query, { log, signal: o.signal }); if (r.status === 'ok') cache[a.id] = { at: Date.now(), sig, jobs: r.jobs }; }
      const run: Run = { adapter: r.adapter, name: r.name, status: r.status, reason: r.reason, found: r.jobs.length, checked_at: new Date().toISOString(), cached };
      results.push(run); raws.push(...r.jobs); o.onSource?.(run);
    });

    // optional on-device semantic similarity for the responsibilities score; any failure falls back to word overlap
    let sim: Map<string, number> | undefined;
    if (prefs.semantic && raws.length) {
      try {
        o.onPhase?.('Loading the on-device model (first time downloads ~25 MB)…');
        const [rv] = await embed([resumeCorpus(profile).slice(0, 2000)]);
        sim = new Map();
        for (let i = 0; i < raws.length; i += 16) {
          o.onPhase?.(`Comparing job descriptions to your resume (${Math.min(i + 16, raws.length)}/${raws.length})…`);
          const batch = raws.slice(i, i + 16), vs = await embed(batch.map(r => `${r.title}. ${r.description}`.replace(/<[^>]+>/g, ' ').slice(0, 1500)));
          batch.forEach((r, k) => sim!.set(r.url, dot(rv, vs[k])));
        }
      } catch (e) { sim = undefined; log({ at: new Date().toISOString(), source: 'semantic', level: 'warn', msg: `Semantic matching unavailable (${(e as Error).message}); using word overlap.` }); }
    }

    o.onPhase?.('Scoring and removing duplicates…');
    const jobs = await jobsOf();
    const counts = ingest(raws, profile, prefs, jobs, r => sim?.get(r.url));
    if (sim) for (const j of jobs) if (sim.has(j.url) && j.semantic == null) j.semantic = sim.get(j.url);
    const perSource = results.map(r => ({ ...r }));
    await Promise.all([store.set('jobs', jobs), store.set('runs', perSource), store.set('cache', cache), store.set('lastSearch', new Date().toISOString()),
      store.set('logs', [...logs, ...((await store.get<LogEntry[]>('logs')) ?? [])].slice(0, 300))]);
    return { results: perSource, added: counts.added, duplicate: counts.duplicate };
  },

  /** Pull listings the browser extension collected from portal pages you viewed. */
  importExtension: () => new Promise<Record<string, number>>((resolve, reject) => {
    const timer = setTimeout(() => { removeEventListener('message', onMsg); reject(new Error('Extension not detected. Install it from the extension/ folder and reload this page.')); }, 1500);
    const onMsg = async (e: MessageEvent) => {
      if (e.source !== window || e.data?.type !== 'jobagent-jobs') return;
      clearTimeout(timer); removeEventListener('message', onMsg);
      try {
        const { profile, prefs } = await need();
        const raws = (e.data.jobs as RawJob[]).map(j => ({ ...j, source: portalName(j.source), sourceKind: 'portal' as const, description: j.description ?? '' }));
        const jobs = await jobsOf(); const counts = ingest(raws, profile, prefs, jobs);
        await store.set('jobs', jobs); resolve({ received: raws.length, ...counts });
      } catch (err) { reject(err); }
    };
    addEventListener('message', onMsg);
    postMessage({ type: 'jobagent-pull' }, location.origin);
  }),

  updateJob: async (id: string, patch: Partial<Pick<Job, 'status' | 'saved' | 'notes'>>) => {
    const jobs = await jobsOf();
    await store.set('jobs', jobs.map(j => j.id !== id ? j : { ...j, ...patch, appliedAt: patch.status === 'applied' && !j.appliedAt ? new Date().toISOString() : j.appliedAt }));
  },

  newSlot: async (name: string) => { const list = await store.slots(); const s = { id: `p${Date.now().toString(36)}`, name: name.trim() || 'New profile' }; await store.saveSlots([...list, s]); await store.useSlot(s.id); },
  switchSlot: (id: string) => store.useSlot(id),
  renameSlot: async (id: string, name: string) => store.saveSlots((await store.slots()).map(s => s.id === id ? { ...s, name: name.trim() || s.name } : s)),
  deleteSlot: async (id: string) => {
    const list = await store.slots(); if (list.length < 2) { await store.removeSlot(id); return; }
    await store.removeSlot(id); const rest = list.filter(s => s.id !== id); await store.saveSlots(rest); await store.useSlot(rest[0].id);
  },
  clearJobs: async () => { await Promise.all([store.set('jobs', []), store.set('runs', []), store.set('cache', {}), store.set('lastSearch', '')]); },
};
