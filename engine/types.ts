export type Status = 'new' | 'shortlisted' | 'interested' | 'applied' | 'interview' | 'rejected' | 'not_interested';
export const STATUSES: Status[] = ['new', 'shortlisted', 'interested', 'applied', 'interview', 'rejected', 'not_interested'];
export type WorkMode = 'remote' | 'hybrid' | 'office' | '';

/** What an adapter returns. Every job must carry a verifiable source and original URL. */
export interface RawJob {
  source: string; sourceKind: 'portal' | 'career';
  title: string; company: string; location: string; url: string; description: string;
  workMode?: WorkMode; salary?: string; postedAt?: string; deadline?: string; exp?: string;
}

export interface Profile {
  name: string; totalExperienceYears: number; currentDesignation: string; previousDesignations: string[];
  skills: { frontend: string[]; backend: string[]; frameworks: string[]; libraries: string[]; databases: string[]; cloud: string[]; aiMl: string[]; other: string[] };
  allSkills: string[];
  projects: { name: string; description: string; tech: string[] }[];
  education: { degree: string; institution: string; year: string }[];
  certifications: string[]; location: string;
  targetRoles: string[]; // inferred from experience, editable in preferences
  summary: string;
}

export interface Company { ats: 'greenhouse' | 'lever' | 'ashby' | 'smartrecruiters'; token: string; name?: string }
export interface Adzuna { id: string; key: string }
export interface Prefs { roles: string[]; locations: string[]; workModes: WorkMode[]; minScore: number; blocklist: string[]; companies: Company[]; adzuna?: Adzuna }
export interface Query { roles: string[]; locations: string[]; companies: Company[]; adzuna?: Adzuna }

export type Access = 'ok' | 'blocked' | 'manual' | 'error' | 'not_configured';
export interface AdapterResult { adapter: string; name: string; status: Access; reason: string; jobs: RawJob[] }
export interface Adapter { id: string; name: string; note: string; search(q: Query): Promise<AdapterResult> }

export interface Breakdown { skills: number; title: number; experience: number; responsibilities: number; location: number }
export interface Job {
  id: string; fingerprint: string; canonicalUrl: string; url: string;
  source: string; sourceKind: 'portal' | 'career';
  title: string; company: string; location: string; workMode: WorkMode;
  expMin: number | null; expMax: number | null; expLevel: string; salary: string; summary: string; description: string;
  requiredSkills: string[]; matchedSkills: string[]; missingSkills: string[];
  score: number; category: string; reasons: string[]; breakdown: Breakdown;
  postedAt: string; deadline: string; status: Status; firstSeen: string;
}
