import { apiSources } from '../../engine/adapters/apis.ts';
import { careerPages } from '../../engine/adapters/ats.ts';
import { PORTALS, portalName } from '../../engine/adapters/portalList.ts';
import { makeAi } from '../../engine/ai.ts';
import { defaultRegion, regionFromPhone } from '../../engine/region.ts';
import { parseLocal } from '../../engine/localResume.ts';
import { resumeCorpus } from '../../engine/match.ts';
import { findCompanyBoards } from '../../engine/adapters/discover.ts';
import { addJob, ingest, toJob } from '../../engine/pipeline.ts';
import { normalizeProfile } from '../../engine/profile.ts';
import { buildQueries } from '../../engine/queries.ts';
import { STATUSES } from '../../engine/types.ts';
import type { AdapterResult, Company, Job, LogEntry, Prefs, Profile, Query, RawJob, Status } from '../../engine/types.ts';
import { boardsFor } from './boards.ts';
import { dot, embed } from './embed.ts';
import { checkResume, fileText } from './resumeFile.ts';
import * as store from './store.ts';

export type { Job, LogEntry, Prefs, Profile, Status };
export { STATUSES };
export interface Run { adapter: string; name: string; status: string; reason: string; found: number; checked_at: string; cached?: boolean; added?: number; duplicate?: number }
export interface PortalResult { portal: string; name: string; found: number; added: number; duplicate: number; blocked?: string; error?: string }
export interface State { photo: string; resumeText: string; slot: store.Slot; slots: store.Slot[]; profile: Profile | null; prefs: Prefs | null; jobs: Job[]; runs: Run[]; logs: LogEntry[]; lastSearch: string; queries: string[] }
export const SOURCES = [careerPages, ...apiSources];
export { PORTALS };

const CACHE_TTL = 6 * 3600e3;
const DEFAULT_PREFS: Prefs = { roles: [], locations: [], workModes: [], minScore: 60, blocklist: [], companies: [] };

// Data saved by an older version of the app has fewer fields. Fill every field on read so no screen can hit "undefined".
const readProfile = async () => { const p = await store.get<Profile>('profile'); return p ? normalizeProfile(p) : null; };
const readPrefs = async (): Promise<Prefs | null> => { const p = await store.get<Prefs>('prefs'); return p ? { ...DEFAULT_PREFS, ...p, roles: p.roles ?? [], locations: p.locations ?? [], workModes: p.workModes ?? [], blocklist: p.blocklist ?? [], companies: p.companies ?? [] } : null; };
const hydrateJob = (j: Job): Job => ({
  ...j, regions: j.regions ?? [], externalId: j.externalId ?? '', sources: j.sources?.length ? j.sources : [{ source: j.source, url: j.url }], locationFit: j.locationFit ?? 'unknown', salary: j.salary ?? '', salaryValue: j.salaryValue ?? 0,
  summary: j.summary ?? '', description: j.description ?? '', requiredSkills: j.requiredSkills ?? [], optionalSkills: j.optionalSkills ?? [], matchedSkills: j.matchedSkills ?? [], missingSkills: j.missingSkills ?? [], missingOptional: j.missingOptional ?? [],
  reasons: j.reasons ?? [], breakdown: Object.assign({ skills: 0, experience: 0, responsibilities: 0, title: 0, education: 0 }, j.breakdown), postedAt: j.postedAt ?? '', deadline: j.deadline ?? '', status: j.status ?? 'new', firstSeen: j.firstSeen ?? new Date().toISOString(),
});
const readJobs = async () => ((await store.get<Job[]>('jobs')) ?? []).map(hydrateJob);

async function need() {
  const [profile, prefs] = await Promise.all([readProfile(), readPrefs()]);
  if (!profile || !prefs) throw new Error('Upload a resume first');
  return { profile, prefs };
}
/** Without a resume there is nothing to score against: an empty profile lets the same code run, and the results are marked "Not scored". */
const GUEST = normalizeProfile({} as Profile);
async function needOrGuest() {
  const [profile, prefs] = await Promise.all([readProfile(), readPrefs()]);
  return { profile: profile ?? GUEST, prefs: prefs ?? { ...DEFAULT_PREFS, minScore: 0 }, guest: !profile };
}
const unscored = (j: Job): Job => Object.assign(j, { score: 0, category: 'Not scored', reasons: [], matchedSkills: [], missingSkills: [], missingOptional: [], breakdown: { skills: 0, experience: 0, responsibilities: 0, title: 0, education: 0 } });
const jobsOf = readJobs;
const rawOf = (j: Job): RawJob => ({ source: j.source, sourceKind: j.sourceKind, title: j.title, company: j.company, location: j.location, url: j.url, description: j.description, workMode: j.workMode || undefined, salary: j.salary, postedAt: j.postedAt, deadline: j.deadline, externalId: j.externalId, exp: j.expMin == null ? '' : `${j.expMin}${j.expMax != null ? '-' + j.expMax : '+'} years` });

