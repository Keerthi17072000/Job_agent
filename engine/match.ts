import { GENERAL, TECH } from './lexicon.ts';
import type { Breakdown, LocationFit, Prefs, Profile, WorkMode } from './types.ts';

// Professional fit only. Location and salary are filters (see locationFit), never part of the score.
export const W = { skills: 0.35, experience: 0.20, responsibilities: 0.20, title: 0.15, education: 0.10 };

// Soft skills are deliberately not here: a posting mentioning "communication" must not count against a resume that does not list it.
export const VOCAB = [...TECH, ...GENERAL];
const ALIAS: Record<string, string> = { js: 'javascript', ts: 'typescript', nodejs: 'node.js', node: 'node.js', reactjs: 'react', 'react.js': 'react', vuejs: 'vue', nextjs: 'next.js', postgres: 'postgresql', mongo: 'mongodb', k8s: 'kubernetes', golang: 'go', 'amazon web services': 'aws', 'google cloud': 'gcp', ml: 'machine learning', 'scikit learn': 'scikit-learn', tf: 'tensorflow', 'ms excel': 'excel', 'microsoft excel': 'excel', 'ms office': 'ms office', 'powerbi': 'power bi', 'google analytics 4': 'google analytics' };
export const normSkill = (s: string) => { const k = s.toLowerCase().trim(); return ALIAS[k] ?? k; };

