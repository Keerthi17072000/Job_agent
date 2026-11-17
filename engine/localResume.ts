// Free, offline resume parser for ANY profession: no API key, nothing leaves your machine. Rule-based:
// it reads the resume's own section headings and lines, so it finds what the document says rather than assuming a field.
// Review the result in the profile editor. Accuracy is lower than an AI provider on unusual layouts.
import { CITIES, GENERAL, INDUSTRIES, SOFT, TECH, TITLE_WORDS } from './lexicon.ts';
import { normalizeProfile } from './profile.ts';
import type { Experience, Profile } from './types.ts';

// Section headings as they appear on real resumes (matched on a normalised form: lower case, letters only). Checked in this order,
// so "Academic Profile" is education and "Personal Profile" is ignored rather than both being read as a summary.
const SECTIONS: [string, RegExp][] = [
  ['other', /^(personal (details?|profile|information|info|data|dossier|particulars)|declaration|hobbies( and interests?)?|interests?|areas? of interests?|languages? (known|spoken|proficiency)|known languages|strengths?( and weakness(es)?)?|weakness(es)?|references?|extra ?curricular( activities)?|co ?curricular( activities)?|activities|contact( details| information| info| me)?|links|social( links| profiles?)?)$/],
  ['education', /^(education(al)?( (background|qualifications?|details?|profile|credentials?|summary))?|academics?( (qualifications?|background|details?|profile|credentials?|record|summary))?|qualifications?|scholastic( record| details?)?)$/],
  ['experience', /^(((work|working|professional|employment|relevant|industry|industrial|career|job|total) )?(experiences?|history)( (details?|summary))?|employment( details?)?|professional background|internships?( (experience|details?))?|organi[sz]ational experience)$/],
  ['projects', /^(((academic|key|personal|selected|notable|major|mini|main|final year|college|live|recent) )?projects?( (details?|undertaken|work|works|experience|handled|done|summary))?)$/],
  ['skills', /^(((technical|key|core|professional|it|functional|relevant|software|computer|hard|programming|primary) )?(skills?|skill ?sets?|competenc(y|ies)|proficienc(y|ies)|expertise|technologies|tech ?stack|tools)( (and )?(tools|technologies|abilities|expertise|summary|sets?|known|proficiency))*|areas? of expertise|technical (knowledge|summary)|tools (and )?technologies)$/],
  ['certifications', /^((certifications?|certificates?|licen[sc]es?|courses?|trainings?|achievements?|awards?|honou?rs?|accomplishments?)( (completed|undertaken|attended|and \w+))?)$/],
  ['summary', /^(((professional|career|carrier|carreer|executive|job|profile) )?(summary|profile|objectives?|about( me)?|overview|synopsis|goals?)|summary of (qualifications?|experience)|career (objectives?|summary|goals?))$/],
];
/** "C A R E E R" -> "CAREER" (letter-spaced headings and names in designed PDFs). */
const despace = (l: string) => l.replace(/\b(?:[A-Za-z] ){3,}[A-Za-z]\b/g, m => m.replace(/ /g, ''));
const normHead = (l: string) => despace(l).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim();
/** Which section a line starts, if it is a heading. */
const headingOf = (l: string) => { const h = normHead(l); return h && h.length <= 45 && h.split(' ').length <= 5 ? SECTIONS.find(([, re]) => re.test(h))?.[0] : undefined; };
const MONTHS = 'jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec';
const MON = new RegExp(`^(${MONTHS})`, 'i');
// "Jan 2019", "January, 2019", "Jan'19", "05/2019", "2019"
const DATE = `(?:(?:${MONTHS})[a-z]*\\.?\\s*,?\\s*(?:(?:19|20)\\d\\d|['’]\\d\\d)|(?:0?[1-9]|1[0-2])[/.](?:19|20)\\d\\d|(?:19|20)\\d\\d)`;
const END = `present|current|now|till\\s*date|to\\s*date|ongoing|${DATE}`;
const RANGE = new RegExp(`(${DATE})\\s*(?:-|–|—|to|till|until)\\s*(${END})`, 'i');
const EDU_CI = /bachelor|master|diploma|ph\.?d|high school|secondary|b\.?\s?tech|m\.?\s?tech|b\.?\s?sc|m\.?\s?sc|b\.?\s?com|m\.?\s?com|\bmca\b|\bbca\b|\bmba\b|\bbba\b|\bllb\b|\bmbbs\b|\bssc\b|\bhsc\b/i;
const EDU_CS = /\b(B\.E|B\.A|M\.A|M\.S|B\.S|BE|BA|MA|MS|BS)\b/; // upper-case only: "be" and "ms office" are not degrees
const EDU = { test: (l: string) => EDU_CI.test(l) || EDU_CS.test(l) };
const INSTITUTION = /university|college|institute|school|academy|polytechnic/i;

