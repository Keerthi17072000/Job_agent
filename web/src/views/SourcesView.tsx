import { Badge, Button, Card } from '../ui.tsx';
import { useApp } from '../state.tsx';
import { PORTALS, SOURCES } from '../api.ts';

const TONE = { ok: 'good', error: 'bad', not_configured: 'warn', blocked: 'bad', manual: 'warn', skipped: 'mute' } as const;

export default function SourcesView() {
  const { st, scan, runScan, cancelScan, busy, ext, checkExtension, portalSearch, portalSearchAll, portalBusy } = useApp();
  if (!st) return null;
  const role = st.prefs?.roles[0] ?? '', loc = st.prefs?.locations[0] ?? '';
  return <div className="view space-y-5">
    <Card className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-extrabold">Job sources</h2><p className="text-sm text-mute">{st.lastSearch ? `Last search ${new Date(st.lastSearch).toLocaleString()}. Results are cached for 6 hours.` : 'Not searched yet.'}</p></div>
      <div className="flex gap-2">{scan.running && <Button variant="outline" onClick={cancelScan}>Cancel</Button>}<Button disabled={busy || !st.profile} onClick={() => runScan(true)}>{scan.running ? <><span className="spinner" />{scan.phase.slice(0, 28)}</> : 'Fresh search'}</Button></div></Card>
    {scan.running && <div className="h-2 overflow-hidden rounded-full bg-card"><div className="h-full rounded-full bg-gradient-to-r from-brand to-lime transition-all" style={{ width: `${Math.max(5, (scan.done / scan.total) * 100)}%` }} /></div>}

    <section aria-label="Automatic sources" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{SOURCES.map(s => {
      const r = scan.running ? scan.fin[s.id] : st.runs.find(x => x.adapter === s.id), wait = scan.running && !r;
      return <Card key={s.id} className="space-y-2 p-4"><div className="flex items-center justify-between gap-2"><b className="text-sm">{s.name}</b>
        <Badge tone={wait ? 'brand' : r ? TONE[r.status as keyof typeof TONE] ?? 'mute' : 'mute'}>{wait && <span className="dot-live" />}{wait ? 'Searching' : !r ? 'Ready' : r.status === 'ok' ? r.found === 1 ? '1 listing' : `${r.found} listings` : r.status === 'not_configured' ? 'Needs setup' : r.status === 'skipped' ? 'Skipped' : 'Error'}</Badge></div>
        {wait ? <div className="space-y-1.5"><div className="skel h-3" /><div className="skel h-3 w-2/3" /></div> : <p className="text-xs text-mute">{r?.reason ?? s.note}</p>}
        {r && !scan.running && <p className="text-[11px] text-mute">checked {new Date(r.checked_at).toLocaleTimeString()}{r.cached ? ' · cached' : ''}</p>}</Card>;
    })}</section>

    <Card className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-extrabold">Job portals (through your browser)</h3>
        <p className="mt-1 flex items-center gap-2 text-sm text-mute">{ext ? <Badge tone="good">Extension connected v{ext}</Badge> : <Badge tone="warn">Extension not detected</Badge>}<button className="font-semibold text-brand-ink hover:underline" onClick={checkExtension}>Check again</button></p></div>
        <Button disabled={busy || !ext || !role} onClick={portalSearchAll}>{portalBusy ? <><span className="spinner" />Searching…</> : 'Search all portals'}</Button></div>
      <p className="text-sm text-mute">Naukri, LinkedIn and similar sites have no public API and forbid automated reading, so this app never opens them itself. With the extension, <b>you</b> click Search here and the extension loads that portal's search page <b>in your own browser and login</b>, reads the listings and shows them in this app. One page per click. If a portal shows a login or verification page, its tab is brought to the front: complete it yourself, then search again. Nothing tries to get past it.</p>
      <ul className="divide-y divide-line">{PORTALS.map(p => { const r = st.runs.find(x => x.adapter === p.id), busyHere = portalBusy === p.id;
        return <li key={p.id} className="flex flex-wrap items-center gap-3 py-3"><div className="min-w-0 flex-1"><b className="text-sm">{p.name}</b>
            <p className="text-xs text-mute">{r ? `${r.reason}${r.added != null ? ` (${r.added} new)` : ''}` : p.note}</p></div>
          {r && <Badge tone={r.status === 'ok' ? 'good' : r.status === 'blocked' ? 'warn' : 'bad'}>{r.status === 'ok' ? `${r.found} listings` : r.status === 'blocked' ? 'Needs you' : 'Error'}</Badge>}
          <Button variant="outline" className="h-9" disabled={busy || !ext || !role} onClick={() => portalSearch(p.id)}>{busyHere ? <><span className="spinner" />Searching</> : 'Search'}</Button>
          {role && <a href={p.searchUrl(role, loc)} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-brand-ink hover:underline" title={`Open ${p.name} yourself`}>Open ↗</a>}</li>; })}</ul>
      <details open={!ext} className="text-sm text-mute"><summary className="cursor-pointer font-semibold text-ink">{ext ? 'Update or reinstall the extension' : 'Install the extension (once)'}</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5"><li><a className="font-semibold text-brand-ink underline" href="job-agent-extension.zip" download>Download job-agent-extension.zip</a> and unzip it.</li><li>Open <code>chrome://extensions</code> and turn on Developer mode.</li><li>Click Load unpacked and pick the unzipped folder, then reload this page.</li><li>If a portal returns nothing, open it, click <b>Diagnose</b> in the Job Agent panel and send the copied text so that portal can be fixed.</li></ol></details>
      <p className="text-xs text-mute">Selectors and search links for each portal are unverified until you try them. Portals marked as not working need the Diagnose text to be fixed.</p></Card>

    <Card className="space-y-3"><h3 className="font-extrabold">Activity log</h3>
      {!st.logs.length ? <p className="text-sm text-mute">Nothing logged yet.</p> : <ul className="max-h-80 space-y-1 overflow-y-auto pr-1 font-mono text-xs">{st.logs.slice(0, 120).map((l, i) => <li key={i} className={l.level === 'error' ? 'text-bad' : l.level === 'warn' ? 'text-warn' : 'text-mute'}>{new Date(l.at).toLocaleTimeString()} [{l.source}] {l.msg}</li>)}</ul>}</Card>
  </div>;
}
