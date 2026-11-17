export type Status = 'new' | 'shortlisted' | 'interested' | 'applied' | 'interview' | 'rejected' | 'not_interested';
export const STATUSES: Status[] = ['new', 'shortlisted', 'interested', 'applied', 'interview', 'rejected', 'not_interested'];
export type WorkMode = 'remote' | 'hybrid' | 'office' | '';

/** What an adapter returns. Every job must carry a verifiable source and original URL. */
export interface RawJob {
  source: string; sourceKind: 'portal' | 'career';
  title: string; company: string; location: string; url: string; description: string;
  workMode?: WorkMode; salary?: string; postedAt?: string; deadline?: string; exp?: string; externalId?: string;
}

export interface Experience { company: string; title: string; start: string; end: string; summary: string }
export interface Profile {
  name: string; email: string; phone: string; links: string[]; totalExperienceYears: number; seniority: string;
  currentDesignation: string; previousDesignations: string[];
  skills: { frontend: string[]; backend: string[]; frameworks: string[]; libraries: string[]; databases: string[]; cloud: string[]; aiMl: string[]; soft: string[]; other: string[] };
  allSkills: string[]; // every skill above, lower-cased; what the matcher compares against
  experience: Experience[];
  projects: { name: string; description: string; tech: string[] }[];
  education: { degree: string; institution: string; year: string; grade: string }[];
  certifications: string[]; industries: string[]; location: string;
  extras: { heading: string; text: string }[]; // sections such as Extra-curricular activities, Hobbies, Languages known: kept as written
  targetRoles: string[]; // inferred from experience, editable
  summary: string;
}

export interface Company { ats: 'greenhouse' | 'lever' | 'ashby' | 'smartrecruiters'; token: string; name?: string }
export interface Adzuna { id: string; key: string }
export interface Prefs { roles: string[]; locations: string[]; workModes: WorkMode[]; minScore: number; blocklist: string[]; companies: Company[]; adzuna?: Adzuna; minSalary?: number; aiProvider?: 'claude' | 'openai'; aiKey?: string; semantic?: boolean; autoRefresh?: boolean }
export interface Query { roles: string[]; queries: string[]; locations: string[]; companies: Company[]; adzuna?: Adzuna }

export type Access = 'ok' | 'blocked' | 'manual' | 'error' | 'not_configured';
export interface LogEntry { at: string; source: string; level: 'info' | 'warn' | 'error'; msg: string }
export interface SearchCtx { log?: (e: LogEntry) => void; signal?: AbortSignal }
export interface AdapterResult { adapter: string; name: string; status: Access; reason: string; jobs: RawJob[] }
export interface SourceStatus { state: Access | 'unknown'; reason: string; checkedAt: string }
/** Every job source implements this contract. */
export interface Adapter {
  id: string; name: string; note: string;
  searchJobs(q: Query, ctx?: SearchCtx): Promise<RawJob[]>;           // throws on failure
  getJobDetails(job: RawJob, ctx?: SearchCtx): Promise<RawJob>;       // enrich one listing; default returns it unchanged
  normalizeJob(raw: unknown): RawJob | null;                          // null = unusable (no title/company/https url)
  getSourceStatus(): SourceStatus;                                    // result of the last search
  search(q: Query, ctx?: SearchCtx): Promise<AdapterResult>;          // searchJobs with status, logging and failure isolation
}

export interface Breakdown { skills: number; title: number; experience: number; responsibilities: number; education: number }
export type LocationFit = 'match' | 'mismatch' | 'unknown';
export interface JobSource { source: string; url: string }
export interface Job {
  id: string; fingerprint: string; canonicalUrl: string; url: string; externalId: string;
  sources: JobSource[]; // every place this canonical job was seen
  source: string; sourceKind: 'portal' | 'career';
  title: string; company: string; location: string; workMode: WorkMode; locationFit: LocationFit;
  expMin: number | null; expMax: number | null; expLevel: string; salary: string; salaryValue: number; summary: string; description: string;
  requiredSkills: string[]; optionalSkills: string[]; matchedSkills: string[]; missingSkills: string[]; missingOptional: string[];
  score: number; category: string; reasons: string[]; breakdown: Breakdown;
  postedAt: string; deadline: string; status: Status; firstSeen: string;
  saved?: boolean; notes?: string; appliedAt?: string; semantic?: number; // user data and optional embedding similarity, kept across re-scoring
}
