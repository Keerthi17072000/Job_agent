import { canonicalUrl, fingerprint, htmlToText, norm, salaryValue, similarity } from './text.ts';
import { category, detectWorkMode, expLevel, match } from './match.ts';
import { ANYWHERE, inRegion, regionsOf } from './region.ts';
import type { Job, Prefs, Profile, RawJob } from './types.ts';

/** 64-bit FNV-1a as 16 hex chars: stable id that works in browsers and Node. */
function hash(s: string): string {
  let a = 0x811c9dc5, b = 0x01000193 ^ s.length;
  for (let i = 0; i < s.length; i++) { a = Math.imul(a ^ s.charCodeAt(i), 16777619) >>> 0; b = Math.imul(b ^ s.charCodeAt(i), 2246822519) >>> 0; }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

/** Countries a job is open to; a remote job with no place named is open to anyone. */
export const jobRegions = (location: string | undefined, workMode?: string) => { const r = regionsOf(location ?? ''); return r.length ? r : workMode === 'remote' ? [ANYWHERE] : []; };

export type Rejection = 'missing title/company' | 'no verifiable https url' | 'blocklisted' | 'outside your region';

/** Raw adapter output to a scored job. Refuses anything without a verifiable source and original URL. `semantic` is an optional embedding similarity (0..1) for responsibilities. */
export function toJob(raw: RawJob, profile: Profile, prefs: Prefs, semantic?: number): Job | Rejection {
  if (!raw.title?.trim() || !raw.company?.trim()) return 'missing title/company';
  let cUrl: string;
  try { if (!/^https:\/\//i.test(raw.url)) throw 0; cUrl = canonicalUrl(raw.url); } catch { return 'no verifiable https url'; }
  const hay = `${raw.title} ${raw.company}`.toLowerCase();
  if (prefs.blocklist.some(b => b && hay.includes(b.toLowerCase()))) return 'blocklisted';

  const description = htmlToText(raw.description ?? '').slice(0, 12000);
  const workMode = raw.workMode || detectWorkMode(`${raw.location} ${raw.title} ${description.slice(0, 600)}`);
  const m = match(profile, prefs, { title: raw.title, location: raw.location ?? '', workMode, text: `${raw.title}\n${raw.exp ?? ''}\n${description}` }, semantic);
  const fp = fingerprint(raw.company, raw.title, raw.location);
  return {
    id: hash(fp), fingerprint: fp, canonicalUrl: cUrl, url: raw.url, externalId: raw.externalId ?? '', sources: [{ source: raw.source, url: raw.url }],
    source: raw.source, sourceKind: raw.sourceKind, title: raw.title.trim(), company: raw.company.trim(), location: (raw.location ?? '').trim(), regions: jobRegions(raw.location, workMode), workMode, locationFit: m.locationFit,
    expMin: m.expMin, expMax: m.expMax, expLevel: expLevel(m.expMin), salary: raw.salary ?? '', salaryValue: salaryValue(raw.salary ?? ''),
    summary: description.slice(0, 300) + (description.length > 300 ? '…' : ''), description,
    requiredSkills: m.required, optionalSkills: m.optional, matchedSkills: m.matched, missingSkills: m.missing, missingOptional: m.missingOptional,
    score: m.score, category: category(m.score), reasons: m.reasons, breakdown: m.breakdown,
    postedAt: raw.postedAt ?? '', deadline: raw.deadline ?? '', status: 'new', firstSeen: new Date().toISOString(),
  };
}

const titleWords = (t: string) => new Set(t.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2));
const titleOverlap = (a: string, b: string) => { const A = titleWords(a), B = titleWords(b); let n = 0; for (const w of A) if (B.has(w)) n++; return A.size && B.size ? n / Math.max(A.size, B.size) : 0; };

/** The existing entry that is the same vacancy, if any. Different vacancies with similar titles stay separate. */
export function findDuplicate(list: Job[], j: Job): Job | undefined {
  return list.find(x =>
    x.fingerprint === j.fingerprint || x.canonicalUrl === j.canonicalUrl ||
    (j.externalId && x.externalId === j.externalId && x.source === j.source) ||
    (norm(x.company) === norm(j.company) && titleOverlap(x.title, j.title) >= 0.6 && x.description.length > 200 && j.description.length > 200 && similarity(x.description, j.description) >= 0.85
      && (!x.location || !j.location || norm(x.location) === norm(j.location) || x.workMode === 'remote' && j.workMode === 'remote')));
}

/** Add `j` unless it is a duplicate; a duplicate contributes its source link to the canonical entry. */
export function addJob(list: Job[], j: Job): 'added' | 'duplicate' {
  const dup = findDuplicate(list, j);
  if (dup) { if (!dup.sources.some(s => canonicalUrl(s.url) === j.canonicalUrl)) dup.sources.push(...j.sources); return 'duplicate'; }
  list.push(j); return 'added';
}

/** Score and add raw jobs to `list`; returns counts so nothing is dropped silently. */
export function ingest(raws: RawJob[], profile: Profile, prefs: Prefs, list: Job[], semantic?: (raw: RawJob) => number | undefined) {
  const out: Record<string, number> = { added: 0, duplicate: 0 };
  for (const raw of raws) {
    // the region filter applies when jobs are collected; rescoring stored jobs never removes them
    const j = !inRegion(jobRegions(raw.location, raw.workMode), prefs.region, prefs.includeRemote === true) ? 'outside your region' as const : toJob(raw, profile, prefs, semantic?.(raw));
    const k = typeof j === 'string' ? `rejected: ${j}` : addJob(list, j);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}
