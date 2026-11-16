export interface Job {
  id: string; url: string; source: string; sourceKind: string; title: string; company: string; location: string; workMode: string;
  expLevel: string; salary: string; summary: string; requiredSkills: string[]; matchedSkills: string[]; missingSkills: string[];
  score: number; category: string; reasons: string[]; postedAt: string; deadline: string; status: string; firstSeen: string;
}
export interface Profile { name: string; totalExperienceYears: number; currentDesignation: string; allSkills: string[]; location: string; targetRoles: string[]; summary: string }
export interface Company { ats: string; token: string; name?: string }
export interface Prefs { roles: string[]; locations: string[]; workModes: string[]; minScore: number; blocklist: string[]; companies: Company[]; adzuna?: { id: string; key: string } }
export interface PortalInfo { id: string; name: string; note: string; extension: boolean; searchUrl: (role: string, location: string) => string }
export interface SourceInfo { id: string; name: string; note: string }
export interface Run { adapter: string; name: string; status: string; reason: string; found: number; checked_at: string }
export interface State { profile: Profile | null; prefs: Prefs | null; jobs: Job[]; statuses: string[]; portals: PortalInfo[]; sources: SourceInfo[]; runs: Run[] }

import { careerPages } from '../../engine/adapters/ats.ts';
import { apiSources } from '../../engine/adapters/apis.ts';
import { PORTALS, portalName } from '../../engine/adapters/portalList.ts';
import { ingest } from '../../engine/pipeline.ts';
import { parseLocal } from '../../engine/localResume.ts';
import { STATUSES } from '../../engine/types.ts';
import type { Job as EJob, Prefs as EPrefs, Profile as EProfile, RawJob } from '../../engine/types.ts';
import { fileText } from './resumeFile.ts';

const SOURCES = [careerPages, ...apiSources];

// Everything runs in the browser. Data lives in this browser's localStorage and never leaves it,
// except the public job-board requests for the companies you list.
const read = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem('ja.' + k); return v ? JSON.parse(v) : d; } catch { return d; } };
const write = (k: string, v: unknown) => {
  try { localStorage.setItem('ja.' + k, JSON.stringify(v)); } catch { throw new Error('Browser storage is full or blocked. Remove some jobs or allow site storage.'); }
};

function needProfile() {
  const profile = read<EProfile | null>('profile', null), prefs = read<EPrefs | null>('prefs', null);
  if (!profile || !prefs) throw new Error('Upload a resume first');
  return { profile, prefs };
}

export const api = {
  state: async (): Promise<State> => ({
    profile: read('profile', null), prefs: read('prefs', null),
    jobs: read<EJob[]>('jobs', []).sort((a, b) => b.score - a.score || b.firstSeen.localeCompare(a.firstSeen)),
    statuses: STATUSES, portals: PORTALS, sources: SOURCES.map(({ id, name, note }) => ({ id, name, note })), runs: read<Run[]>('runs', []),
  }),
  resume: async (f: File) => {
    const profile = parseLocal(await fileText(f));
    write('profile', profile);
    const old = read<EPrefs | null>('prefs', null);
    write('prefs', {
      workModes: [], minScore: 60, blocklist: [], companies: [], ...old,
      roles: old?.roles.length ? old.roles : profile.targetRoles,
      locations: old?.locations.length ? old.locations : profile.location ? [profile.location] : [],
    } satisfies EPrefs);
  },
  prefs: async (p: Prefs) => write('prefs', p),
  search: async (onSource?: (r: { adapter: string; name: string; status: string; reason: string; found: number }) => void) => {
    const { profile, prefs } = needProfile();
    const query = { roles: prefs.roles, locations: prefs.locations, companies: prefs.companies as EPrefs['companies'], adzuna: prefs.adzuna };
    const found = await Promise.all(SOURCES.map(async a => { const r = await a.search(query); onSource?.({ adapter: r.adapter, name: r.name, status: r.status, reason: r.reason, found: r.jobs.length }); return r; })); // each adapter reports its own failure; the UI shows each as it lands
    const jobs = read<EJob[]>('jobs', []);
    const checked_at = new Date().toISOString();
    const results = found.map(r => ({ adapter: r.adapter, name: r.name, status: r.status, reason: r.reason, found: r.jobs.length, checked_at, ...(c => ({ added: c.added, duplicate: c.duplicate }))(ingest(r.jobs, profile, prefs, jobs)) }));
    write('jobs', jobs);
    write('runs', results.map(({ adapter, name, status, reason, found, checked_at }) => ({ adapter, name, status, reason, found, checked_at })));
    return { results };
  },
  status: async (id: string, s: string) => { write('jobs', read<EJob[]>('jobs', []).map(j => j.id === id ? { ...j, status: s as EJob['status'] } : j)); },
  /** Pull listings the browser extension collected from portal pages you viewed. */
  importExtension: () => new Promise<Record<string, number>>((resolve, reject) => {
    const timer = setTimeout(() => { removeEventListener('message', onMsg); reject(new Error('Extension not detected. Install it from the extension/ folder and reload this page.')); }, 1500);
    const onMsg = (e: MessageEvent) => {
      if (e.source !== window || e.data?.type !== 'jobagent-jobs') return;
      clearTimeout(timer); removeEventListener('message', onMsg);
      try {
        const { profile, prefs } = needProfile();
        const raws = (e.data.jobs as RawJob[]).map(j => ({ ...j, source: portalName(j.source), sourceKind: 'portal' as const, description: j.description ?? '' }));
        const jobs = read<EJob[]>('jobs', []);
        const counts = ingest(raws, profile, prefs, jobs);
        write('jobs', jobs); resolve({ received: raws.length, ...counts });
      } catch (err) { reject(err); }
    };
    addEventListener('message', onMsg);
    postMessage({ type: 'jobagent-pull' }, location.origin);
  }),
};
