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
