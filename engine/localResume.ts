// Free, offline resume parser for ANY profession: no API key, nothing leaves your machine. Rule-based:
// it reads the resume's own section headings and lines, so it finds what the document says rather than assuming a field.
// Review the result in the profile editor. Accuracy is lower than an AI provider on unusual layouts.
import { CITIES, GENERAL, INDUSTRIES, SOFT, TECH, TITLE_WORDS } from './lexicon.ts';
import { ACTION } from './ats.ts';
import { normSkill } from './match.ts';
import { normalizeProfile } from './profile.ts';
import type { Experience, Profile } from './types.ts';

// ---------- headings ----------
// Exact heading forms, matched on a normalised form (lower case, letters only). Checked in this order, so "Academic Profile"
// is education and "Personal Profile" is ignored rather than both being read as a summary.
const SECTIONS: [string, RegExp][] = [
  ['other', /^(personal (details?|profile|information|info|data|dossier|particulars)|declaration|references?|referees?)$/],
  ['extras', /^(hobbies( and interests?)?|interests?|areas? of interests?|languages?( known| spoken| proficiency)?|known languages|strengths?( and weakness(es)?)?|extra ?curricular( activities)?|co ?curricular( activities)?|activities|volunteer(ing)?( experience| work)?|social( work| activities)?|publications?|patents?|memberships?)$/],
  ['education', /^(education(al)?( (background|qualifications?|details?|profile|credentials?|summary))?|academics?( (qualifications?|background|details?|profile|credentials?|record|summary))?|qualifications?|scholastic( record| details?)?)$/],
  ['experience', /^(((work|working|professional|employment|relevant|industry|industrial|career|job|total) )?(experiences?|history)( (details?|summary))?|employment( details?)?|professional background|internships?( (experience|details?))?|organi[sz]ational experience|(industrial|vocational|summer|winter|in ?plant|on the job|practical) (training|trainings|internships?|experience))$/],
  ['projects', /^(((academic|key|personal|selected|notable|major|mini|main|final year|college|live|recent) )?projects?( (details?|undertaken|work|works|experience|handled|done|summary))?)$/],
  ['skills', /^(((technical|key|core|professional|it|functional|relevant|software|computer|hard|programming|primary) )?(skills?|skill ?sets?|competenc(y|ies)|proficienc(y|ies)|expertise|technologies|tech ?stack|tools)( (and )?(tools|technologies|abilities|expertise|summary|sets?|known|proficiency))*|areas? of expertise|technical (knowledge|summary)|tools (and )?technologies)$/],
  ['certifications', /^((certifications?|certificates?|licen[sc]es?|courses?|trainings?|achievements?|awards?|honou?rs?|accomplishments?)( (completed|undertaken|attended|and \w+))?)$/],
  ['summary', /^(((professional|career|carrier|carreer|executive|job|profile) )?(summary|profile|objectives?|about( me)?|overview|synopsis|goals?)|summary of (qualifications?|experience)|career (objectives?|summary|goals?))$/],
];
// A heading that is not in the list above ("Technical Skills anD Interests", "Extra-Curricular Activities") is still recognised when
// EVERY word is ordinary heading vocabulary. A project called "Projects Management System" has other words, so it is not mistaken for one.
const HEADING_WORDS = new Set(('technical key core professional personal academic academics work working employment extra co curricular curriculum skills skill set sets and or of the my in & interests interest activities activity achievements achievement awards award projects project details detail summary profile objective objectives experience experiences history education educational qualification qualifications background certifications certification certificates courses languages language known spoken hobbies internships internship training trainings volunteer volunteering social strengths industrial vocational summer winter inplant practical memberships publications patents references declaration information additional other relevant areas area expertise competencies technologies technology tools software industry career carrier job total undertaken completed handled').split(' '));
const KEYWORDS: [string, RegExp][] = [
  ['other', /declaration|personal (details|information|profile|particulars|data)|reference/], ['skills', /skill|competenc|expertise|technolog|tools?\b|software/], ['projects', /project/],
  ['education', /education|academic|qualification/], ['experience', /experience|employment|internship|history|work\b|industrial|vocational/], ['certifications', /certif|licen|course|award|achievement|honou?r|accomplishment|training/],
  ['extras', /extra|curricular|activit|hobb|interest|language|volunteer|social|strength|membership|publication|patent/], ['summary', /objective|summary|profile|about|overview|goal/],
];
/** "C A R E E R" -> "CAREER" (letter-spaced headings and names in designed PDFs). */
const despace = (l: string) => l.replace(/\b(?:[A-Za-z] ){3,}[A-Za-z]\b/g, m => m.replace(/ /g, ''));
const normHead = (l: string) => despace(l).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim();
/** Which section a line starts, if it is a heading. */
function headingOf(l: string): string | undefined {
  const h = normHead(l);
  if (!h || h.length > 45 || h.split(' ').length > 6) return undefined;
  const exact = SECTIONS.find(([, re]) => re.test(h))?.[0];
  if (exact) return exact;
  if (/\d|[.!?]$/.test(l.trim()) || !h.split(' ').every(w => HEADING_WORDS.has(w))) return undefined;
  return KEYWORDS.find(([, re]) => re.test(h))?.[0];
}

// ---------- dates ----------
const MONTHS = 'jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec';
const MON = new RegExp(`^(${MONTHS})`, 'i');
// "Jan 2019", "January, 2019", "Jan'19", "05/2019", "2019"
const DATE = `(?:(?:${MONTHS})[a-z]*\\.?\\s*,?\\s*(?:(?:19|20)\\d\\d|['’]\\d\\d)|(?:0?[1-9]|1[0-2])[/.](?:19|20)\\d\\d|(?:19|20)\\d\\d)`;
const END = `present|current|now|till\\s*date|to\\s*date|ongoing|${DATE}`;
const RANGE = new RegExp(`(${DATE})\\s*(?:-|–|—|to|till|until)\\s*(${END})`, 'i');
const ENDS_WITH_DATE = new RegExp(`(?:^|[|,–—-]|\\s)\\s*\\(?(${DATE})\\)?\\s*$`, 'i');

