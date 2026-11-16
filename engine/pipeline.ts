import { canonicalUrl, fingerprint, htmlToText } from './text.ts';
import { category, detectWorkMode, expLevel, match } from './match.ts';
import type { Job, Prefs, Profile, RawJob } from './types.ts';

/** 64-bit FNV-1a as 16 hex chars: stable id that works in browsers and Node. */
function hash(s: string): string {
  let a = 0x811c9dc5, b = 0x01000193 ^ s.length;
  for (let i = 0; i < s.length; i++) { a = Math.imul(a ^ s.charCodeAt(i), 16777619) >>> 0; b = Math.imul(b ^ s.charCodeAt(i), 2246822519) >>> 0; }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

export type Rejection = 'missing title/company' | 'no verifiable https url' | 'blocklisted';

/** Raw adapter output to a scored job. Refuses anything without a verifiable source and original URL. */
export function toJob(raw: RawJob, profile: Profile, prefs: Prefs): Job | Rejection {
  if (!raw.title?.trim() || !raw.company?.trim()) return 'missing title/company';
  let cUrl: string;
  try { if (!/^https:\/\//i.test(raw.url)) throw 0; cUrl = canonicalUrl(raw.url); } catch { return 'no verifiable https url'; }
  const hay = `${raw.title} ${raw.company}`.toLowerCase();
  if (prefs.blocklist.some(b => b && hay.includes(b.toLowerCase()))) return 'blocklisted';

  const description = htmlToText(raw.description ?? '').slice(0, 8000);
  const workMode = raw.workMode || detectWorkMode(`${raw.location} ${raw.title} ${description.slice(0, 600)}`);
  const m = match(profile, prefs, { title: raw.title, location: raw.location, workMode, text: `${raw.title}\n${raw.exp ?? ''}\n${description}` });
  const fp = fingerprint(raw.company, raw.title, raw.location);
  return {
    id: hash(fp), fingerprint: fp, canonicalUrl: cUrl, url: raw.url,
    source: raw.source, sourceKind: raw.sourceKind, title: raw.title.trim(), company: raw.company.trim(), location: (raw.location ?? '').trim(), workMode,
    expMin: m.expMin, expMax: m.expMax, expLevel: expLevel(m.expMin), salary: raw.salary ?? '',
    summary: description.slice(0, 300) + (description.length > 300 ? '…' : ''), description,
    requiredSkills: m.required, matchedSkills: m.matched, missingSkills: m.missing,
    score: m.score, category: category(m.score), reasons: m.reasons, breakdown: m.breakdown,
    postedAt: raw.postedAt ?? '', deadline: raw.deadline ?? '', status: 'new', firstSeen: new Date().toISOString(),
  };
}

/** Duplicate if company+title+location OR the canonical URL is already in `list`. */
export function addJob(list: Job[], j: Job): 'added' | 'duplicate' {
  if (list.some(x => x.fingerprint === j.fingerprint || x.canonicalUrl === j.canonicalUrl)) return 'duplicate';
  list.push(j); return 'added';
}

/** Score and add raw jobs to `list`; returns counts so nothing is dropped silently. */
export function ingest(raws: RawJob[], profile: Profile, prefs: Prefs, list: Job[]) {
  const out: Record<string, number> = { added: 0, duplicate: 0 };
  for (const raw of raws) {
    const j = toJob(raw, profile, prefs);
    // shortcut: full text is trimmed to 2000 chars so many jobs fit in localStorage; upgrade to IndexedDB for more
    const k = typeof j === 'string' ? `rejected: ${j}` : addJob(list, { ...j, description: j.description.slice(0, 2000) });
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}
