import { useEffect, useRef, useState } from 'react';
import { api } from '../api.ts';
import { Button, Input, cn } from '../ui.tsx';
import { useApp } from '../state.tsx';

/** The profile menu in the header: switch between candidate profiles, create one, or open Settings to rename or delete. Each profile has its own resume, jobs and applications. */
export default function ProfileSwitcher() {
  const { st, slotAction, busy } = useApp();
  const [open, setOpen] = useState(false), [name, setName] = useState(''), box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); }, esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    addEventListener('mousedown', away); addEventListener('keydown', esc); return () => { removeEventListener('mousedown', away); removeEventListener('keydown', esc); };
  }, [open]);
  if (!st?.slots.length) return null;
  const go = async (f: () => Promise<unknown>) => { setOpen(false); location.hash = '#/overview'; await slotAction(f); };
  return <div ref={box} className="relative">
    <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label={`Profile: ${st.slot.name}. Switch or add a profile`} onClick={() => setOpen(o => !o)}
      className="flex max-w-48 items-center gap-2 rounded-full bg-card px-4 py-2 text-sm font-semibold transition-colors hover:text-brand-ink"><span className="truncate">{st.slot.name}</span><span aria-hidden className={cn('text-xs transition-transform', open && 'rotate-180')}>▾</span></button>
    {open && <div role="menu" className="rise absolute right-0 top-full z-50 mt-2 w-72 space-y-2 rounded-3xl border border-line bg-card p-3 shadow-2xl">
      <p className="px-2 text-xs font-semibold text-mute">Profiles on this browser</p>
      <ul className="space-y-1">{st.slots.map(s => <li key={s.id}><button role="menuitemradio" aria-checked={s.id === st.slot.id} type="button" disabled={busy}
        onClick={() => s.id === st.slot.id ? setOpen(false) : void go(() => api.switchSlot(s.id))}
        className={cn('flex w-full items-center justify-between rounded-2xl px-3 py-2 text-left text-sm font-semibold transition-colors hover:bg-sunk', s.id === st.slot.id && 'bg-brand-soft text-brand-ink')}><span className="truncate">{s.name}</span>{s.id === st.slot.id && <span aria-hidden>✓</span>}</button></li>)}</ul>
      <form className="flex gap-2 border-t border-line pt-2" onSubmit={e => { e.preventDefault(); if (name.trim()) void go(() => api.newSlot(name)).then(() => setName('')); }}>
        <Input aria-label="New profile name" placeholder="New profile name, e.g. Sherin" value={name} onChange={e => setName(e.target.value)} /><Button type="submit" disabled={busy || !name.trim()}>Add</Button></form>
      <a href="#/settings" onClick={() => setOpen(false)} className="block px-2 text-xs font-semibold text-brand-ink hover:underline">Rename or delete profiles in Settings</a></div>}
  </div>;
}