const clean = (l: string) => l.replace(/^[\s•●▪■◦·*\-–—>]+/, '').replace(/\s+/g, ' ').trim();
const has = (text: string, term: string) => new RegExp(`(^|[^a-z0-9+#.])${term.replace(/[.+*?^${}()|[\]\\/]/g, '\\$&')}($|[^a-z0-9+#])`, 'i').test(text);

function toMonths(d: string, now: Date, isEnd = false): number | null {
  if (/present|current|now|till|to\s*date|ongoing/i.test(d)) return now.getFullYear() * 12 + now.getMonth();
  const num = /(0?[1-9]|1[0-2])[/.]((?:19|20)\d\d)/.exec(d); if (num) return +num[2] * 12 + (+num[1] - 1);
  const short = /['’](\d\d)/.exec(d), long = /(19|20)\d\d/.exec(d);
  const y = short ? 2000 + +short[1] : long ? +long[0] : null; if (y == null) return null;
  const m = MON.exec(d.trim()); const mi = m ? MONTHS.split('|').indexOf(m[1].toLowerCase()) : isEnd ? 11 : 0; // a bare end year means the end of that year
  return y * 12 + Math.max(0, mi);
}

function splitSections(lines: string[]) {
  const out: Record<string, string[]> = {}; let cur = '';
  for (const raw of lines) {
    const line = clean(despace(raw)).replace(/\(.*?\)/g, ''); // despace before collapsing spaces, so the double gap between spaced words survives
    let name = headingOf(line.replace(/[:：\-–—]\s*$/, ''));
    let rest = '';
    if (!name && cur !== 'skills') { // "Career Objective: To obtain ..." on one line (inside Skills, "Label: a, b" is a sub-label instead)
      const m = /^([^:：]{3,40})[:：]\s*(\S.*)$/.exec(line), h = m && headingOf(m[1]);
      if (h) { name = h; rest = m![2]; }
    }
    if (name) { cur = name; out[cur] ??= []; if (rest) out[cur].push(rest); continue; }
    if (cur) out[cur].push(raw);
  }
  delete out.other; // personal details, declaration, hobbies: recognised only so they do not leak into the section before them
  return out;
}

function parseSkillLines(lines: string[]): string[] {
  const out: string[] = [];
  for (const raw of lines) {
    for (const seg of clean(raw).split(/[|•●▪·;]|\s{3,}/)) {
      const m = /^([A-Za-z &/+]{3,32}):\s*(.+)$/.exec(seg.trim()); // "Languages: A, B" keeps the list
      for (const t of (m ? m[2] : seg).split(/,|\s\/\s/)) {
        const s = t.replace(/\.$/, '').trim();
        if (s.length >= 2 && s.length <= 40 && s.split(/\s+/).length <= 4 && !/^\d+$/.test(s) && !/^(and|etc|more)$/i.test(s)) out.push(s);
      }
    }
  }
  return out;
}

const LOCATION = new RegExp(`\\b(${CITIES.join('|')}|india|usa|uk|remote|maharashtra|karnataka|tamil nadu|telangana|kerala|delhi)\\b`, 'i');
const PARTS = /\s+[|–—@]\s+|\s+-\s+|,\s+|\s+at\s+|\s*\|\s*/;
const isBullet = (raw: string) => /^\s*[•●▪■◦·*\-–—>]/.test(raw);

/**
 * Employment history. Handles "Title, Company  Jan 2019 - Present" on one line and the stacked layout
 * (company line, title line, then a dates line). Header lines above a dates line belong to that entry, not the previous one.
 */
function parseExperience(lines: string[]): Experience[] {
  const L = lines.map(raw => ({ raw, l: clean(raw) })).filter(x => x.l);
  const dateAt = L.map((x, i) => (RANGE.test(x.l) ? i : -1)).filter(i => i >= 0);
  const headers = dateAt.map((i, n) => { // nearest non-bullet short lines above the dates line, after the previous entry's dates line
    const floor = n ? dateAt[n - 1] : -1, above: { l: string; at: number }[] = [];
    for (let j = i - 1; j > floor && above.length < 2; j--) { if (isBullet(L[j].raw) || L[j].l.length > 80 || RANGE.test(L[j].l)) break; above.unshift({ l: L[j].l, at: j }); }
    return above;
  });
  return dateAt.map((i, n) => {
    const r = RANGE.exec(L[i].l)!;
    const rest = clean(L[i].l.replace(RANGE, '').replace(/[()|,–—-]+\s*$/, '').replace(/^[()|,–—-]+\s*/, ''));
    const cands = [...rest.split(PARTS), ...headers[n].flatMap(h => h.l.split(PARTS))].map(clean).filter(Boolean);
    const title = cands.find(c => TITLE_WORDS.test(c) && c.length < 70) ?? '';
    const company = cands.find(c => c !== title && !LOCATION.test(c) && !/^\d/.test(c) && c.length < 70) ?? '';
    const end = n + 1 < dateAt.length ? (headers[n + 1][0]?.at ?? dateAt[n + 1]) : L.length;
    return { company, title, start: r[1], end: r[2], summary: L.slice(i + 1, end).map(x => x.l).join('\n').slice(0, 1500) }; // one line per bullet
  });
}

function spanYears(entries: Experience[], now: Date): number {
  const iv = entries.map(e => [toMonths(e.start, now), toMonths(e.end, now, true)] as const).filter((x): x is [number, number] => x[0] != null && x[1] != null && x[1] >= x[0]).sort((a, b) => a[0] - b[0]);
  let total = 0, curEnd = -1, curStart = -1;
  for (const [s, e] of iv) { if (s > curEnd) { if (curEnd >= 0) total += curEnd - curStart; curStart = s; curEnd = e; } else curEnd = Math.max(curEnd, e); }
  if (curEnd >= 0) total += curEnd - curStart;
  return Math.round(total / 12 * 10) / 10;
}

const seniority = (years: number, title: string) =>
  /\b(intern|trainee)\b/i.test(title) ? 'intern' : /\b(head|director|vp|chief)\b/i.test(title) ? 'leadership' : /\b(lead|principal|staff|manager)\b/i.test(title) ? 'lead'
  : /\b(senior|sr)\b/i.test(title) || years >= 6 ? 'senior' : /\b(junior|jr|associate)\b/i.test(title) || years < 2 ? 'junior' : 'mid';

export function parseLocal(text: string, now = new Date()): Profile {
  const lines = text.split(/\r?\n/).map(l => l.replace(/\s+$/, '')).filter(l => l.trim());
  const sec = splitSections(lines);
  const head = lines.slice(0, 10).join('\n');

  const email = /[\w.+-]+@[\w-]+(\.[\w-]+)+/.exec(text)?.[0] ?? '';
  const phone = (/(?:mobile|phone|contact|mob|cell|tel)[\s.a-z]{0,8}[:\-]?\s*(\+?\d[\d\s().-]{8,15}\d)/i.exec(text)?.[1] ?? /(\+?\d[\d\s().-]{8,15}\d)/.exec(head)?.[1] ?? /((?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5})\b/.exec(text)?.[1] ?? '').trim();

  // name: a "Name:" label wins; otherwise the best short capitalised line near the top that is not a heading, title, place or contact detail
  const labelled = /^\s*(?:full\s+)?name\s*[:\-–]\s*([A-Za-z][A-Za-z.' ]{1,40}?)\s*$/im.exec(text)?.[1]?.trim();
  const NOT_NAME = /resume|curriculum|vitae|\bcv\b|bio-?data|objective|summary|profile|experience|education|skills?|declaration|personal|details|contact|career|carrier|address|e-?mail|mobile|phone|linkedin|github|portfolio|www|http|@|\d|india\b/i;
  const local = email.split('@')[0].toLowerCase().replace(/[^a-z]/g, '');
  let name = labelled ?? '', best = 0;
  if (!name) lines.slice(0, 15).forEach((raw, i) => {
    const piece = clean(despace(raw)).split(/\s*[|•·,/]\s*|\s{3,}|\s+-\s+/)[0].trim(), tok = piece.split(/\s+/);
    if (tok.length > 4 || piece.length < 3 || piece.length > 40 || !tok.every(t => /^[A-Z][A-Za-z.'-]*$/.test(t)) || NOT_NAME.test(piece) || TITLE_WORDS.test(piece) || headingOf(piece) || CITIES.includes(piece.toLowerCase())) return;
    const first = tok.map(t => t.toLowerCase().replace(/[^a-z]/g, '')).find(t => t.length >= 3) ?? '';
    const inEmail = !!first && local.length >= 3 && (local.includes(first) || first.includes(local));
    const score = (inEmail ? 4 : 0) + (i <= 2 ? 2 : i <= 6 ? 1 : 0) + (tok.length >= 2 ? 2 : 0);
    if (score >= 3 && score > best) { best = score; name = piece; } // a single word needs the email or the very top of the page to vouch for it
  });

  // contact lines that sit under a summary heading (name, email, phone, address) are not part of the summary
  const notContact = (l: string) => l !== name && clean(despace(l)) !== name && !/@|https?:|www\.|linkedin|github/i.test(l) && l.replace(/\D/g, '').length < 8 && !/^(e-?mail|mobile|phone|contact|address|location|dob|date of birth)\b/i.test(l) && !(l.length <= 40 && !/[.!]$/.test(l) && LOCATION.test(l) && l.split(/\s+/).length <= 4);

  // skills: the Skills section as written, plus recognised terms anywhere in the resume
  const listed = parseSkillLines(sec.skills ?? []);
  const known = [...TECH, ...GENERAL].filter(t => has(text, t));
  const soft = SOFT.filter(t => has(text, t));
  const buckets = { frontend: [] as string[], backend: [] as string[], frameworks: [] as string[], libraries: [] as string[], databases: [] as string[], cloud: [] as string[], aiMl: [] as string[], soft, other: [] as string[] };
  const CAT: Record<string, string[]> = {
    frontend: ['html', 'css', 'sass', 'tailwind', 'figma', 'webpack', 'vite', 'javascript', 'typescript'], frameworks: ['react', 'react native', 'next.js', 'vue', 'angular', 'svelte', 'express', 'nestjs', 'django', 'flask', 'fastapi', 'spring', 'spring boot', 'laravel', 'rails', 'flutter'],
    libraries: ['redux', 'pandas', 'numpy', 'scikit-learn', 'jest', 'cypress', 'selenium', 'playwright', 'tensorflow', 'pytorch', 'langchain'], databases: ['sql', 'nosql', 'postgresql', 'mysql', 'mongodb', 'dynamodb', 'redis', 'elasticsearch', 'cassandra', 'snowflake', 'bigquery'],
    cloud: ['aws', 'azure', 'gcp', 'docker', 'kubernetes', 'terraform', 'ansible', 'jenkins', 'ci/cd'], aiMl: ['machine learning', 'deep learning', 'nlp', 'llm', 'rag', 'computer vision', 'mlops'],
    backend: ['node.js', 'java', 'python', 'go', 'rust', 'php', 'ruby', 'scala', 'kotlin', 'c#', '.net', 'c++', 'graphql', 'rest', 'grpc', 'microservices', 'kafka', 'rabbitmq', 'spark', 'airflow'],
  };
  const seen = new Set<string>(soft);
  for (const s of [...known, ...listed]) {
    const k = s.toLowerCase(); if (seen.has(k)) continue; seen.add(k);
    const cat = (Object.keys(CAT).find(c => CAT[c].includes(k)) ?? 'other') as keyof typeof buckets;
    buckets[cat].push(k === s.toLowerCase() && known.includes(k) ? k : s);
  }

  // experience
  const expLines = sec.experience ?? [];
  let experience = parseExperience(expLines);
  let titles: string[] = [];
  if (!experience.length) { // no Experience heading: look for "<title>, <company> <date range>" lines anywhere
    experience = parseExperience(lines.filter(l => RANGE.test(l) && !EDU.test(l)));
  }
  // current role = the entry that ends last ("Present" is latest); the rest follow, newest first
  experience = [...experience].sort((a, b) => (toMonths(b.end, now, true) ?? 0) - (toMonths(a.end, now, true) ?? 0));
  titles = experience.map(e => e.title).filter(Boolean);
  const stated = /(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?)\b/i.exec([...(sec.summary ?? []), ...lines.slice(0, 15)].join(' '));
  const years = stated ? +stated[1] : spanYears(experience, now);
  const distinct = [...new Map(titles.map(t => [t.toLowerCase(), t])).values()];

  const eduLines = (sec.education ?? lines.filter(l => EDU_CI.test(l))).map(clean).filter(Boolean); // no Education heading: use lines that name a degree
  const education = eduLines.filter(l => EDU.test(l) || INSTITUTION.test(l)).reduce<{ degree: string; institution: string; year: string }[]>((acc, l) => {
    const year = /(19|20)\d\d/.exec(l.match(/(19|20)\d\d(?!.*(19|20)\d\d)/)?.[0] ?? '')?.[0] ?? '';
    if (EDU.test(l)) { // "Degree, Institution, 2018" in any of the usual separators
      const parts = l.replace(/[,(–—-]?\s*\(?(19|20)\d\d.*$/, '').split(/,|–|—| - |\|/).map(x => x.trim()).filter(Boolean);
      const institution = parts.find(x => INSTITUTION.test(x) && !EDU.test(x)) ?? '';
      acc.push({ degree: parts.filter(x => x !== institution).join(', '), institution, year });
    }
    else if (acc.length && !acc.at(-1)!.institution) { acc.at(-1)!.institution = l.replace(/[,(–—-]?\s*(19|20)\d\d.*$/, '').trim(); if (!acc.at(-1)!.year) acc.at(-1)!.year = year; }
    return acc;
  }, []).slice(0, 5);

  const projLines = (sec.projects ?? []).map(raw => ({ raw, l: clean(raw) })).filter(x => x.l);
  const projects: { name: string; description: string; tech: string[] }[] = [];
  for (const { raw, l } of projLines) {
    if (!/^\s*[•●▪■◦·*\-–—]/.test(raw) && l.length < 80 || !projects.length) projects.push({ name: l.replace(/[:–—-].*$/, '').trim() || l, description: '', tech: [] });
    else projects.at(-1)!.description += (projects.at(-1)!.description ? ' ' : '') + l;
  }
  for (const p of projects) p.tech = TECH.filter(t => has(`${p.name} ${p.description}`, t));

  const industries = Object.entries(INDUSTRIES).map(([k, re]) => [k, (text.match(new RegExp(re.source, 'gi')) ?? []).length] as const).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);

  const lower = head.toLowerCase();
  const city = CITIES.find(c => new RegExp(`\\b${c}\\b`).test(lower)) ?? CITIES.find(c => new RegExp(`\\b${c}\\b`).test(text.toLowerCase()));
  const labelledLoc = /(?:location|address|city|current location)\s*[:\-]\s*([A-Za-z][A-Za-z .]{2,30})/i.exec(head)?.[1]?.split(/[,|]/)[0]?.trim();
  const headerLoc = lines.slice(0, 8).map(l => /^(?:.*[|•]\s*)?([A-Z][a-z]+(?: [A-Z][a-z]+)?),\s*(?:[A-Z][a-z]+(?: [A-Z][a-z]+)?|[A-Z]{2})(?:,\s*[A-Za-z ]+)?\s*(?:[|•].*)?$/.exec(clean(l))?.[1]).find(c => c && !TITLE_WORDS.test(c) && !/@/.test(c));
  const cityCase = city ? city.replace(/\b\w/g, m => m.toUpperCase()) : labelledLoc ?? headerLoc ?? '';

  return normalizeProfile({
    name, email, phone, totalExperienceYears: years, seniority: seniority(years, titles[0] ?? ''),
    currentDesignation: distinct[0] ?? '', previousDesignations: distinct.slice(1), skills: buckets, experience, projects, education,
    certifications: (sec.certifications ?? []).map(clean).filter(l => l && l.length < 120 && !/^[A-Z &]{4,}$/.test(l)).slice(0, 10),
    industries, location: cityCase, targetRoles: distinct.slice(0, 3), summary: (sec.summary ?? []).map(l => clean(despace(l))).filter(notContact).join(' ').slice(0, 600),
  });
}
