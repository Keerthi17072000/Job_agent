// Free, offline resume parser: no API key, nothing leaves your machine. Rule-based, so it is less
// accurate than the Claude path (no projects, rough designation/experience). Review the result in the UI.
import { VOCAB, normSkill } from './match.ts';
import type { Profile } from './types.ts';

const CAT: Record<string, string[]> = {
  frontend: ['html', 'css', 'sass', 'tailwind', 'figma', 'webpack', 'vite'],
  frameworks: ['react', 'react native', 'next.js', 'vue', 'angular', 'svelte', 'express', 'nestjs', 'django', 'flask', 'fastapi', 'spring', 'spring boot', 'laravel', 'rails', 'flutter'],
  libraries: ['redux', 'pandas', 'numpy', 'scikit-learn', 'jest', 'cypress', 'selenium', 'playwright', 'tensorflow', 'pytorch', 'langchain'],
  databases: ['sql', 'nosql', 'postgresql', 'mysql', 'mongodb', 'dynamodb', 'redis', 'elasticsearch', 'cassandra', 'snowflake', 'bigquery'],
  cloud: ['aws', 'azure', 'gcp', 'docker', 'kubernetes', 'terraform', 'ansible', 'jenkins', 'ci/cd'],
  aiMl: ['machine learning', 'deep learning', 'nlp', 'llm', 'rag', 'computer vision', 'mlops'],
  backend: ['node.js', 'java', 'python', 'go', 'rust', 'php', 'ruby', 'scala', 'kotlin', 'c#', '.net', 'c++', 'graphql', 'rest', 'grpc', 'microservices', 'kafka', 'rabbitmq', 'spark', 'airflow'],
};
const CITIES = ['bengaluru', 'bangalore', 'hyderabad', 'pune', 'chennai', 'mumbai', 'delhi', 'noida', 'gurgaon', 'gurugram', 'kolkata', 'ahmedabad', 'kochi', 'coimbatore', 'jaipur', 'chandigarh', 'indore', 'remote'];
const MONTHS = 'jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec';
const EDU = /b\.?\s?tech|b\.?\s?e\b|m\.?\s?tech|\bmca\b|\bbca\b|\bmba\b|b\.?\s?sc|m\.?\s?sc|bachelor|master|diploma|ph\.?d|university|college|institute/i;
const TITLE = /\b((?:senior|sr\.?|lead|junior|jr\.?|principal|staff|associate)\s+)?(software|frontend|front-end|backend|back-end|full[- ]?stack|web|data|ml|machine learning|devops|qa|test|mobile|android|ios|cloud|ai|sde)\s*(\d|i{1,3}\b)?\s*(engineer|developer|analyst|scientist|architect|intern)\b/gi;

export function parseLocal(text: string, now = new Date()): Profile {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const lower = text.toLowerCase();

  // skills: vocabulary found anywhere in the resume, sorted into the spec's categories
  const has = (t: string) => new RegExp(`(^|[^a-z0-9+#.])${t.replace(/[.+*?^${}()|[\]\\/]/g, '\\$&')}($|[^a-z0-9+#])`, 'i').test(text);
  const found = [...new Set(VOCAB.filter(has).map(normSkill))];
  const skills = { frontend: [] as string[], backend: [] as string[], frameworks: [] as string[], libraries: [] as string[], databases: [] as string[], cloud: [] as string[], aiMl: [] as string[], other: [] as string[] };
  for (const s of found) { const k = (Object.keys(CAT).find(c => CAT[c].includes(s)) ?? 'other') as keyof typeof skills; skills[k].push(s); }
  if (/\bjavascript\b/i.test(text) && !skills.frontend.includes('javascript')) skills.frontend.push('javascript');
  if (/\btypescript\b/i.test(text) && !skills.frontend.includes('typescript')) skills.frontend.push('typescript');
  const strip = (arr: string[]) => arr.filter((s, i) => arr.indexOf(s) === i);
  for (const k of Object.keys(skills) as (keyof typeof skills)[]) skills[k] = strip(skills[k]);
  const allSkills = [...new Set(Object.values(skills).flat())];

  // experience: an explicit "N years" near the top, else span of job date ranges (education lines excluded)
  let years = 0;
  const stated = /(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?)\b/i.exec(lines.slice(0, 25).join(' '));
  if (stated) years = +stated[1];
  else {
    const re = new RegExp(`(?:(?:${MONTHS})[a-z]*\\.?\\s*,?\\s*)?((?:19|20)\\d\\d)\\s*(?:-|–|—|to)\\s*(present|current|now|till date|(?:(?:${MONTHS})[a-z]*\\.?\\s*,?\\s*)?((?:19|20)\\d\\d))`, 'i');
    let lo = 9999, hi = 0;
    for (const l of lines.filter(l => !EDU.test(l))) {
      const m = re.exec(l); if (!m) continue;
      lo = Math.min(lo, +m[1]); hi = Math.max(hi, /^\d/.test(m[3] ?? '') ? +m[3] : now.getFullYear() + now.getMonth() / 12);
    }
    if (hi > lo) years = Math.round((hi - lo) * 10) / 10;
  }

  // designations in order of appearance: first is treated as current
  const titles: string[] = [];
  for (const m of text.matchAll(TITLE)) { const t = m[0].replace(/\s+/g, ' ').trim(); if (!titles.some(x => x.toLowerCase() === t.toLowerCase())) titles.push(t); }
  const certHeader = lines.findIndex(l => /^certifications?\b/i.test(l));

  const city = CITIES.find(c => new RegExp(`\\b${c}\\b`).test(lower));
  return {
    name: lines[0]?.length < 60 ? lines[0] : '', totalExperienceYears: years,
    currentDesignation: titles[0] ?? '', previousDesignations: titles.slice(1),
    skills, allSkills, projects: [],
    education: lines.filter(l => EDU.test(l) && l.length < 140).slice(0, 4).map(l => ({ degree: l, institution: '', year: /(19|20)\d\d/.exec(l)?.[0] ?? '' })),
    certifications: certHeader >= 0 ? lines.slice(certHeader + 1, certHeader + 5).filter(l => !/^[A-Z ]{4,}$/.test(l)) : [],
    location: city ? city[0].toUpperCase() + city.slice(1) : '', targetRoles: titles.slice(0, 3), summary: '',
  };
}
