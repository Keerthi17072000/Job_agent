// Rule-based resume clean-up for the ATS score: no AI key, no invented facts. It only rewrites wording, fills the summary from
// the resume's own data and lists skills the resume already mentions; what needs real facts (numbers, missing roles) is returned as todo.
import { ACTION, atsScore, bullets, flatSkills } from './ats.ts';
import { GENERAL, TECH } from './lexicon.ts';
import type { Profile } from './types.ts';

const WEAK: [RegExp, string][] = [[/^responsible for\s+/i, 'Managed '], [/^in charge of\s+/i, 'Led '], [/^(worked on|working on)\s+/i, 'Contributed to '],
  [/^(helped with|helping with|helped)\s+/i, 'Supported '], [/^(involved in|part of)\s+/i, 'Contributed to '], [/^(duties include|tasked with)\s+/i, 'Handled ']];
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface Improvement { profile: Profile; changes: string[]; todo: string[]; before: number; after: number }

export function improve(p: Profile, layout?: { twoColumn: boolean; photo: boolean }): Improvement {
  const before = atsScore(p, [], layout).score, changes: string[] = [];
  const q: Profile = JSON.parse(JSON.stringify(p));

  let reworded = 0;
  q.experience = q.experience.map(e => {
    const out = bullets(e.summary).map(b => {
      let t = b.replace(/\s+/g, ' ').replace(/[;,]+$/, '').replace(/\.$/, '');
      for (const [re, to] of WEAK) if (re.test(t)) { t = t.replace(re, to); break; }
      t = t.charAt(0).toUpperCase() + t.slice(1);
      if (t !== b) reworded++;
      return t;
    });
    return { ...e, summary: [...new Set(out)].join('\n') };
  });
  if (reworded) changes.push(`Cleaned ${reworded} bullet${reworded === 1 ? '' : 's'}: removed stray symbols, capitalised, and replaced weak openers such as "Responsible for" with action verbs.`);

  if (q.summary.trim().length < 40) {
    const top = flatSkills(q).slice(0, 5), yrs = Math.round(q.totalExperienceYears), role = q.currentDesignation;
    if (role && (top.length || yrs)) {
      q.summary = `${role}${yrs ? ` with ${yrs}+ year${yrs === 1 ? '' : 's'} of experience` : ''}${top.length ? ` in ${top.slice(0, -1).join(', ')}${top.length > 1 ? ' and ' : ''}${top.at(-1)}` : ''}. Looking for a role where I can apply these skills and keep growing.`;
      changes.push('Wrote a short summary from your title, experience and skills. Edit it so it sounds like you.');
    }
  }

  const body = [q.summary, ...q.experience.map(e => e.summary), ...q.projects.map(x => `${x.description} ${x.tech.join(' ')}`)].join('\n').toLowerCase();
  const have = new Set(q.allSkills.map(s => s.toLowerCase()));
  const found = [...new Set([...TECH, ...GENERAL])].filter(s => s.length > 2 && !have.has(s) && new RegExp(`(^|[^a-z0-9+#])${esc(s)}(?![a-z0-9+#])`).test(body)).slice(0, 12);
  if (found.length) {
    q.skills.other = [...q.skills.other, ...found]; q.allSkills = [...q.allSkills, ...found];
    changes.push(`Added ${found.length} skill${found.length === 1 ? '' : 's'} your resume text already mentions: ${found.join(', ')}.`);
  }

  const after = atsScore(q, [], layout);
  const todo = after.checks.filter(c => c.tip && c.got < c.max).map(c => c.tip);
  return { profile: q, changes, todo, before, after: after.score };
}
