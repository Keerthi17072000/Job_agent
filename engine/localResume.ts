// Free, offline resume parser for ANY profession: no API key, nothing leaves your machine. Rule-based:
// it reads the resume's own section headings and lines, so it finds what the document says rather than assuming a field.
// Review the result in the profile editor. Accuracy is lower than an AI provider on unusual layouts.
import { CITIES, GENERAL, INDUSTRIES, SOFT, TECH, TITLE_WORDS } from './lexicon.ts';
import { normalizeProfile } from './profile.ts';
import type { Experience, Profile } from './types.ts';

const SECTIONS: Record<string, RegExp> = {
  summary: /^(professional\s+|career\s+)?(summary|profile|objective|about(\s+me)?)$/i,
  skills: /^((technical|key|core|professional|it)\s+)?(skills?|competenc(y|ies)|expertise|tools?(\s*(&|and)\s*technologies)?|technologies|skills?\s*(&|and)\s*(tools|technologies|abilities))$/i,
  experience: /^((work|professional|employment|relevant|industry)\s+)?(experience|history)$|^career\s+history$/i,
  projects: /^((academic|key|personal|selected|notable)\s+)?projects?$/i,
  education: /^(education(al)?(\s+(background|qualifications?))?|academic(s|\s+qualifications?|\s+background)?|qualifications?)$/i,
  certifications: /^(certifications?|licen[sc]es?|courses|training|achievements?)(\s*(&|and)\s*\w+)?$/i,
};
const MONTHS = 'jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec';
const MON = new RegExp(`^(${MONTHS})`, 'i');
const DATE = `(?:(?:${MONTHS})[a-z]*\\.?\\s*,?\\s*)?(?:19|20)\\d\\d`;
const RANGE = new RegExp(`(${DATE})\\s*(?:-|–|—|to)\\s*(present|current|now|till date|ongoing|${DATE})`, 'i');
const EDU_CI = /bachelor|master|diploma|ph\.?d|high school|secondary|b\.?\s?tech|m\.?\s?tech|b\.?\s?sc|m\.?\s?sc|b\.?\s?com|m\.?\s?com|\bmca\b|\bbca\b|\bmba\b|\bbba\b|\bllb\b|\bmbbs\b|\bssc\b|\bhsc\b/i;
const EDU_CS = /\b(B\.E|B\.A|M\.A|M\.S|B\.S|BE|BA|MA|MS|BS)\b/; // upper-case only: "be" and "ms office" are not degrees
const EDU = { test: (l: string) => EDU_CI.test(l) || EDU_CS.test(l) };
const INSTITUTION = /university|college|institute|school|academy|polytechnic/i;

const clean = (l: string) => l.replace(/^[\s•●▪■◦·*\-–—>]+/, '').replace(/\s+/g, ' ').trim();
const has = (text: string, term: string) => new RegExp(`(^|[^a-z0-9+#.])${term.replace(/[.+*?^${}()|[\]\\/]/g, '\\$&')}($|[^a-z0-9+#])`, 'i').test(text);

function toMonths(d: string, now: Date, isEnd = false): number | null {
  if (/present|current|now|till|ongoing/i.test(d)) return now.getFullYear() * 12 + now.getMonth();
  const y = /(19|20)\d\d/.exec(d)?.[0]; if (!y) return null;
  const m = MON.exec(d.trim()); const mi = m ? MONTHS.split('|').indexOf(m[1].toLowerCase()) : isEnd ? 11 : 0; // a bare end year means the end of that year
  return +y * 12 + Math.max(0, mi);
}

function splitSections(lines: string[]) {
  const out: Record<string, string[]> = {}; let cur = '';
  for (const raw of lines) {
    const head = clean(raw).replace(/[:：]$/, '');
    const name = head.length <= 40 && Object.keys(SECTIONS).find(k => SECTIONS[k].test(head));
    if (name) { cur = name; out[cur] ??= []; continue; }
    if (cur) out[cur].push(raw);
  }
  return out;
}

function parseSkillLines(lines: string[]): string[] {
  const out: string[] = [];
  for (const raw of lines) {
    let l = clean(raw);
    const m = /^([A-Za-z &/]{3,32}):\s*(.+)$/.exec(l); if (m) l = m[2]; // "Languages: A, B" keeps the list
    for (const t of l.split(/[,;|•●▪·]|\s{2,}|\s\/\s/)) {
      const s = t.replace(/\.$/, '').trim();
      if (s.length >= 2 && s.length <= 40 && s.split(/\s+/).length <= 4 && !/^\d+$/.test(s)) out.push(s);
    }
  }
  return out;
}

