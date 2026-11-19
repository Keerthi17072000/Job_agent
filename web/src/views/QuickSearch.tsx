import { useState } from 'react';
import { Button, Card, Input, Select } from '../ui.tsx';
import { useApp } from '../state.tsx';
import { REGIONS } from '../boards.ts';

/** Search by job title and place, no resume needed. Results are listed without a match score; upload a resume to get one. */
export default function QuickSearch() {
  const { st, scan, busy, quickSearch, cancelScan } = useApp();
  const [role, setRole] = useState(st?.prefs?.roles[0] ?? ''), [loc, setLoc] = useState(st?.prefs?.locations[0] ?? ''), [region, setRegion] = useState(st?.prefs?.region ?? '');
  return <Card className="space-y-3"><h2 className="text-lg font-extrabold">Search jobs without a resume</h2>
    <p className="text-sm text-mute">Type a job title or keyword. Jobs from company career pages and job boards are listed as they are, with no match score. Upload a resume to rank them against you.</p>
    <form className="flex flex-wrap items-center gap-2" onSubmit={e => { e.preventDefault(); if (role.trim()) void quickSearch(role, loc, region); }}>
      <Input className="min-w-52 flex-1" aria-label="Job title or keyword" placeholder="Job title or keyword, for example React Developer" value={role} onChange={e => setRole(e.target.value)} />
      <Input className="w-44" aria-label="Location" placeholder="Location (optional)" value={loc} onChange={e => setLoc(e.target.value)} />
      <Select className="w-44" aria-label="Region" value={region} onChange={e => setRegion(e.target.value)}><option value="">Any region</option>{REGIONS.map(r => <option key={r}>{r}</option>)}</Select>
      <Button type="submit" disabled={busy || !role.trim()}>{scan.running ? <><span className="spinner" />Searching {scan.done}/{scan.total}</> : 'Search'}</Button>
      {scan.running && <Button type="button" variant="outline" onClick={cancelScan}>Cancel</Button>}</form></Card>;
}
