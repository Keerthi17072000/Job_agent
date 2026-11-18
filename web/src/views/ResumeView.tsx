import { createElement, useEffect, useMemo, useRef, useState } from 'react';
import { atsScore, bullets, flatSkills } from '../../../engine/ats.ts';
import { suggest, scoreWith, type Change } from '../../../engine/improve.ts';
import { buildDocx } from '../docx.ts';
import { CATEGORIES, TEMPLATE_DEFS, atsLayout, atsSafe, paperProps, templateById, type TemplateDef } from '../templates.ts';
import { api } from '../api.ts';
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
function Preview({ p, def, photo }: { p: Profile; def: TemplateDef; photo: string }) {
  const summary = <section><h2>Summary</h2><p>{p.summary || 'Two or three lines about your experience and strengths.'}</p></section>;
  const skills = <section><h2>Skills</h2><p>{flatSkills(p).join(', ') || 'Your skills'}</p></section>;
  const exp = <section><h2>Experience</h2>{(p.experience.length ? p.experience : [{ title: 'Job title', company: 'Company', start: 'Start', end: 'End', summary: 'What you did and the result' }]).slice(0, 3).map((e, i) => <div key={i} className="r-item">
    <p><span className="r-c r-strong">{e.title}</span><span className="r-c r-strong">{e.company}</span></p><p className="r-dates">{e.start} – {e.end}</p><div className="r-bullets">{bullets(e.summary).map(b => `• ${b}`).join('\n')}</div></div>)}</section>;
  const edu = <section><h2>Education</h2>{(p.education.length ? p.education : [{ degree: 'Degree', institution: 'University', year: 'Year', grade: '' }]).map((e, i) => <p key={i}>{[e.degree, e.institution, e.year].filter(Boolean).join(', ')}</p>)}</section>;
  const side = <div className="r-side">{skills}{edu}</div>, main = <div className="r-main">{summary}{exp}</div>;
  return <div className="resume-page" {...paperProps(def)}>
    <div className={cn('r-head', def.photo && 'has-photo')}>{def.photo && (photo ? <img className="r-photo" src={photo} alt="" /> : <span className="r-photo">Photo</span>)}
      <div className="r-ht"><h1>{p.name || 'Your Name'}</h1><p className="r-role">{p.currentDesignation || 'Job title'}</p><p className="r-contact">{[p.email || 'email@example.com', p.phone || 'phone', p.location || 'city'].map(x => <span key={x} className="r-c">{x}</span>)}</p></div></div>
    {def.layout === 'single' ? <>{summary}{skills}{exp}{edu}</> : <div className="r-cols">{def.layout === 'left' ? <>{side}{main}</> : <>{main}{side}</>}</div>}
  </div>;
}

const download = (blob: Blob, name: string) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };

