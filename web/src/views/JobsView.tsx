import { useMemo, useState } from 'react';
import { Button, Card, Input, Select } from '../ui.tsx';
import { useApp } from '../state.tsx';
import { EmptyCard, JobCard, STATUS_LABEL, lines } from './common.tsx';
import type { Job } from '../api.ts';

const SORTS: Record<string, (a: Job, b: Job) => number> = {
  match: (a, b) => b.score - a.score,
  newest: (a, b) => (b.postedAt || b.firstSeen).localeCompare(a.postedAt || a.firstSeen),
  salary: (a, b) => b.salaryValue - a.salaryValue,
  relevant: (a, b) => (b.breakdown.title + b.breakdown.skills) - (a.breakdown.title + a.breakdown.skills) || b.score - a.score,
  experience: (a, b) => (a.expMin ?? 99) - (b.expMin ?? 99),
};

export default function JobsView({ savedOnly }: { savedOnly?: boolean }) {
  const { st, scan } = useApp();
  const [f, setF] = useState({ min: -1, role: '', company: '', location: '', exp: '', salary: false, mode: '', portal: '', posted: '', status: '', skills: '', fit: false, sort: 'match' });
  const set = (k: keyof typeof f, v: string | number | boolean) => setF(x => ({ ...x, [k]: v }));
  const jobs = st?.jobs ?? [];
  const min = f.min >= 0 ? f.min : st?.prefs?.minScore ?? 60;
  const skills = lines(f.skills.toLowerCase());
  const shown = useMemo(() => jobs.filter(j => {
    const age = j.postedAt ? (Date.now() - +new Date(j.postedAt)) / 864e5 : 0;
    return (!savedOnly || j.saved) && j.score >= min && j.title.toLowerCase().includes(f.role.toLowerCase()) && (!f.company || j.company === f.company)
      && j.location.toLowerCase().includes(f.location.toLowerCase()) && (!f.exp || j.expLevel === f.exp) && (!f.salary || !!j.salary) && (!f.mode || j.workMode === f.mode)
      && (!f.portal || j.sources.some(s => s.source === f.portal)) && (!f.status || j.status === f.status) && (!f.fit || j.locationFit !== 'mismatch')
      && (!skills.length || skills.every(s => j.requiredSkills.includes(s) || j.optionalSkills.includes(s))) && (!f.posted || (j.postedAt !== '' && age <= +f.posted));
  }).sort(SORTS[f.sort]), [jobs, f, min, savedOnly]);
  const uniq = (g: (j: Job) => string) => [...new Set(jobs.map(g).filter(Boolean))].sort();
  if (!st) return null;
  if (!st.profile) return <EmptyCard title="Upload your resume first" body="Matches appear here once your resume has been read." cta={{ href: '#/overview', label: 'Upload resume' }} />;

  return <div className="view space-y-4">
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-extrabold">{savedOnly ? 'Saved jobs' : 'All matches'} <span className="text-mute">({shown.length} of {savedOnly ? jobs.filter(j => j.saved).length : jobs.length})</span></h2>
        <Select className="w-52" aria-label="Sort" value={f.sort} onChange={e => set('sort', e.target.value)}><option value="match">Sort: highest match</option><option value="newest">Sort: newest</option><option value="salary">Sort: highest salary</option><option value="relevant">Sort: most relevant</option><option value="experience">Sort: lowest experience</option></Select></div>
      <details open className="group"><summary className="cursor-pointer text-sm font-semibold text-mute">Filters</summary>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <Select aria-label="Minimum match" value={min} onChange={e => set('min', +e.target.value)}><option value={0}>Any score</option><option value={60}>60+ Moderate</option><option value={75}>75+ Strong</option><option value={90}>90+ Excellent</option></Select>
          <Input aria-label="Job title" placeholder="Job title" value={f.role} onChange={e => set('role', e.target.value)} />
          <Select aria-label="Company" value={f.company} onChange={e => set('company', e.target.value)}><option value="">All companies</option>{uniq(j => j.company).map(c => <option key={c}>{c}</option>)}</Select>
          <Input aria-label="Location" placeholder="Location" value={f.location} onChange={e => set('location', e.target.value)} />
          <Select aria-label="Experience" value={f.exp} onChange={e => set('exp', e.target.value)}><option value="">All experience</option>{uniq(j => j.expLevel).map(c => <option key={c}>{c}</option>)}</Select>
          <Select aria-label="Work mode" value={f.mode} onChange={e => set('mode', e.target.value)}><option value="">Remote / Hybrid / Office</option><option value="remote">Remote</option><option value="hybrid">Hybrid</option><option value="office">Office</option></Select>
          <Select aria-label="Source" value={f.portal} onChange={e => set('portal', e.target.value)}><option value="">All sources</option>{[...new Set(jobs.flatMap(j => j.sources.map(s => s.source)))].sort().map(c => <option key={c}>{c}</option>)}</Select>
          <Select aria-label="Posted" value={f.posted} onChange={e => set('posted', e.target.value)}><option value="">Any posted date</option><option value="1">Last 24 hours</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option></Select>
          <Select aria-label="Status" value={f.status} onChange={e => set('status', e.target.value)}><option value="">All statuses</option>{st.jobs.length >= 0 && Object.keys(STATUS_LABEL).map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</Select>
          <Input aria-label="Required skills" placeholder="Required skills (comma separated)" value={f.skills} onChange={e => set('skills', e.target.value)} />
          <label className="flex h-10 items-center gap-2 px-2 text-sm"><input type="checkbox" checked={f.salary} onChange={e => set('salary', e.target.checked)} />Salary listed</label>
          <label className="flex h-10 items-center gap-2 px-2 text-sm"><input type="checkbox" checked={f.fit} onChange={e => set('fit', e.target.checked)} />Hide outside my location/mode</label>
        </div></details>
    </Card>
    {scan.running && !jobs.length && <div className="grid gap-3 xl:grid-cols-2">{[0, 1, 2, 3].map(i => <Card key={i} className="flex gap-4"><div className="skel size-14 !rounded-full" /><div className="flex-1 space-y-3"><div className="skel h-4 w-2/3" /><div className="skel h-3 w-full" /><div className="skel h-3 w-5/6" /></div></Card>)}</div>}
    {!scan.running && !jobs.length && <EmptyCard title="No jobs yet" body="Search from the Overview page to scan all sources." cta={{ href: '#/overview', label: 'Go to Overview' }} />}
    {jobs.length > 0 && !shown.length && <Card className="py-10 text-center text-sm text-mute">Nothing passes these filters.{min > 0 && <> <Button variant="ghost" className="h-8" onClick={() => set('min', 0)}>Show every score</Button></>}</Card>}
    <div className="grid gap-3 xl:grid-cols-2">{shown.map(j => <JobCard key={j.id} job={j} />)}</div>
  </div>;
}