/** Recompute every stored job against the current profile and preferences, keeping the user's own data on each job. */
async function rescore() {
  const { profile, prefs, guest } = await needOrGuest();
  if (guest) { await store.set('jobs', (await jobsOf()).map(unscored)); return; }
  const out: Job[] = [];
  for (const j of await jobsOf()) {
    const n = toJob(rawOf(j), profile, prefs, j.semantic);
    if (typeof n === 'string') continue;
    out.push({ ...n, id: j.id, sources: j.sources, status: j.status, firstSeen: j.firstSeen, saved: j.saved, notes: j.notes, appliedAt: j.appliedAt, semantic: j.semantic });
  }
  await store.set('jobs', out);
}

let reqSeq = 0;
/** Ask the browser extension (through its bridge on this page) and wait for the reply with the same id. */
function extRequest<T>(type: string, payload: object, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = ++reqSeq;
    const timer = setTimeout(() => { removeEventListener('message', on); reject(new Error('The extension did not answer.')); }, timeoutMs);
    const on = (e: MessageEvent) => { if (e.source !== window || e.data?.type !== 'jobagent-reply' || e.data.id !== id) return; clearTimeout(timer); removeEventListener('message', on); resolve(e.data as T); };
    addEventListener('message', on); postMessage({ type, id, ...payload }, location.origin);
  });
}

const pool = async <T,>(items: T[], n: number, f: (x: T) => Promise<void>) => { let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await f(items[i++]); })); };

