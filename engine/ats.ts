// ATS readiness estimate. It checks what applicant-tracking parsers generally need (contact details, standard sections,
// dated roles, skills, achievement bullets, sensible length). It is an estimate, not any ATS vendor's real score.
import type { Job, Profile } from './types.ts';

export const ACTION = /^(led|built|designed|developed|managed|created|implemented|improved|increased|reduced|delivered|launched|drove|owned|optimi[sz]ed|automated|migrated|analy[sz]ed|coordinated|trained|negotiated|achieved|established|streamlined|supervised|maintained|resolved|conducted|prepared|handled|generated|grew|spearheaded|executed|planned|organi[sz]ed|collaborated|architected|mentored|wrote|tested|deployed|supported|administered|processed|taught|researched|produced|presented|sold|served|provided|performed|monitored|ensured|worked|shipped|integrated|refactored|scaled|cut|saved|won|closed|recruited|audited|reconciled)\b/i;

/** Bullet lines of a role description (one per line, bullet characters removed). */
export const bullets = (s: string) => (s ?? '').split('\n').map(l => l.replace(/^[\s•●▪■◦·*\-–—>]+/, '').trim()).filter(Boolean);
export const flatSkills = (p: Profile) => [...new Map(Object.values(p.skills).flat().map(s => [s.toLowerCase(), s])).values()];

/** The resume as plain text, in the same order the templates print it. */
export function resumeText(p: Profile): string {
  const out = [p.name, p.currentDesignation, [p.email, p.phone, p.location].filter(Boolean).join(' | '), p.links.join(' | ')];
  if (p.summary) out.push('SUMMARY', p.summary);
  if (flatSkills(p).length) out.push('SKILLS', flatSkills(p).join(', '));
  if (p.experience.length) out.push('EXPERIENCE', ...p.experience.flatMap(e => [[e.title, e.company].filter(Boolean).join(' | '), [e.start, e.end].filter(Boolean).join(' – '), ...bullets(e.summary).map(b => `• ${b}`)]));
  if (p.projects.length) out.push('PROJECTS', ...p.projects.flatMap(x => [x.name, x.description, x.tech.length ? `Tools: ${x.tech.join(', ')}` : '']));
  if (p.education.length) out.push('EDUCATION', ...p.education.map(e => [e.degree, e.institution, e.year, e.grade].filter(Boolean).join(', ')));
  if (p.certifications.length) out.push('CERTIFICATIONS', ...p.certifications);
  for (const x of p.extras) out.push(x.heading.toUpperCase(), x.text);
  return out.filter(Boolean).join('\n');
}

export interface AtsCheck { id: string; label: string; got: number; max: number; tip: string }
export interface AtsResult { score: number; checks: AtsCheck[]; missingKeywords: string[]; words: number }

/** `layout` describes the chosen template: columns and photos change how reliably ATS software reads a resume. */
export function atsScore(p: Profile, jobs: Pick<Job, 'requiredSkills' | 'score'>[] = [], layout?: { twoColumn: boolean; photo: boolean }): AtsResult {
  const checks: AtsCheck[] = [];
  const add = (id: string, label: string, got: number, max: number, tip: string) => checks.push({ id, label, got: Math.round(got * 10) / 10, max, tip: got >= max ? '' : tip });

  const missingContact = [!p.name && 'name', !/^[\w.+-]+@[\w-]+(\.[\w-]+)+$/.test(p.email) && 'email', p.phone.replace(/\D/g, '').length < 8 && 'phone', !p.location && 'location'].filter(Boolean);
  add('contact', 'Contact details', (p.name ? 2 : 0) + (missingContact.includes('email') ? 0 : 5) + (missingContact.includes('phone') ? 0 : 5) + (p.location ? 3 : 0), 15, `Add your ${missingContact.join(', ')} at the top.`);

  const missingSec = [p.summary.length < 40 && 'a 2-3 line summary', !p.allSkills.length && 'a skills section', !p.experience.length && 'work experience', !p.education.length && 'education'].filter(Boolean);
  add('sections', 'Standard sections', (p.summary.length >= 40 ? 5 : 0) + (p.allSkills.length ? 5 : 0) + (p.experience.length ? 10 : 0) + (p.education.length ? 5 : 0), 25, `Add ${missingSec.join(', ')}. ATS software looks for these headings.`);

  const n = p.allSkills.length;
  add('skills', 'Skills listed', n >= 8 ? 10 : n >= 4 ? 5 : n ? 2 : 0, 10, `You list ${n} skill${n === 1 ? '' : 's'}. Aim for 8 or more that you really have, using the words job postings use.`);

  const complete = p.experience.filter(e => e.title && e.company && e.start && e.end).length;
  add('roles', 'Roles have title, company and dates', p.experience.length ? 10 * complete / p.experience.length : 0, 10, p.experience.length ? `${p.experience.length - complete} role(s) are missing a title, company or dates.` : 'Add each role with its title, company and dates.');

  const all = p.experience.flatMap(e => bullets(e.summary));
  add('bullets', 'Achievement bullets', all.length >= 6 ? 5 : all.length >= 3 ? 3 : all.length ? 1 : 0, 5, `You have ${all.length} bullet line(s). Give each role 3 to 5 short bullets.`);
  const verbs = all.filter(b => ACTION.test(b)).length, nums = all.filter(b => /\d/.test(b)).length;
  add('verbs', 'Bullets start with action verbs', all.length ? Math.min(5, 5 * (verbs / all.length) / 0.6) : 0, 5, 'Start bullets with a verb such as Built, Led, Reduced, Managed.');
  add('metrics', 'Results with numbers', all.length ? Math.min(10, 10 * (nums / all.length) / 0.4) : 0, 10, `${nums} of ${all.length} bullets contain a number. Add results such as "cut load time by 30%" or "managed 12 accounts" where they are true.`);

  const words = resumeText(p).split(/\s+/).filter(Boolean).length;
  add('length', 'Length', words >= 250 && words <= 1000 ? 10 : words >= 150 && words <= 1400 ? 5 : 0, 10, words < 250 ? `About ${words} words is thin. Aim for 250 to 1000.` : `About ${words} words is long. Aim for 250 to 1000 (1 to 2 pages).`);

  if (layout) add('template', 'Template layout', layout.twoColumn ? (layout.photo ? 2 : 4) : layout.photo ? 6 : 10, 10,
    layout.twoColumn ? `Two-column layouts${layout.photo ? ' and photos' : ''} are often read out of order or skipped by ATS software. Use a single-column template without a photo for online applications.`
      : 'Many ATS systems cannot read a photo and some employers discard resumes that have one. Use a template without a photo for online applications.');

  // keywords: skills most often required by the jobs you matched, when there are enough jobs to say anything
  const pool = jobs.filter(j => j.requiredSkills.length);
  let missingKeywords: string[] = [];
  if (pool.length >= 5) {
    const freq = new Map<string, number>();
    for (const j of pool) for (const s of j.requiredSkills) freq.set(s, (freq.get(s) ?? 0) + 1);
    const top = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([s]) => s);
    const mine = new Set(p.allSkills);
    missingKeywords = top.filter(s => !mine.has(s));
    add('keywords', 'Keywords from your matched jobs', 10 * (top.length - missingKeywords.length) / top.length, 10, `Often asked for in your matched jobs but not in your resume: ${missingKeywords.join(', ')}. Add only the ones you really have.`);
  }

  const got = checks.reduce((s, c) => s + c.got, 0), max = checks.reduce((s, c) => s + c.max, 0);
  return { score: Math.round(100 * got / max), checks, missingKeywords, words };
}
