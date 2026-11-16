import type { Breakdown, Profile, Prefs, WorkMode } from './types.ts';

// Weights from the spec.
export const W = { skills: 0.35, title: 0.20, experience: 0.20, responsibilities: 0.15, location: 0.10 };

export const VOCAB = ['javascript','typescript','python','java','kotlin','swift','go','golang','rust','c++','c#','.net','php','ruby','scala','sql','nosql','html','css','sass','react','react native','next.js','redux','vue','angular','svelte','tailwind','node.js','express','nestjs','django','flask','fastapi','spring','spring boot','laravel','rails','graphql','rest','grpc','microservices','kafka','rabbitmq','redis','postgresql','mysql','mongodb','dynamodb','elasticsearch','cassandra','snowflake','bigquery','spark','airflow','dbt','aws','azure','gcp','docker','kubernetes','terraform','ansible','jenkins','ci/cd','git','linux','tensorflow','pytorch','scikit-learn','pandas','numpy','machine learning','deep learning','nlp','llm','langchain','rag','computer vision','mlops','playwright','selenium','jest','cypress','webpack','vite','figma','android','ios','flutter','data structures','algorithms','system design','agile','scrum'];
const ALIAS: Record<string, string> = { js: 'javascript', ts: 'typescript', nodejs: 'node.js', node: 'node.js', reactjs: 'react', 'react.js': 'react', vuejs: 'vue', nextjs: 'next.js', postgres: 'postgresql', mongo: 'mongodb', k8s: 'kubernetes', golang: 'go', 'amazon web services': 'aws', 'google cloud': 'gcp', ml: 'machine learning', 'scikit learn': 'scikit-learn', tf: 'tensorflow' };
export const normSkill = (s: string) => { const k = s.toLowerCase().trim(); return ALIAS[k] ?? k; };

const has = (text: string, term: string) => {
  const t = term.replace(/[.+*?^${}()|[\]\\/]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9+#.])${t}($|[^a-z0-9+#])`, 'i').test(text);
};
/** Skills the job text mentions: known vocabulary plus anything in the user's own skill list. */
export function jobSkills(text: string, profileSkills: string[]): string[] {
  const out = new Set<string>();
  for (const t of new Set([...VOCAB, ...profileSkills.map(s => s.toLowerCase())])) if (t.length > 1 && has(text, t)) out.add(normSkill(t));
  return [...out];
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
export const category = (s: number) => s >= 90 ? 'Excellent match' : s >= 80 ? 'Strong match' : s >= 70 ? 'Good match' : s >= 60 ? 'Moderate match' : 'Low match';

export function detectWorkMode(text: string): WorkMode {
  if (/\bhybrid\b/i.test(text)) return 'hybrid';
  if (/\bremote\b|work from home|\bwfh\b/i.test(text)) return 'remote';
  return '';
}

function cosine(a: string[], b: string[]) {
  const f = (t: string[]) => t.reduce((m, w) => m.set(w, (m.get(w) ?? 0) + 1), new Map<string, number>());
  const fa = f(a), fb = f(b);
  let dot = 0, na = 0, nb = 0;
  for (const [w, c] of fa) { dot += c * (fb.get(w) ?? 0); na += c * c; }
  for (const c of fb.values()) nb += c * c;
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export interface MatchInput { title: string; location: string; workMode: WorkMode; text: string }
export interface MatchResult { score: number; breakdown: Breakdown; reasons: string[]; required: string[]; matched: string[]; missing: string[]; expMin: number | null; expMax: number | null }

export function match(profile: Profile, prefs: Prefs, job: MatchInput): MatchResult {
  const reasons: string[] = [];
  const mine = new Set(profile.allSkills.map(normSkill));

  // 1. skills (35%)
  const required = jobSkills(job.text, profile.allSkills);
  const matched = required.filter(s => mine.has(s)), missing = required.filter(s => !mine.has(s));
  let skills = 0.5;
  if (required.length) { skills = matched.length / required.length; reasons.push(`Skills: ${matched.length} of ${required.length} mentioned skills match${missing.length ? `; missing ${missing.slice(0, 5).join(', ')}` : ''}.`); }
  else reasons.push('Skills: the posting names no recognisable skills, so this part is neutral.');

  // 2. title (20%)
  const wanted = [...prefs.roles, ...profile.targetRoles, profile.currentDesignation, ...profile.previousDesignations].filter(Boolean);
  const jt = new Set(normTitle(job.title));
  let title = 0;
  for (const r of wanted) { const rt = normTitle(r); if (rt.length) title = Math.max(title, rt.filter(w => jt.has(w)).length / rt.length); }
  reasons.push(title >= 0.99 ? 'Title: matches one of your target roles.' : title > 0 ? `Title: partly matches your target roles (${Math.round(title * 100)}%).` : 'Title: does not resemble your target roles.');

  // 3. experience (20%)
  const { min, max } = parseExp(job.text);
  const y = profile.totalExperienceYears;
  let experience = 0.6;
  if (min == null) reasons.push('Experience: not stated in the posting, so this part is neutral.');
  else {
    if (max != null) experience = y >= min - 1 && y <= max + 1 ? 1 : y < min ? Math.max(0, 1 - (min - y) * 0.25) : Math.max(0.5, 1 - (y - max) * 0.1);
    else experience = y >= min ? (y > min + 6 ? 0.8 : 1) : Math.max(0, 1 - (min - y) * 0.25);
    reasons.push(`Experience: asks ${max != null ? `${min}-${max}` : `${min}+`} years, you have ${y}.`);
  }

  // 4. responsibilities (15%): similarity between the posting and your roles/projects
  const corpus = tokens([profile.summary, profile.currentDesignation, ...profile.previousDesignations, ...profile.allSkills, ...profile.projects.map(p => `${p.name} ${p.description} ${p.tech.join(' ')}`)].join(' '));
  const sim = cosine(tokens(job.text), corpus);
  const responsibilities = Math.min(1, sim / 0.35); // 0.35 cosine ~ strong overlap; heuristic
  reasons.push(`Responsibilities: ${Math.round(responsibilities * 100)}% overlap with your roles and projects.`);

  // 5. location and work mode (10%)
  const locs = prefs.locations.map(l => l.toLowerCase()).filter(Boolean);
  const where = `${job.location}`.toLowerCase();
  let location = locs.length ? 0.2 : 0.7;
  if (job.workMode === 'remote') location = 1;
  else if (locs.some(l => where.includes(l))) location = 1;
  if (prefs.workModes.length && job.workMode && !prefs.workModes.includes(job.workMode)) location *= 0.5;
  reasons.push(job.workMode === 'remote' ? 'Location: remote role.' : location >= 1 ? 'Location: matches your preferred location.' : locs.length ? `Location: ${job.location || 'unspecified'} is outside your preferred locations.` : 'Location: no preference set.');

  const breakdown = { skills, title, experience, responsibilities, location };
  const score = Math.round(100 * (W.skills * skills + W.title * title + W.experience * experience + W.responsibilities * responsibilities + W.location * location));
  return { score, breakdown, reasons, required, matched, missing, expMin: min, expMax: max };
}
