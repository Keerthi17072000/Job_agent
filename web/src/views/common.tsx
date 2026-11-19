import { useState } from 'react';
import { Avatar, Badge, Button, Card, LinkButton, ScoreRing, Select, cn } from '../ui.tsx';
import { STATUSES, type Job } from '../api.ts';
import { useApp } from '../state.tsx';

export const STATUS_LABEL: Record<string, string> = { new: 'New', shortlisted: 'Shortlisted', interested: 'Interested', applied: 'Applied', interview: 'Interview', rejected: 'Rejected', not_interested: 'Not interested' };
export const day = (iso: string) => iso.slice(0, 10);
export const lines = (s: string) => s.split(/[,\n]/).map(x => x.trim()).filter(Boolean);
export const countBy = (jobs: Job[], f: (j: Job) => string) => Object.entries(jobs.reduce<Record<string, number>>((m, j) => { const k = f(j) || 'Unknown'; m[k] = (m[k] ?? 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]);

export const Icon = ({ d, className = 'size-5' }: { d: string; className?: string }) =>
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>;
export const ICONS = {
  overview: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z', jobs: 'M3 7h18v13H3zM8 7V4h8v3M3 13h18', saved: 'M6 3h12v18l-6-4-6 4z',
  applications: 'M9 6h11M9 12h11M9 18h11M3 6l1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17', profile: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
  sources: 'M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18', settings: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4',
  company: 'M4 21V5l8-2 8 2v16M9 21v-4h6v4M8 9h1M12 9h1M16 9h1M8 13h1M12 13h1M16 13h1',
  resume: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
  pin: 'M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11zM12 12a2 2 0 100-4 2 2 0 000 4z', sun: 'M12 16a4 4 0 100-8 4 4 0 000 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z', search: 'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3',
};

/** The one file input (rendered by the app shell). Every "upload" control is a label for it. */
export function ResumeInput() {
  const { upload, busy } = useApp();
  return <input id="resume" type="file" accept=".pdf,.docx,.txt" disabled={busy} className="sr-only" aria-label="Resume file (PDF, DOCX or TXT)" onChange={e => { void upload(e.target.files?.[0]); e.target.value = ''; }} />;
}
export function DeleteResume({ className }: { className?: string }) {
  const { deleteResume, busy } = useApp();
  return <button type="button" disabled={busy} className={cn('inline-flex h-10 items-center rounded-full border border-bad/50 px-5 text-sm font-semibold text-bad transition-colors hover:bg-bad/10', className)}
    onClick={() => { if (confirm('Delete your uploaded resume and the profile read from it? Jobs you saved or tracked stay, without a match score.')) void deleteResume(); }}>Delete resume</button>;
}
export const ReplaceResume = ({ className }: { className?: string }) => <label htmlFor="resume" className={cn('inline-flex h-10 cursor-pointer items-center rounded-full border border-line bg-card px-5 text-sm font-semibold transition-colors hover:border-brand hover:bg-sunk focus-within:outline-2', className)}>Upload another resume</label>;

export function UploadCard({ big }: { big?: boolean }) {
  const { upload, busy, msg } = useApp();
  const [drag, setDrag] = useState(false);
  return <>
    <label htmlFor="resume" onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files[0]); }}
      className={cn('block cursor-pointer rounded-3xl border-2 border-dashed border-brand/40 bg-card text-center transition-all hover:bg-brand-soft/50 focus-within:outline-2', big ? 'p-12' : 'p-6', drag && 'scale-[1.01] border-brand bg-brand-soft')}>
      {busy && msg.startsWith('Reading') ? <span className="inline-flex items-center gap-3 font-semibold"><span className="spinner text-brand" />Reading your resume…</span>
        : <><span className="mx-auto mb-3 grid size-14 place-items-center rounded-2xl bg-lime text-lime-ink"><Icon d="M12 16V4M7 9l5-5 5 5M4 20h16" className="size-6" /></span>
          <span className="block text-lg font-extrabold">Drop your resume here</span><span className="text-sm text-mute">or click to browse · PDF, DOCX or TXT · up to 5 MB · read on this device, never uploaded</span></>}</label>
  </>;
}

/** One job in a list. */
export function JobCard({ job, compact }: { job: Job; compact?: boolean }) {
  const { st, updateJob } = useApp();
  const chip = (items: string[], tone: 'good' | 'bad' | 'mute') => items.slice(0, 6).map(s => <Badge key={s} tone={tone}>{s}</Badge>);
  return <Card className="lift rise flex gap-4">
    {st?.profile && <ScoreRing score={job.score} />}
    <div className="flex min-w-0 flex-1 flex-col gap-3">
      <div className="flex items-start gap-3"><Avatar name={job.company} />
        <div className="min-w-0 flex-1"><a href={`#/job/${job.id}`} className="block text-[15px] font-extrabold leading-snug hover:text-brand-ink">{job.title}</a>
          <p className="truncate text-sm text-mute">{job.company}</p></div>
        {st?.profile && <Badge tone={job.score >= 75 ? 'good' : job.score >= 60 ? 'brand' : 'mute'} className="shrink-0">{job.category}</Badge>}</div>
      <div className="flex flex-wrap gap-1.5 text-xs">
        {job.workMode && <Badge tone={job.workMode === 'remote' ? 'lime' : 'brand'}>{job.workMode}</Badge>}<Badge>{job.expLevel}</Badge>
        {job.salary && <Badge tone="warn">{job.salary}</Badge>}<Badge className="gap-1"><Icon d={ICONS.pin} className="size-3" />{job.location || 'Location not stated'}{job.regions.length === 1 && !job.location.includes(job.regions[0]) ? ` · ${job.regions[0]}` : ''}</Badge>
        {job.locationFit === 'mismatch' && <Badge tone="bad">outside your location/mode</Badge>}</div>
      {!compact && <p className="text-sm text-mute">{job.reasons.slice(0, 2).join(' ')}</p>}
      {!compact && <div className="flex flex-wrap gap-1.5">{chip(job.matchedSkills, 'good')}{chip(job.missingSkills, 'bad')}</div>}
      <p className="text-xs text-mute">via {job.sources.map(s => s.source).filter((v, i, a) => a.indexOf(v) === i).join(', ')}{job.postedAt && ` · posted ${day(job.postedAt)}`}{job.deadline && ` · deadline ${day(job.deadline)}`}</p>
      <div className="mt-auto flex flex-wrap items-center gap-2">
        <LinkButton href={job.url}>Apply</LinkButton>
        <Button variant={job.saved ? 'lime' : 'outline'} onClick={() => updateJob(job.id, { saved: !job.saved })} aria-pressed={!!job.saved}>{job.saved ? 'Saved' : 'Save'}</Button>
        <Select className="w-40" aria-label="Status" value={job.status} onChange={e => updateJob(job.id, { status: e.target.value as Job['status'] })}>{(st?.prefs ? STATUSES : STATUSES).map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</Select>
      </div>
    </div>
  </Card>;
}

export const EmptyCard = ({ title, body, cta }: { title: string; body: string; cta?: { href: string; label: string } }) =>
  <Card className="py-14 text-center"><p className="text-lg font-extrabold">{title}</p><p className="mx-auto mt-1 max-w-md text-sm text-mute">{body}</p>{cta && <a href={cta.href} className="mt-4 inline-flex"><span className="inline-flex h-10 items-center rounded-full bg-ink px-5 text-sm font-semibold text-canvas">{cta.label}</span></a>}</Card>;
