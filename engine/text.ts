const ENT: Record<string, string> = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
const unescape = (s: string) => s.replace(/&(lt|gt|amp|quot|#39|nbsp);/g, m => ENT[m]);

/** HTML (possibly entity-escaped, as Greenhouse returns it) to plain text. */
export function htmlToText(html: string): string {
  let s = unescape(html ?? '');
  s = s.replace(/<(br|\/p|\/li|\/h\d|\/div)\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ');
  return unescape(s).replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
}

const TRACKING = /^(utm_.*|ref|refid|trackingid|trk|src|source|gh_src|lever-source|lever-origin|fbclid|gclid)$/i;
/** Stable identity for a posting URL: lowercase host, no hash, no tracking params, no trailing slash. */
export function canonicalUrl(u: string): string {
  const url = new URL(u);
  url.hash = '';
  for (const k of [...url.searchParams.keys()]) if (TRACKING.test(k)) url.searchParams.delete(k);
  url.searchParams.sort();
  return (url.origin + url.pathname.replace(/\/+$/, '') + url.search).toLowerCase();
}

export const norm = (s: string) => (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
export const fingerprint = (company: string, title: string, location: string) => [company, title, location].map(norm).join('|');

const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
/** Jaccard similarity of 5-word shingles: 1 = same text, 0 = nothing shared. */
export function similarity(a: string, b: string): number {
  const sh = (t: string) => { const w = words(t), out = new Set<string>(); for (let i = 0; i + 5 <= w.length; i++) out.add(w.slice(i, i + 5).join(' ')); return out; };
  const A = sh(a), B = sh(b); if (!A.size || !B.size) return 0;
  let n = 0; for (const x of A) if (B.has(x)) n++;
  return n / (A.size + B.size - n);
}
/** Biggest number in a salary string ("$50k", "INR 10-20", "12 LPA"); 0 when none. Only for sorting, currencies are not converted. */
export function salaryValue(s: string): number {
  const nums = [...(s ?? '').replace(/,/g, '').matchAll(/(\d+(?:\.\d+)?)\s*(k|m|lpa|lakhs?)?/gi)].map(m => +m[1] * (/^k$/i.test(m[2] ?? '') ? 1e3 : /^m$/i.test(m[2] ?? '') ? 1e6 : /lpa|lakh/i.test(m[2] ?? '') ? 1e5 : 1));
  return nums.length ? Math.max(...nums) : 0;
}
