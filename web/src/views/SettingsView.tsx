import { useEffect, useState } from 'react';
import { api, type Prefs } from '../api.ts';
import { Badge, Button, Card, Input, Label, Select, confirmDialog } from '../ui.tsx';
import { useApp } from '../state.tsx';
import { boardsFor } from '../boards.ts';

export default function SettingsView({ dark, toggleTheme }: { dark: boolean; toggleTheme: () => void }) {
  const { st, savePrefs, slotAction, busy, load } = useApp();
  const [p, setP] = useState<Prefs | null>(null), [name, setName] = useState('');
  useEffect(() => { if (st?.prefs) setP(st.prefs); }, [st?.prefs]);
  if (!st) return null;
  const save = (patch: Partial<Prefs>) => { if (!p) return; const n = { ...p, ...patch }; setP(n); };
  const dirty = p && JSON.stringify(p) !== JSON.stringify(st.prefs);

  return <div className="view space-y-5">
    <h2 className="text-lg font-extrabold">Settings</h2>
    <div className="grid gap-5 xl:grid-cols-2">
      {p ? <Card className="space-y-4"><h3 className="font-extrabold">Matching and search</h3>
        <Label>Minimum match to show<Select value={p.minScore} onChange={e => save({ minScore: +e.target.value })}><option value={0}>Any score</option><option value={60}>60+ (Moderate and above)</option><option value={75}>75+ (Strong and above)</option><option value={90}>90+ (Excellent only)</option></Select></Label>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={!!p.semantic} onChange={e => save({ semantic: e.target.checked })} /><span><b>Semantic matching</b> (on-device AI)<br /><span className="text-xs text-mute">Compares job descriptions to your experience by meaning. Downloads a small model (~25 MB) once into your browser; if it cannot load, word-overlap matching is used.</span></span></label>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={!!p.autoRefresh} onChange={e => save({ autoRefresh: e.target.checked })} /><span><b>Refresh when I open the app</b><br /><span className="text-xs text-mute">A server-less app cannot run daily schedules. If your last search is older than 24 hours it searches again when you open this page.</span></span></label>
        <details className="text-sm"><summary className="cursor-pointer font-semibold">Adzuna key (Indian listings, free)</summary><div className="mt-2 grid gap-2"><Input aria-label="Adzuna app id" placeholder="App id" value={p.adzuna?.id ?? ''} onChange={e => save({ adzuna: { id: e.target.value, key: p.adzuna?.key ?? '' } })} /><Input aria-label="Adzuna app key" type="password" placeholder="App key" value={p.adzuna?.key ?? ''} onChange={e => save({ adzuna: { id: p.adzuna?.id ?? '', key: e.target.value } })} /><span className="text-xs text-mute">Get both at developer.adzuna.com. Stored only in this browser.</span></div></details>
        <label className="block space-y-1.5 text-xs font-semibold text-mute">Company career pages (<code>ats:token</code> per line)<textarea className="min-h-28 w-full rounded-2xl border border-line bg-card p-3 font-mono text-xs focus:border-brand" value={p.companies.map(c => [c.ats, c.token, c.name].filter(Boolean).join(':')).join('\n')}
          onChange={e => save({ companies: e.target.value.split('\n').map(l => l.trim().split(':')).filter(x => x.length >= 2 && x[1]).map(([ats, token, name]) => ({ ats: ats as 'greenhouse', token, name })) })} /></label>
        <Button variant="outline" className="h-8" onClick={() => save({ companies: boardsFor(p.region) })}>{p.region === 'India' ? 'Fill with Indian company boards' : `Fill with example boards${p.region ? ` (for ${p.region})` : ''}`}</Button>
        <Button variant="lime" disabled={busy || !dirty} onClick={() => savePrefs(p)}>{dirty ? 'Save settings' : 'Saved'}</Button></Card> : <Card className="text-sm text-mute">Upload a resume to unlock matching settings.</Card>}

      <div className="space-y-5">
        {p && <Card className="space-y-3"><h3 className="font-extrabold">Optional AI provider</h3><p className="text-xs text-mute">By default everything runs on this device for free. Add your own key to get better profile extraction and query suggestions. The key stays in this browser and is sent only to that provider. Your resume text is sent to the provider when you upload a resume.</p>
          <Label>Provider<Select value={p.aiProvider ?? ''} onChange={e => save({ aiProvider: (e.target.value || undefined) as Prefs['aiProvider'] })}><option value="">None (on-device)</option><option value="claude">Claude (Anthropic)</option><option value="openai">OpenAI</option></Select></Label>
          <Input aria-label="AI API key" type="password" placeholder="API key" autoComplete="off" value={p.aiKey ?? ''} onChange={e => save({ aiKey: e.target.value || undefined })} /><p className="text-xs text-mute">Browser calls depend on each provider's CORS policy and are unverified here. Click “Save settings” after changing.</p></Card>}
        <Card className="space-y-3"><h3 className="font-extrabold">Appearance</h3><Button variant="outline" onClick={toggleTheme}>{dark ? 'Switch to light theme' : 'Switch to dark theme'}</Button></Card>
        <Card className="space-y-3"><h3 className="font-extrabold">Profiles on this browser</h3><p className="text-xs text-mute">Each profile keeps its own resume, matches, saved jobs and applications, fully separate from the others. Nothing is shared or uploaded.</p>
          <ul className="space-y-2">{st.slots.map(s => <li key={s.id} className="flex items-center justify-between gap-2 rounded-2xl bg-sunk px-3 py-2 text-sm"><span className="font-semibold">{s.name}{s.id === st.slot.id && <Badge tone="lime" className="ml-2">active</Badge>}</span>
            <span className="flex gap-2">{s.id !== st.slot.id && <Button variant="outline" className="h-8" onClick={() => slotAction(() => api.switchSlot(s.id))}>Switch</Button>}
              <Button variant="ghost" className="h-8 text-bad" onClick={async () => { if (await confirm_(s.name)) void slotAction(() => api.deleteSlot(s.id)); }}>Delete</Button></span></li>)}</ul>
          <form className="flex gap-2" onSubmit={e => { e.preventDefault(); void slotAction(() => api.newSlot(name)).then(() => setName('')); }}><Input aria-label="New profile name" placeholder="New profile name" value={name} onChange={e => setName(e.target.value)} /><Button type="submit" disabled={busy}>Add</Button></form></Card>
        <Card className="space-y-3"><h3 className="font-extrabold">Data</h3><Button variant="outline" onClick={() => slotAction(async () => { await api.clearJobs(); await load(); })}>Clear jobs, cache and history for this profile</Button></Card>
      </div>
    </div>
  </div>;
}
const confirm_ = (name: string) => confirmDialog(`Delete "${name}" and all its data from this browser?`, 'Delete profile', 'Delete this profile?');
