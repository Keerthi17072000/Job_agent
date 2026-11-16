import type { Profile } from './types.ts';

const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map(x => x.trim()).filter(Boolean) : []);
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const uniq = (a: string[]) => [...new Map(a.map(x => [x.toLowerCase(), x])).values()];
const SKILL_KEYS = ['frontend', 'backend', 'frameworks', 'libraries', 'databases', 'cloud', 'aiMl', 'soft', 'other'] as const;

/** Coerce anything (local parser output, AI JSON, edited form state) into a valid Profile. Never invents values. */
export function normalizeProfile(j: any): Profile {
  const s = j?.skills ?? {};
  const skills = Object.fromEntries(SKILL_KEYS.map(k => [k, uniq(arr(s[k]))])) as Profile['skills'];
  const allSkills = [...new Set(Object.values(skills).flat().map(x => x.toLowerCase()))];
  const years = Number(j?.totalExperienceYears);
  return {
    name: str(j?.name), email: str(j?.email), phone: str(j?.phone),
    totalExperienceYears: Number.isFinite(years) && years >= 0 ? Math.round(years * 10) / 10 : 0,
    seniority: str(j?.seniority), currentDesignation: str(j?.currentDesignation), previousDesignations: uniq(arr(j?.previousDesignations)),
    skills, allSkills,
    experience: (Array.isArray(j?.experience) ? j.experience : []).map((e: any) => ({ company: str(e?.company), title: str(e?.title), start: str(e?.start), end: str(e?.end), summary: str(e?.summary) })),
    projects: (Array.isArray(j?.projects) ? j.projects : []).map((p: any) => ({ name: str(p?.name), description: str(p?.description), tech: arr(p?.tech) })),
    education: (Array.isArray(j?.education) ? j.education : []).map((e: any) => ({ degree: str(e?.degree), institution: str(e?.institution), year: str(e?.year) })),
    certifications: arr(j?.certifications), industries: arr(j?.industries), location: str(j?.location),
    targetRoles: uniq(arr(j?.targetRoles)), summary: str(j?.summary),
  };
}
export const emptyProfile = (): Profile => normalizeProfile({});
