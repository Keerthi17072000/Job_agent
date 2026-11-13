import { createHash } from 'node:crypto';
import { canonicalUrl, fingerprint, htmlToText } from './text.ts';
import { category, detectWorkMode, expLevel, match } from './match.ts';
import type { Job, Prefs, Profile, RawJob } from './types.ts';

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
    id: createHash('sha1').update(fp).digest('hex').slice(0, 16), fingerprint: fp, canonicalUrl: cUrl, url: raw.url,
    source: raw.source, sourceKind: raw.sourceKind, title: raw.title.trim(), company: raw.company.trim(), location: (raw.location ?? '').trim(), workMode,
    expMin: m.expMin, expMax: m.expMax, expLevel: expLevel(m.expMin), salary: raw.salary ?? '',
    summary: description.slice(0, 300) + (description.length > 300 ? '…' : ''), description,
    requiredSkills: m.required, matchedSkills: m.matched, missingSkills: m.missing,
    score: m.score, category: category(m.score), reasons: m.reasons, breakdown: m.breakdown,
    postedAt: raw.postedAt ?? '', deadline: raw.deadline ?? '', status: 'new', firstSeen: new Date().toISOString(),
  };
}
