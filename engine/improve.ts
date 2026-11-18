// Rule-based resume clean-up for the ATS score: no AI key, no invented facts. Each Change is one proposed edit the user accepts or
// skips. Anything that needs a real fact (phone, numbers, what a role involved) becomes a [placeholder] that earns no score until replaced.
import { atsScore, bullets, flatSkills, hasPlaceholder } from './ats.ts';
import { GENERAL, TECH } from './lexicon.ts';
import type { Job, Profile } from './types.ts';

const WEAK: [RegExp, string][] = [[/^responsible for\s+/i, 'Managed '], [/^in charge of\s+/i, 'Led '], [/^(worked on|working on)\s+/i, 'Contributed to '],
  [/^(helped with|helping with|helped)\s+/i, 'Supported '], [/^(involved in|part of)\s+/i, 'Contributed to '], [/^(duties include|tasked with)\s+/i, 'Handled ']];
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const clone = (p: Profile): Profile => JSON.parse(JSON.stringify(p));
const NUM_HINT = '[add a number: users, %, time saved or team size]';

export interface Change { id: string; label: string; before: string; after: string; placeholder?: boolean; apply: (p: Profile) => Profile }

const reword = (p: Profile): Profile => {
  const q = clone(p);
  q.experience = q.experience.map(e => ({ ...e, summary: [...new Set(bullets(e.summary).map(b => {
    let t = b.replace(/\s+/g, ' ').replace(/[;,]+$/, '').replace(/\.$/, '');
    for (const [re, to] of WEAK) if (re.test(t)) { t = t.replace(re, to); break; }
    return t.charAt(0).toUpperCase() + t.slice(1);
  }))].join('\n') }));
  return q;
};
const fillSummary = (p: Profile): Profile => {
  const q = clone(p); if (q.summary.replace(/\s*\[[^\]]*\]/g, '').trim().length >= 40) return q;
  const top = flatSkills(q).slice(0, 5), yrs = Math.round(q.totalExperienceYears), role = q.currentDesignation;
  if (role && (top.length || yrs)) q.summary = `${role}${yrs ? ` with ${yrs}+ year${yrs === 1 ? '' : 's'} of experience` : ''}${top.length ? ` in ${top.slice(0, -1).join(', ')}${top.length > 1 ? ' and ' : ''}${top.at(-1)}` : ''}. Looking for a role where I can apply these skills and keep growing.`;
  return q;
};
const addSkills = (p: Profile): Profile => {
  const q = clone(p), body = [q.summary, ...q.experience.map(e => e.summary), ...q.projects.map(x => `${x.description} ${x.tech.join(' ')}`)].join('\n').toLowerCase();
  const have = new Set(q.allSkills.map(s => s.toLowerCase()));
  const found = [...new Set([...TECH, ...GENERAL])].filter(s => s.length > 2 && !have.has(s) && new RegExp(`(^|[^a-z0-9+#])${esc(s)}(?![a-z0-9+#])`).test(body)).slice(0, 12);
  if (found.length) { q.skills.other = [...q.skills.other, ...found]; q.allSkills = [...q.allSkills, ...found]; }
  return q;
};
const contactHoles = (p: Profile): Profile => {
  const q = clone(p);
  if (q.phone.replace(/\D/g, '').length < 8) q.phone = '[Add phone number]';
  if (!q.location) q.location = '[Add city]';
  if (!/^[\w.+-]+@[\w-]+(\.[\w-]+)+$/.test(q.email)) q.email = '[Add email]';
  return q;
};
const emptyRoles = (p: Profile): Profile => { // a role with no bullets gets prompts, which earn nothing until they are replaced with what you really did
  const q = clone(p);
  q.experience = q.experience.map(e => bullets(e.summary).length ? e : { ...e, summary: '[Built / led / improved ... what you did and the result]\n[A second achievement, with a number]\n[A third achievement]' });
  return q;
};
const numberHints = (p: Profile): Profile => { // the first three bullets without any number get a prompt to add one
  const q = clone(p); let left = 3;
  q.experience = q.experience.map(e => ({ ...e, summary: bullets(e.summary).map(b => left > 0 && !/\d/.test(b) && !hasPlaceholder(b) ? (left--, `${b} ${NUM_HINT}`) : b).join('\n') }));
  return q;
};

const bulletText = (p: Profile) => p.experience.flatMap(e => bullets(e.summary)).join('\n');
const STEPS: { id: string; label: string; placeholder?: boolean; fn: (p: Profile) => Profile; show: (p: Profile) => string }[] = [
  { id: 'contact', label: 'Contact details missing: placeholders added (replace them with the real ones)', placeholder: true, fn: contactHoles, show: p => `${p.email}\n${p.phone}\n${p.location}` },
  { id: 'reword', label: 'Reword bullets: action verbs, no stray symbols or duplicates', fn: reword, show: bulletText },
  { id: 'summary', label: 'Write a short summary from your title, experience and skills', fn: fillSummary, show: p => p.summary },
  { id: 'skills', label: 'Add skills your resume text already mentions', fn: addSkills, show: p => flatSkills(p).join(', ') },
  { id: 'roles', label: 'Roles without bullets: prompts added (write what you really did)', placeholder: true, fn: emptyRoles, show: bulletText },
  { id: 'numbers', label: 'Add a number to 3 bullets: prompts added (use only true numbers)', placeholder: true, fn: numberHints, show: bulletText },
];

/** Proposed edits, none applied. Each one is computed on the resume as it is when accepted, so they can be taken in any order. */
export function suggest(p: Profile): Change[] {
  return STEPS.flatMap(s => { const after = s.show(s.fn(p)), before = s.show(p); return after === before ? [] : [{ id: s.id, label: s.label, before, after, placeholder: s.placeholder, apply: s.fn }]; });
}

/** Score of the resume with every change accepted, for "if you accept all". */
export const scoreWith = (p: Profile, changes: Change[], jobs: Pick<Job, 'requiredSkills' | 'score'>[], layout?: { twoColumn: boolean; photo: boolean }) =>
  atsScore(changes.reduce((q, c) => c.apply(q), p), jobs, layout).score;

