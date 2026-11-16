import { useEffect, useMemo, useState } from 'react';
import { api, type Company, type Job, type Prefs, type State } from './api.ts';
import { Badge, Button, Card, Input, Label, Radar, Reveal, ScoreRing, Select, cn, useCountUp } from './ui.tsx';

const STATUS_LABEL: Record<string, string> = { new: 'New', shortlisted: 'Shortlisted', interested: 'Interested', applied: 'Applied', interview: 'Interview', rejected: 'Rejected', not_interested: 'Not interested' };
// Boards confirmed reachable from a browser when this list was made.
const EXAMPLE_BOARDS = 'greenhouse:stripe\ngreenhouse:airbnb\ngreenhouse:gitlab\ngreenhouse:groww\ngreenhouse:cloudflare\nlever:cred\nlever:meesho\nlever:paytm\nlever:zeta\nashby:notion\nashby:openai\nashby:supabase';

const lines = (s: string) => s.split(/[,\n]/).map(x => x.trim()).filter(Boolean);
const parseBoards = (t: string): Company[] => t.split('\n').map(l => l.trim().split(':')).filter(p => p.length >= 2 && p[1]).map(([ats, token, name]) => ({ ats, token, name }));
const countBy = (jobs: Job[], f: (j: Job) => string) => Object.entries(jobs.reduce<Record<string, number>>((m, j) => { const k = f(j) || 'Unknown'; m[k] = (m[k] ?? 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]);
const day = (iso: string) => iso.slice(0, 10);

function useTheme() {
  const [t, setT] = useState<string | null>(() => { try { return localStorage.getItem('ja.theme'); } catch { return null; } });
  useEffect(() => {
    if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
    try { t ? localStorage.setItem('ja.theme', t) : localStorage.removeItem('ja.theme'); } catch { /* storage blocked: theme just won't persist */ }
  }, [t]);
  const dark = t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  return [dark, () => setT(dark ? 'light' : 'dark')] as const;
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  const v = useCountUp(value);
  return <Card className="lift p-4"><div className="font-display text-3xl font-bold tabular-nums">{v}</div><div className="text-sm text-mute">{label}</div>{hint && <div className="font-mono text-[11px] text-mute/80">{hint}</div>}</Card>;
}
function Bars({ title, rows }: { title: string; rows: [string, number][] }) {
  const max = rows[0]?.[1] ?? 1;
  return <Card><h3 className="mb-3 text-sm font-bold">{title}</h3>
    {rows.length === 0 ? <p className="text-sm text-mute">Nothing yet.</p> : <ul className="space-y-2.5">{rows.slice(0, 5).map(([k, n]) => <li key={k} className="text-sm">
      <div className="flex justify-between gap-2"><span className="truncate">{k}</span><span className="font-mono text-xs tabular-nums text-mute">{n}</span></div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-sunk"><div className="bar-grow h-full rounded-full bg-gradient-to-r from-brand to-brand2" style={{ width: `${(n / max) * 100}%` }} /></div></li>)}</ul>}</Card>;
}

function JobCard({ job, statuses, onStatus }: { job: Job; statuses: string[]; onStatus: (id: string, s: string) => void }) {
  const chips = (label: string, items: string[], tone: 'mute' | 'good' | 'bad') => items.length > 0 &&
    <div className="flex flex-wrap items-center gap-1.5"><span className="w-16 shrink-0 font-mono text-[11px] uppercase tracking-wide text-mute">{label}</span>{items.map(s => <Badge key={s} tone={tone}>{s}</Badge>)}</div>;
  return <Card className="lift flex h-full gap-4">
    <ScoreRing score={job.score} />
    <div className="flex min-w-0 flex-1 flex-col gap-3">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <h3 className="text-[15px] font-bold leading-snug">{job.title}</h3>
          <Badge tone={job.score >= 80 ? 'good' : job.score >= 60 ? 'warn' : 'mute'}>{job.category}</Badge>
        </div>
        <p className="text-sm text-mute">{job.company} · {job.location || 'Location not stated'}{job.workMode && ` · ${job.workMode}`}</p>
      </div>
      <p className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-mute">
        <span>via {job.source}</span><span>{job.expLevel}</span>{job.salary && <span>{job.salary}</span>}
        {job.postedAt && <span>posted {day(job.postedAt)}</span>}{job.deadline && <span>deadline {day(job.deadline)}</span>}</p>
      {job.summary && <p className="line-clamp-3 text-sm">{job.summary}</p>}
      <div className="space-y-1.5">{chips('Required', job.requiredSkills, 'mute')}{chips('You have', job.matchedSkills, 'good')}{chips('Missing', job.missingSkills, 'bad')}</div>
      <details className="text-sm"><summary className="cursor-pointer text-mute hover:text-ink">Why this score</summary><ul className="mt-1 list-disc space-y-0.5 pl-5">{job.reasons.map(r => <li key={r}>{r}</li>)}</ul></details>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        <a href={job.url} target="_blank" rel="noopener noreferrer" className="btn-ember inline-flex h-10 items-center rounded-xl px-5 text-sm">View original posting →</a>
        <Select className="w-44" value={job.status} aria-label="Status" onChange={e => onStatus(job.id, e.target.value)}>{statuses.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</Select>
      </div>
    </div>
  </Card>;
}

const SkeletonJob = () => <Card className="flex gap-4"><div className="skel size-16 shrink-0 !rounded-full" /><div className="flex-1 space-y-3"><div className="skel h-4 w-2/3" /><div className="skel h-3 w-1/3" /><div className="skel h-3 w-full" /><div className="skel h-3 w-5/6" /><div className="flex gap-2"><div className="skel h-5 w-14" /><div className="skel h-5 w-16" /><div className="skel h-5 w-12" /></div></div></Card>;

export default function App() {
  const [st, setSt] = useState<State | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [fin, setFin] = useState<Record<string, { status: string; reason: string; found: number }>>({});
  const [drag, setDrag] = useState(false);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [boards, setBoards] = useState('');
  const [dark, toggleTheme] = useTheme();
  const [f, setF] = useState({ min: 60, role: '', company: '', location: '', exp: '', salary: false, mode: '', portal: '', posted: '', status: '' });

  const load = async (resetPrefs = false) => {
    const s = await api.state(); setSt(s);
    if (resetPrefs || !prefs) { setPrefs(s.prefs); setBoards((s.prefs?.companies ?? []).map(c => [c.ats, c.token, c.name].filter(Boolean).join(':')).join('\n')); }
  };
  useEffect(() => { load().catch(e => setMsg(e.message)); }, []);
  useEffect(() => { if (!msg || busy) return; const t = setTimeout(() => setMsg(''), 7000); return () => clearTimeout(t); }, [msg, busy]);

  const run = async (label: string, fn: () => Promise<unknown>, resetPrefs = false) => {
    setBusy(true); setMsg(label);
    try { await fn(); setMsg(m => m === label ? '' : m); await load(resetPrefs); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };
  const savePrefs = () => prefs ? api.prefs(prefs) : Promise.resolve();
  const editBoards = (t: string) => { setBoards(t); if (prefs) setPrefs({ ...prefs, companies: parseBoards(t) }); };
  const upload = (file?: File) => { if (file) run('Reading resume…', () => api.resume(file), true); };

  const scan = async () => {
    setBusy(true); setScanning(true); setFin({}); setMsg('Scanning all sources…');
    try {
      await savePrefs();
      const { results } = await api.search(r => setFin(x => ({ ...x, [r.adapter]: r })));
      await load();
      setMsg(`Scan complete: ${results.reduce((n, r) => n + (r.added ?? 0), 0)} new jobs added`);
      document.getElementById('results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) { setMsg((e as Error).message); } finally { setScanning(false); setBusy(false); }
  };

  const jobs = st?.jobs ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const matching = jobs.filter(j => j.score >= 60);
  const shown = useMemo(() => jobs.filter(j => {
    const age = j.postedAt ? (Date.now() - +new Date(j.postedAt)) / 864e5 : 0;
    return j.score >= f.min && j.title.toLowerCase().includes(f.role.toLowerCase()) && (!f.company || j.company === f.company)
      && j.location.toLowerCase().includes(f.location.toLowerCase()) && (!f.exp || j.expLevel === f.exp) && (!f.salary || !!j.salary)
      && (!f.mode || j.workMode === f.mode) && (!f.portal || j.source === f.portal) && (!f.status || j.status === f.status)
      && (!f.posted || (j.postedAt !== '' && age <= +f.posted));
  }), [jobs, f]);
  const uniq = (g: (j: Job) => string) => [...new Set(jobs.map(g).filter(Boolean))].sort();
  const set = (k: keyof typeof f, v: string | number | boolean) => setF(x => ({ ...x, [k]: v }));
  const heroJobs = useCountUp(jobs.length), heroMatch = useCountUp(matching.length), heroSources = useCountUp(st?.sources.length ?? 0);

  if (!st) return <p className="p-6">{msg || 'Loading…'}</p>;
  const hasRoles = !!prefs?.roles.length;
  const total = st.sources.length, done = Object.keys(fin).length;

  return <div className="relative min-h-screen">
    <div className="aurora" aria-hidden><i /><i /><i /></div>
    <div className="progress-bar" style={{ width: scanning ? `${Math.max(6, (done / total) * 100)}%` : '100%', opacity: scanning ? 1 : 0 }} aria-hidden />

    <header className="glass sticky top-0 z-40 border-b border-line">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
        <a href="#top" className="flex items-center gap-2.5"><span className="relative grid size-8 place-items-center rounded-full border border-brand/50"><span className="size-2 rounded-full bg-brand shadow-[0_0_10px_var(--color-brand)]" /></span><span className="whitespace-nowrap font-display text-base font-bold">Job Agent</span></a>
        <nav className="flex items-center gap-1 text-sm"><a href="#scan" className="rounded-lg px-3 py-1.5 text-mute transition-colors hover:text-ink max-sm:hidden">Scan</a><a href="#results" className="rounded-lg px-3 py-1.5 text-mute transition-colors hover:text-ink max-sm:hidden">Results</a>
          <a href="roadmap.html" className="rounded-lg px-3 py-1.5 text-mute transition-colors hover:text-ink">Roadmap</a>
          <button onClick={toggleTheme} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'} className="grid size-9 place-items-center rounded-lg border border-line transition-colors hover:border-brand">
            {dark ? <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
              : <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></svg>}</button></nav>
      </div>
    </header>

    <section id="top" className="relative">
      <div className="grid-fade" aria-hidden />
      <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 pb-14 pt-12 lg:grid-cols-[1.05fr_.95fr] lg:pt-20">
        <div className="min-w-0 space-y-6">
          <Reveal><Badge tone="brand" className="px-3 py-1"><span className="dot-live" />Private by design: everything runs in your browser</Badge></Reveal>
          <Reveal delay={80}><h1 className="text-[clamp(2rem,5.2vw,3.7rem)] font-bold leading-[1.05]">Scan every job board against <span className="grad-text">your resume.</span></h1></Reveal>
          <Reveal delay={160}><p className="max-w-xl text-lg text-mute">Drop in your resume. The agent searches company career pages and job boards at once, scores each posting against your skills, removes duplicates and links you to the original application.</p></Reveal>

          <Reveal delay={240}>
            <input id="resume" type="file" accept=".pdf,.docx,.txt" disabled={busy} className="sr-only" onChange={e => upload(e.target.files?.[0])} aria-label="Resume file (PDF, DOCX or TXT)" />
            {!st.profile
              ? <label htmlFor="resume" onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files[0]); }}
                  className={cn('dropzone block cursor-pointer rounded-2xl bg-card/60 p-7 text-center transition-all hover:bg-brand-soft/40 focus-within:outline-2', drag && 'drag scale-[1.02] bg-brand-soft/60')}>
                  {busy && msg.startsWith('Reading') ? <span className="inline-flex items-center gap-3 font-medium"><span className="spinner text-brand" />Reading your resume…</span>
                    : <><span className="font-display text-lg font-bold">Drop your resume here</span><br /><span className="text-sm text-mute">or click to browse · PDF, DOCX or TXT · parsed on this device, never uploaded</span></>}</label>
              : <Card className="pop-in space-y-3 border-brand/40">
                  <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-display text-lg font-bold">{st.profile.name || 'Your profile'}</p>
                    <p className="text-sm text-mute">{st.profile.currentDesignation || 'Designation not found'} · {st.profile.totalExperienceYears} yrs · {st.profile.location || 'Location not found'}</p></div>
                    <label htmlFor="resume" className="cursor-pointer rounded-lg border border-line px-3 py-1.5 text-xs font-medium transition-colors hover:border-brand">Replace resume</label></div>
                  <div className="flex flex-wrap gap-1.5">{st.profile.allSkills.slice(0, 20).map((s, i) => <Badge key={s} tone="brand" style={{ animation: `pop .4s ${i * 35}ms cubic-bezier(.2,1.3,.4,1) both` }}>{s}</Badge>)}</div></Card>}
          </Reveal>

          <Reveal delay={320}><div className="flex flex-wrap items-center gap-4">
            <Button className="h-12 px-7 text-base" disabled={busy || !st.profile || !hasRoles} onClick={scan}>{scanning ? <><span className="spinner" />Scanning {done}/{total}</> : 'Scan all sources'}</Button>
            <a href="#scan" className="text-sm font-medium text-mute underline-offset-4 hover:text-ink hover:underline">Adjust preferences</a></div>
            {st.profile && !hasRoles && <p className="mt-2 text-sm text-warn">Add at least one target role in Preferences first.</p>}</Reveal>

          <Reveal delay={400}><dl className="grid max-w-md grid-cols-3 gap-4 border-t border-line pt-5">
            {[['Sources', heroSources], ['Jobs found', heroJobs], ['Matches 60+', heroMatch]].map(([k, v]) => <div key={k as string}><dd className="font-display text-2xl font-bold tabular-nums">{v}</dd><dt className="font-mono text-[11px] uppercase tracking-wider text-mute">{k}</dt></div>)}</dl></Reveal>
        </div>

        <Reveal delay={200} className="min-w-0"><Radar scanning={scanning} blips={matching.slice(0, 40).map(j => ({ id: j.id, score: j.score }))} />
          <p className="mt-4 text-center font-mono text-[11px] uppercase tracking-wider text-mute">{matching.length ? 'Each dot is a matched job · closer to the centre = better match' : scanning ? 'Scanning…' : 'Radar fills with your matches after a scan'}</p></Reveal>
      </div>
    </section>

    <section className="mx-auto max-w-7xl px-4 pb-14"><ol className="grid gap-3 md:grid-cols-3">
      {[['Upload', 'A free on-device parser reads skills, experience and roles from your PDF, DOCX or TXT.'], ['Scan', 'Career pages and public job APIs are searched in parallel. Each source reports its own status.'], ['Review', 'Every job gets a 0–100 score with reasons, missing skills and the original application link.']].map(([t, d], i) =>
        <Reveal key={t} delay={i * 100}><li className="lift flex h-full gap-4 rounded-2xl border border-line bg-card/70 p-5 backdrop-blur"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft font-mono text-sm font-medium text-brand-ink">{i + 1}</span><div><h3 className="text-base font-bold">{t}</h3><p className="mt-1 text-sm text-mute">{d}</p></div></li></Reveal>)}</ol></section>

    <section id="scan" className="mx-auto max-w-7xl scroll-mt-20 px-4 pb-14">
      <Reveal><h2 className="mb-1 text-2xl font-bold">Scan settings</h2><p className="mb-6 text-mute">Tell the agent what to look for, then watch each source report in.</p></Reveal>
      <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <Reveal>{prefs ? <Card className="space-y-3.5">
          <h3 className="text-base font-bold">Preferences</h3>
          <Label>Target roles<Input value={prefs.roles.join(', ')} onChange={e => setPrefs({ ...prefs, roles: lines(e.target.value) })} placeholder="Frontend Developer, React Engineer" /></Label>
          <Label>Locations<Input value={prefs.locations.join(', ')} onChange={e => setPrefs({ ...prefs, locations: lines(e.target.value) })} placeholder="Bangalore, Remote" /></Label>
          <Label>Work mode<Select value={prefs.workModes[0] ?? ''} onChange={e => setPrefs({ ...prefs, workModes: e.target.value ? [e.target.value] : [] })}><option value="">Any</option><option value="remote">Remote</option><option value="hybrid">Hybrid</option><option value="office">Office</option></Select></Label>
          <Label>Blocklist (company or title words)<Input value={prefs.blocklist.join(', ')} onChange={e => setPrefs({ ...prefs, blocklist: lines(e.target.value) })} /></Label>
          <Label>Company career pages (<code className="font-mono">ats:token</code> per line)
            <textarea value={boards} onChange={e => editBoards(e.target.value)} placeholder={'greenhouse:stripe\nlever:cred\nashby:notion'} className="min-h-28 w-full rounded-xl border border-line bg-card/70 p-3 font-mono text-xs focus:border-brand" /></Label>
          <Button variant="ghost" className="h-8 px-2" onClick={() => editBoards(EXAMPLE_BOARDS)}>Fill with example boards</Button>
          <details className="text-xs text-mute"><summary className="cursor-pointer hover:text-ink">Adzuna key for Indian listings (free)</summary>
            <div className="mt-2 grid gap-2"><Input aria-label="Adzuna app id" placeholder="App id" value={prefs.adzuna?.id ?? ''} onChange={e => setPrefs({ ...prefs, adzuna: { id: e.target.value, key: prefs.adzuna?.key ?? '' } })} />
              <Input aria-label="Adzuna app key" placeholder="App key" type="password" value={prefs.adzuna?.key ?? ''} onChange={e => setPrefs({ ...prefs, adzuna: { id: prefs.adzuna?.id ?? '', key: e.target.value } })} />
              <span>Get both at developer.adzuna.com. Stored only in this browser.</span></div></details>
          <Button variant="outline" disabled={busy} onClick={() => run('Saving…', async () => { await savePrefs(); setMsg('Preferences saved'); })}>Save preferences</Button>
        </Card> : <Card className="text-sm text-mute">Upload a resume to unlock preferences.</Card>}</Reveal>

        <div className="min-w-0 space-y-4">
          <section aria-label="Job sources" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{st.sources.map((s, i) => {
            const r = scanning ? fin[s.id] : st.runs.find(x => x.adapter === s.id);
            const wait = scanning && !r;
            const tone = !r ? 'mute' : r.status === 'ok' ? 'good' : r.status === 'not_configured' ? 'warn' : 'bad';
            const label = wait ? 'Scanning' : !r ? 'Ready' : r.status === 'ok' ? `${r.found} matches` : r.status === 'not_configured' ? 'Needs setup' : 'Error';
            return <Reveal key={s.id} delay={i * 60}><Card className={cn('lift h-full space-y-2 p-3.5', r && !scanning && 'pop-in')} key={`${s.id}-${r?.status ?? 'x'}`}>
              <div className="flex items-center justify-between gap-2"><b className="text-sm">{s.name}</b><Badge tone={wait ? 'brand' : tone}>{wait && <span className="dot-live" />}{label}</Badge></div>
              {wait ? <div className="space-y-1.5"><div className="skel h-3 w-full" /><div className="skel h-3 w-2/3" /></div>
                : <p className="text-xs text-mute">{r?.reason ?? s.note}</p>}
              {r && !scanning && <p className="font-mono text-[11px] text-mute">{jobs.filter(j => j.source === s.name || (s.id === 'career-pages' && j.sourceKind === 'career')).length} jobs stored</p>}</Card></Reveal>;
          })}</section>
          <Reveal><Card className="space-y-2.5 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><b className="text-sm">Restricted portals: use the browser extension</b>
            <Button variant="outline" className="h-8" disabled={busy || !st.profile} onClick={() => run('Importing…', async () => { const r = await api.importExtension(); setMsg(`Imported ${r.received}: ${r.added} added, ${r.duplicate} duplicates, ${r.received - r.added - r.duplicate} rejected (no verifiable https link)`); })}>Import from extension</Button></div>
            <p className="text-xs text-mute">These sites forbid automated reading, so the app never opens them. Install the extension, click “Send to Job Agent” on a job list in your own tab, then import.</p>
            <div className="flex flex-wrap gap-1.5">{st.portals.map(p => <Badge key={p.id} tone={p.extension ? 'brand' : 'mute'} title={p.note}>{p.name}{p.extension ? '' : ' (soon)'}</Badge>)}</div></Card></Reveal>
        </div>
      </div>
    </section>

    <section id="results" className="mx-auto max-w-7xl scroll-mt-20 space-y-6 px-4 pb-20">
      <Reveal><h2 className="mb-1 text-2xl font-bold">Results</h2><p className="text-mute">Ranked by match score. Every job links to its original posting.</p></Reveal>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Stat label="Jobs discovered" value={jobs.length} /><Stat label="Matching" value={matching.length} hint="score 60+" />
        <Stat label="Excellent" value={jobs.filter(j => j.score >= 90).length} hint="score 90+" /><Stat label="New today" value={jobs.filter(j => day(j.firstSeen) === today).length} /></div>
      <Reveal><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Bars title="By portal" rows={countBy(jobs, j => j.source)} /><Bars title="By company" rows={countBy(jobs, j => j.company)} />
        <Bars title="By experience" rows={countBy(jobs, j => j.expLevel)} /><Bars title="By location" rows={countBy(jobs, j => j.location)} /></div></Reveal>

      <div className="glass z-30 space-y-3 rounded-2xl border border-line p-3 lg:sticky lg:top-[68px]">
        <details open className="group"><summary className="flex cursor-pointer items-center justify-between text-sm font-bold"><span>Filters · {shown.length} of {jobs.length} jobs</span><span className="text-xs font-normal text-mute group-open:hidden">show</span></summary>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            <Select aria-label="Minimum match" value={f.min} onChange={e => set('min', +e.target.value)}><option value={0}>Any score</option><option value={60}>60+ Moderate</option><option value={70}>70+ Good</option><option value={80}>80+ Strong</option><option value={90}>90+ Excellent</option></Select>
            <Input aria-label="Job role" placeholder="Job role" value={f.role} onChange={e => set('role', e.target.value)} />
            <Select aria-label="Company" value={f.company} onChange={e => set('company', e.target.value)}><option value="">All companies</option>{uniq(j => j.company).map(c => <option key={c}>{c}</option>)}</Select>
            <Input aria-label="Location" placeholder="Location" value={f.location} onChange={e => set('location', e.target.value)} />
            <Select aria-label="Experience" value={f.exp} onChange={e => set('exp', e.target.value)}><option value="">All experience</option>{uniq(j => j.expLevel).map(c => <option key={c}>{c}</option>)}</Select>
            <Select aria-label="Work mode" value={f.mode} onChange={e => set('mode', e.target.value)}><option value="">Remote / Hybrid / Office</option><option value="remote">Remote</option><option value="hybrid">Hybrid</option><option value="office">Office</option></Select>
            <Select aria-label="Portal" value={f.portal} onChange={e => set('portal', e.target.value)}><option value="">All portals</option>{uniq(j => j.source).map(c => <option key={c}>{c}</option>)}</Select>
            <Select aria-label="Posted" value={f.posted} onChange={e => set('posted', e.target.value)}><option value="">Any posted date</option><option value="1">Last 24 hours</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option></Select>
            <Select aria-label="Status" value={f.status} onChange={e => set('status', e.target.value)}><option value="">All statuses</option>{st.statuses.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</Select>
            <label className="flex h-10 items-center gap-2 text-sm"><input type="checkbox" checked={f.salary} onChange={e => set('salary', e.target.checked)} />Salary listed</label>
          </div></details></div>

      {scanning && jobs.length === 0 && <div className="grid gap-3 xl:grid-cols-2"><SkeletonJob /><SkeletonJob /><SkeletonJob /><SkeletonJob /></div>}
      {!scanning && jobs.length === 0 && <Card className="py-14 text-center"><p className="font-display text-lg font-bold">No jobs yet</p><p className="text-sm text-mute">Upload a resume, set a target role and scan all sources.</p></Card>}
      {jobs.length > 0 && shown.length === 0 && <Card className="py-10 text-center text-sm text-mute">No jobs pass these filters. Lower the minimum match to see more.</Card>}
      <div className="grid gap-3 xl:grid-cols-2">{shown.map((j, i) => <Reveal key={j.id} delay={Math.min(i, 6) * 50}><JobCard job={j} statuses={st.statuses} onStatus={(id, s) => api.status(id, s).then(() => load())} /></Reveal>)}</div>
    </section>

    <footer className="border-t border-line"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-mute">
      <span>Your resume and jobs stay in this browser. Nothing is uploaded.</span><span className="flex gap-4"><a href="roadmap.html" className="hover:text-ink">Roadmap</a><a href="https://github.com/Keerthi17072000/Job_agent" className="hover:text-ink">Source</a></span></div></footer>

    {msg && <div role="status" className="toast glass fixed bottom-5 left-1/2 z-50 flex max-w-[92vw] items-center gap-3 rounded-xl border border-line px-4 py-3 text-sm shadow-2xl">{busy && <span className="spinner text-brand" />}<span>{msg}</span></div>}
  </div>;
}
