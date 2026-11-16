import { useEffect, useMemo, useState } from 'react';
import { api, type Company, type Job, type Prefs, type State } from './api.ts';
import { Badge, Button, Card, Input, Select, cn } from './ui.tsx';

const STATUS_LABEL: Record<string, string> = { new: 'New', shortlisted: 'Shortlisted', interested: 'Interested', applied: 'Applied', interview: 'Interview', rejected: 'Rejected', not_interested: 'Not interested' };
const scoreColor = (s: number) => s >= 80 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : s >= 60 ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' : 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300';
const ACCESS: Record<string, { label: string; cls: string }> = {
  ok: { label: 'Read', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  blocked: { label: 'Blocked: manual access needed', cls: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300' },
  manual: { label: 'Manual: use extension', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  error: { label: 'Error', cls: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300' },
  not_configured: { label: 'Not configured', cls: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300' },
  none: { label: 'Not run yet', cls: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300' },
};
const lines = (s: string) => s.split(/[,\n]/).map(x => x.trim()).filter(Boolean);
const countBy = (jobs: Job[], f: (j: Job) => string) => Object.entries(jobs.reduce<Record<string, number>>((m, j) => { const k = f(j) || 'Unknown'; m[k] = (m[k] ?? 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]);
const day = (iso: string) => iso.slice(0, 10);

function Stat({ label, value }: { label: string; value: number }) {
  return <Card className="p-3"><div className="text-2xl font-semibold tabular-nums">{value}</div><div className="text-sm text-zinc-500">{label}</div></Card>;
}
function Breakdown({ title, rows }: { title: string; rows: [string, number][] }) {
  const max = rows[0]?.[1] ?? 1;
  return <Card><h3 className="mb-2 text-sm font-semibold">{title}</h3>
    {rows.length === 0 && <p className="text-sm text-zinc-500">No data yet.</p>}
    <ul className="space-y-1.5">{rows.slice(0, 6).map(([k, n]) => <li key={k} className="text-sm">
      <div className="flex justify-between gap-2"><span className="truncate">{k}</span><span className="tabular-nums text-zinc-500">{n}</span></div>
      <div className="h-1.5 rounded bg-zinc-200 dark:bg-zinc-800"><div className="h-1.5 rounded bg-teal-600" style={{ width: `${(n / max) * 100}%` }} /></div></li>)}</ul></Card>;
}

function JobCard({ job, statuses, onStatus }: { job: Job; statuses: string[]; onStatus: (id: string, s: string) => void }) {
  return <Card className="space-y-3">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0"><h3 className="font-semibold leading-snug">{job.title}</h3>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{job.company} · {job.location || 'Location not stated'}{job.workMode && ` · ${job.workMode}`}</p></div>
      <div className="shrink-0 text-right"><Badge className={cn('text-sm', scoreColor(job.score))}>{job.score}%</Badge><div className="mt-1 text-xs text-zinc-500">{job.category}</div></div>
    </div>
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
      <span>Source: {job.source}</span><span>Experience: {job.expLevel}</span>{job.salary && <span>Salary: {job.salary}</span>}
      {job.postedAt && <span>Posted {day(job.postedAt)}</span>}{job.deadline && <span>Deadline {day(job.deadline)}</span>}
    </div>
    {job.summary && <p className="text-sm text-zinc-700 dark:text-zinc-300">{job.summary}</p>}
    <div className="space-y-1.5 text-xs">
      {job.requiredSkills.length > 0 && <div className="flex flex-wrap items-center gap-1"><span className="w-16 text-zinc-500">Required</span>{job.requiredSkills.map(s => <Badge key={s} className="bg-zinc-100 dark:bg-zinc-800">{s}</Badge>)}</div>}
      {job.matchedSkills.length > 0 && <div className="flex flex-wrap items-center gap-1"><span className="w-16 text-zinc-500">You have</span>{job.matchedSkills.map(s => <Badge key={s} className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">{s}</Badge>)}</div>}
      {job.missingSkills.length > 0 && <div className="flex flex-wrap items-center gap-1"><span className="w-16 text-zinc-500">Missing</span>{job.missingSkills.map(s => <Badge key={s} className="bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300">{s}</Badge>)}</div>}
    </div>
    <details className="text-sm"><summary className="cursor-pointer text-zinc-600 dark:text-zinc-400">Why this score</summary><ul className="mt-1 list-disc pl-5">{job.reasons.map(r => <li key={r}>{r}</li>)}</ul></details>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <a href={job.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-teal-700 underline dark:text-teal-400">Open original posting</a>
      <Select className="w-44" value={job.status} aria-label="Status" onChange={e => onStatus(job.id, e.target.value)}>{statuses.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</Select>
    </div>
  </Card>;
}

export default function App() {
  const [st, setSt] = useState<State | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [results, setResults] = useState<{ name: string; status: string; reason: string; found: number }[]>([]);
  const [f, setF] = useState({ min: 60, role: '', company: '', location: '', exp: '', salary: false, mode: '', portal: '', posted: '', status: '' });

  const load = async () => { const s = await api.state(); setSt(s); setPrefs(p => p ?? s.prefs); };
  useEffect(() => { load().catch(e => setMsg(e.message)); }, []);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true); setMsg(label);
    try { await fn(); setMsg(m => m === label ? '' : m); await load(); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };
  const savePrefs = () => prefs && api.prefs(prefs);

  const jobs = st?.jobs ?? [];
  const matching = jobs.filter(j => j.score >= 60);
  const today = new Date().toISOString().slice(0, 10);
  const shown = useMemo(() => jobs.filter(j => {
    const age = j.postedAt ? (Date.now() - +new Date(j.postedAt)) / 864e5 : 0;
    return j.score >= f.min && j.title.toLowerCase().includes(f.role.toLowerCase()) && (!f.company || j.company === f.company)
      && j.location.toLowerCase().includes(f.location.toLowerCase()) && (!f.exp || j.expLevel === f.exp) && (!f.salary || !!j.salary)
      && (!f.mode || j.workMode === f.mode) && (!f.portal || j.source === f.portal) && (!f.status || j.status === f.status)
      && (!f.posted || (j.postedAt !== '' && age <= +f.posted));
  }), [jobs, f]);
  const uniq = (g: (j: Job) => string) => [...new Set(jobs.map(g).filter(Boolean))].sort();
  const set = (k: keyof typeof f, v: string | number | boolean) => setF(x => ({ ...x, [k]: v }));

  if (!st) return <p className="p-6">{msg || 'Loading…'}</p>;
  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
    <header><h1 className="text-2xl font-semibold">Job Agent <a href="roadmap.html" className="ml-2 text-sm font-normal text-teal-700 underline dark:text-teal-400">Roadmap</a></h1><p className="text-sm text-zinc-500">Runs entirely in your browser. Your resume and jobs stay in this browser and are never uploaded.</p></header>

    <Card className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium" htmlFor="resume">Resume (PDF, DOCX or TXT)</label>
        <input id="resume" type="file" accept=".pdf,.docx,.txt" disabled={busy} onChange={e => { const file = e.target.files?.[0]; if (file) run('Reading resume…', () => api.resume(file)); }} />
        <Button disabled={busy || !st.profile} onClick={() => run('Searching…', async () => { await savePrefs(); setResults((await api.search()).results); })}>Search jobs</Button>
        {msg && <span role="status" className="text-sm text-zinc-500">{msg}</span>}
      </div>
      {st.profile && <p className="text-sm"><b>{st.profile.name}</b> · {st.profile.currentDesignation} · {st.profile.totalExperienceYears} yrs · {st.profile.location}<br /><span className="text-zinc-500">{st.profile.allSkills.join(', ')}</span></p>}
    </Card>

    {prefs && <Card className="space-y-3"><h2 className="font-semibold">Search preferences</h2>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm">Target roles (comma separated)<Input value={prefs.roles.join(', ')} onChange={e => setPrefs({ ...prefs, roles: lines(e.target.value) })} /></label>
        <label className="text-sm">Locations<Input value={prefs.locations.join(', ')} onChange={e => setPrefs({ ...prefs, locations: lines(e.target.value) })} /></label>
        <label className="text-sm">Blocklist (company or title words)<Input value={prefs.blocklist.join(', ')} onChange={e => setPrefs({ ...prefs, blocklist: lines(e.target.value) })} /></label>
        <label className="text-sm">Preferred work mode
          <Select value={prefs.workModes[0] ?? ''} onChange={e => setPrefs({ ...prefs, workModes: e.target.value ? [e.target.value] : [] })}><option value="">Any</option><option value="remote">Remote</option><option value="hybrid">Hybrid</option><option value="office">Office</option></Select></label>
      </div>
      <label className="block text-sm">Company career pages: one per line as <code>ats:token</code> or <code>ats:token:Display name</code> (ats = greenhouse, lever, ashby, smartrecruiters)
        <textarea className="mt-1 min-h-20 w-full rounded-md border border-zinc-300 bg-white p-2 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-900"
          defaultValue={prefs.companies.map(c => [c.ats, c.token, c.name].filter(Boolean).join(':')).join('\n')}
          onChange={e => setPrefs({ ...prefs, companies: e.target.value.split('\n').map(l => l.trim().split(':')).filter(p => p.length >= 2).map(([ats, token, name]) => ({ ats, token, name } as Company)) })} /></label>
      <Button variant="outline" disabled={busy} onClick={() => run('Saving…', async () => { await savePrefs(); })}>Save preferences</Button>
    </Card>}

    <section aria-label="Portal status" className="space-y-2"><h2 className="font-semibold">Job sources</h2>
      <p className="flex flex-wrap items-center gap-3 text-sm text-zinc-500">Portals that restrict automation are never opened by this app. Install the browser extension, click “Send to Job Agent” on a portal's job list, then import here.
        <Button variant="outline" disabled={busy || !st.profile} onClick={() => run('Importing…', async () => { const r = await api.importExtension(); setMsg(`Imported ${r.received}: ${r.added} added, ${r.duplicate} duplicates, ${r.received - r.added - r.duplicate} rejected (no verifiable https link)`); })}>Import from extension</Button></p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{st.portals.map(p => {
        const run = st.runs.find(r => r.adapter === p.id), live = results.find(r => r.name === p.name);
        const status = live?.status ?? run?.status ?? (p.policy === 'manual' ? 'manual' : 'none'), a = ACCESS[status] ?? ACCESS.none;
        return <Card key={p.id} className="p-3 text-sm"><div className="flex items-center justify-between gap-2"><b>{p.name}</b><Badge className={a.cls}>{a.label}</Badge></div>
          <p className="mt-1 text-xs text-zinc-500">{live?.reason ?? run?.reason ?? p.note}</p><p className="mt-1 text-xs">{jobs.filter(j => j.source === p.name).length} jobs stored</p></Card>;
      })}
        {(() => { const r = results.find(x => x.name.startsWith('Company career')) ?? st.runs.find(x => x.adapter === 'career-pages'); const a = ACCESS[r?.status ?? 'none'];
          return <Card className="p-3 text-sm"><div className="flex items-center justify-between gap-2"><b>Company career pages</b><Badge className={a.cls}>{a.label}</Badge></div>
            <p className="mt-1 text-xs text-zinc-500">{r?.reason ?? 'Greenhouse, Lever, Ashby and SmartRecruiters boards you list above. Workday is not supported yet.'}</p></Card>; })()}
      </div></section>

    <section aria-label="Summary" className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Stat label="Jobs discovered" value={jobs.length} /><Stat label="Matching (60+)" value={matching.length} />
      <Stat label="Excellent (90+)" value={jobs.filter(j => j.score >= 90).length} /><Stat label="New today" value={jobs.filter(j => day(j.firstSeen) === today).length} />
    </section>
    <section aria-label="Breakdowns" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Breakdown title="By portal" rows={countBy(jobs, j => j.source)} /><Breakdown title="By company" rows={countBy(jobs, j => j.company)} />
      <Breakdown title="By experience level" rows={countBy(jobs, j => j.expLevel)} /><Breakdown title="By location" rows={countBy(jobs, j => j.location)} />
    </section>

    <section aria-label="Jobs" className="space-y-3"><h2 className="font-semibold">Jobs ({shown.length})</h2>
      <Card className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Select aria-label="Minimum match" value={f.min} onChange={e => set('min', +e.target.value)}><option value={0}>Any score</option><option value={60}>60+ Moderate</option><option value={70}>70+ Good</option><option value={80}>80+ Strong</option><option value={90}>90+ Excellent</option></Select>
        <Input aria-label="Job role" placeholder="Job role" value={f.role} onChange={e => set('role', e.target.value)} />
        <Select aria-label="Company" value={f.company} onChange={e => set('company', e.target.value)}><option value="">All companies</option>{uniq(j => j.company).map(c => <option key={c}>{c}</option>)}</Select>
        <Input aria-label="Location" placeholder="Location" value={f.location} onChange={e => set('location', e.target.value)} />
        <Select aria-label="Experience" value={f.exp} onChange={e => set('exp', e.target.value)}><option value="">All experience</option>{uniq(j => j.expLevel).map(c => <option key={c}>{c}</option>)}</Select>
        <Select aria-label="Work mode" value={f.mode} onChange={e => set('mode', e.target.value)}><option value="">Remote / Hybrid / Office</option><option value="remote">Remote</option><option value="hybrid">Hybrid</option><option value="office">Office</option></Select>
        <Select aria-label="Portal" value={f.portal} onChange={e => set('portal', e.target.value)}><option value="">All portals</option>{uniq(j => j.source).map(c => <option key={c}>{c}</option>)}</Select>
        <Select aria-label="Posted" value={f.posted} onChange={e => set('posted', e.target.value)}><option value="">Any posted date</option><option value="1">Last 24 hours</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option></Select>
        <Select aria-label="Status" value={f.status} onChange={e => set('status', e.target.value)}><option value="">All statuses</option>{st.statuses.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</Select>
        <label className="flex h-9 items-center gap-2 text-sm"><input type="checkbox" checked={f.salary} onChange={e => set('salary', e.target.checked)} />Salary listed</label>
      </Card>
      {jobs.length === 0 && <Card><p className="text-sm text-zinc-500">No jobs yet. Upload a resume and click Search jobs. Add company career pages above, or import listings from the browser extension.</p></Card>}
      <div className="grid gap-3 lg:grid-cols-2">{shown.map(j => <JobCard key={j.id} job={j} statuses={st.statuses} onStatus={(id, s) => api.status(id, s).then(load)} />)}</div>
    </section>
  </main>;
}