const splitTitleCompany = (rest: string, prev: string) => {
  const parts = rest.split(/\s+[|–—@]\s+|\s+-\s+|,\s+|\s+at\s+/).map(clean).filter(Boolean);
  const title = parts.find(p => TITLE_WORDS.test(p));
  const company = parts.find(p => p !== title) ?? (prev && !TITLE_WORDS.test(prev) ? prev : '');
  return { title: title ?? (prev && TITLE_WORDS.test(prev) ? prev : parts[0] ?? ''), company: company ?? '' };
};

function parseExperience(lines: string[], now: Date): Experience[] {
  const out: Experience[] = []; let prev = '';
  for (const raw of lines) {
    const l = clean(raw); if (!l) continue;
    const r = RANGE.exec(l);
    if (r) {
      const rest = clean(l.replace(RANGE, '').replace(/[()|,–—-]+\s*$/, '').replace(/^[()|,–—-]+\s*/, ''));
      const { title, company } = splitTitleCompany(rest, prev);
      out.push({ company, title, start: r[1], end: r[2], summary: '' });
    } else if (out.length && out[out.length - 1].summary.length < 400 && !(TITLE_WORDS.test(l) && l.length < 60 && !/[.]$/.test(l) && !out.at(-1)!.title)) {
      out[out.length - 1].summary += (out[out.length - 1].summary ? ' ' : '') + l;
    }
    prev = l;
  }
  return out;
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
  const phone = /(\+?\d[\d\s().-]{8,15}\d)/.exec(head)?.[1]?.trim() ?? '';
  const name = lines.slice(0, 5).map(clean).find(l => /^[A-Za-z][A-Za-z.'-]+(\s+[A-Za-z.'-]+){1,3}$/.test(l) && !TITLE_WORDS.test(l) && !Object.values(SECTIONS).some(re => re.test(l))) ?? '';

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
  let experience = parseExperience(expLines, now);
  let titles = experience.map(e => e.title).filter(Boolean);
  if (!experience.length) { // no Experience heading: look for "<title>, <company> <date range>" lines anywhere
    experience = parseExperience(lines.filter(l => RANGE.test(l) && !EDU.test(l)), now);
    titles = experience.map(e => e.title).filter(Boolean);
  }
  const stated = /(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?)\b/i.exec([...(sec.summary ?? []), ...lines.slice(0, 15)].join(' '));
  const years = stated ? +stated[1] : spanYears(experience, now);
  const distinct = [...new Map(titles.map(t => [t.toLowerCase(), t])).values()];

  const eduLines = (sec.education ?? lines.filter(l => EDU_CI.test(l))).map(clean).filter(Boolean); // no Education heading: use lines that name a degree
  const education = eduLines.filter(l => EDU.test(l) || INSTITUTION.test(l)).reduce<{ degree: string; institution: string; year: string }[]>((acc, l) => {
    const year = /(19|20)\d\d/.exec(l.match(/(19|20)\d\d(?!.*(19|20)\d\d)/)?.[0] ?? '')?.[0] ?? '';
    if (EDU.test(l)) acc.push({ degree: l.replace(/[,(–—-]?\s*(19|20)\d\d.*$/, '').trim(), institution: INSTITUTION.test(l) ? (l.split(/,|–|—| - /).find(p => INSTITUTION.test(p)) ?? '').trim() : '', year });
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
  const cityCase = city ? city.replace(/\b\w/g, m => m.toUpperCase()) : '';

  return normalizeProfile({
    name, email, phone, totalExperienceYears: years, seniority: seniority(years, titles[0] ?? ''),
    currentDesignation: distinct[0] ?? '', previousDesignations: distinct.slice(1), skills: buckets, experience, projects, education,
    certifications: (sec.certifications ?? []).map(clean).filter(l => l && l.length < 120 && !/^[A-Z &]{4,}$/.test(l)).slice(0, 10),
    industries, location: cityCase, targetRoles: distinct.slice(0, 3), summary: (sec.summary ?? []).map(clean).join(' ').slice(0, 400),
  });
}
