import type { Prefs, Profile } from './types.ts';

const SENIORITY = /\b(senior|sr\.?|junior|jr\.?|lead|principal|staff|associate|head of)\b\s*/gi;
const SWAPS: [RegExp, string][] = [[/\bdeveloper\b/i, 'Engineer'], [/\bengineer\b/i, 'Developer'], [/\bexecutive\b/i, 'Specialist'], [/\bspecialist\b/i, 'Executive']];
const cap = (s: string) => s.replace(/\b\w/g, c => c.toUpperCase());

/**
 * Search queries generated from the confirmed profile: the user's target roles, alternative titles
 * (seniority removed, synonym swapped) and role+skill combinations. Nothing here is fixed to a profession.
 */
export function buildQueries(profile: Profile, prefs: Pick<Prefs, 'roles'>, max = 6): string[] {
  const roles = (prefs.roles.length ? prefs.roles : profile.targetRoles).filter(Boolean);
  const out: string[] = [];
  const add = (q: string) => { const t = q.replace(/\s+/g, ' ').trim(); if (t && !out.some(x => x.toLowerCase() === t.toLowerCase())) out.push(t); };
  roles.forEach(add);
  for (const r of roles) {
    const bare = r.replace(SENIORITY, '').trim(); add(bare);
    for (const [re, to] of SWAPS) if (re.test(bare)) add(bare.replace(re, to));
  }
  const skills = profile.allSkills.filter(s => !profile.skills.soft.map(x => x.toLowerCase()).includes(s));
  const noun = (roles[0] ?? '').replace(SENIORITY, '').trim().split(/\s+/).pop();
  if (noun) for (const s of skills.slice(0, 3)) add(`${cap(s)} ${cap(noun)}`);
  return out.slice(0, max);
}
