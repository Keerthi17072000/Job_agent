import { useEffect, useState } from 'react';
import { Badge, Button, Card, Input, Label, Select } from '../ui.tsx';
import { useApp } from '../state.tsx';
import { DeleteResume, EmptyCard, ReplaceResume, lines } from './common.tsx';
import type { Prefs, Profile } from '../api.ts';
import { REGIONS } from '../boards.ts';

const CATS: [keyof Profile['skills'], string][] = [['frontend', 'Frontend'], ['backend', 'Languages and backend'], ['frameworks', 'Frameworks'], ['libraries', 'Libraries'], ['databases', 'Databases'], ['cloud', 'Cloud and DevOps'], ['aiMl', 'AI / ML'], ['soft', 'Soft skills'], ['other', 'Other skills and tools']];

function Chips({ items, onChange }: { items: string[]; onChange: (v: string[]) => void }) {
  const [v, setV] = useState('');
  const add = () => { const t = v.trim(); if (t && !items.some(i => i.toLowerCase() === t.toLowerCase())) onChange([...items, t]); setV(''); };
  return <div className="space-y-2"><div className="flex flex-wrap gap-1.5">{items.map(s => <Badge key={s} tone="brand" className="gap-1.5 pr-1.5">{s}<button type="button" aria-label={`Remove ${s}`} className="grid size-4 place-items-center rounded-full hover:bg-brand/20" onClick={() => onChange(items.filter(i => i !== s))}>×</button></Badge>)}{!items.length && <span className="text-xs text-mute">None</span>}</div>
    <Input aria-label="Add item" placeholder="Type and press Enter to add" value={v} onChange={e => setV(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} onBlur={add} /></div>;
}

export default function ProfileView() {
  const { st, saveProfile, busy } = useApp();
  const [p, setP] = useState<Profile | null>(null), [prefs, setPrefs] = useState<Prefs | null>(null);
  useEffect(() => { if (st?.profile) setP(st.profile); if (st?.prefs) setPrefs(st.prefs); }, [st?.profile, st?.prefs]);
  if (!st) return null;
  if (!p || !prefs) return <EmptyCard title="No profile yet" body="Upload a resume and your extracted profile appears here for review." cta={{ href: '#/overview', label: 'Upload resume' }} />;
  const up = (patch: Partial<Profile>) => setP({ ...p, ...patch });
  const upSkills = (k: keyof Profile['skills'], v: string[]) => { const skills = { ...p.skills, [k]: v }; up({ skills, allSkills: [...new Set(Object.values(skills).flat().map(x => x.toLowerCase()))] }); };
  const dirty = JSON.stringify([p, prefs]) !== JSON.stringify([st.profile, st.prefs]);

  return <div className="view space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-extrabold">Review your profile</h2><p className="text-sm text-mute">Extracted from your resume. Fix anything wrong, then confirm: every match is recalculated from this profile.</p></div>
      <div className="flex flex-wrap gap-2"><ReplaceResume /><DeleteResume /><Button variant="lime" disabled={busy || !dirty} onClick={() => saveProfile(p, prefs)}>{dirty ? 'Confirm and update matches' : 'Profile confirmed'}</Button></div></div>
    <div className="grid gap-5 xl:grid-cols-2">
      <Card className="space-y-3"><h3 className="font-extrabold">About you</h3>
        <div className="grid gap-3 sm:grid-cols-2"><Label>Name<Input value={p.name} onChange={e => up({ name: e.target.value })} /></Label><Label>Email<Input value={p.email} onChange={e => up({ email: e.target.value })} /></Label>
          <Label>Phone<Input value={p.phone} onChange={e => up({ phone: e.target.value })} /></Label><Label>Location<Input value={p.location} onChange={e => up({ location: e.target.value })} /></Label>
          <Label>Current designation<Input value={p.currentDesignation} onChange={e => up({ currentDesignation: e.target.value })} /></Label>
          <Label>Total experience (years)<Input type="number" min={0} step={0.5} value={p.totalExperienceYears} onChange={e => up({ totalExperienceYears: Math.max(0, +e.target.value) })} /></Label>
          <Label>Seniority<Select value={p.seniority} onChange={e => up({ seniority: e.target.value })}>{['', 'intern', 'junior', 'mid', 'senior', 'lead', 'leadership'].map(s => <option key={s} value={s}>{s || 'Not set'}</option>)}</Select></Label></div>
        <Label>Previous designations<Chips items={p.previousDesignations} onChange={v => up({ previousDesignations: v })} /></Label>
        <Label>Industries<Chips items={p.industries} onChange={v => up({ industries: v })} /></Label></Card>
      <Card className="space-y-3"><h3 className="font-extrabold">What you want</h3>
        <Label>Target roles (used to build the search queries)<Chips items={prefs.roles} onChange={v => setPrefs({ ...prefs, roles: v })} /></Label>
        <Label>Region (only companies and jobs in this country are kept)<Select value={prefs.region ?? ''} onChange={e => setPrefs({ ...prefs, region: e.target.value })}><option value="">Any region</option>{REGIONS.map(r => <option key={r}>{r}</option>)}</Select></Label>
        <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={prefs.includeRemote === true} onChange={e => setPrefs({ ...prefs, includeRemote: e.target.checked })} />Also show remote jobs open to anyone, from any country</label>
        <Label>Preferred locations<Chips items={prefs.locations} onChange={v => setPrefs({ ...prefs, locations: v })} /></Label>
        <Label>Work modes<div className="flex gap-4 py-1 text-sm font-medium text-ink">{(['remote', 'hybrid', 'office'] as const).map(m => <label key={m} className="flex items-center gap-1.5 capitalize"><input type="checkbox" checked={prefs.workModes.includes(m)} onChange={e => setPrefs({ ...prefs, workModes: e.target.checked ? [...prefs.workModes, m] : prefs.workModes.filter(x => x !== m) })} />{m}</label>)}</div></Label>
        <Label>Blocklist (company or title words)<Input value={prefs.blocklist.join(', ')} onChange={e => setPrefs({ ...prefs, blocklist: lines(e.target.value) })} /></Label>
        <p className="text-xs text-mute">Location and work mode filter jobs; they do not change how well your resume fits a job.</p></Card></div>
    <Card className="space-y-2"><details><summary className="cursor-pointer font-extrabold">Text read from your resume</summary>
      <p className="my-2 text-xs text-mute">This is exactly what the parser saw. If something is missing here (for example a two-column PDF that was read out of order), add it above yourself or upload the resume as DOCX or TXT.</p>
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-2xl bg-sunk p-3 text-xs">{st.resumeText || 'Not available for resumes uploaded before this feature. Upload the resume again.'}</pre></details></Card>
    <Card className="space-y-4"><h3 className="font-extrabold">Skills</h3><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{CATS.map(([k, label]) => <Label key={k}>{label}<Chips items={p.skills[k]} onChange={v => upSkills(k, v)} /></Label>)}</div>
      <p className="text-xs text-mute">Only skills that appear here are ever treated as yours. Add any the parser missed.</p></Card>
    <div className="grid gap-5 xl:grid-cols-2">
      <Card className="space-y-3"><div className="flex items-center justify-between"><h3 className="font-extrabold">Experience</h3><Button variant="outline" className="h-8" onClick={() => up({ experience: [...p.experience, { company: '', title: '', start: '', end: '', summary: '' }] })}>Add</Button></div>
        {p.experience.map((e, i) => <div key={i} className="space-y-2 rounded-2xl bg-sunk p-3">
          <div className="grid gap-2 sm:grid-cols-2"><Input aria-label="Title" placeholder="Title" value={e.title} onChange={ev => up({ experience: p.experience.map((x, j) => j === i ? { ...x, title: ev.target.value } : x) })} /><Input aria-label="Company" placeholder="Company" value={e.company} onChange={ev => up({ experience: p.experience.map((x, j) => j === i ? { ...x, company: ev.target.value } : x) })} />
            <Input aria-label="Start" placeholder="Start (Jan 2019)" value={e.start} onChange={ev => up({ experience: p.experience.map((x, j) => j === i ? { ...x, start: ev.target.value } : x) })} /><Input aria-label="End" placeholder="End or Present" value={e.end} onChange={ev => up({ experience: p.experience.map((x, j) => j === i ? { ...x, end: ev.target.value } : x) })} /></div>
          {e.summary && <p className="line-clamp-2 text-xs text-mute">{e.summary}</p>}<button type="button" className="text-xs font-semibold text-bad hover:underline" onClick={() => up({ experience: p.experience.filter((_, j) => j !== i) })}>Remove</button></div>)}
        {!p.experience.length && <p className="text-sm text-mute">No employment history was found.</p>}</Card>
      <div className="space-y-5"><Card className="space-y-3"><h3 className="font-extrabold">Education</h3>{p.education.map((e, i) => <div key={i} className="rounded-2xl bg-sunk p-3 text-sm"><b>{e.degree || 'Degree'}</b><p className="text-xs text-mute">{[e.institution, e.year, e.grade].filter(Boolean).join(' · ')}</p></div>)}{!p.education.length && <p className="text-sm text-mute">None found.</p>}</Card>
        <Card className="space-y-3"><h3 className="font-extrabold">Certifications</h3><Chips items={p.certifications} onChange={v => up({ certifications: v })} /></Card>
        <Card className="space-y-3"><h3 className="font-extrabold">Projects</h3>{p.projects.map((x, i) => <div key={i} className="rounded-2xl bg-sunk p-3 text-sm"><b>{x.name}</b><p className="line-clamp-2 text-xs text-mute">{x.description}</p></div>)}{!p.projects.length && <p className="text-sm text-mute">None found.</p>}</Card></div></div>
  </div>;
}
