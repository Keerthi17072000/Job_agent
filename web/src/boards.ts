import type { Company } from '../../engine/types.ts';
import { REGION_OPTIONS } from '../../engine/region.ts';

// Company career-page boards confirmed reachable from a browser when this list was made, grouped by where the company hires.
const c = (ats: Company['ats'], token: string): Company => ({ ats, token });
const INDIA: Company[] = [c('lever', 'cred'), c('lever', 'meesho'), c('lever', 'paytm'), c('lever', 'zeta'), c('lever', 'fampay'), c('lever', 'mindtickle'), c('greenhouse', 'groww'), c('greenhouse', 'inmobi'), c('greenhouse', 'druva'), c('ashby', 'sarvam'), c('greenhouse', 'airbnb'), c('ashby', 'openai')];
const GLOBAL: Company[] = [c('greenhouse', 'stripe'), c('greenhouse', 'airbnb'), c('greenhouse', 'gitlab'), c('greenhouse', 'cloudflare'), c('greenhouse', 'datadog'), c('greenhouse', 'mongodb'), c('lever', 'spotify'), c('lever', 'palantir'), c('ashby', 'notion'), c('ashby', 'openai'), c('ashby', 'supabase'), c('ashby', 'ramp')];

/** Boards for a region. Only India has a dedicated list so far; every other region gets the global list and the region filter removes jobs elsewhere. */
export const boardsFor = (region: string | undefined): Company[] => (region === 'India' ? INDIA : GLOBAL);
export const boardsText = (list: Company[]) => list.map(x => [x.ats, x.token, x.name].filter(Boolean).join(':')).join('\n');

const FIRST = ['India', 'United States', 'United Kingdom', 'Canada', 'Australia', 'Germany', 'Singapore', 'United Arab Emirates'];
export const REGIONS = [...FIRST, ...REGION_OPTIONS.filter(r => !FIRST.includes(r) && !r.startsWith('Remote')).sort()];