export const api = {
  init: async () => {
    let slots = await store.initSlots();
    // one-time upgrade of data saved by an older version: store the complete shapes and recompute scores with the current rules
    const prof = await readProfile(), slot = slots.find(x => x.id === store.slotId());
    if (slot && prof?.name && slot.name === 'My profile') await store.saveSlots(slots.map(x => x.id === slot.id ? { ...x, name: prof.name } : x));
    const raw = (await store.get<Job[]>('jobs')) ?? [];
    if (raw.some(j => !Array.isArray(j.sources) || !j.breakdown || j.breakdown.education === undefined)) {
      try { const { profile, prefs } = await need(); await store.set('profile', profile); await store.set('prefs', prefs); await rescore(); }
      catch { await store.set('jobs', await readJobs()); } // no profile to score with: keep the jobs, filled in
    }
    return store.slots();
  },

  state: async (): Promise<State> => {
    const [slots, profile, prefs, jobs, runs, logs, lastSearch, resumeText, photo] = await Promise.all([store.slots(), readProfile(), readPrefs(), readJobs(), store.get<Run[]>('runs'), store.get<LogEntry[]>('logs'), store.get<string>('lastSearch'), store.get<string>('resumeText'), store.get<string>('photo')]);
    const slot = slots.find(s => s.id === store.slotId()) ?? slots[0];
    return { photo: photo ?? '', resumeText: resumeText ?? '', slot, slots, profile: profile ?? null, prefs: prefs ?? null, jobs: (jobs ?? []).sort((a, b) => b.score - a.score || b.firstSeen.localeCompare(a.firstSeen)), runs: runs ?? [], logs: logs ?? [], lastSearch: lastSearch ?? '',
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
    // A new resume means a new search: roles and locations come from THIS resume (other settings are kept), and jobs found for the
    // previous resume are dropped. Jobs you saved or moved past "New" are kept and rescored against the new profile.
    const previous = await readProfile();
    if (previous && previous.name !== profile.name) await store.set('photo', ''); // a different person's resume must not keep the old photo
    await store.set('profile', profile); await store.set('resumeText', text.slice(0, 60000));
    const region = defaultRegion(profile.location) || regionFromPhone(profile.phone) || old?.region || ''; // the country of the new resume's location or phone number; kept from before when the resume names none
    const next = { ...DEFAULT_PREFS, ...old, roles: profile.targetRoles, locations: profile.location ? [profile.location] : [], region, includeRemote: old?.includeRemote ?? false } satisfies Prefs; // jobs open to anyone are off until asked for: they bring companies from everywhere
    if (!next.companies.length) next.companies = boardsFor(region); // companies that hire in the region, so the first search already lists them
    await store.set('prefs', next);
    const keep = (await readJobs()).filter(j => j.saved || j.status !== 'new');
    await Promise.all([store.set('jobs', keep), store.set('runs', []), store.set('cache', {}), store.set('lastSearch', '')]);
    await rescore();
    const slot = (await store.slots()).find(x => x.id === store.slotId());
    if (slot && profile.name && (/^(My profile|New profile)$/.test(slot.name) || slot.name === previous?.name)) await api.renameSlot(slot.id, profile.name); // name the profile after its owner
    return note;
  },

  /** No resume: remember what to search for. Jobs found are listed without a match score. */
  quickQuery: async (role: string, location: string, region: string) => {
    const old = await readPrefs();
    await store.set('prefs', { ...DEFAULT_PREFS, ...old, roles: [role], locations: location ? [location] : [], region, minScore: 0, includeRemote: !region, companies: old?.companies?.length ? old.companies : boardsFor(region) } satisfies Prefs);
  },
  /** Remove the uploaded resume and everything derived from it. Jobs you saved or tracked stay, without a score. */
  deleteResume: async () => {
    const old = await readPrefs();
    await Promise.all([store.del('profile'), store.del('resumeText'), store.del('photo'), store.set('runs', []), store.set('cache', {}), store.set('lastSearch', ''),
      store.set('prefs', { ...DEFAULT_PREFS, ...old, roles: [], locations: [], minScore: 0 }),
      store.set('jobs', (await readJobs()).filter(j => j.saved || j.status !== 'new').map(unscored))]);
  },
  saveProfile: async (p: Profile) => { await store.set('profile', normalizeProfile(p)); await rescore(); },
  savePrefs: async (p: Prefs) => { await store.set('prefs', p); await rescore(); },
  suggestQueries: async () => { const { profile, prefs } = await need(); if (!prefs.aiKey || !prefs.aiProvider) return buildQueries(profile, prefs); return [...new Set([...(await makeAi(prefs.aiProvider, prefs.aiKey).suggestQueries(profile)), ...buildQueries(profile, prefs)])].slice(0, 8); },

  /** Search every source in the background: bounded concurrency, per-source status as each finishes, cancellable, cached for 6 hours. */
  search: async (o: { fresh?: boolean; signal?: AbortSignal; onSource?: (r: Run) => void; onPhase?: (s: string) => void } = {}) => {
    const { profile, prefs, guest } = await needOrGuest();
    if (!prefs.roles.length) throw new Error('Enter a job title to search for.');
    const queries = buildQueries(profile, prefs);
    const query: Query = { region: prefs.region, roles: prefs.roles, queries, locations: prefs.locations, companies: prefs.companies, adzuna: prefs.adzuna };
    const sig = JSON.stringify([queries, prefs.locations, prefs.companies, !!prefs.adzuna?.id, prefs.region]);
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
    if (!guest && prefs.semantic && raws.length) {
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
    if (guest) jobs.forEach(unscored);
    if (sim) for (const j of jobs) if (sim.has(j.url) && j.semantic == null) j.semantic = sim.get(j.url);
    const perSource = results.map(r => ({ ...r }));
    await Promise.all([store.set('jobs', jobs), store.set('runs', [...((await store.get<Run[]>('runs')) ?? []).filter(r => !SOURCES.some(x => x.id === r.adapter)), ...perSource]), store.set('cache', cache), store.set('lastSearch', new Date().toISOString()),
      store.set('logs', [...logs, ...((await store.get<LogEntry[]>('logs')) ?? [])].slice(0, 300))]);
    return { results: perSource, added: counts.added, duplicate: counts.duplicate, outside: counts['rejected: outside your region'] ?? 0 };
  },

  /** Pull listings the browser extension collected from portal pages you viewed. */
  importExtension: () => new Promise<Record<string, number>>((resolve, reject) => {
    const timer = setTimeout(() => { removeEventListener('message', onMsg); reject(new Error('Extension not detected. Install it from the extension/ folder and reload this page.')); }, 1500);
    const onMsg = async (e: MessageEvent) => {
      if (e.source !== window || e.data?.type !== 'jobagent-jobs') return;
      clearTimeout(timer); removeEventListener('message', onMsg);
      try {
        const { profile, prefs, guest } = await needOrGuest();
        const raws = (e.data.jobs as RawJob[]).map(j => ({ ...j, source: portalName(j.source), sourceKind: 'portal' as const, description: j.description ?? '' }));
        const jobs = await jobsOf(); const counts = ingest(raws, profile, prefs, jobs); if (guest) jobs.forEach(unscored);
        await store.set('jobs', jobs); resolve({ received: raws.length, ...counts });
      } catch (err) { reject(err); }
    };
    addEventListener('message', onMsg);
    postMessage({ type: 'jobagent-pull' }, location.origin);
  }),

  /** Version string when the extension is installed and connected to this page, otherwise ''. */
  extensionStatus: async () => { try { return (await extRequest<{ version: string }>('jobagent-ping', {}, 1200)).version; } catch { return ''; } },

  /**
   * Search one restricted portal through the extension, in the user's own browser: the extension opens the portal's search page
   * (one page, because the user clicked), reads the listings, and the results are scored and shown here. A login or CAPTCHA stops it.
   */
  portalSearch: async (portalId: string): Promise<PortalResult> => {
    const portal = PORTALS.find(p => p.id === portalId); if (!portal) throw new Error('Unknown portal');
    const { profile, prefs, guest } = await needOrGuest();
    const role = buildQueries(profile, prefs)[0] ?? prefs.roles[0];
    if (!role) throw new Error('Add a target role first.');
    const r = await extRequest<{ jobs?: RawJob[]; blocked?: string; error?: string }>('jobagent-search', { url: portal.searchUrl(role, prefs.locations[0] ?? '') }, 90000);
    const raws = (r.jobs ?? []).map(j => ({ ...j, source: portalName(j.source), sourceKind: 'portal' as const, description: j.description ?? '' }));
    const jobs = await jobsOf(); const counts = ingest(raws, profile, prefs, jobs); if (guest) jobs.forEach(unscored); await store.set('jobs', jobs);
    const run: Run = { adapter: portal.id, name: portal.name, status: r.blocked ? 'blocked' : r.error ? 'error' : 'ok', reason: r.blocked ?? r.error ?? `Read ${raws.length} listings through your browser.`, found: raws.length, checked_at: new Date().toISOString(), added: counts.added, duplicate: counts.duplicate };
    await store.set('runs', [...((await store.get<Run[]>('runs')) ?? []).filter(x => x.adapter !== portal.id), run]);
    return { portal: portal.id, name: portal.name, found: raws.length, added: counts.added, duplicate: counts.duplicate, blocked: r.blocked, error: r.error };
  },

  /** Openings of one company on a restricted portal, read through the extension (user clicked). Only listings naming the company are kept; scored, not stored. */
  companyPortalSearch: async (portalId: string, company: string): Promise<{ jobs: Job[]; others: number; blocked?: string; error?: string }> => {
    const portal = PORTALS.find(p => p.id === portalId); if (!portal) throw new Error('Unknown portal');
    const { profile, prefs, guest } = await needOrGuest();
    const r = await extRequest<{ jobs?: RawJob[]; blocked?: string; error?: string }>('jobagent-search', { url: portal.searchUrl(company, '') }, 90000);
    const key = company.toLowerCase().replace(/[^a-z0-9]/g, ''), raws = (r.jobs ?? []).map(j => ({ ...j, source: portalName(j.source), sourceKind: 'portal' as const, description: j.description ?? '' }));
    const mine = raws.filter(j => j.company.toLowerCase().replace(/[^a-z0-9]/g, '').includes(key));
    const jobs = mine.map(raw => toJob(raw, profile, prefs)).filter((j): j is Job => typeof j === 'object').map(j => guest ? unscored(j) : j).sort((a, b) => b.score - a.score);
    return { jobs, others: raws.length - mine.length, blocked: r.blocked, error: r.error };
  },

  /** Profile photo for photo templates: cropped square, at most 320px, stored only in this browser. '' removes it. */
  setPhoto: async (file: File | null) => {
    if (!file) return store.set('photo', '');
    if (!file.type.startsWith('image/')) throw new Error('Choose an image file (JPG or PNG).');
    if (file.size > 8 * 1024 * 1024) throw new Error('That image is larger than 8 MB.');
    const bmp = await createImageBitmap(file).catch(() => { throw new Error('That image could not be read.'); });
    const side = Math.min(bmp.width, bmp.height), c = Object.assign(document.createElement('canvas'), { width: 320, height: 320 });
    c.getContext('2d')!.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, 320, 320);
    await store.set('photo', c.toDataURL('image/jpeg', 0.86));
  },

  /** Every opening of one company, found by trying its likely public job-board names. Scored against your resume but not stored until you save them. */
  lookupCompany: async (name: string) => {
    const { profile, prefs, guest } = await needOrGuest();
    return (await findCompanyBoards(name)).map(f => ({ label: f.label, company: f.company,
      jobs: f.jobs.map(raw => toJob(raw, profile, prefs)).filter((j): j is Job => typeof j === 'object').map(j => guest ? unscored(j) : j).sort((a, b) => b.score - a.score) }));
  },
  addCompany: async (c: Company) => { const { prefs } = await need(); if (!prefs.companies.some(x => x.ats === c.ats && x.token === c.token)) await store.set('prefs', { ...prefs, companies: [...prefs.companies, c] }); },
  saveJobs: async (found: Job[]) => { const jobs = await jobsOf(); let added = 0; for (const j of found) if (addJob(jobs, j) === 'added') added++; await store.set('jobs', jobs); return added; },

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
