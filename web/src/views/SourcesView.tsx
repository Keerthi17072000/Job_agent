import { Badge, Button, Card } from '../ui.tsx';
import { useApp } from '../state.tsx';
import { PORTALS, SOURCES } from '../api.ts';

const TONE = { ok: 'good', error: 'bad', not_configured: 'warn', blocked: 'bad', manual: 'warn' } as const;

export default function SourcesView() {
  const { st, scan, runScan, cancelScan, busy, importExt } = useApp();
  if (!st) return null;
  const role = st.prefs?.roles[0] ?? '', loc = st.prefs?.locations[0] ?? '';
  return <div className="view space-y-5">
    <Card className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-extrabold">Job sources</h2><p className="text-sm text-mute">{st.lastSearch ? `Last search ${new Date(st.lastSearch).toLocaleString()}. Results are cached for 6 hours.` : 'Not searched yet.'}</p></div>
      <div className="flex gap-2">{scan.running && <Button variant="outline" onClick={cancelScan}>Cancel</Button>}<Button disabled={busy || !st.profile} onClick={() => runScan(true)}>{scan.running ? <><span className="spinner" />{scan.phase.slice(0, 28)}</> : 'Fresh search'}</Button></div></Card>
    {scan.running && <div className="h-2 overflow-hidden rounded-full bg-card"><div className="h-full rounded-full bg-gradient-to-r from-brand to-lime transition-all" style={{ width: `${Math.max(5, (scan.done / scan.total) * 100)}%` }} /></div>}

    <section aria-label="Automatic sources" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{SOURCES.map(s => {
      const r = scan.running ? scan.fin[s.id] : st.runs.find(x => x.adapter === s.id), wait = scan.running && !r;
      return <Card key={s.id} className="space-y-2 p-4"><div className="flex items-center justify-between gap-2"><b className="text-sm">{s.name}</b>
        <Badge tone={wait ? 'brand' : r ? TONE[r.status as keyof typeof TONE] ?? 'mute' : 'mute'}>{wait && <span className="dot-live" />}{wait ? 'Searching' : !r ? 'Ready' : r.status === 'ok' ? r.found === 1 ? '1 listing' : `${r.found} listings` : r.status === 'not_configured' ? 'Needs setup' : 'Error'}</Badge></div>
        {wait ? <div className="space-y-1.5"><div className="skel h-3" /><div className="skel h-3 w-2/3" /></div> : <p className="text-xs text-mute">{r?.reason ?? s.note}</p>}
        {r && !scan.running && <p className="text-[11px] text-mute">checked {new Date(r.checked_at).toLocaleTimeString()}{r.cached ? ' · cached' : ''}</p>}</Card>;
    })}</section>

    <Card className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-extrabold">Restricted portals (your own browser)</h3><Button variant="outline" disabled={busy || !st.profile} onClick={importExt}>Import from extension</Button></div>
      <p className="text-sm text-mute">Naukri, LinkedIn, Indeed, Glassdoor and similar sites forbid automated reading, so this app never opens or reads them. They are marked <b>manual</b>, not integrated. Open a search below in your own logged-in browser, click <b>Send to Job Agent</b> (browser extension) on the results page, then come back; listings import automatically.</p>
      <div className="flex flex-wrap gap-2">{PORTALS.map(p => role ? <a key={p.id} href={p.searchUrl(role, loc)} target="_blank" rel="noopener noreferrer" title={p.note} className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-3 py-1.5 text-xs font-semibold text-brand-ink transition-transform hover:-translate-y-0.5">{p.name} ↗</a> : <Badge key={p.id} title="Add a target role first">{p.name}</Badge>)}</div>
      <details className="text-sm text-mute"><summary className="cursor-pointer font-semibold hover:text-ink">Install the extension (once)</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5"><li><a className="font-semibold text-brand-ink underline" href="job-agent-extension.zip" download>Download job-agent-extension.zip</a> and unzip it.</li><li>Open <code>chrome://extensions</code> and turn on Developer mode.</li><li>Click Load unpacked and pick the unzipped folder.</li><li>If a portal captures nothing, click <b>Diagnose</b> on its page and send the copied text so that portal can be fixed.</li></ol></details></Card>

    <Card className="space-y-3"><h3 className="font-extrabold">Activity log</h3>
      {!st.logs.length ? <p className="text-sm text-mute">Nothing logged yet.</p> : <ul className="max-h-80 space-y-1 overflow-y-auto pr-1 font-mono text-xs">{st.logs.slice(0, 120).map((l, i) => <li key={i} className={l.level === 'error' ? 'text-bad' : l.level === 'warn' ? 'text-warn' : 'text-mute'}>{new Date(l.at).toLocaleTimeString()} [{l.source}] {l.msg}</li>)}</ul>}</Card>
  </div>;
}
