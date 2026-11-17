import { createElement, useEffect, useMemo, useState } from 'react';
import { atsScore, bullets, flatSkills } from '../../../engine/ats.ts';
import { TEMPLATES, buildDocx, type Template } from '../docx.ts';
import { Badge, Button, Card, ScoreRing, cn } from '../ui.tsx';
import { useApp } from '../state.tsx';
import { ReplaceResume, UploadCard, lines } from './common.tsx';
import type { Profile } from '../api.ts';

/** A piece of the resume you edit in place. Plain text only; the value is saved when you leave the field. */
function E({ value, onChange, placeholder, className, tag = 'span', multiline }: { value: string; onChange: (v: string) => void; placeholder: string; className?: string; tag?: string; multiline?: boolean }) {
  return createElement(tag, {
    className: cn('editable', className), contentEditable: true, suppressContentEditableWarning: true, role: 'textbox', 'aria-label': placeholder, 'aria-multiline': !!multiline, 'data-placeholder': placeholder, spellCheck: true,
    onBlur: (e: React.FocusEvent<HTMLElement>) => { const v = e.currentTarget.innerText.replace(/ /g, ' ').trim(); if (!v) e.currentTarget.textContent = ''; if (v !== value) onChange(v); },
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => { if (e.key === 'Enter' && !multiline) { e.preventDefault(); e.currentTarget.blur(); } },
    onPaste: (e: React.ClipboardEvent) => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); }, // never paste formatting
  }, value);
}

/** Read-only render of the resume in a template, used for the template thumbnails. */
function Preview({ p, tpl }: { p: Profile; tpl: Template }) {
  return <div className={cn('resume-page', `tpl-${tpl}`)}>
    <div className="r-head"><h1>{p.name || 'Your Name'}</h1><p className="r-role">{p.currentDesignation || 'Job title'}</p><p className="r-contact">{[p.email || 'email@example.com', p.phone || 'phone', p.location || 'city'].map(x => <span key={x} className="r-c">{x}</span>)}</p></div>
    <h2>Summary</h2><p>{p.summary || 'Two or three lines about your experience and strengths.'}</p>
    <h2>Skills</h2><p>{flatSkills(p).join(', ') || 'Your skills'}</p>
    <h2>Experience</h2>{(p.experience.length ? p.experience : [{ title: 'Job title', company: 'Company', start: 'Start', end: 'End', summary: 'What you did and the result' }]).slice(0, 3).map((e, i) => <div key={i} className="r-item">
      <p><span className="r-c r-strong">{e.title}</span><span className="r-c r-strong">{e.company}</span></p><p className="r-dates">{e.start} – {e.end}</p><div className="r-bullets">{bullets(e.summary).map(b => `• ${b}`).join('\n')}</div></div>)}
    <h2>Education</h2>{(p.education.length ? p.education : [{ degree: 'Degree', institution: 'University', year: 'Year' }]).map((e, i) => <p key={i}>{[e.degree, e.institution, e.year].filter(Boolean).join(', ')}</p>)}
  </div>;
}

const download = (blob: Blob, name: string) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };

export default function ResumeView() {
  const { st, saveProfile, busy, setMsg } = useApp();
  const [p, setP] = useState<Profile | null>(null);
  const [tpl, setTplState] = useState<Template>(() => { try { const t = localStorage.getItem('ja.template'); return t && t in TEMPLATES ? t as Template : 'classic'; } catch { return 'classic'; } });
  useEffect(() => { if (st?.profile) setP(st.profile); }, [st?.profile]);
  const ats = useMemo(() => (p ? atsScore(p, st?.jobs ?? []) : null), [p, st?.jobs]);
  if (!st) return null;
  if (!p || !ats || !st.prefs) return <div className="view mx-auto max-w-2xl space-y-5 py-8 text-center"><h2 className="text-2xl font-extrabold">Check your resume's ATS score</h2>
    <p className="text-mute">Upload a resume to see how well applicant-tracking software can read it, fix it right on the page, pick a template and download it as PDF or Word.</p><UploadCard big /></div>;

  const setTpl = (t: Template) => { setTplState(t); try { localStorage.setItem('ja.template', t); } catch { /* storage blocked: choice just will not persist */ } };
  const up = (patch: Partial<Profile>) => setP({ ...p, ...patch });
  const setSkills = (list: string[]) => { // keep each skill in its category; new ones go to "other"
    const want = new Map(list.map(s => [s.toLowerCase(), s]));
    const skills = Object.fromEntries(Object.entries(p.skills).map(([k, v]) => [k, v.filter(s => want.delete(s.toLowerCase()))])) as Profile['skills'];
    skills.other = [...skills.other, ...want.values()];
    up({ skills, allSkills: [...new Set(Object.values(skills).flat().map(s => s.toLowerCase()))] });
  };
  const setExp = (i: number, patch: Partial<Profile['experience'][0]>) => up({ experience: p.experience.map((e, j) => j === i ? { ...e, ...patch } : e) });
  const setEdu = (i: number, patch: Partial<Profile['education'][0]>) => up({ education: p.education.map((e, j) => j === i ? { ...e, ...patch } : e) });
  const setProj = (i: number, patch: Partial<Profile['projects'][0]>) => up({ projects: p.projects.map((e, j) => j === i ? { ...e, ...patch } : e) });
  const dirty = JSON.stringify(p) !== JSON.stringify(st.profile);
  const fileBase = (p.name || 'resume').replace(/[^\w]+/g, '_');
  const word = async () => { try { download(await buildDocx(p, tpl), `${fileBase}.docx`); setMsg('Word file downloaded.'); } catch (e) { setMsg(`Could not build the Word file: ${(e as Error).message}`); } };
  const Tool = ({ onClick, children, del }: { onClick: () => void; children: string; del?: boolean }) => <button type="button" className={cn('no-print r-tool', del && 'del')} onClick={onClick}>{children}</button>;

  return <div className="view print-block grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
    <aside className="no-print min-w-0 space-y-5">
      <Card className="space-y-4"><div className="flex items-center gap-4"><ScoreRing score={ats.score} size={84} /><div><h2 className="text-lg font-extrabold">ATS score</h2>
          <p className="text-sm text-mute">{ats.score >= 85 ? 'Reads well for applicant-tracking software.' : ats.score >= 65 ? 'Good base. Fix the items below to raise it.' : 'Needs work before you apply. Start with the items below.'}</p></div></div>
        <ul className="space-y-3">{ats.checks.map(c => <li key={c.id} className="text-sm"><div className="flex justify-between gap-2"><span className="font-semibold">{c.label}</span><span className="tabular-nums text-mute">{c.got}/{c.max}</span></div>
          <div className="mt-1 h-1.5 rounded-full bg-sunk"><div className={cn('h-full rounded-full transition-all', c.got >= c.max ? 'bg-good' : c.got >= c.max / 2 ? 'bg-brand' : 'bg-bad')} style={{ width: `${(c.got / c.max) * 100}%` }} /></div>
          {c.tip && <p className="mt-1 text-xs text-mute">{c.tip}</p>}</li>)}</ul>
        <p className="text-xs text-mute">The score updates as you edit the resume on the right. It is an estimate of how parser-friendly the resume is, not the score of any particular company's ATS. About {ats.words} words.</p></Card>

      <Card className="space-y-3"><h3 className="font-extrabold">Template</h3>
        <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Template">{(Object.keys(TEMPLATES) as Template[]).map(t => <button key={t} type="button" role="radio" aria-checked={tpl === t} onClick={() => setTpl(t)}
          className={cn('lift rounded-2xl border-2 p-2 text-center text-sm font-semibold transition-colors', tpl === t ? 'border-brand bg-brand-soft text-brand-ink' : 'border-line hover:border-brand')}>
          <div className="tpl-thumb" aria-hidden><Preview p={p} tpl={t} /></div><span className="mt-2 block">{TEMPLATES[t]}{tpl === t && ' ✓'}</span></button>)}</div>
        <p className="text-xs text-mute">Each preview is your own resume in that template. Click one to apply it. All are single-column with plain headings, which ATS parsers read most reliably.</p></Card>

      <Card className="space-y-3"><h3 className="font-extrabold">Save and download</h3>
        <Button variant="lime" className="w-full" disabled={busy || !dirty} onClick={() => saveProfile(p, st.prefs!)}>{dirty ? 'Save changes' : 'All changes saved'}</Button>
        <div className="grid grid-cols-2 gap-2"><Button onClick={() => window.print()}>Save as PDF</Button><Button variant="outline" onClick={word}>Download Word</Button></div>
        <p className="text-xs text-mute">“Save as PDF” opens your browser's print window: choose <b>Save as PDF</b> as the destination. Saving changes also updates your job matches.</p>
        <ReplaceResume className="w-full justify-center" /><p className="text-xs text-mute">Upload a resume (including one you downloaded here) to analyse it again.</p></Card>
      {dirty && <Badge tone="warn">Unsaved edits</Badge>}
    </aside>

    <div className="min-w-0"><p className="no-print mb-2 text-sm text-mute">Click any text on the page to edit it. Bullets: one per line.</p>
      <article className={cn('resume-page', `tpl-${tpl}`)} aria-label="Resume">
        <header className="r-head"><E tag="h1" value={p.name} onChange={v => up({ name: v })} placeholder="Your name" />
          <E tag="p" className="r-role" value={p.currentDesignation} onChange={v => up({ currentDesignation: v })} placeholder="Job title" />
          <p className="r-contact"><span className="r-c"><E value={p.email} onChange={v => up({ email: v })} placeholder="Email" /></span><span className="r-c"><E value={p.phone} onChange={v => up({ phone: v })} placeholder="Phone" /></span><span className="r-c"><E value={p.location} onChange={v => up({ location: v })} placeholder="City" /></span></p></header>

        <section className={cn(!p.summary && 'no-print')}><h2>Summary</h2><E tag="p" multiline className="r-pre" value={p.summary} onChange={v => up({ summary: v })} placeholder="Two or three lines on your experience, strengths and what you want next" /></section>
        <section className={cn(!p.allSkills.length && 'no-print')}><h2>Skills</h2><E tag="p" multiline value={flatSkills(p).join(', ')} onChange={v => setSkills(lines(v))} placeholder="Skills separated by commas" /></section>

        <section className={cn(!p.experience.length && 'no-print')}><h2>Experience</h2>
          {p.experience.map((e, i) => <div key={i} className="r-item">
            <p><span className="r-c"><E className="r-strong" value={e.title} onChange={v => setExp(i, { title: v })} placeholder="Job title" /></span><span className="r-c"><E className="r-strong" value={e.company} onChange={v => setExp(i, { company: v })} placeholder="Company" /></span></p>
            <p className="r-dates"><E value={e.start} onChange={v => setExp(i, { start: v })} placeholder="Start (Jan 2020)" /> – <E value={e.end} onChange={v => setExp(i, { end: v })} placeholder="End or Present" /></p>
            <E tag="div" multiline className="r-bullets" value={bullets(e.summary).map(b => `• ${b}`).join('\n')} onChange={v => setExp(i, { summary: bullets(v).join('\n') })} placeholder="• What you did and the result, one bullet per line" />
            <Tool del onClick={() => up({ experience: p.experience.filter((_, j) => j !== i) })}>Remove role</Tool></div>)}
          <Tool onClick={() => up({ experience: [...p.experience, { title: '', company: '', start: '', end: '', summary: '' }] })}>+ Add role</Tool></section>

        <section className={cn(!p.projects.length && 'no-print')}><h2>Projects</h2>
          {p.projects.map((x, i) => <div key={i} className="r-item"><E tag="p" className="r-strong" value={x.name} onChange={v => setProj(i, { name: v })} placeholder="Project name" />
            <E tag="p" multiline className="r-pre" value={x.description} onChange={v => setProj(i, { description: v })} placeholder="What it does and what you used" />
            <Tool del onClick={() => up({ projects: p.projects.filter((_, j) => j !== i) })}>Remove project</Tool></div>)}
          <Tool onClick={() => up({ projects: [...p.projects, { name: '', description: '', tech: [] }] })}>+ Add project</Tool></section>

        <section className={cn(!p.education.length && 'no-print')}><h2>Education</h2>
          {p.education.map((e, i) => <div key={i} className="r-item"><p className="r-commas"><span className="r-c"><E className="r-strong" value={e.degree} onChange={v => setEdu(i, { degree: v })} placeholder="Degree" /></span><span className="r-c"><E value={e.institution} onChange={v => setEdu(i, { institution: v })} placeholder="College or university" /></span><span className="r-c"><E value={e.year} onChange={v => setEdu(i, { year: v })} placeholder="Year" /></span></p>
            <Tool del onClick={() => up({ education: p.education.filter((_, j) => j !== i) })}>Remove</Tool></div>)}
          <Tool onClick={() => up({ education: [...p.education, { degree: '', institution: '', year: '' }] })}>+ Add education</Tool></section>

        <section className={cn(!p.certifications.length && 'no-print')}><h2>Certifications</h2><E tag="div" multiline className="r-pre" value={p.certifications.join('\n')} onChange={v => up({ certifications: v.split('\n').map(x => x.trim()).filter(Boolean) })} placeholder="One certification per line" /></section>
      </article></div>
  </div>;
}
