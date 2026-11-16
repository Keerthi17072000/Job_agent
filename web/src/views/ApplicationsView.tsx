import { Avatar, Badge, Card, Select } from '../ui.tsx';
import { useApp } from '../state.tsx';
import { EmptyCard, STATUS_LABEL, day } from './common.tsx';
import { STATUSES, type Job } from '../api.ts';

const COLS: Job['status'][] = ['shortlisted', 'interested', 'applied', 'interview', 'rejected'];

export default function ApplicationsView() {
  const { st, updateJob } = useApp();
  if (!st) return null;
  if (!st.profile) return <EmptyCard title="Upload your resume first" body="Track applications once you have matches." cta={{ href: '#/overview', label: 'Upload resume' }} />;
  const tracked = st.jobs.filter(j => COLS.includes(j.status));
  return <div className="view space-y-4"><h2 className="text-lg font-extrabold">Applications <span className="text-mute">({tracked.length})</span></h2>
    {!tracked.length && <EmptyCard title="Nothing tracked yet" body="Change a job's status to Shortlisted, Interested, Applied, Interview or Rejected and it shows up here." cta={{ href: '#/jobs', label: 'Browse jobs' }} />}
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">{COLS.map(col => <section key={col} className="min-w-0 space-y-3" aria-label={STATUS_LABEL[col]}>
      <div className="flex items-center justify-between"><h3 className="text-sm font-extrabold">{STATUS_LABEL[col]}</h3><Badge tone={col === 'interview' ? 'lime' : col === 'rejected' ? 'bad' : 'brand'}>{tracked.filter(j => j.status === col).length}</Badge></div>
      {tracked.filter(j => j.status === col).map(j => <Card key={j.id} className="rise space-y-2 p-4">
        <div className="flex items-start gap-2"><Avatar name={j.company} /><div className="min-w-0"><a href={`#/job/${j.id}`} className="block text-sm font-extrabold leading-snug hover:text-brand-ink">{j.title}</a><p className="truncate text-xs text-mute">{j.company}</p></div></div>
        {j.appliedAt && <p className="text-xs text-mute">Applied {day(j.appliedAt)}</p>}
        {j.notes && <p className="line-clamp-2 text-xs text-mute">{j.notes}</p>}
        <Select aria-label={`Move ${j.title}`} value={j.status} onChange={e => updateJob(j.id, { status: e.target.value as Job['status'] })}>{STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</Select></Card>)}
    </section>)}</div></div>;
}
