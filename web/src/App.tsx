import { useEffect, useMemo, useState } from 'react';
import { api, type Company, type Job, type Prefs, type State } from './api.ts';
import { Badge, Button, Card, Input, Label, ScoreRing, Select } from './ui.tsx';

const STATUS_LABEL: Record<string, string> = { new: 'New', shortlisted: 'Shortlisted', interested: 'Interested', applied: 'Applied', interview: 'Interview', rejected: 'Rejected', not_interested: 'Not interested' };
// Boards confirmed reachable from a browser when this list was made.
const EXAMPLE_BOARDS = 'greenhouse:stripe\ngreenhouse:airbnb\ngreenhouse:gitlab\ngreenhouse:groww\ngreenhouse:cloudflare\nlever:cred\nlever:meesho\nlever:paytm\nlever:zeta\nashby:notion\nashby:openai\nashby:supabase';

const lines = (s: string) => s.split(/[,\n]/).map(x => x.trim()).filter(Boolean);
const parseBoards = (t: string): Company[] => t.split('\n').map(l => l.trim().split(':')).filter(p => p.length >= 2 && p[1]).map(([ats, token, name]) => ({ ats, token, name }));
const countBy = (jobs: Job[], f: (j: Job) => string) => Object.entries(jobs.reduce<Record<string, number>>((m, j) => { const k = f(j) || 'Unknown'; m[k] = (m[k] ?? 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]);
const day = (iso: string) => iso.slice(0, 10);

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return <Card className="p-4"><div className="font-display text-3xl font-bold tabular-nums">{value}</div><div className="text-sm text-mute">{label}</div>{hint && <div className="text-xs text-mute/80">{hint}</div>}</Card>;
}
function Bars({ title, rows }: { title: string; rows: [string, number][] }) {
  const max = rows[0]?.[1] ?? 1;
  return <Card><h3 className="mb-3 text-sm font-semibold">{title}</h3>
    {rows.length === 0 ? <p className="text-sm text-mute">Nothing yet.</p> : <ul className="space-y-2">{rows.slice(0, 5).map(([k, n]) => <li key={k} className="text-sm">
      <div className="flex justify-between gap-2"><span className="truncate">{k}</span><span className="tabular-nums text-mute">{n}</span></div>
      <div className="mt-1 h-1.5 rounded-full bg-sunk"><div className="h-1.5 rounded-full bg-brand" style={{ width: `${(n / max) * 100}%` }} /></div></li>)}</ul>}</Card>;
}

function JobCard({ job, statuses, onStatus }: { job: Job; statuses: string[]; onStatus: (id: string, s: string) => void }) {
  const chips = (label: string, items: string[], tone: 'mute' | 'good' | 'bad') => items.length > 0 &&
    <div className="flex flex-wrap items-center gap-1.5"><span className="w-14 shrink-0 text-xs text-mute">{label}</span>{items.map(s => <Badge key={s} tone={tone}>{s}</Badge>)}</div>;
  return <Card className="flex gap-4">
    <ScoreRing score={job.score} />
    <div className="min-w-0 flex-1 space-y-3">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-x-3">
          <h3 className="text-base font-semibold leading-snug">{job.title}</h3>
          <Badge tone={job.score >= 80 ? 'good' : job.score >= 60 ? 'warn' : 'mute'}>{job.category}</Badge>
        </div>
        <p className="text-sm text-mute">{job.company} · {job.location || 'Location not stated'}{job.workMode && ` · ${job.workMode}`}</p>
      </div>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-mute">
        <span>via {job.source}</span><span>{job.expLevel}</span>{job.salary && <span>{job.salary}</span>}
        {job.postedAt && <span>posted {day(job.postedAt)}</span>}{job.deadline && <span>deadline {day(job.deadline)}</span>}</p>
      {job.summary && <p className="line-clamp-3 text-sm">{job.summary}</p>}
      <div className="space-y-1.5">{chips('Required', job.requiredSkills, 'mute')}{chips('You have', job.matchedSkills, 'good')}{chips('Missing', job.missingSkills, 'bad')}</div>
      <details className="text-sm"><summary className="cursor-pointer text-mute">Why this score</summary><ul className="mt-1 list-disc space-y-0.5 pl-5">{job.reasons.map(r => <li key={r}>{r}</li>)}</ul></details>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        <a href={job.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center rounded-lg bg-brand px-4 text-sm font-medium text-white hover:opacity-90 dark:text-canvas">View original posting</a>
        <Select className="w-44" value={job.status} aria-label="Status" onChange={e => onStatus(job.id, e.target.value)}>{statuses.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</Select>
      </div>
    </div>
  </Card>;
}

export default function App() {
  const [st, setSt] = useState<State | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [boards, setBoards] = useState('');
  const [f, setF] = useState({ min: 60, role: '', company: '', location: '', exp: '', salary: false, mode: '', portal: '', posted: '', status: '' });

  const load = async (resetPrefs = false) => {
    const s = await api.state(); setSt(s);
    if (resetPrefs || !prefs) { setPrefs(s.prefs); setBoards((s.prefs?.companies ?? []).map(c => [c.ats, c.token, c.name].filter(Boolean).join(':')).join('\n')); }
  };
  useEffect(() => { load().catch(e => setMsg(e.message)); }, []);

  const run = async (label: string, fn: () => Promise<unknown>, resetPrefs = false) => {
    setBusy(true); setMsg(label);
    try { await fn(); setMsg(m => m === label ? '' : m); await load(resetPrefs); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };
  const savePrefs = () => prefs ? api.prefs(prefs) : Promise.resolve();
  const editBoards = (t: string) => { setBoards(t); if (prefs) setPrefs({ ...prefs, companies: parseBoards(t) }); };

  const jobs = st?.jobs ?? [];
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
  const hasRoles = !!prefs?.roles.length;
  const ran = st.runs.length > 0;
  const steps = [{ n: 1, t: 'Upload resume', done: !!st.profile }, { n: 2, t: 'Search sources', done: ran }, { n: 3, t: 'Review matches', done: jobs.some(j => j.score >= 60) }];

  return <div className="min-h-screen">
    <header className="sticky top-0 z-20 border-b border-line bg-card/85 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-lg bg-brand font-display text-sm font-bold text-white dark:text-canvas">JA</span><span className="whitespace-nowrap font-display text-lg font-bold">Job Agent</span></div>
        <div className="flex items-center gap-3 text-sm"><Badge tone="good" className="max-sm:hidden">Private: runs in your browser</Badge><a href="roadmap.html" className="text-brand-ink underline">Roadmap</a></div>
      </div>
    </header>

    <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[340px_minmax(0,1fr)]">
      <aside className="space-y-4 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6.5rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
        <Card className="space-y-3">
          <h2 className="font-semibold">Your resume</h2>
          <input id="resume" type="file" accept=".pdf,.docx,.txt" disabled={busy} className="w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-soft file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-ink"
            onChange={e => { const file = e.target.files?.[0]; if (file) run('Reading resume…', () => api.resume(file), true); }} aria-label="Resume file (PDF, DOCX or TXT)" />
          {st.profile ? <div className="space-y-2 text-sm">
            <p><b>{st.profile.name || 'Unnamed'}</b><br /><span className="text-mute">{st.profile.currentDesignation || 'Designation not found'} · {st.profile.totalExperienceYears} yrs · {st.profile.location || 'Location not found'}</span></p>
            <div className="flex flex-wrap gap-1">{st.profile.allSkills.slice(0, 18).map(s => <Badge key={s} tone="brand">{s}</Badge>)}</div>
          </div> : <p className="text-sm text-mute">PDF, DOCX or TXT. Parsed on this device and never uploaded.</p>}
        </Card>

        {prefs && <Card className="space-y-3">
          <h2 className="font-semibold">Preferences</h2>
          <Label>Target roles<Input value={prefs.roles.join(', ')} onChange={e => setPrefs({ ...prefs, roles: lines(e.target.value) })} placeholder="Frontend Developer, React Engineer" /></Label>
          <Label>Locations<Input value={prefs.locations.join(', ')} onChange={e => setPrefs({ ...prefs, locations: lines(e.target.value) })} placeholder="Bangalore, Remote" /></Label>
          <Label>Work mode<Select value={prefs.workModes[0] ?? ''} onChange={e => setPrefs({ ...prefs, workModes: e.target.value ? [e.target.value] : [] })}><option value="">Any</option><option value="remote">Remote</option><option value="hybrid">Hybrid</option><option value="office">Office</option></Select></Label>
          <Label>Blocklist (company or title words)<Input value={prefs.blocklist.join(', ')} onChange={e => setPrefs({ ...prefs, blocklist: lines(e.target.value) })} /></Label>
          <Label>Company career pages (one per line, <code>ats:token</code>)
            <textarea value={boards} onChange={e => editBoards(e.target.value)} placeholder={'greenhouse:stripe\nlever:cred\nashby:notion'} className="min-h-24 w-full rounded-lg border border-line bg-card p-2 font-mono text-xs" /></Label>
          <Button variant="ghost" className="h-8 px-2" onClick={() => editBoards(EXAMPLE_BOARDS)}>Fill with example boards</Button>
          <details className="text-xs text-mute"><summary className="cursor-pointer">Adzuna key for Indian listings (free)</summary>
            <div className="mt-2 grid gap-2"><Input aria-label="Adzuna app id" placeholder="App id" value={prefs.adzuna?.id ?? ''} onChange={e => setPrefs({ ...prefs, adzuna: { id: e.target.value, key: prefs.adzuna?.key ?? '' } })} />
              <Input aria-label="Adzuna app key" placeholder="App key" type="password" value={prefs.adzuna?.key ?? ''} onChange={e => setPrefs({ ...prefs, adzuna: { id: prefs.adzuna?.id ?? '', key: e.target.value } })} />
              <span>Get both at developer.adzuna.com. Stored only in this browser.</span></div></details>
          <Button variant="outline" disabled={busy} onClick={() => run('Saving…', async () => { await savePrefs(); })}>Save preferences</Button>
        </Card>}
      </aside>

      <main className="min-w-0 space-y-6">
        <ol className="grid gap-2 sm:grid-cols-3" aria-label="Progress">{steps.map(s => <li key={s.n} className="flex items-center gap-3 rounded-xl border border-line bg-card px-4 py-3">
          <span className={`grid size-7 place-items-center rounded-full text-sm font-bold ${s.done ? 'bg-good text-white dark:text-canvas' : 'bg-sunk text-mute'}`}>{s.done ? '✓' : s.n}</span><span className="text-sm font-medium">{s.t}</span></li>)}</ol>

        <Card className="flex flex-wrap items-center justify-between gap-4">
          <div><h2 className="font-display text-xl font-bold">Find jobs</h2>
            <p className="text-sm text-mute">Searches {st.sources.length} sources at once for {hasRoles ? prefs!.roles.join(', ') : 'your target roles'}, scores each posting against your resume and removes duplicates.</p>
            {!st.profile && <p className="mt-1 text-sm text-warn">Upload a resume first.</p>}
            {st.profile && !hasRoles && <p className="mt-1 text-sm text-warn">Add at least one target role in Preferences.</p>}</div>
          <div className="flex items-center gap-3">{msg && <span role="status" className="max-w-64 text-sm text-mute">{msg}</span>}
            <Button className="h-11 px-6 text-base" disabled={busy || !st.profile || !hasRoles} onClick={() => run('Searching…', async () => { await savePrefs(); await api.search(); })}>{busy && msg === 'Searching…' ? 'Searching…' : 'Search jobs'}</Button></div>
        </Card>

        <section aria-label="Job sources" className="space-y-3"><h2 className="font-semibold">Sources</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{st.sources.map(s => {
            const r = st.runs.find(x => x.adapter === s.id);
            const tone = !r ? 'mute' : r.status === 'ok' ? 'good' : r.status === 'not_configured' ? 'warn' : 'bad';
            const label = !r ? 'Ready' : r.status === 'ok' ? `Read · ${r.found} matches` : r.status === 'not_configured' ? 'Needs setup' : 'Error';
            return <Card key={s.id} className="space-y-1.5 p-3"><div className="flex items-center justify-between gap-2"><b className="text-sm">{s.name}</b><Badge tone={tone}>{label}</Badge></div>
              <p className="text-xs text-mute">{r?.reason ?? s.note}</p>{r && <p className="text-xs">{jobs.filter(j => j.source === s.name || (s.id === 'career-pages' && j.sourceKind === 'career')).length} jobs stored</p>}</Card>;
          })}</div>
          <Card className="space-y-2 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><b className="text-sm">Restricted portals: use the browser extension</b>
            <Button variant="outline" className="h-8" disabled={busy || !st.profile} onClick={() => run('Importing…', async () => { const r = await api.importExtension(); setMsg(`Imported ${r.received}: ${r.added} added, ${r.duplicate} duplicates, ${r.received - r.added - r.duplicate} rejected (no verifiable https link)`); })}>Import from extension</Button></div>
            <p className="text-xs text-mute">These sites forbid automated reading, so the app never opens them. Install the extension, click “Send to Job Agent” on a job list in your own tab, then import.</p>
            <div className="flex flex-wrap gap-1.5">{st.portals.map(p => <Badge key={p.id} tone={p.extension ? 'brand' : 'mute'} title={p.note}>{p.name}{p.extension ? '' : ' (soon)'}</Badge>)}</div></Card>
        </section>

        <section aria-label="Summary" className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Jobs discovered" value={jobs.length} /><Stat label="Matching" value={jobs.filter(j => j.score >= 60).length} hint="score 60+" />
          <Stat label="Excellent" value={jobs.filter(j => j.score >= 90).length} hint="score 90+" /><Stat label="New today" value={jobs.filter(j => day(j.firstSeen) === today).length} />
        </section>
        <section aria-label="Breakdowns" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Bars title="By portal" rows={countBy(jobs, j => j.source)} /><Bars title="By company" rows={countBy(jobs, j => j.company)} />
          <Bars title="By experience" rows={countBy(jobs, j => j.expLevel)} /><Bars title="By location" rows={countBy(jobs, j => j.location)} />
        </section>

        <section aria-label="Jobs" className="space-y-3"><h2 className="font-semibold">Matches ({shown.length})</h2>
          <Card className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
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
          {jobs.length === 0 && <Card className="py-10 text-center"><p className="font-medium">No jobs yet</p><p className="text-sm text-mute">Upload a resume, set a target role and click Search jobs.</p></Card>}
          {jobs.length > 0 && shown.length === 0 && <Card className="py-8 text-center text-sm text-mute">No jobs pass these filters. Lower the minimum match to see more.</Card>}
          <div className="space-y-3">{shown.map(j => <JobCard key={j.id} job={j} statuses={st.statuses} onStatus={(id, s) => api.status(id, s).then(() => load())} />)}</div>
        </section>
      </main>
    </div>
  </div>;
}