const has = (text: string, term: string) => {
  const t = term.replace(/[.+*?^${}()|[\]\\/]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9+#.])${t}($|[^a-z0-9+#])`, 'i').test(text);
};
const OPTIONAL_HEAD = /(^|\n)\s*(nice[- ]to[- ]have|preferred(\s+(qualifications|skills|experience))?|good to have|bonus(\s+points)?|desirable|a plus|plus points)\b[^\n]{0,40}/i;

/** Skills a posting mentions, split into required (before any "nice to have" heading) and optional (after it). Terms come from the shared vocabulary and from the candidate's own skills. */
export function jobSkills(text: string, profileSkills: string[]): { required: string[]; optional: string[] } {
  const cut = OPTIONAL_HEAD.exec(text), req = cut ? text.slice(0, cut.index) : text, opt = cut ? text.slice(cut.index) : '';
  const terms = new Set([...VOCAB, ...profileSkills.map(s => s.toLowerCase())]);
  const found = (t: string) => [...terms].filter(x => x.length > 1 && has(t, x)).map(normSkill);
  const required = [...new Set(found(req))];
  return { required, optional: [...new Set(found(opt))].filter(s => !required.includes(s)) };
}

const STOP = new Set('the a an and or of to in for with on at by is are be as we you our your will this that from it they their have has experience work working team teams years year strong ability skills knowledge using use etc new build building role job company across within including able good great well more'.split(' '));
const tokens = (s: string) => s.toLowerCase().replace(/[^a-z0-9+#.\s]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w));
const normTitle = (s: string) => tokens(s.replace(/\b(developer|programmer|sde)\b/gi, 'engineer')).filter(w => !['senior','junior','lead','staff','principal','sr','jr','associate','ii','iii'].includes(w));

export function parseExp(text: string): { min: number | null; max: number | null } {
  const r = /(\d+)\s*(?:-|–|to)\s*(\d+)\s*\+?\s*(?:years?|yrs?)/i.exec(text);
  if (r) return { min: +r[1], max: +r[2] };
  const m = /(\d+)\s*\+?\s*(?:years?|yrs?)/i.exec(text);
  return m ? { min: +m[1], max: null } : { min: null, max: null };
}
export const expLevel = (min: number | null) => min == null ? 'Not stated' : min <= 2 ? 'Entry (0-2 yrs)' : min <= 5 ? 'Mid (3-5 yrs)' : min <= 9 ? 'Senior (6-9 yrs)' : 'Lead (10+ yrs)';
export const category = (s: number) => s >= 90 ? 'Excellent match' : s >= 75 ? 'Strong match' : s >= 60 ? 'Moderate match' : 'Low match';

export function detectWorkMode(text: string): WorkMode {
  if (/\bhybrid\b/i.test(text)) return 'hybrid';
  if (/\bremote\b|work from home|\bwfh\b/i.test(text)) return 'remote';
  return '';
}

/** 1 = diploma, 2 = bachelor, 3 = master, 4 = doctorate, 0 = none found. */
export function eduLevel(text: string): number {
  if (/ph\.?d|doctorate/i.test(text)) return 4;
  if (/master|m\.?\s?tech|\bm\.?s\.?\b|\bmba\b|\bmca\b|m\.?\s?sc|\bm\.?a\b|m\.?\s?com/i.test(text)) return 3;
  if (/bachelor|b\.?\s?tech|b\.?\s?e\b|b\.?\s?sc|\bbca\b|\bbba\b|b\.?\s?com|\bb\.?a\b|undergraduate|\bdegree\b|graduate/i.test(text)) return 2;
  if (/diploma|polytechnic|high school|\bhsc\b|\bssc\b/i.test(text)) return 1;
  return 0;
}

function cosine(a: string[], b: string[]) {
  const f = (t: string[]) => t.reduce((m, w) => m.set(w, (m.get(w) ?? 0) + 1), new Map<string, number>());
  const fa = f(a), fb = f(b);
  let dot = 0, na = 0, nb = 0;
  for (const [w, c] of fa) { dot += c * (fb.get(w) ?? 0); na += c * c; }
  for (const c of fb.values()) nb += c * c;
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** The part of the resume used for responsibility matching (also what gets embedded when semantic matching is on). */
export const resumeCorpus = (p: Profile) => [p.summary, p.currentDesignation, ...p.previousDesignations, ...p.experience.map(e => `${e.title} ${e.summary}`), ...p.projects.map(x => `${x.name} ${x.description}`), p.allSkills.join(' ')].join('\n');

export function locationFit(prefs: Pick<Prefs, 'locations' | 'workModes'>, job: { location: string; workMode: WorkMode }): LocationFit {
  const wants = prefs.locations.map(l => l.toLowerCase()).filter(Boolean), where = job.location.toLowerCase();
  const modeOk = !prefs.workModes.length || !job.workMode || prefs.workModes.includes(job.workMode);
  if (!modeOk) return 'mismatch';
  if (job.workMode === 'remote') return 'match';
  if (!wants.length || !where) return 'unknown';
  return wants.some(l => where.includes(l) || l.includes(where)) ? 'match' : 'mismatch';
}

export interface MatchInput { title: string; location: string; workMode: WorkMode; text: string }
export interface MatchResult {
  score: number; breakdown: Breakdown; reasons: string[]; locationFit: LocationFit;
  required: string[]; optional: string[]; matched: string[]; missing: string[]; missingOptional: string[]; expMin: number | null; expMax: number | null;
}

/** `semantic` (0..1 cosine from the embedding model) replaces the bag-of-words responsibility estimate when supplied. */
export function match(profile: Profile, prefs: Prefs, job: MatchInput, semantic?: number): MatchResult {
  const reasons: string[] = [];
  const mine = new Set(profile.allSkills.map(normSkill));

  // 1. technical / professional skills (35%)
  const { required, optional } = jobSkills(job.text, profile.allSkills);
  const matched = required.filter(s => mine.has(s)), missing = required.filter(s => !mine.has(s)), missingOptional = optional.filter(s => !mine.has(s));
  let skills = 0.5;
  if (required.length) {
    skills = matched.length / required.length;
    reasons.push(`Skills: ${matched.length} of ${required.length} required skills appear in your resume${missing.length ? `; not found in your resume: ${missing.slice(0, 5).join(', ')} (that does not prove you lack them)` : ''}.`);
  } else reasons.push('Skills: the posting names no recognisable skills, so this part is neutral.');

  // 2. experience compatibility (20%)
  const { min, max } = parseExp(job.text);
  const y = profile.totalExperienceYears;
  let experience = 0.7; // not stated: mildly positive, most postings that omit it accept a range
  if (min == null) reasons.push('Experience: not stated in the posting, so this part is neutral.');
  else {
    if (max != null) experience = y >= min - 1 && y <= max + 1 ? 1 : y < min ? Math.max(0, 1 - (min - y) * 0.25) : Math.max(0.5, 1 - (y - max) * 0.1);
    else experience = y >= min ? (y > min + 6 ? 0.8 : 1) : Math.max(0, 1 - (min - y) * 0.25);
    reasons.push(`Experience: asks ${max != null ? `${min}-${max}` : `${min}+`} years, your resume shows ${y}${y < min ? ` (a gap of about ${Math.round((min - y) * 10) / 10})` : ''}.`);
  }

  // 3. responsibilities (20%)
  let responsibilities: number;
  if (semantic != null) { responsibilities = Math.max(0, Math.min(1, (semantic - 0.15) / 0.5)); reasons.push(`Responsibilities: ${Math.round(responsibilities * 100)}% semantic similarity to your experience.`); }
  else { responsibilities = Math.min(1, cosine(tokens(job.text), tokens(resumeCorpus(profile))) / 0.25); reasons.push(`Responsibilities: ${Math.round(responsibilities * 100)}% word overlap with your experience.`); }

  // 4. title relevance (15%)
  const wanted = [...prefs.roles, ...profile.targetRoles, profile.currentDesignation, ...profile.previousDesignations, ...profile.experience.map(e => e.title)].filter(Boolean);
  const jt = new Set(normTitle(job.title));
  let title = 0;
  for (const r of wanted) { const rt = normTitle(r); if (rt.length) title = Math.max(title, rt.filter(w => jt.has(w)).length / rt.length); }
  reasons.push(title >= 0.99 ? 'Title: matches one of your target roles.' : title > 0 ? `Title: partly matches your roles (${Math.round(title * 100)}%).` : 'Title: does not resemble your roles.');

  // 5. education and other requirements (10%)
  const need = eduLevel(job.text), have = Math.max(0, ...profile.education.map(e => eduLevel(`${e.degree} ${e.institution}`)));
  let education = 0.8;
  if (need) {
    education = !have ? 0.5 : have >= need ? 1 : 0.35;
    reasons.push(!have ? 'Education: the posting asks for a degree; none was found in your resume.' : have >= need ? 'Education: meets the stated requirement.' : 'Education: below the stated requirement.');
  } else reasons.push('Education: no requirement stated.');

  const fit = locationFit(prefs, job);
  reasons.push(fit === 'match' ? 'Location and work mode fit your preferences (filter only, not scored).' : fit === 'mismatch' ? 'Location or work mode is outside your preferences (filter only, not scored).' : 'Location: unknown or no preference set.');

  const breakdown = { skills, experience, responsibilities, title, education };
  const score = Math.round(100 * (W.skills * skills + W.experience * experience + W.responsibilities * responsibilities + W.title * title + W.education * education));
  return { score, breakdown, reasons, locationFit: fit, required, optional, matched, missing, missingOptional, expMin: min, expMax: max };
}
