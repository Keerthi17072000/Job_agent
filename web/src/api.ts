export interface Job {
  id: string; url: string; source: string; sourceKind: string; title: string; company: string; location: string; workMode: string;
  expLevel: string; salary: string; summary: string; requiredSkills: string[]; matchedSkills: string[]; missingSkills: string[];
  score: number; category: string; reasons: string[]; postedAt: string; deadline: string; status: string; firstSeen: string;
}
export interface Profile { name: string; totalExperienceYears: number; currentDesignation: string; allSkills: string[]; location: string; targetRoles: string[]; summary: string }
export interface Company { ats: string; token: string; name?: string }
export interface Prefs { roles: string[]; locations: string[]; workModes: string[]; minScore: number; blocklist: string[]; companies: Company[] }
export interface PortalInfo { id: string; name: string; policy: 'manual' | 'checked'; note: string }
export interface Run { adapter: string; name: string; status: string; reason: string; found: number; checked_at: string }
export interface State { profile: Profile | null; prefs: Prefs | null; jobs: Job[]; statuses: string[]; portals: PortalInfo[]; runs: Run[] }

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  const d = await r.json();
  if (!r.ok) throw new Error(d.error ?? r.statusText);
  return d;
}
export const api = {
  state: () => call<State>('/api/state'),
  resume: (f: File) => call('/api/resume', { method: 'POST', headers: { 'x-filename': f.name }, body: f }),
  prefs: (p: Prefs) => call('/api/prefs', { method: 'POST', body: JSON.stringify(p) }),
  search: () => call<{ results: { adapter: string; name: string; status: string; reason: string; found: number; added?: number; duplicate?: number }[] }>('/api/search', { method: 'POST' }),
  status: (id: string, s: string) => call(`/api/jobs/${id}/status/${s}`, { method: 'POST' }),
};
