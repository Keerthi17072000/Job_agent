import { useEffect, useState } from 'react';
import { Avatar, Badge, Button, Card, LinkButton, ScoreRing, Select } from '../ui.tsx';
import { useApp } from '../state.tsx';
import { EmptyCard, ICONS, Icon, STATUS_LABEL, day } from './common.tsx';
import { STATUSES, type Job } from '../api.ts';

/** Split a posting into responsibilities / qualifications / preferred by its own headings. Text that has no headings stays whole. */
export function splitJd(text: string) {
  const heads: [string, RegExp][] = [['responsibilities', /^(key\s+)?(responsibilities|what you('| wi)ll do|duties|the role|your role)/i], ['preferred', /^(preferred|nice[- ]to[- ]have|bonus|good to have)/i], ['qualifications', /^(requirements?|qualifications?|what you bring|must[- ]have|who you are|skills)/i]];
  const out: Record<string, string[]> = {}; let cur = '';
  for (const l of text.split('\n')) { const t = l.trim().replace(/[:：]$/, ''); const h = t.length < 60 && heads.find(([, re]) => re.test(t)); if (h) { cur = h[0]; out[cur] ??= []; } else if (cur && t) out[cur].push(t); }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.join('\n')]));
}

const PARTS: [keyof Job['breakdown'], string, string][] = [['skills', 'Skills', '35%'], ['experience', 'Experience', '20%'], ['responsibilities', 'Responsibilities', '20%'], ['title', 'Title relevance', '15%'], ['education', 'Education and other', '10%']];

export default function JobDetail({ id }: { id: string }) {
  const { st, updateJob } = useApp();
  const job = st?.jobs.find(j => j.id === id);
  const [notes, setNotes] = useState('');
  useEffect(() => setNotes(job?.notes ?? ''), [job?.id, job?.notes]);
  if (!st) return null;
  if (!job) return <EmptyCard title="Job not found" body="It may have been removed when you cleared your data." cta={{ href: '#/jobs', label: 'Back to jobs' }} />;
  const parts = splitJd(job.description);
  const verdict = job.score >= 90 ? 'Your resume is an excellent fit for this posting.' : job.score >= 75 ? 'Your resume is a strong fit; check the missing skills below.' : job.score >= 60 ? 'Your resume is a moderate fit; tailor it to the missing requirements before applying.' : 'Your resume is a weak fit for this posting as written.';

  return <div className="view grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
    <div className="min-w-0 space-y-5">
      <a href="#/jobs" className="text-sm font-semibold text-brand-ink hover:underline">← All jobs</a>
      <Card className="space-y-4">
        <div className="flex flex-wrap items-start gap-4"><Avatar name={job.company} />
          <div className="min-w-0 flex-1"><h2 className="text-xl font-extrabold leading-snug md:text-2xl">{job.title}</h2><p className="text-mute">{job.company} · {job.location || 'Location not stated'}</p></div>{st.profile && <ScoreRing score={job.score} size={64} />}</div>
        <div className="flex flex-wrap gap-1.5">{job.workMode && <Badge tone={job.workMode === 'remote' ? 'lime' : 'brand'}>{job.workMode}</Badge>}<Badge>{job.expLevel}</Badge>{job.salary && <Badge tone="warn">{job.salary}</Badge>}{job.postedAt && <Badge>posted {day(job.postedAt)}</Badge>}{job.deadline && <Badge tone="bad">deadline {day(job.deadline)}</Badge>}<Badge tone="good">{job.category}</Badge></div>
        <div className="flex flex-wrap items-center gap-2"><LinkButton href={job.url} variant="primary">Apply on the original site</LinkButton>
          <Button variant={job.saved ? 'lime' : 'outline'} onClick={() => updateJob(job.id, { saved: !job.saved })}>{job.saved ? 'Saved' : 'Save job'}</Button>
          <Select className="w-44" aria-label="Status" value={job.status} onChange={e => updateJob(job.id, { status: e.target.value as Job['status'] })}>{STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</Select></div>
      </Card>
      {(['responsibilities', 'qualifications', 'preferred'] as const).filter(k => parts[k]).map(k => <Card key={k}><h3 className="mb-2 font-extrabold capitalize">{k === 'qualifications' ? 'Required qualifications' : k === 'preferred' ? 'Preferred qualifications' : 'Responsibilities'}</h3><p className="whitespace-pre-line text-sm leading-relaxed">{parts[k]}</p></Card>)}
      <Card><h3 className="mb-2 font-extrabold">Full job description</h3>{job.description ? <p className="whitespace-pre-line text-sm leading-relaxed">{job.description}</p> : <p className="text-sm text-mute">This source did not provide a description. Open the original posting for details.</p>}</Card>
    </div>
    <aside className="min-w-0 space-y-5">
      {!st.profile ? <Card className="space-y-2"><h3 className="font-extrabold">Match with your resume</h3><p className="text-sm text-mute">This job is not scored because no resume is uploaded. Upload one to see the match, the missing skills and why.</p><Button onClick={() => { location.hash = '#/overview'; }}>Upload resume</Button>{!!job.requiredSkills.length && <><p className="text-xs font-semibold text-mute">Skills the posting asks for</p><div className="flex flex-wrap gap-1.5">{job.requiredSkills.map(k => <Badge key={k}>{k}</Badge>)}</div></>}</Card> : <>
      <Card className="space-y-3"><h3 className="font-extrabold">Resume suitability</h3><p className="text-sm">{verdict}</p>
        <ul className="space-y-2.5">{PARTS.map(([k, label, w]) => <li key={k} className="text-sm"><div className="flex justify-between"><span>{label} <span className="text-xs text-mute">weight {w}</span></span><span className="tabular-nums">{Math.round(job.breakdown[k] * 100)}%</span></div>
          <div className="mt-1 h-2 rounded-full bg-sunk"><div className="bar-grow-x h-full rounded-full bg-gradient-to-r from-brand to-lime" style={{ width: `${job.breakdown[k] * 100}%` }} /></div></li>)}</ul>
        <ul className="list-disc space-y-1 pl-5 text-xs text-mute">{job.reasons.map(r => <li key={r}>{r}</li>)}</ul></Card>
      <Card className="space-y-3"><h3 className="font-extrabold">Skill gap</h3>
        {[['Matched (found in your resume)', job.matchedSkills, 'good'], ['Required, not found in your resume', job.missingSkills, 'bad'], ['Optional, not found in your resume', job.missingOptional, 'warn']].map(([t, items, tone]) => (items as string[]).length > 0 &&
          <div key={t as string}><p className="mb-1 text-xs font-semibold text-mute">{t as string}</p><div className="flex flex-wrap gap-1.5">{(items as string[]).map(s => <Badge key={s} tone={tone as 'good'}>{s}</Badge>)}</div></div>)}
        {!job.requiredSkills.length && <p className="text-sm text-mute">The posting names no recognisable skills.</p>}
        <p className="text-xs text-mute">“Not found” only means the resume does not mention it. It does not prove you lack the skill.</p></Card>
</>}
      <Card className="space-y-2"><h3 className="font-extrabold">Where this job was seen</h3><ul className="space-y-1.5 text-sm">{job.sources.map(s => <li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-brand-ink hover:underline"><Icon d={ICONS.sources} className="size-4" />{s.source}</a></li>)}</ul></Card>
      <Card className="space-y-2"><h3 className="font-extrabold">Notes</h3><textarea aria-label="Notes" className="min-h-24 w-full rounded-2xl border border-line bg-card p-3 text-sm focus:border-brand" value={notes} onChange={e => setNotes(e.target.value)} onBlur={() => notes !== (job.notes ?? '') && updateJob(job.id, { notes })} placeholder="Contacts, follow-ups, interview dates…" />{job.appliedAt && <p className="text-xs text-mute">Applied on {day(job.appliedAt)}</p>}</Card>
    </aside>
  </div>;
}