function toMonths(d: string, now: Date, isEnd = false): number | null {
  if (/present|current|now|till|to\s*date|ongoing/i.test(d)) return now.getFullYear() * 12 + now.getMonth();
  const num = /(0?[1-9]|1[0-2])[/.]((?:19|20)\d\d)/.exec(d); if (num) return +num[2] * 12 + (+num[1] - 1);
  const short = /['’](\d\d)/.exec(d), long = /(19|20)\d\d/.exec(d);
  const y = short ? 2000 + +short[1] : long ? +long[0] : null; if (y == null) return null;
  const m = MON.exec(d.trim()); const mi = m ? MONTHS.split('|').indexOf(m[1].toLowerCase()) : isEnd ? 11 : 0; // a bare end year means the end of that year
  return y * 12 + Math.max(0, mi);
}

// ---------- text preparation ----------
const clean = (l: string) => l.replace(/^[\s•●▪■◦·*\-–—>]+/, '').replace(/\s+/g, ' ').trim();
const has = (text: string, term: string) => new RegExp(`(^|[^a-z0-9+#.])${term.replace(/[.+*?^${}()|[\]\\/]/g, '\\$&')}($|[^a-z0-9+#])`, 'i').test(text);
const isBullet = (raw: string) => /^\s*[•●▪■◦·*\-–—>]/.test(raw);
/** "Kumbakonam,India" -> "Kumbakonam, India", "St.Annes.Matriculation" -> "St. Annes. Matriculation", "BE.Computer" -> "BE. Computer". */
const tidy = (s: string) => s.replace(/,(?=\S)/g, ', ').replace(/(?<=[A-Za-z]{2})\.(?=[A-Z][a-z])/g, '. ').replace(/\s+/g, ' ').replace(/\s+,/g, ',').trim();
const headTitle = (s: string) => title(s).replace(/(?<=\s)(Of|And|Or|In|The|For|To|A)\b/g, m => m.toLowerCase());
const title = (s: string) => s.replace(/\b([a-z])([a-z']*)/gi, (m, a: string, b: string) => (b === b.toLowerCase() || b === b.toUpperCase() ? a.toUpperCase() + b.toLowerCase() : m));

const MONTH_ONLY = new RegExp(`((?:${MONTHS})[a-z]*)(?:\\s*(?:-|–|—|to)\\s*((?:${MONTHS})[a-z]*))?`, 'i');
/**
 * Lines ready for parsing. Tab-aligned columns ("School<TAB>2021") become "School | 2021". A date broken over two lines
 * ("...Program<TAB>Aug" then "Company<TAB>2023", which Word does when a date wraps) is put back together.
 */
function prepLines(text: string): string[] {
  const out = text.replace(/ /g, ' ').replace(/[​-‍﻿]/g, '').split(/\r?\n/)
    .map(l => l.replace(/\t+/g, ' | ').replace(/(\s*\|\s*)+$/, '').replace(/^(\s*\|\s*)+/, '').replace(/\s+$/, '')).filter(l => l.trim());
  const monthOnly = new RegExp(`\\|\\s*(${MONTH_ONLY.source})\\s*$`, 'i');
  for (let i = 0; i + 1 < out.length; i++) {
    const m = monthOnly.exec(out[i]), y = /\|\s*((?:19|20)\d\d)\s*$/.exec(out[i + 1]);
    if (!m || !y) continue;
    const mm = MONTH_ONLY.exec(m[1])!, range = mm[2] ? `${mm[1]} ${y[1]} - ${mm[2]} ${y[1]}` : `${mm[1]} ${y[1]}`;
    out[i] = out[i].replace(monthOnly, '').trim(); out[i + 1] = out[i + 1].replace(/\|\s*(?:19|20)\d\d\s*$/, `| ${range}`);
  }
  return out;
}

interface Sections { [k: string]: string[] }
function splitSections(lines: string[]): { sec: Sections; extras: { heading: string; lines: string[] }[] } {
  const sec: Sections = {}, extras: { heading: string; lines: string[] }[] = []; let cur = '';
  for (const raw of lines) {
    const line = clean(despace(raw)).replace(/\(.*?\)/g, ''); // despace before collapsing spaces, so the double gap between spaced words survives
    let name = isBullet(raw) ? undefined : headingOf(line.replace(/[:：\-–—]\s*$/, ''));
    let rest = '';
    if (!name && cur !== 'skills') { // "Career Objective: To obtain ..." on one line (inside Skills, "Label: a, b" is a sub-label instead)
      const m = /^([^:：]{3,40})[:：]\s*(\S.*)$/.exec(line), h = m && SECTIONS.find(([, re]) => re.test(normHead(m[1])))?.[0];
      if (h && !(h === 'skills' && (cur === 'projects' || cur === 'experience'))) { name = h; rest = m![2]; } // "Tools: ..." inside a project is a label, not a new section
    }
    if (name) {
      cur = name;
      if (name === 'extras') extras.push({ heading: headTitle((rest ? clean(raw).split(/[:：]/)[0] : clean(raw)).replace(/[:：\-–—]\s*$/, '')), lines: rest ? [rest] : [] });
      else { sec[cur] ??= []; if (rest) sec[cur].push(rest); }
      continue;
    }
    if (cur === 'extras') extras.at(-1)?.lines.push(raw); else if (cur) sec[cur]?.push(raw);
  }
  delete sec.other; // personal details and declaration (father's name, date of birth...) are recognised only so they do not leak into the section before them
  return { sec, extras };
}

// ---------- skills ----------
const HUMAN_LANGUAGES = new Set('english hindi tamil telugu kannada malayalam marathi gujarati bengali punjabi urdu odia oriya assamese french german spanish arabic japanese chinese mandarin russian italian portuguese korean sanskrit'.split(' '));
const labelCategory = (label: string): keyof Profile['skills'] | 'extras' | undefined => {
  if (/interest|hobb|known|spoken|extra|activit/i.test(label)) return 'extras';
  if (/soft|interpersonal|behaviou?r|personal (skills|strengths)|people|managerial|leadership/i.test(label)) return 'soft';
  if (/front/i.test(label)) return 'frontend'; if (/back|server/i.test(label)) return 'backend'; if (/language|program|coding/i.test(label)) return 'backend';
  if (/database|\bdb\b|\bsql\b/i.test(label)) return 'databases'; if (/cloud|devops|infra|deploy/i.test(label)) return 'cloud';
  if (/framework|librar/i.test(label)) return 'frameworks'; if (/\bai\b|\bml\b|machine|deep learning|data ?science/i.test(label)) return 'aiMl';
  return undefined; // "Data Analysis Skills", "Tools" and so on: kept, in "other"
};
interface Group { label: string; items: string[] }
function skillGroups(lines: string[]): Group[] {
  const out: Group[] = [];
  for (const raw of lines) {
    for (const seg of clean(raw).split(/[|•●▪·;]|\s{3,}/)) {
      const m = /^([A-Za-z0-9 &/+.-]{3,40}?)\s*[:：]\s*(.+)$/.exec(seg.trim()); // "Languages: A, B" and "Front-End Skills:HTML,CSS"
      const items = (m ? m[2] : seg).split(/,|\s\/\s/).map(t => t.replace(/\.$/, '').trim())
        .filter(s => (s.length >= 2 || /^[CR]$/.test(s)) && s.length <= 40 && s.split(/\s+/).length <= 4 && !/^\d+$/.test(s) && !/^(and|etc|more)$/i.test(s));
      if (items.length) out.push({ label: m ? m[1].trim() : '', items });
    }
  }
  return out;
}
const ACRONYMS = new Set('html css sql aws gcp api php nlp llm rag gst seo sem crm sap xml json ui ux tds erp hr b2b dbt sass ios cad emr spss sas plc ci/cd mlops oop ajax rest'.split(' '));
const SPELLING: Record<string, string> = { javascript: 'JavaScript', typescript: 'TypeScript', 'node.js': 'Node.js', 'next.js': 'Next.js', mysql: 'MySQL', postgresql: 'PostgreSQL', mongodb: 'MongoDB', fastapi: 'FastAPI', graphql: 'GraphQL', rabbitmq: 'RabbitMQ', tensorflow: 'TensorFlow', pytorch: 'PyTorch', langchain: 'LangChain', dynamodb: 'DynamoDB', bigquery: 'BigQuery', 'power bi': 'Power BI', 'ms office': 'MS Office', '.net': '.NET', autocad: 'AutoCAD', solidworks: 'SolidWorks', quickbooks: 'QuickBooks', hubspot: 'HubSpot', wordpress: 'WordPress', powerpoint: 'PowerPoint', 'scikit-learn': 'scikit-learn', github: 'GitHub', 'c++': 'C++', 'c#': 'C#', c: 'C', r: 'R', go: 'Go', 'react native': 'React Native' };
/** Display form of a skill the lexicon recognised (the resume's own spelling is kept when the skill was listed). */
const pretty = (s: string) => SPELLING[s] ?? (ACRONYMS.has(s) ? s.toUpperCase() : s.replace(/\b[a-z]/g, m => m.toUpperCase()));

const isLexicon = (k: string) => TECH.includes(k) || GENERAL.includes(k);
/** The resume's own wording, except shouting ("NODEJS") and lower case ("python") for skills the lexicon knows, which get their usual spelling ("Node.js", "Python"). */
function display(s: string): string {
  const k = normSkill(s.toLowerCase());
  if (SPELLING[k]) return SPELLING[k];
  if (ACRONYMS.has(k)) return k.toUpperCase();
  return isLexicon(k) && (s === s.toLowerCase() || s === s.toUpperCase()) ? pretty(k) : s;
}
// Words that are skills only inside a skills list, never in running text ("go to", "R&D", "Training Program").
const AMBIGUOUS = new Set(['go', 'r', 'training', 'sales', 'lean', 'rest', 'word', 'sas', 'sap', 'sem', 'writing', 'tax']);

const CAT: Record<string, string[]> = {
  frontend: ['html', 'css', 'sass', 'tailwind', 'figma', 'webpack', 'vite', 'javascript', 'typescript', 'bootstrap'], frameworks: ['react', 'react native', 'next.js', 'vue', 'angular', 'svelte', 'express', 'nestjs', 'django', 'flask', 'fastapi', 'spring', 'spring boot', 'laravel', 'rails', 'flutter'],
  libraries: ['redux', 'pandas', 'numpy', 'scikit-learn', 'jest', 'cypress', 'selenium', 'playwright', 'tensorflow', 'pytorch', 'langchain'], databases: ['sql', 'nosql', 'postgresql', 'mysql', 'mongodb', 'dynamodb', 'redis', 'elasticsearch', 'cassandra', 'snowflake', 'bigquery'],
  cloud: ['aws', 'azure', 'gcp', 'docker', 'kubernetes', 'terraform', 'ansible', 'jenkins', 'ci/cd'], aiMl: ['machine learning', 'deep learning', 'nlp', 'llm', 'rag', 'computer vision', 'mlops'],
  backend: ['node.js', 'java', 'python', 'go', 'rust', 'php', 'ruby', 'scala', 'kotlin', 'c#', '.net', 'c++', 'c', 'graphql', 'rest', 'grpc', 'microservices', 'kafka', 'rabbitmq', 'spark', 'airflow'],
};

// ---------- experience ----------
const LOCATION = new RegExp(`\\b(${CITIES.join('|')}|india|usa|uk|remote|maharashtra|karnataka|tamil nadu|tamilnadu|telangana|kerala|delhi)\\b`, 'i');
const PARTS = /\s+[|–—@]\s+|\s+-\s+|,\s*|\s+at\s+|\s*\|\s*/;
const ORG_WORD = /solutions|services|technolog|systems|software|consult|limited|ltd|pvt|\binc\b|corp|bank|hospital|india|group|labs?\b|industries|enterprises|traders|associates|llp|llc|university|college|institute|school|company|motors|infotech|networks|pharma/i;
const INTERNISH = /intern|trainee|training|apprentice|fellowship|volunteer/i;

/**
 * Employment history. Handles "Title, Company  Jan 2019 - Present" on one line, the stacked layout (company line, title line,
 * dates line), and a single date ("Aug 2023") as used by internships. Header lines above a dates line belong to that entry.
 */
function parseExperience(lines: string[]): Experience[] {
  const L = lines.map(raw => ({ raw, l: clean(raw) })).filter(x => x.l);
  const anchor = (x: { raw: string; l: string }) => { // a range, or (not a bullet) a single date at the end of the line
    const r = RANGE.exec(x.l); if (r) return { start: r[1], end: r[2], text: x.l.replace(RANGE, '') };
    const d = !isBullet(x.raw) && x.l.length < 110 ? ENDS_WITH_DATE.exec(x.l) : null;
    return d ? { start: d[1], end: d[1], text: x.l.slice(0, d.index) } : null;
  };
  const dateAt = L.map((x, i) => (anchor(x) ? i : -1)).filter(i => i >= 0);
  const headers = dateAt.map((i, n) => { // nearest non-bullet short lines above the dates line, after the previous entry's dates line
    const floor = n ? dateAt[n - 1] : -1, above: { l: string; at: number }[] = [];
    for (let j = i - 1; j > floor && above.length < 2; j--) { if (isBullet(L[j].raw) || L[j].l.length > 80 || anchor(L[j]) || ACTION.test(L[j].l)) break; above.unshift({ l: L[j].l, at: j }); } // a line starting with an action verb is a bullet whose bullet sign the file lost
    return above;
  });
  return dateAt.map((i, n) => {
    const a = anchor(L[i])!;
    const rest = clean(a.text.replace(/[()|,–—-]+\s*$/, '').replace(/^[()|,–—-]+\s*/, ''));
    const cands = [...rest.split(PARTS), ...[...headers[n]].reverse().flatMap(h => h.l.split(PARTS))].map(clean).filter(Boolean); // nearest header line first
    let role = cands.find(c => TITLE_WORDS.test(c) && c.length < 70) ?? '';
    let company = cands.find(c => c !== role && !LOCATION.test(c) && !/^\d/.test(c) && c.length < 70) ?? '';
    const end = n + 1 < dateAt.length ? (headers[n + 1][0]?.at ?? dateAt[n + 1]) : L.length;
    const body = L.slice(i + 1, end);
    // "Senior Manager - Audit" followed by "Deloitte India, Delhi": the dash joined a title and its department, and the company is the next line
    if (company && rest.includes(company) && company.split(' ').length <= 2 && !ORG_WORD.test(company) && body[0] && ORG_WORD.test(body[0].l) && !isBullet(body[0].raw)) { role = clean(rest); company = ''; }
    let co = company;
    if (!co && body.length && !isBullet(body[0].raw) && body[0].l.length < 70 && !/[.!?]$/.test(body[0].l)) co = body.shift()!.l.split(PARTS)[0]; // "Title<TAB>dates" then the company on the next line
    return { company: tidy(co), title: tidy(role), start: a.start, end: a.end, summary: body.map(x => x.l).join('\n').slice(0, 1500) }; // one line per bullet
  });
}

function spanYears(entries: Experience[], now: Date): number {
  const iv = entries.filter(e => !INTERNISH.test(e.title)).map(e => [toMonths(e.start, now), toMonths(e.end, now, true)] as const)
    .filter((x): x is [number, number] => x[0] != null && x[1] != null && x[1] >= x[0]).sort((a, b) => a[0] - b[0]); // internships and training are listed, not counted as years of experience
  let total = 0, curEnd = -1, curStart = -1;
  for (const [s, e] of iv) { if (s > curEnd) { if (curEnd >= 0) total += curEnd - curStart; curStart = s; curEnd = e; } else curEnd = Math.max(curEnd, e); }
  if (curEnd >= 0) total += curEnd - curStart;
  return Math.round(total / 12 * 10) / 10;
}

const seniority = (years: number, role: string) =>
  /\b(intern|trainee)\b/i.test(role) ? 'intern' : /\b(head|director|vp|chief)\b/i.test(role) ? 'leadership' : /\b(lead|principal|staff|manager)\b/i.test(role) ? 'lead'
  : /\b(senior|sr)\b/i.test(role) || years >= 6 ? 'senior' : /\b(junior|jr|associate)\b/i.test(role) || years < 2 ? 'junior' : 'mid';

// ---------- education ----------
const EDU_CI = /bachelor|master|diploma|ph\.?d|high school|secondary|b\.?\s?tech|m\.?\s?tech|b\.?\s?sc|m\.?\s?sc|b\.?\s?com|m\.?\s?com|\bmca\b|\bbca\b|\bmba\b|\bbba\b|\bllb\b|\bmbbs\b|\bssc\b|\bhsc\b|\bhslc\b|\bsslc\b|\bcbse\b|\bicse\b|matriculation|intermediate|\b(10|12)(th)?\b|\bx{1,2}i{0,2} ?(std|standard)\b|\bpolytechnic\b|chartered accountan\w*|company secretary|cost (?:and |& )?management accountan\w*/i;
const EDU_CS = /\b(B\.E|B\.A|M\.A|M\.S|B\.S|BE|BA|MA|MS|BS|BDes|MDes|B\.Des|M\.Des|BArch|MArch|B\.Arch|M\.Arch|BPharm|MPharm|B\.Pharm|M\.Pharm|BEd|MEd|B\.Ed|M\.Ed|BFA|MFA|BSW|MSW|BHM|BDS|BAMS|BHMS|BPT|LLM|MPhil|PGDM|PGDCA|DCA|ITI|CA)\b/; // upper-case only: "be" and "ms office" are not degrees
const EDU = { test: (l: string) => EDU_CI.test(l) || EDU_CS.test(l) };
const INSTITUTION = /university|college|institute|school|academy|polytechnic|vidyalaya|vidyalayam|campus/i;
const GRADE = /\b(?:cgpa|gpa|percentage|percent|marks|grade|score)\b[\w/ .]{0,20}?[:\-]?\s*\d+(?:\.\d+)?\s*(?:\/\s*\d+(?:\.\d+)?|%)?|\b\d+(?:\.\d+)?\s*(?:cgpa|gpa|%)/i;
const YEARISH = /\(?\s*((?:19|20)\d\d)(?:\s*(?:-|–|—|to)\s*((?:19|20)\d\d|present|current|ongoing))?\s*\)?/gi;

const SUBJECT = /^(mechanical|electrical|electronics|civil|computer|information|science|sciences|engineering|commerce|arts|mathematics|maths|physics|chemistry|biology|botany|zoology|management|nursing|accountancy|accounting|economics|english|history|business|administration|applications|technology|design|architecture|pharmacy|law|education|finance|marketing|statistics|biotechnology|microbiology|interaction|graphic|fashion|hotel|automobile|aeronautical|instrumentation|telecommunication|data|artificial|intelligence)$/i;
/** "B.E Mechanical PSG College of Technology" (table cells joined by spaces) into the degree and the institution. */
const EDU_START = /^(?:b\.?\s?(?:tech|e|sc|com|a|ed|des|arch|pharm)\b|m\.?\s?(?:tech|e|sc|com|a|ed|des|arch|pharm)\b|bachelor|master|diploma|ph\.?d|mba|mca|bca|bba|llb|llm|mbbs|hsc|hslc|sslc|ssc|cbse|icse|chartered|bdes|pgdm|bpt|bds)/i;
function splitCombined(seg: string): string[] {
  if (!EDU_START.test(seg) || !INSTITUTION.test(seg)) return [seg]; // "St. Marys Matriculation Higher Secondary School" is a school's name, not a degree plus a school
  const w = seg.split(/\s+/), k = w.findIndex(x => INSTITUTION.test(x)); if (k < 0) return [seg];
  let a = k, b = k;
  while (a > 0 && /^[A-Z]/.test(w[a - 1]) && !EDU.test(w[a - 1]) && !SUBJECT.test(w[a - 1]) && k - a < 4) a--; // the subject ("Mechanical") stays with the degree
  while (b + 2 < w.length + 1 && /^(of|and|for|&)$/i.test(w[b + 1] ?? '') && /^[A-Z]/.test(w[b + 2] ?? '')) b += 2; // "College of Technology"
  const inst = w.slice(a, b + 1).join(' '), degree = [...w.slice(0, a), ...w.slice(b + 1)].join(' ').trim();
  return degree && a < w.length && EDU.test(degree) ? [degree, inst] : [seg];
}
function parseEducation(lines: string[]): Profile['education'] {
  const out: Profile['education'] = [];
  let cur: Profile['education'][0] & { has: { inst: boolean; deg: boolean } } = { degree: '', institution: '', year: '', grade: '', has: { inst: false, deg: false } };
  const flush = () => { if (cur.has.inst || cur.has.deg) out.push({ degree: tidy(cur.degree), institution: tidy(cur.institution), year: cur.year, grade: cur.grade }); cur = { degree: '', institution: '', year: '', grade: '', has: { inst: false, deg: false } }; };
  for (const raw of lines) {
    let l = clean(raw); if (!l) continue;
    const grade = GRADE.exec(l)?.[0].trim() ?? ''; if (grade) l = l.replace(GRADE, ' ');
    const years = [...l.matchAll(YEARISH)], year = years.length ? (years.at(-1)![2] && /\d/.test(years.at(-1)![2]) ? years.at(-1)![2] : years.at(-1)![1]) : '';
    const segs = l.replace(YEARISH, ' ').split(/\s*[|–—]\s*|\s+-\s+|,\s*/).map(s => s.replace(/[()]/g, '').trim()).filter(Boolean).flatMap(splitCombined);
    const inst = segs.filter(s => INSTITUTION.test(s) && !(EDU_CI.test(s) && /^(b|m)\.?\s?(tech|sc|com|e|a)\b|^(bachelor|master|diploma)/i.test(s))), deg = segs.filter(s => EDU.test(s) && !inst.includes(s));
    const firstInst = segs.findIndex(s => inst.includes(s)); // other segments (a subject, a town): before the institution they belong to the degree, after it to the institution
    const before = segs.filter((s, i) => !inst.includes(s) && !deg.includes(s) && firstInst >= 0 && i < firstInst), after = segs.filter((s, i) => !inst.includes(s) && !deg.includes(s) && !(firstInst >= 0 && i < firstInst));
    if (!inst.length && !deg.length) { // a year or grade on a line of its own belongs to the entry above it; anything else is a stray line (a table header, a page note)
      const target = cur.has.inst || cur.has.deg ? cur : out.at(-1);
      if (target && !segs.length) { if (year && !target.year) target.year = year; if (grade && !target.grade) target.grade = grade.replace(/\s+/g, ' '); }
      continue;
    }
    if (inst.length && cur.has.inst) flush();
    if (deg.length && cur.has.deg) flush();
    if (inst.length) { cur.institution = [...inst, ...after].join(', '); cur.has.inst = true; }
    if (deg.length) { cur.degree = [...deg, ...before, ...(inst.length ? [] : after)].join(', '); cur.has.deg = true; }
    if (year) cur.year = year; if (grade) cur.grade = grade.replace(/\s+/g, ' ');
  }
  flush();
  return out.slice(0, 8);
}

// ---------- projects ----------
const P_DESC = /^(?:description|desc|about( the project)?|details?|overview|summary|objective)\s*[:\-–]\s*(.*)$/i;
const P_TECH = /^(?:tools?(?:\s*(?:&|and)\s*technolog(?:y|ies))?(?:\s+used)?|technolog(?:y|ies)(?:\s+used)?|tech(?:nical)? stack|stack(?:\s+used)?|environment|skills used|built with|languages?(?:\s+used)?|platform)\s*[:\-–]\s*(.*)$/i;
const P_META = /^(role|duration|team(?: size)?|client|link|github|url|domain|responsibilit(?:y|ies)|company|period)\s*[:\-–]\s*(.*)$/i;
function parseProjects(lines: string[]): Profile['projects'] {
  const out: Profile['projects'] = [];
  const add = (p: Profile['projects'][0], text: string) => { p.description += (p.description ? '\n' : '') + text; };
  for (const raw of lines) {
    const l = clean(raw); if (!l) continue;
    const cur = out.at(-1), d = P_DESC.exec(l), t = P_TECH.exec(l), m = P_META.exec(l);
    if (cur && d) { add(cur, d[2].trim()); continue; }
    if (cur && t) { cur.tech.push(...t[1].split(/[,;/|]|\s&\s/).map(x => x.replace(/\.$/, '').trim()).filter(x => x && x.length <= 40)); continue; }
    if (cur && m) { add(cur, `${title(m[1])}: ${m[2].trim()}`); continue; }
    const looksTitle = !isBullet(raw) && l.length <= 90 && !/[.:]$/.test(l);
    if (!cur || (looksTitle && (cur.description || cur.tech.length))) {
      const dash = /^(.{3,80}?)\s+[–—-]\s+(.+)$/.exec(l), colon = /^(.{3,60}?):\s+(.+)$/.exec(l), mm = dash ?? colon;
      const p = { name: tidy((mm ? mm[1] : l).replace(/\s*[|–—-]\s*(?:19|20)\d\d.*$/, '')), description: '', tech: [] as string[] };
      if (mm) p.description = mm[2].trim(); out.push(p);
    } else add(cur, l);
  }
  for (const p of out) {
    p.description = p.description.trim(); p.tech = [...new Map(p.tech.map(display).map(t => [t.toLowerCase(), t])).values()];
    if (!p.tech.length) p.tech = TECH.filter(t => !AMBIGUOUS.has(t) && has(`${p.name} ${p.description}`, t)).map(pretty);
  }
  return out.filter(p => p.name);
}

// ---------- roles for people with no job history ----------
const ROLE_NOUN = 'developer|engineer|analyst|designer|manager|executive|accountant|nurse|teacher|consultant|specialist|administrator|associate|officer|scientist|architect|tester|coordinator|assistant';
// A role the skills point to: needs `min` of the listed skills.
const SKILL_ROLES: { role: string; skills: string[]; min: number }[] = [
  { role: 'Accounts Executive', skills: ['tally', 'tally erp', 'gst', 'gst filing', 'accounting', 'accounts payable', 'accounts receivable', 'taxation', 'tds', 'quickbooks'], min: 2 },
  { role: 'Digital Marketing Executive', skills: ['seo', 'sem', 'google ads', 'google analytics', 'content marketing', 'social media marketing', 'email marketing', 'facebook ads'], min: 2 },
  { role: 'HR Executive', skills: ['recruitment', 'talent acquisition', 'onboarding', 'payroll', 'employee engagement', 'hr operations'], min: 2 },
  { role: 'Customer Support Executive', skills: ['customer service', 'customer support', 'call center', 'customer success'], min: 1 },
  { role: 'Sales Executive', skills: ['sales', 'b2b sales', 'lead generation', 'cold calling', 'business development', 'crm'], min: 2 },
  { role: 'Staff Nurse', skills: ['nursing', 'patient care'], min: 1 },
  { role: 'Frontend Developer', skills: ['html', 'css', 'react', 'javascript', 'angular', 'vue', 'bootstrap'], min: 3 },
  { role: 'Python Developer', skills: ['python', 'django', 'flask', 'fastapi'], min: 2 },
  { role: 'Java Developer', skills: ['java', 'spring', 'spring boot'], min: 2 },
  { role: 'Data Analyst', skills: ['power bi', 'tableau', 'sql', 'excel', 'statistics', 'data visualization'], min: 2 },
];
/** Search titles for a fresher, from what the resume itself says: its objective, its areas of interest, then its skills. Editable; never shown as a job held. */
function inferRoles(objective: string, interests: string[], skills: Profile['skills'], degree: string): string[] {
  const out: string[] = [];
  const add = (r: string) => { const t = title(r.replace(/\s+/g, ' ').trim()); if (t && !out.some(x => x.toLowerCase() === t.toLowerCase())) out.push(t); };
  const words = `((?:[A-Za-z][A-Za-z+#.-]*\\s+){0,3}(?:${ROLE_NOUN}))`;
  const m = new RegExp(`\\b(?:as|for|become|be|seeking|seek|position of|role of)\\s+(?:an?\\s+)?${words}\\b`, 'i').exec(objective) ?? new RegExp(`\\b(?:an?\\s+)?${words}\\s+(?:role|position|job|opportunity)\\b`, 'i').exec(objective);
  if (m && !/^(a|an|the|good|great|challenging|suitable)\\b/i.test(m[1])) add(m[1].replace(/^(?:an?|the)\\s+/i, ''));
  for (const i of interests) {
    let x: RegExpExecArray | null;
    if ((x = /^(.{3,40}?)\s+(?:analysis|analytics)$/i.exec(i))) add(`${x[1]} Analyst`);
    else if ((x = /^(.{3,40}?)\s+development$/i.exec(i))) add(`${x[1]} Developer`);
    else if ((x = /^(.{3,40}?\s+marketing)$/i.exec(i))) add(`${x[1]} Executive`);
    else if ((x = /^(.{3,40}?)\s+management$/i.exec(i))) add(`${x[1]} Coordinator`);
    else if (new RegExp(`\\b(${ROLE_NOUN})$`, 'i').test(i)) add(i);
  }
  if (out.length < 3) {
    const all = new Set(Object.values(skills).flat().map(s => s.toLowerCase().replace(/^advanced /, '')));
    for (const r of SKILL_ROLES) if (r.skills.filter(k => all.has(k)).length >= r.min) add(r.role);
    if (!out.length && /computer|information technology|software/i.test(degree) && all.size >= 4) add('Software Developer');
  }
  return out.slice(0, 3);
}

const LINK = /(?:https?:\/\/(?:www\.)?|www\.)[^\s|,;)<>]+|\b(?:github\.com|linkedin\.com\/in|gitlab\.com|behance\.net|dribbble\.com|medium\.com|kaggle\.com)\/[^\s|,;)<>]+/gi;

export function parseLocal(text: string, now = new Date()): Profile {
  const lines = prepLines(text);
  const { sec, extras: extraBlocks } = splitSections(lines);
  const head = lines.slice(0, 10).join('\n');

  const email = /[\w.+-]+@[\w-]+(\.[\w-]+)+/.exec(text)?.[0] ?? '';
  const phone = (/(?:mobile|phone|contact|mob|cell|tel)[\s.a-z]{0,8}[:\-]?\s*(\+?\d[\d\s().-]{8,15}\d)/i.exec(text)?.[1] ?? /(\+?\d[\d\s().-]{8,15}\d)/.exec(head)?.[1] ?? /((?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5})\b/.exec(text)?.[1] ?? '').trim();
  const links = [...new Set([...lines.slice(0, 14).join('\n').matchAll(LINK)].map(m => m[0].replace(/[.,;:]+$/, '')).filter(u => !/@/.test(u) && /\/[^/\s]{3,}/.test(u.replace(/^https?:\/\/(www\.)?[^/]+/, '')) && !/\/(in|pub|company|profile)\/?$/i.test(u)) // a bare "linkedin.com/in/" with nothing after it is not a link
    .map(u => (/^https?:/.test(u) ? u : `https://${u.replace(/^www\./, '')}`)))].slice(0, 4);

  // name: a "Name:" label wins; otherwise the best short capitalised line near the top that is not a heading, title, place or contact detail
  const labelled = /^\s*(?:full\s+)?name\s*[:\-–]\s*([A-Za-z][A-Za-z.' ]{1,40}?)\s*$/im.exec(lines.join('\n'))?.[1]?.trim();
  const NOT_NAME = /resume|curriculum|vitae|\bcv\b|bio-?data|objective|summary|profile|experience|education|skills?|declaration|personal|details|contact|career|carrier|address|e-?mail|mobile|phone|linkedin|github|portfolio|www|http|@|\d|india\b/i;
  // colleges, companies, degrees and street addresses are capitalised short lines too, and are the usual wrong guesses
  const ORG = /universit|college|institut|school|academy|polytechnic|vidyalaya|engineering|technolog|science|arts\b|commerce|management|studies|department|faculty|campus|solutions|services|systems|software|consult|enterprises?|industries|group|labs?\b|pvt|ltd|limited|\binc\b|llp|corp|company|bank|hospital|bachelor|master|diploma|degree|b\.?\s?tech|m\.?\s?tech|\bb\.?e\b|\bmba\b|nagar|street|road|colony|district|taluk|post\b|state\b|pin\s?code/i;
  const local = email.split('@')[0].toLowerCase().replace(/[^a-z]/g, '');
  let name = labelled ?? '', best = 0;
  if (!name) lines.slice(0, 80).forEach((raw, i) => {
    const piece = clean(despace(raw)).split(/\s*[|•·,/]\s*|\s{3,}|\s+-\s+/)[0].trim(), tok = piece.split(/\s+/);
    if (tok.length > 4 || piece.length < 3 || piece.length > 40 || !tok.every(t => /^[A-Z][A-Za-z.'-]*$/.test(t)) || NOT_NAME.test(piece) || ORG.test(piece) || EDU.test(piece) || TITLE_WORDS.test(piece) || headingOf(piece) || CITIES.includes(piece.toLowerCase())) return;
    const parts = tok.map(t => t.toLowerCase().replace(/[^a-z]/g, '')).filter(t => t.length >= 3);
    const inEmail = local.length >= 3 && parts.some(t => local.includes(t) || t.includes(local)); // "keerthivasan17@" vouches for "Keerthi Vasan S"
    if (i >= 15 && !inEmail) return; // far from the top, only the email address can vouch for a line
    const score = (inEmail ? 6 : 0) + (i <= 2 ? 2 : i <= 6 ? 1 : 0) + (tok.length >= 2 ? 2 : 0);
    if (score >= 3 && score > best) { best = score; name = piece; } // a single word needs the email or the very top of the page to vouch for it
  });
  name = name.replace(/\s+/g, ' ');

  // contact lines that sit under a summary heading (name, email, phone, address) are not part of the summary
  const notContact = (l: string) => l !== name && clean(despace(l)) !== name && !/@|https?:|www\.|linkedin|github/i.test(l) && l.replace(/\D/g, '').length < 8 && !/^(e-?mail|mobile|phone|contact|address|location|dob|date of birth)\b/i.test(l) && !(l.length <= 40 && !/[.!]$/.test(l) && LOCATION.test(l) && l.split(/\s+/).length <= 4);

  const projects = parseProjects(sec.projects ?? []);

  // ---- skills: the Skills section as written (with its own sub-labels), plus recognised terms anywhere in the resume
  const buckets = { frontend: [] as string[], backend: [] as string[], frameworks: [] as string[], libraries: [] as string[], databases: [] as string[], cloud: [] as string[], aiMl: [] as string[], soft: [] as string[], other: [] as string[] };
  const seen = new Set<string>(), interests: string[] = [], spoken: string[] = [];
  const put = (skill0: string, cat?: keyof typeof buckets) => {
    const skill = display(skill0), k = normSkill(skill); if (seen.has(k) || seen.has(skill.toLowerCase())) return; seen.add(k); seen.add(skill.toLowerCase());
    const c = cat ?? (SOFT.includes(skill.toLowerCase()) ? 'soft' : (Object.keys(CAT).find(x => CAT[x].includes(k)) ?? 'other') as keyof typeof buckets);
    buckets[c].push(skill);
  };
  for (const g of skillGroups(sec.skills ?? [])) {
    const cat = labelCategory(g.label);
    if (cat === 'extras') { (/known|spoken|language/i.test(g.label) && !g.items.some(i => !HUMAN_LANGUAGES.has(i.toLowerCase())) || /known|spoken/i.test(g.label) ? spoken : interests).push(...g.items); continue; }
    if (!cat && g.items.length && g.items.every(i => HUMAN_LANGUAGES.has(i.toLowerCase()))) { spoken.push(...g.items); continue; }
    for (const s of g.items) put(s, cat);
  }
  // skills named anywhere in the working parts of the resume (not in interests, hobbies or declaration); with no headings found, the whole text
  const scan = Object.keys(sec).length >= 2 ? [head, ...Object.entries(sec).flatMap(([k, v]) => (k === 'skills' ? v.filter(l => !/interest|hobb|known languages|languages known/i.test(l)) : v))].join('\n') : text;
  const listedText = (sec.skills ?? []).join('\n') + '\n' + projects.flatMap(p => p.tech).join(' ');
  const haveList = (sec.skills ?? []).length > 0; // with a skills list, trust it: everyday words in job descriptions ("onboarding", "budgeting") are not skills
  for (const t of [...TECH, ...GENERAL].filter(t => has(scan, t) && (!AMBIGUOUS.has(t) || has(listedText, t)) && (TECH.includes(t) || !haveList || has(listedText, t)))) put(SOFT.includes(t) ? t : pretty(t));
  for (const t of SOFT.filter(t => has(text, t))) put(title(t), 'soft');

  // ---- experience
  let experience = parseExperience(sec.experience ?? []);
  if (!experience.length) experience = parseExperience(lines.filter(l => RANGE.test(l) && !EDU.test(l))); // no Experience heading: "<title>, <company> <date range>" lines anywhere
  // current role = the entry that ends last ("Present" is latest); the rest follow, newest first
  experience = [...experience].sort((a, b) => (toMonths(b.end, now, true) ?? 0) - (toMonths(a.end, now, true) ?? 0));
  const titles = experience.map(e => e.title).filter(Boolean), jobTitles = titles.filter(t => !INTERNISH.test(t));
  const stated = /(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?)\b/i.exec([...(sec.summary ?? []), ...lines.slice(0, 15)].join(' '));
  const years = stated ? +stated[1] : spanYears(experience, now);
  const distinct = [...new Map(jobTitles.map(t => [t.toLowerCase(), t])).values()];

  const education = parseEducation(sec.education ?? lines.filter(l => EDU_CI.test(l))); // no Education heading: use lines that name a degree
  const summary = (sec.summary ?? []).map(l => clean(despace(l))).filter(notContact).join(' ').slice(0, 600);

  const industries = Object.entries(INDUSTRIES).map(([k, re]) => [k, (text.match(new RegExp(re.source, 'gi')) ?? []).length] as const).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);

  const lower = head.toLowerCase();
  const city = CITIES.find(c => new RegExp(`\\b${c}\\b`).test(lower)) ?? CITIES.find(c => new RegExp(`\\b${c}\\b`).test(text.toLowerCase()));
  const labelledLoc = /(?:location|address|city|current location)\s*[:\-]\s*([A-Za-z][A-Za-z .]{2,30})/i.exec(head)?.[1]?.split(/[,|]/)[0]?.trim();
  const headerLoc = lines.slice(0, 8).map(l => /^(?:.*[|•]\s*)?([A-Z][a-z]+(?: [A-Z][a-z]+)?),\s*(?:[A-Z][a-z]+(?: [A-Z][a-z]+)?|[A-Z]{2})(?:,\s*[A-Za-z ]+)?\s*(?:[|•].*)?$/.exec(clean(l))?.[1]).find(c => c && !TITLE_WORDS.test(c) && !/@/.test(c));
  const cityCase = city ? city.replace(/\b\w/g, m => m.toUpperCase()) : labelledLoc ?? headerLoc ?? '';

  // ---- sections kept as written: interests and languages from the skills section, then Extra-curricular, Hobbies and so on
  const extras: { heading: string; text: string }[] = [];
  const addExtra = (heading: string, items: string[]) => { const text = items.map(x => clean(x)).filter(Boolean).join('\n'); if (!text) return; const same = extras.find(e => e.heading.toLowerCase() === heading.toLowerCase()); same ? same.text += '\n' + text : extras.push({ heading, text }); };
  if (interests.length) addExtra('Areas of Interest', [interests.join(', ')]);
  if (spoken.length) addExtra('Languages', [spoken.join(', ')]);
  for (const b of extraBlocks) addExtra(b.heading, b.lines.map(l => l.replace(/\s*\|\s*/g, ' | ')));

  const objective = (sec.summary ?? []).join(' ');
  const roles = distinct.length ? distinct.slice(0, 3) : inferRoles(objective, interests.flatMap(i => i.split(/,/)).map(x => x.trim()).filter(Boolean), buckets, education[0]?.degree ?? '');

  return normalizeProfile({
    name, email, phone, links, totalExperienceYears: years, seniority: seniority(years, titles[0] ?? ''),
    currentDesignation: distinct[0] ?? '', previousDesignations: distinct.slice(1), skills: buckets, experience, projects, education, extras,
    certifications: (sec.certifications ?? []).map(clean).filter(l => l && l.length < 120 && !/^[A-Z &]{4,}$/.test(l)).slice(0, 10),
    industries, location: cityCase, targetRoles: roles, summary,
  });
}
