/** Is `path` allowed for generic crawlers (User-agent: *)? Longest matching rule wins; Allow wins ties. */
export function robotsAllows(robotsTxt: string, path: string): boolean {
  let applies = false, sawAgent = false;
  const rules: { allow: boolean; prefix: string }[] = [];
  for (const raw of robotsTxt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase(), val = m[2].trim();
    if (key === 'user-agent') { if (!sawAgent) applies = false; sawAgent = true; if (val === '*') applies = true; continue; }
    sawAgent = false;
    if (applies && val && (key === 'disallow' || key === 'allow')) rules.push({ allow: key === 'allow', prefix: val });
  }
  const match = (p: string) => { // supports * and trailing $
    const re = new RegExp('^' + p.replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\$$/, '$'));
    return re.test(path);
  };
  let best: { allow: boolean; len: number } | null = null;
  for (const r of rules) if (match(r.prefix) && (!best || r.prefix.length > best.len || (r.prefix.length === best.len && r.allow))) best = { allow: r.allow, len: r.prefix.length };
  return best ? best.allow : true;
}
