import { useState } from 'react';
import { api, PORTALS, type Job } from '../api.ts';
import { Badge, Button, Card, Input, LinkButton, ScoreRing } from '../ui.tsx';
import { useApp } from '../state.tsx';
import { EmptyCard, day } from './common.tsx';
import type { Company } from '../../../engine/types.ts';

type Result = { label: string; company: Company; jobs: Job[] };

/** Look up any company's openings: its public job board is found from its name, no setup. */
export default function CompanyView() {
  const { st, setMsg, load, ext } = useApp();
  const [pBusy, setPBusy] = useState(''), [pRes, setPRes] = useState<{ portal: string; jobs: Job[]; others: number; note?: string }[]>([]);
  const [name, setName] = useState(''), [busy, setBusy] = useState(false), [res, setRes] = useState<{ asked: string; boards: Result[] } | null>(null), [q, setQ] = useState('');
  if (!st) return null;
  if (!st.profile) return <EmptyCard title="Upload your resume first" body="Openings are scored against your resume." cta={{ href: '#/overview', label: 'Upload resume' }} />;
  const go = async () => {
    if (name.trim().length < 2) return; setBusy(true); setRes(null); setQ('');
    try { setRes({ asked: name.trim(), boards: await api.lookupCompany(name.trim()) }); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };
  const viaPortal = async (id: string, label: string) => {
    setPBusy(id);
    try { const r = await api.companyPortalSearch(id, res?.asked || name.trim()); setPRes(x => [...x.filter(y => y.portal !== label), { portal: label, jobs: r.jobs, others: r.others, note: r.blocked ?? r.error }]); }
    catch (e) { setMsg((e as Error).message); } finally { setPBusy(''); }
  };
  const role = st.prefs?.roles[0] ?? '', loc = st.prefs?.locations[0] ?? '';
  return <div className="view space-y-5">
    <Card className="space-y-3"><h2 className="text-lg font-extrabold">Find a company's openings</h2>
      <p className="text-sm text-mute">Type a company name. The app looks for its public job board (Greenhouse, Lever, Ashby or SmartRecruiters) and lists every opening with its match to your resume.</p>
      <form className="flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); void go(); }}><Input className="min-w-60 flex-1" aria-label="Company name" placeholder="Company name, for example Cred or Zeta" value={name} onChange={e => setName(e.target.value)} />
        <Button type="submit" disabled={busy || name.trim().length < 2}>{busy ? <><span className="spinner" />Looking…</> : 'Look up'}</Button></form></Card>

    {res && !res.boards.length && <Card className="space-y-3"><p className="font-extrabold">No public job board found for “{res.asked}”</p>
      <p className="text-sm text-mute">This usually means the company runs its own careers site or uses Workday or another system this app cannot read, or the board has no openings right now. Try its name spelled differently, or look yourself:</p>
      <div className="flex flex-wrap gap-2"><LinkButton href={`https://www.google.com/search?q=${encodeURIComponent(res.asked + ' careers jobs')}`}>Search the web</LinkButton>
        {PORTALS.filter(p => ['linkedin', 'naukri', 'indeed'].includes(p.id)).map(p => <LinkButton key={p.id} href={p.searchUrl(res.asked, '')}>{p.name}</LinkButton>)}</div></Card>}

    {res && <Card className="space-y-3"><p className="font-extrabold">Also look on Naukri and Indeed</p>
      <p className="text-sm text-mute">{ext ? 'Reads those sites in your own browser (one page each, only when you click) and keeps listings that name this company.' : 'Needs the Job Agent extension: install it from Sources, then come back.'}</p>
      <div className="flex flex-wrap gap-2">{[['naukri', 'Naukri'], ['indeed', 'Indeed']].map(([id, l]) => <Button key={id} variant="outline" disabled={!ext || !!pBusy} onClick={() => void viaPortal(id, l)}>{pBusy === id ? <><span className="spinner" />Reading {l}…</> : `Search ${l}`}</Button>)}</div></Card>}
    {pRes.map(r => <section key={r.portal} className="space-y-3" aria-label={`${r.portal} openings`}><Card className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-base font-extrabold">{r.portal}: {r.jobs.length} at {res?.asked}</h3>
      <p className="text-xs text-mute">{r.note ?? (r.others ? `${r.others} other listings from different companies were left out.` : 'Listings read from the page.')}</p></div>
      {!!r.jobs.length && <Button variant="lime" onClick={async () => { const n = await api.saveJobs(r.jobs); await load(); setMsg(`${n} openings saved to your jobs.`); }}>Save these jobs</Button>}</Card>
      <div className="grid gap-3 xl:grid-cols-2">{r.jobs.map(j => <Card key={j.id} className="flex items-center gap-4 p-4"><ScoreRing score={j.score} size={48} /><div className="min-w-0 flex-1"><p className="font-extrabold leading-snug">{j.title}</p><p className="truncate text-xs text-mute">{j.location || 'Location not stated'}</p></div><LinkButton href={j.url}>Open</LinkButton></Card>)}</div></section>)}

    {res?.boards.map(b => { // big boards (hundreds of openings) show the best 100; the filter narrows the rest
      const matches = b.jobs.filter(j => (j.title + ' ' + j.location).toLowerCase().includes(q.toLowerCase())), shown = matches.slice(0, 100);
      return <section key={b.label} className="space-y-3" aria-label={`Openings at ${b.company.name}`}>
      <Card className="space-y-2"><div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-base font-extrabold">{b.company.name} <span className="font-medium text-mute">({b.jobs.length} openings on {b.label})</span></h3>
          <p className="text-xs text-mute">Check that these are the right company's jobs: a short name can belong to another company.</p></div>
        <div className="flex gap-2"><Button variant="outline" onClick={async () => { await api.addCompany(b.company); await load(); setMsg(`${b.company.name} added: it is included in every search now.`); }}>Add to my searches</Button>
          <Button variant="lime" onClick={async () => { const n = await api.saveJobs(b.jobs); await load(); setMsg(`${n} openings saved to your jobs.`); }}>Save these jobs</Button></div></div>
        <Input aria-label="Filter openings" placeholder="Filter by title or place" value={q} onChange={e => setQ(e.target.value)} /></Card>
      <div className="grid gap-3 xl:grid-cols-2">{shown.map(j => <Card key={j.id} className="rise flex items-center gap-4 p-4"><ScoreRing score={j.score} size={48} />
        <div className="min-w-0 flex-1"><p className="font-extrabold leading-snug">{j.title}</p><p className="truncate text-xs text-mute">{[j.location || 'Location not stated', j.workMode, j.postedAt && `posted ${day(j.postedAt)}`].filter(Boolean).join(' · ')}</p>
          <div className="mt-1 flex flex-wrap gap-1">{j.regions.slice(0, 2).map(r => <Badge key={r} tone="brand">{r}</Badge>)}<Badge tone={j.score >= 75 ? 'good' : 'mute'}>{j.category}</Badge></div></div>
        <LinkButton href={j.url}>Apply</LinkButton></Card>)}
        {!shown.length && <Card className="text-sm text-mute">No opening matches that filter.</Card>}</div>
      {matches.length > shown.length && <p className="text-center text-sm text-mute">Showing the best {shown.length} of {matches.length} openings. Type in the filter to find others.</p>}</section>; })}
  </div>;
}
