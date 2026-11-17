// Find a company's public job board from its name: try the likely board names on Greenhouse, Lever, Ashby and SmartRecruiters.
import { board } from './ats.ts';
import type { Company, RawJob, SearchCtx } from '../types.ts';

const LEGAL = /\b(pvt|private|ltd|limited|inc|incorporated|llc|llp|corp|corporation|gmbh|co|company|technologies|technology|solutions|services|india|group)\b\.?/gi;
/** Board names a company is likely to use: "Cred Club Pvt Ltd" -> cred, credclub, cred-club. Never more than 6, so a lookup stays a few dozen requests. */
export function boardNames(name: string): string[] {
  const words = name.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  const core = name.toLowerCase().replace(LEGAL, ' ').replace(/[^a-z0-9 ]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  const out = new Set<string>();
  const base = core.length ? core : words; // legal suffixes (Pvt Ltd, Inc) are not part of a board name
  out.add(base.join('')); out.add(base.join('-'));
  if (core[0] && core[0].length >= 3) out.add(core[0]);
  const initials = words.filter(w => !/^(pvt|private|ltd|limited|inc|llc|llp|corp|corporation|gmbh|co|company|and|of|the)$/.test(w)).map(w => w[0]).join('');
  if (initials.length >= 3) out.add(initials); // "Tata Consultancy Services" -> tcs
  return [...out].filter(n => n.length >= 2).slice(0, 6);
}

const ATS: Company['ats'][] = ['greenhouse', 'lever', 'ashby', 'smartrecruiters'];
export interface Found { company: Company; jobs: RawJob[]; label: string }

/** Boards that exist for this name, with their openings. A board with no openings counts as not found. Check the job list: a short name can belong to another company. */
export async function findCompanyBoards(name: string, ctx: SearchCtx = {}): Promise<Found[]> {
  const found: Found[] = [];
  await Promise.all(boardNames(name).flatMap(token => ATS.map(async ats => {
    const c: Company = { ats, token, name: name.trim() };
    try { const jobs = await board(c, { roles: [], queries: [], locations: [], companies: [] }, { ...ctx, retries: 0 } as SearchCtx, true); if (jobs.length) found.push({ company: c, jobs, label: `${ats}:${token}` }); }
    catch { /* no such board (404) or unreachable: not a match */ }
  })));
  return found.sort((a, b) => b.jobs.length - a.jobs.length);
}
