import mammoth from 'mammoth';
import { extractText, getDocumentProxy } from 'unpdf';
import { parseLocal } from './localResume.ts';
import type { Profile } from './types.ts';

const PROMPT = `Extract a professional profile from this resume as JSON only, no prose.
Rules: use ONLY what the resume states. Never invent skills, employers, dates or experience. Use [] / "" / 0 when absent.
Skill lists hold short names ("React", "PostgreSQL"). Put each skill in the single best category.
targetRoles = up to 3 job titles this person should search for, inferred from their experience.
Schema: {"name":"","totalExperienceYears":0,"currentDesignation":"","previousDesignations":[],"skills":{"frontend":[],"backend":[],"frameworks":[],"libraries":[],"databases":[],"cloud":[],"aiMl":[],"other":[]},"projects":[{"name":"","description":"","tech":[]}],"education":[{"degree":"","institution":"","year":""}],"certifications":[],"location":"","targetRoles":[],"summary":"two sentences"}`;

const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

export function normalizeProfile(j: any): Profile {
  const s = j?.skills ?? {};
  const skills = { frontend: arr(s.frontend), backend: arr(s.backend), frameworks: arr(s.frameworks), libraries: arr(s.libraries), databases: arr(s.databases), cloud: arr(s.cloud), aiMl: arr(s.aiMl), other: arr(s.other) };
  return {
    name: String(j?.name ?? ''), totalExperienceYears: Number(j?.totalExperienceYears) || 0,
    currentDesignation: String(j?.currentDesignation ?? ''), previousDesignations: arr(j?.previousDesignations),
    skills, allSkills: [...new Set(Object.values(skills).flat())],
    projects: (Array.isArray(j?.projects) ? j.projects : []).map((p: any) => ({ name: String(p?.name ?? ''), description: String(p?.description ?? ''), tech: arr(p?.tech) })),
    education: (Array.isArray(j?.education) ? j.education : []).map((e: any) => ({ degree: String(e?.degree ?? ''), institution: String(e?.institution ?? ''), year: String(e?.year ?? '') })),
    certifications: arr(j?.certifications), location: String(j?.location ?? ''), targetRoles: arr(j?.targetRoles), summary: String(j?.summary ?? ''),
  };
}

/** Resume file to plain text, locally. */
export async function fileText(buf: Buffer, filename: string): Promise<string> {
  const ext = filename.toLowerCase().split('.').pop();
  if (ext === 'pdf') return (await extractText(await getDocumentProxy(new Uint8Array(buf)), { mergePages: true })).text;
  if (ext === 'docx') return (await mammoth.extractRawText({ buffer: buf })).value;
  if (ext === 'txt') return buf.toString('utf8');
  throw new Error('Upload a PDF, DOCX or TXT resume');
}

/** Free local parser by default. If ANTHROPIC_API_KEY is set, Claude does it (better accuracy); then only the resume text is sent. */
export async function parseResume(buf: Buffer, filename: string): Promise<Profile> {
  const text = await fileText(buf, filename);
  if (!process.env.ANTHROPIC_API_KEY) return parseLocal(text);
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: process.env.MODEL ?? 'claude-sonnet-5-5', max_tokens: 3000, messages: [{ role: 'user', content: [{ type: 'text', text }, { type: 'text', text: PROMPT }] }] }),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);
  const out: string = (await res.json() as any).content[0].text;
  return normalizeProfile(JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1)));
}
