import { useState } from 'react';
import { Avatar, Badge, Button, Card, Input, LinkButton, Select, useCountUp, cn } from '../ui.tsx';
import { useApp } from '../state.tsx';
import { REGIONS } from '../boards.ts';
import { Icon, ICONS, ReplaceResume, STATUS_LABEL, UploadCard, day } from './common.tsx';
import type { Job } from '../api.ts';

function Tile({ label, value, tone }: { label: string; value: number; tone?: string }) {
  const v = useCountUp(value);
  return <Card className={cn('rise p-4', tone)}><div className="text-3xl font-extrabold tabular-nums">{v}</div><div className="text-sm font-medium opacity-75">{label}</div></Card>;
}

export default function Overview() {
  const { st, scan, runScan, cancelScan, busy, savePrefs, ext, portalSearchAll, portalBusy } = useApp();
  const [role, setRole] = useState(''), [loc, setLoc] = useState(''), [mode, setMode] = useState(''), [region, setRegion] = useState<string | null>(null);
  if (!st) return null;
  if (!st.profile || !st.prefs) return <div className="view mx-auto max-w-2xl space-y-6 py-10 text-center">
    <h2 className="text-3xl font-extrabold md:text-4xl">Upload your resume, get matched to real jobs</h2>
    <p className="text-mute">Any profession. The app reads your resume on this device, builds a profile you can correct, searches company career pages and job boards, and ranks every job against you.</p>
    <UploadCard big />
    <ol className="grid gap-3 text-left sm:grid-cols-3">{[['Upload', 'PDF, DOCX or TXT'], ['Confirm', 'Review and fix your profile'], ['Match', 'Ranked jobs with reasons']].map(([t, d], i) =>
      <li key={t} className="rounded-2xl bg-card p-4"><span className="mb-2 grid size-7 place-items-center rounded-full bg-lime text-sm font-extrabold text-lime-ink">{i + 1}</span><b>{t}</b><p className="text-sm text-mute">{d}</p></li>)}</ol></div>;

  const prefs = st.prefs, jobs = st.jobs, min = prefs.minScore;
  const rec = jobs.filter(j => j.score >= min && j.status === 'new').slice(0, 6);
  const bands = [['90+', jobs.filter(j => j.score >= 90).length], ['75-89', jobs.filter(j => j.score >= 75 && j.score < 90).length], ['60-74', jobs.filter(j => j.score >= 60 && j.score < 75).length], ['<60', jobs.filter(j => j.score < 60).length]] as const;
  const maxBand = Math.max(1, ...bands.map(b => b[1]));
  const count = (s: Job['status']) => jobs.filter(j => j.status === s).length;
  const tracked = jobs.filter(j => ['applied', 'interview', 'rejected', 'interested', 'shortlisted'].includes(j.status)).slice(0, 5);
  const today = new Date().toISOString().slice(0, 10);
  const go = async () => {
    const roles = role.trim() ? [role.trim(), ...prefs.roles.filter(r => r !== role.trim())] : prefs.roles;
    await savePrefs({ ...prefs, region: region ?? prefs.region, roles, locations: loc.trim() ? [loc.trim()] : prefs.locations, workModes: mode ? [mode as 'remote'] : prefs.workModes });
    await runScan();
  };

  return <div className="view grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
    <div className="min-w-0 space-y-5">
      <Card className="space-y-4">
        <h2 className="text-lg font-extrabold">Find your job with your resume</h2>
        <form className="flex flex-wrap items-center gap-2" onSubmit={e => { e.preventDefault(); void go(); }}>
          <div className="relative min-w-52 flex-1"><Icon d={ICONS.search} className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-mute" /><Input className="pl-10" aria-label="Job role" placeholder={prefs.roles[0] ?? 'Job title'} value={role} onChange={e => setRole(e.target.value)} /></div>
          <Input className="w-44" aria-label="Location" placeholder={prefs.locations[0] ?? 'Location'} value={loc} onChange={e => setLoc(e.target.value)} />
          <Select className="w-44" aria-label="Region" value={region ?? prefs.region ?? ''} onChange={e => setRegion(e.target.value)}><option value="">Any region</option>{REGIONS.map(r => <option key={r}>{r}</option>)}</Select>
          <Select className="w-40" aria-label="Work mode" value={mode} onChange={e => setMode(e.target.value)}><option value="">Any mode</option><option value="remote">Remote</option><option value="hybrid">Hybrid</option><option value="office">Office</option></Select>
          <Button type="submit" disabled={busy || !prefs.roles.length && !role.trim()}>{scan.running ? <><span className="spinner" />Searching {scan.done}/{scan.total}</> : 'Search'}</Button>
          {scan.running && <Button type="button" variant="outline" onClick={cancelScan}>Cancel</Button>}
          <Button type="button" variant="outline" disabled={busy || !ext || !prefs.roles.length} title={ext ? 'Searches Naukri, LinkedIn and the other portals in your own browser, one page each' : 'Install the browser extension to search Naukri and LinkedIn from here'} onClick={portalSearchAll}>{portalBusy ? <><span className="spinner" />Portals…</> : 'Search portals'}</Button>
        </form>
        <div className="flex flex-wrap items-center gap-1.5 text-xs"><span className="font-semibold text-mute">Searching for:</span>{st.queries.map(q => <Badge key={q} tone="lime">{q}</Badge>)}{!st.queries.length && <span className="text-warn">Add a target role (Profile) to search.</span>}</div>
        {!ext && <p className="text-xs text-mute">Naukri, LinkedIn and other portals appear here once the <a href="#/sources" className="font-semibold text-brand-ink hover:underline">browser extension</a> is installed.</p>}
      </Card>

      <section className="space-y-3"><div className="flex items-center justify-between"><h2 className="text-lg font-extrabold">Recommended</h2><a href="#/jobs" className="text-sm font-semibold text-brand-ink hover:underline">View all</a></div>
        {scan.running && !jobs.length && <div className="grid gap-3 md:grid-cols-2">{[0, 1, 2, 3].map(i => <Card key={i} className="space-y-3"><div className="flex gap-3"><div className="skel size-10" /><div className="flex-1 space-y-2"><div className="skel h-4 w-2/3" /><div className="skel h-3 w-1/3" /></div></div><div className="skel h-3 w-full" /><div className="skel h-8 w-1/2 !rounded-full" /></Card>)}</div>}
        {!scan.running && !rec.length && <Card className="py-10 text-center text-sm text-mute">{jobs.length ? `No new jobs score ${min}+ yet. Lower the minimum match in Settings or search again.` : 'No jobs yet. Click Search to scan all sources.'}</Card>}
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">{rec.map((j, i) => <Card key={j.id} className="lift rise flex flex-col gap-3" style={{ '--d': `${i * 60}ms` } as React.CSSProperties}>
          <div className="flex items-start gap-3"><Avatar name={j.company} /><div className="min-w-0 flex-1"><a href={`#/job/${j.id}`} className="block truncate font-extrabold hover:text-brand-ink">{j.title}</a><p className="truncate text-xs text-mute">{j.company}</p></div>
            <Badge tone={j.score >= 75 ? 'good' : 'brand'}>{j.score}%</Badge></div>
          <div className="flex flex-wrap gap-1.5">{j.workMode && <Badge tone={j.workMode === 'remote' ? 'lime' : 'brand'}>{j.workMode}</Badge>}<Badge>{j.expLevel}</Badge></div>
          <p className="flex items-center gap-1 text-xs font-semibold"><Icon d={ICONS.pin} className="size-3.5" />{j.location || 'Location not stated'}</p>
          <p className="line-clamp-2 text-xs text-mute">{j.summary}</p>
          <div className="mt-auto"><LinkButton href={j.url}>Apply for a job</LinkButton></div></Card>)}</div>
      </section>

      <section className="grid gap-5 md:grid-cols-2">
        <Card><h3 className="mb-4 font-extrabold">Match quality</h3>
          <div className="flex h-40 items-end gap-3">{bands.map(([k, n], i) => <div key={k} className="flex flex-1 flex-col items-center gap-2"><span className="text-xs font-bold tabular-nums">{n}</span>
            <div className="flex h-28 w-full items-end"><div className={cn('bar-grow w-full rounded-xl', i === 0 ? 'bg-lime' : i === 1 ? 'bg-brand' : i === 2 ? 'bg-brand/50' : 'bg-line')} style={{ height: `${Math.max(6, (n / maxBand) * 100)}%` }} /></div><span className="text-xs text-mute">{k}</span></div>)}</div></Card>
        <Card><h3 className="mb-3 font-extrabold">Jobs by source</h3><ul className="space-y-2.5">{Object.entries(jobs.reduce<Record<string, number>>((m, j) => { m[j.source] = (m[j.source] ?? 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) =>
          <li key={k} className="text-sm"><div className="flex justify-between"><span>{k}</span><span className="tabular-nums text-mute">{n}</span></div><div className="mt-1 h-1.5 rounded-full bg-sunk"><div className="bar-grow-x h-full rounded-full bg-brand" style={{ width: `${(n / jobs.length) * 100}%` }} /></div></li>)}
          {!jobs.length && <li className="text-sm text-mute">Nothing yet.</li>}</ul></Card>
      </section>
    </div>

    <aside className="min-w-0 space-y-5">
      <Card className="space-y-4 text-center"><span className="mx-auto grid size-16 place-items-center rounded-full bg-brand-soft text-2xl font-extrabold text-brand-ink">{(st.profile.name || 'Y')[0].toUpperCase()}</span>
        <div><p className="text-lg font-extrabold">Hello, {st.profile.name.split(' ')[0] || 'there'}</p><p className="text-sm text-mute">{st.profile.currentDesignation || 'Add your role'} · {st.profile.totalExperienceYears} yrs</p></div>
        <div className="grid grid-cols-3 gap-2 text-center">{[['Jobs', jobs.length], ['Saved', jobs.filter(j => j.saved).length], ['Applied', count('applied') + count('interview')]].map(([k, v]) => <div key={k as string} className="rounded-2xl bg-sunk py-2"><div className="font-extrabold tabular-nums">{v}</div><div className="text-[11px] text-mute">{k}</div></div>)}</div>
        <ReplaceResume className="w-full justify-center" /><p className="text-xs text-mute">A new resume replaces your roles and results, keeps jobs you saved or tracked, and searches again.</p>
        <div className="flex justify-center gap-2"><a href="#/profile" className="text-sm font-semibold text-brand-ink hover:underline">Edit profile</a>·<a href="#/sources" className="text-sm font-semibold text-brand-ink hover:underline">Sources</a></div></Card>
      <div className="grid grid-cols-2 gap-3"><Tile label="Excellent" value={jobs.filter(j => j.score >= 90).length} tone="bg-lime text-lime-ink" /><Tile label="Strong" value={jobs.filter(j => j.score >= 75 && j.score < 90).length} />
        <Tile label="New today" value={jobs.filter(j => day(j.firstSeen) === today).length} /><Tile label="Discovered" value={jobs.length} /></div>
      <Card><div className="mb-3 flex items-center justify-between"><h3 className="font-extrabold">Applications</h3><a href="#/applications" className="text-sm font-semibold text-brand-ink hover:underline">View all</a></div>
        <ul className="space-y-2">{tracked.map(j => <li key={j.id} className={cn('rounded-xl border-l-4 bg-sunk p-3 text-sm', j.status === 'interview' ? 'border-lime' : j.status === 'rejected' ? 'border-bad' : j.status === 'applied' ? 'border-brand' : 'border-line')}>
          <a href={`#/job/${j.id}`} className="block truncate font-bold hover:text-brand-ink">{j.title}</a><span className="text-xs text-mute">{j.company} · {STATUS_LABEL[j.status]}</span></li>)}
          {!tracked.length && <li className="text-sm text-mute">Mark jobs as Interested, Applied or Interview to track them here.</li>}</ul></Card>
    </aside>
  </div>;
}