export default function ResumeView() {
  const { st, saveProfile, busy, setMsg, load } = useApp();
  const [p, setP] = useState<Profile | null>(null);
  const [tpl, setTplState] = useState(() => { try { return templateById(localStorage.getItem('ja.template')).id; } catch { return TEMPLATE_DEFS[0].id; } });
  const def = templateById(tpl);
  const [review, setReview] = useState<{ changes: Change[]; tpl: boolean; allScore: number } | null>(null);
  const [cat, setCat] = useState(def.category);
  // Reload the editable copy only when the SAVED profile really changed (new upload, save). Other reloads, such as adding a photo, must not discard unsaved edits.
  const saved = useRef('');
  useEffect(() => { if (!st?.profile) return; const j = JSON.stringify(st.profile); if (j !== saved.current) { saved.current = j; setP(st.profile); } }, [st?.profile]);
  const ats = useMemo(() => (p ? atsScore(p, st?.jobs ?? [], atsLayout(def)) : null), [p, st?.jobs, def]);
  if (!st) return null;
  if (!p || !ats || !st.prefs) return <div className="view mx-auto max-w-2xl space-y-5 py-8 text-center"><h2 className="text-2xl font-extrabold">Check your resume's ATS score</h2>
    <p className="text-mute">Upload a resume to see how well applicant-tracking software can read it, fix it right on the page, pick a template and download it as PDF or Word.</p><UploadCard big /></div>;

  const setPhoto = async (f: File | null) => { try { await api.setPhoto(f); await load(); setMsg(f ? 'Photo added.' : 'Photo removed.'); } catch (e) { setMsg((e as Error).message); } };
  // one ATS-friendly template is always suggested, chosen from the resume itself
  const suggested = templateById(ats.words > 650 ? 'compact' : p.totalExperienceYears < 2 ? 'modern' : 'classic');
  const suggestWhy = ats.words > 650 ? 'Your resume is long; Compact fits more on a page in a single column that ATS software reads in order.' : p.totalExperienceYears < 2 ? 'A clean single-column layout with clear headings suits an early-career resume and is read reliably by ATS software.' : 'A traditional single-column layout with standard headings is the safest choice for ATS software.';
  const setTpl = (t: string) => { setTplState(t); try { localStorage.setItem('ja.template', t); } catch { /* storage blocked: choice just will not persist */ } };
  const analyse = () => { // proposes edits; nothing changes until you accept
    const useT = atsSafe(def) ? def : suggested, changes = suggest(p);
    setReview({ changes, tpl: useT.id !== def.id, allScore: scoreWith(p, changes, st.jobs, atsLayout(useT)) });
  };
  const accept = (c: Change) => { const n = c.apply(p); setP(n); setReview(r => r && { ...r, changes: r.changes.filter(x => x.id !== c.id), allScore: scoreWith(n, r.changes.filter(x => x.id !== c.id), st.jobs, atsLayout(r.tpl ? suggested : def)) }); };
  const acceptAll = () => { if (!review) return; setP(review.changes.reduce((q, c) => c.apply(q), p)); if (review.tpl) { setTpl(suggested.id); setCat(suggested.category); } setReview(null); setMsg('All suggested edits applied. Replace any [placeholder] with your real details, then Save changes.'); };
  const original = () => { setTpl(TEMPLATE_DEFS[0].id); setCat(TEMPLATE_DEFS[0].category); setMsg('Back to the original layout.'); };
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
  const holes = [p.summary, p.email, p.phone, p.location, ...p.experience.map(e => e.summary)].join('\n').match(/\[[^\]]*\]/g)?.length ?? 0;
  const dirty = JSON.stringify(p) !== JSON.stringify(st.profile);
  const fileBase = (p.name || 'resume').replace(/[^\w]+/g, '_');
  const word = async () => { try { download(await buildDocx(p, def), `${fileBase}.docx`); setMsg('Word file downloaded.'); } catch (e) { setMsg(`Could not build the Word file: ${(e as Error).message}`); } };
  const Tool = ({ onClick, children, del }: { onClick: () => void; children: string; del?: boolean }) => <button type="button" className={cn('no-print r-tool', del && 'del')} onClick={onClick}>{children}</button>;

  const summarySec = <section className={cn(!p.summary && 'no-print')}><h2>Summary</h2><E tag="p" multiline className="r-pre" value={p.summary} onChange={v => up({ summary: v })} placeholder="Two or three lines on your experience, strengths and what you want next" /></section>;
  const skillsSec = <section className={cn(!p.allSkills.length && 'no-print')}><h2>Skills</h2><E tag="p" multiline value={flatSkills(p).join(', ')} onChange={v => setSkills(lines(v))} placeholder="Skills separated by commas" /></section>;
  const expSec = <section className={cn(!p.experience.length && 'no-print')}><h2>Experience</h2>
          {p.experience.map((e, i) => <div key={i} className="r-item">
            <p><span className="r-c"><E className="r-strong" value={e.title} onChange={v => setExp(i, { title: v })} placeholder="Job title" /></span><span className="r-c"><E className="r-strong" value={e.company} onChange={v => setExp(i, { company: v })} placeholder="Company" /></span></p>
            <p className="r-dates"><E value={e.start} onChange={v => setExp(i, { start: v })} placeholder="Start (Jan 2020)" /> – <E value={e.end} onChange={v => setExp(i, { end: v })} placeholder="End or Present" /></p>
            <E tag="div" multiline className="r-bullets" value={bullets(e.summary).map(b => `• ${b}`).join('\n')} onChange={v => setExp(i, { summary: bullets(v).join('\n') })} placeholder="• What you did and the result, one bullet per line" />
            <Tool del onClick={() => up({ experience: p.experience.filter((_, j) => j !== i) })}>Remove role</Tool></div>)}
          <Tool onClick={() => up({ experience: [...p.experience, { title: '', company: '', start: '', end: '', summary: '' }] })}>+ Add role</Tool></section>;
  const projSec = <section className={cn(!p.projects.length && 'no-print')}><h2>Projects</h2>
          {p.projects.map((x, i) => <div key={i} className="r-item"><E tag="p" className="r-strong" value={x.name} onChange={v => setProj(i, { name: v })} placeholder="Project name" />
            <E tag="p" multiline className="r-pre" value={x.description} onChange={v => setProj(i, { description: v })} placeholder="What it does and what you used" />
            <p className="r-dates">Tools: <E value={x.tech.join(', ')} onChange={v => setProj(i, { tech: lines(v) })} placeholder="Tools and technologies, separated by commas" /></p>
            <Tool del onClick={() => up({ projects: p.projects.filter((_, j) => j !== i) })}>Remove project</Tool></div>)}
          <Tool onClick={() => up({ projects: [...p.projects, { name: '', description: '', tech: [] }] })}>+ Add project</Tool></section>;
  const eduSec = <section className={cn(!p.education.length && 'no-print')}><h2>Education</h2>
          {p.education.map((e, i) => <div key={i} className="r-item"><p className="r-commas"><span className="r-c"><E className="r-strong" value={e.degree} onChange={v => setEdu(i, { degree: v })} placeholder="Degree" /></span><span className="r-c"><E value={e.institution} onChange={v => setEdu(i, { institution: v })} placeholder="College or university" /></span><span className="r-c"><E value={e.year} onChange={v => setEdu(i, { year: v })} placeholder="Year" /></span><span className="r-c"><E value={e.grade} onChange={v => setEdu(i, { grade: v })} placeholder="Grade or percentage" /></span></p>
            <Tool del onClick={() => up({ education: p.education.filter((_, j) => j !== i) })}>Remove</Tool></div>)}
          <Tool onClick={() => up({ education: [...p.education, { degree: '', institution: '', year: '', grade: '' }] })}>+ Add education</Tool></section>;
  const setExtra = (i: number, patch: Partial<Profile['extras'][0]>) => up({ extras: p.extras.map((x, j) => j === i ? { ...x, ...patch } : x) });
  const extrasSec = <>{p.extras.map((x, i) => <section key={i}><h2><E value={x.heading} onChange={v => setExtra(i, { heading: v })} placeholder="Section title" /></h2>
    <E tag="div" multiline className="r-pre" value={x.text} onChange={v => setExtra(i, { text: v })} placeholder="One item per line" /><Tool del onClick={() => up({ extras: p.extras.filter((_, j) => j !== i) })}>Remove section</Tool></section>)}
    <Tool onClick={() => up({ extras: [...p.extras, { heading: 'Hobbies', text: '' }] })}>+ Add section (hobbies, languages, activities)</Tool></>;
  const certSec = <section className={cn(!p.certifications.length && 'no-print')}><h2>Certifications</h2><E tag="div" multiline className="r-pre" value={p.certifications.join('\n')} onChange={v => up({ certifications: v.split('\n').map(x => x.trim()).filter(Boolean) })} placeholder="One certification per line" /></section>;

  return <div className="view print-block grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
    <aside className="no-print min-w-0 space-y-5">
      <Card className="space-y-4"><div className="flex items-center gap-4"><ScoreRing score={ats.score} size={84} /><div><h2 className="text-lg font-extrabold">ATS score</h2>
          <p className="text-sm text-mute">{ats.score >= 85 ? 'Reads well for applicant-tracking software.' : ats.score >= 65 ? 'Good base. Fix the items below to raise it.' : 'Needs work before you apply. Start with the items below.'}</p></div></div>
        <ul className="space-y-3">{ats.checks.map(c => <li key={c.id} className="text-sm"><div className="flex justify-between gap-2"><span className="font-semibold">{c.label}</span><span className="tabular-nums text-mute">{c.got}/{c.max}</span></div>
          <div className="mt-1 h-1.5 rounded-full bg-sunk"><div className={cn('h-full rounded-full transition-all', c.got >= c.max ? 'bg-good' : c.got >= c.max / 2 ? 'bg-brand' : 'bg-bad')} style={{ width: `${(c.got / c.max) * 100}%` }} /></div>
          {c.tip && <p className="mt-1 text-xs text-mute">{c.tip}</p>}</li>)}</ul>
        <p className="text-xs text-mute">The score updates as you edit the resume on the right. It is an estimate of how parser-friendly the resume is, not the score of any particular company's ATS. About {ats.words} words.</p></Card>

      <Card className="space-y-3 border-2 border-lime"><h3 className="font-extrabold">Suggested template for ATS</h3>
        {atsSafe(def) ? <p className="text-sm"><b>{def.name}</b> is already ATS-friendly: single column, no photo, standard headings.</p>
          : <><div className="flex items-center gap-3"><div className="tpl-thumb shrink-0" style={{ margin: 0 }} aria-hidden><Preview p={p} def={suggested} photo="" /></div>
              <div className="space-y-2 text-sm"><p><b>{suggested.name}</b> would raise your ATS score by {10 - (ats.checks.find(c => c.id === 'template')?.got ?? 10)} points.</p><p className="text-xs text-mute">{suggestWhy}</p>
                <Button variant="lime" className="h-9" onClick={() => { setTpl(suggested.id); setCat(suggested.category); }}>Use {suggested.name}</Button></div></div></>}</Card>

      {def.photo && <Card className="space-y-3"><h3 className="font-extrabold">Profile photo</h3>
        <input id="photo" type="file" accept="image/*" className="sr-only" aria-label="Profile photo" onChange={e => { void setPhoto(e.target.files?.[0] ?? null); e.target.value = ''; }} />
        <div className="flex flex-wrap gap-2"><label htmlFor="photo" className="inline-flex h-10 cursor-pointer items-center rounded-full bg-ink px-5 text-sm font-semibold text-canvas focus-within:outline-2">{st.photo ? 'Change photo' : 'Upload photo'}</label>
          {st.photo && <Button variant="outline" onClick={() => setPhoto(null)}>Remove photo</Button>}</div>
        <p className="text-xs text-mute">JPG or PNG. It is cropped to a square and kept only in this browser. It appears in the PDF, not in the Word file.</p></Card>}

      <Card className="space-y-3 border-2 border-brand"><h3 className="font-extrabold">Analyse and auto-improve</h3>
        <p className="text-sm text-mute">Finds edits that raise your ATS score and shows each one highlighted. Nothing changes until you accept it. Where a real fact is needed (phone, numbers) it adds a [placeholder] for you to replace; placeholders earn no points.</p>
        <Button className="w-full" onClick={analyse}>Analyse my resume</Button>
        {review && <div className="space-y-3 text-sm">
          <p className="font-bold">ATS score now {ats.score}{review.changes.length || review.tpl ? ` → ${review.allScore} if you accept everything` : ''}</p>
          {!review.changes.length && !review.tpl && <p className="text-mute">No more automatic edits. {ats.score < 100 ? 'Replace any [placeholders] with real details; the checks above show what is left.' : ''}</p>}
          {review.tpl && <div className="rounded-xl border border-line p-3"><p className="font-semibold">Switch to {suggested.name}, an ATS-friendly template</p><p className="text-xs text-mute">{suggestWhy}</p>
            <Button className="mt-2 h-9" onClick={() => { setTpl(suggested.id); setCat(suggested.category); setReview(r => r && { ...r, tpl: false }); }}>Accept</Button></div>}
          {review.changes.map(c => { const was = new Set(c.before.split('\n')), now = new Set(c.after.split('\n'));
            return <div key={c.id} className="space-y-2 rounded-xl border border-line p-3"><p className="font-semibold">{c.label}</p>
              <div className="space-y-1 text-xs">{c.before.split('\n').filter(l => l && !now.has(l)).map((l, i) => <p key={`b${i}`} className="rounded bg-bad/15 px-2 py-1 line-through">{l}</p>)}
                {c.after.split('\n').filter(l => l && !was.has(l)).map((l, i) => <p key={`a${i}`} className="rounded bg-lime/40 px-2 py-1 text-ink">{l}</p>)}</div>
              <div className="flex gap-2"><Button className="h-9" onClick={() => accept(c)}>Accept</Button><Button variant="outline" className="h-9" onClick={() => setReview(r => r && { ...r, changes: r.changes.filter(x => x.id !== c.id) })}>Skip</Button></div></div>; })}
          {review.changes.length > 1 && <Button variant="lime" className="w-full" onClick={acceptAll}>Accept all edits</Button>}
          <p className="text-xs text-mute">Accepted edits are not saved until you press Save changes.</p></div>}</Card>

      <Card className="space-y-3"><h3 className="font-extrabold">Template <span className="font-medium text-mute">({TEMPLATE_DEFS.length})</span></h3>
        <Button variant="outline" className="h-9" onClick={original} disabled={tpl === TEMPLATE_DEFS[0].id}>Original layout</Button>
        <div role="tablist" aria-label="Template category" className="flex flex-wrap gap-1.5">{CATEGORIES.map(c => <button key={c} type="button" role="tab" aria-selected={cat === c} onClick={() => setCat(c)}
          className={cn('rounded-full px-3 py-1.5 text-xs font-semibold transition-colors', cat === c ? 'bg-ink text-canvas' : 'bg-sunk text-mute hover:text-ink')}>{c}</button>)}</div>
        <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Template">{TEMPLATE_DEFS.filter(d => d.category === cat).map(d => <button key={d.id} type="button" role="radio" aria-checked={tpl === d.id} aria-label={d.name} onClick={() => setTpl(d.id)}
          className={cn('lift rounded-2xl border-2 p-2 text-center text-sm font-semibold transition-colors', tpl === d.id ? 'border-brand bg-brand-soft text-brand-ink' : 'border-line hover:border-brand')}>
          <div className="tpl-thumb" aria-hidden><Preview p={p} def={d} photo={st.photo} /></div><span className="mt-2 block">{d.name}{tpl === d.id && ' ✓'}</span>{atsSafe(d) && <span className="text-[10px] font-semibold text-good">ATS-friendly</span>}</button>)}</div>
        <p className="text-xs text-mute">{cat === 'With photo' ? 'Photo templates suit countries and roles where a photo is expected. Many ATS systems cannot read photos, so use a template without one for online application forms. Word export leaves the photo out.' : cat === 'Two-column' ? 'Two-column designs look good to people, but some ATS software reads columns out of order. Use a single-column template when you apply through an online form. Word export is always single-column.' : 'Each preview is your own resume in that template. Click one to apply it. Single-column templates are what ATS parsers read most reliably.'}</p></Card>

      <Card className="space-y-3"><h3 className="font-extrabold">Save and download</h3>
        <Button variant="lime" className="w-full" disabled={busy || !dirty} onClick={() => saveProfile(p, st.prefs!)}>{dirty ? 'Save changes' : 'All changes saved'}</Button>
        <div className="grid grid-cols-2 gap-2"><Button onClick={() => window.print()}>Save as PDF</Button><Button variant="outline" onClick={word}>Download Word</Button></div>
        <p className="text-xs text-mute">“Save as PDF” opens your browser's print window: choose <b>Save as PDF</b> as the destination. Then open <b>More settings</b> and untick <b>Headers and footers</b> (that removes the date, page title and web address your browser prints on every page), and tick <b>Background graphics</b> so template colours show. Saving changes also updates your job matches.</p>
        <ReplaceResume className="w-full justify-center" /><p className="text-xs text-mute">Upload a resume (including one you downloaded here) to analyse it again.</p></Card>
      {dirty && <Badge tone="warn">Unsaved edits</Badge>}
      {holes > 0 && <Badge tone="warn">{holes} [placeholder]{holes === 1 ? '' : 's'} left: replace before you download</Badge>}
    </aside>

    <div className="min-w-0"><p className="no-print mb-2 text-sm text-mute">Click any text on the page to edit it. Bullets: one per line.</p>
      <article className="resume-page" aria-label="Resume" {...paperProps(def)}>
        <header className={cn('r-head', def.photo && 'has-photo')}>{def.photo && (st.photo ? <img className="r-photo" src={st.photo} alt="Profile photo" /> : <label htmlFor="photo" className="r-photo no-print">Add photo</label>)}
          <div className="r-ht"><E tag="h1" value={p.name} onChange={v => up({ name: v })} placeholder="Your name" />
          <E tag="p" className="r-role" value={p.currentDesignation} onChange={v => up({ currentDesignation: v })} placeholder="Job title" />
          <p className="r-contact"><span className="r-c"><E value={p.email} onChange={v => up({ email: v })} placeholder="Email" /></span><span className="r-c"><E value={p.phone} onChange={v => up({ phone: v })} placeholder="Phone" /></span><span className="r-c"><E value={p.location} onChange={v => up({ location: v })} placeholder="City" /></span></p>
          <p className="r-contact"><E value={p.links.join(' | ')} onChange={v => up({ links: v.split(/[|,\s]+/).map(x => x.trim()).filter(Boolean) })} placeholder="LinkedIn, GitHub or portfolio links" /></p></div></header>
        {def.layout === 'single' ? <>{summarySec}{skillsSec}{expSec}{projSec}{eduSec}{certSec}{extrasSec}</>
          : <div className="r-cols">{def.layout === 'left' ? <><div className="r-side">{skillsSec}{eduSec}{certSec}{extrasSec}</div><div className="r-main">{summarySec}{expSec}{projSec}</div></> : <><div className="r-main">{summarySec}{expSec}{projSec}</div><div className="r-side">{skillsSec}{eduSec}{certSec}{extrasSec}</div></>}</div>}
      </article></div>
  </div>;
}
