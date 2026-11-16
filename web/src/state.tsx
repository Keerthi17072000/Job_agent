import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, type Job, type Prefs, type Profile, type Run, type State } from './api.ts';

export interface Scan { running: boolean; done: number; total: number; fin: Record<string, Run>; phase: string }
export interface Ctx {
  st: State | null; busy: boolean; msg: string; setMsg: (m: string) => void; scan: Scan;
  load: () => Promise<void>; upload: (f?: File) => Promise<void>; runScan: (fresh?: boolean) => Promise<void>; cancelScan: () => void; importExt: () => Promise<void>;
  updateJob: (id: string, patch: Partial<Pick<Job, 'status' | 'saved' | 'notes'>>) => Promise<void>;
  savePrefs: (p: Prefs) => Promise<void>; saveProfile: (p: Profile, prefs: Prefs) => Promise<void>;
  slotAction: (f: () => Promise<unknown>) => Promise<void>;
}
const C = createContext<Ctx | null>(null);
export const useApp = () => { const c = useContext(C); if (!c) throw new Error('outside provider'); return c; };

export function AppProvider({ children }: { children: ReactNode }) {
  const [st, setSt] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [scan, setScan] = useState<Scan>({ running: false, done: 0, total: 0, fin: {}, phase: '' });
  const abort = useRef<AbortController | null>(null);

  const load = useCallback(async () => setSt(await api.state()), []);
  useEffect(() => { api.init().then(load).catch(e => setMsg((e as Error).message)); }, [load]);
  useEffect(() => { if (!msg || busy || scan.running) return; const t = setTimeout(() => setMsg(''), 7000); return () => clearTimeout(t); }, [msg, busy, scan.running]);

  const guard = async (label: string, f: () => Promise<string | void>) => {
    setBusy(true); setMsg(label);
    try { const done = await f(); await load(); setMsg(done || ''); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };

  const runScan = useCallback(async (fresh = false) => {
    abort.current = new AbortController();
    setBusy(true); setScan({ running: true, done: 0, total: 6, fin: {}, phase: 'Searching all sources…' }); setMsg('Searching all sources…');
    try {
      const r = await api.search({ fresh, signal: abort.current.signal,
        onSource: run => setScan(s => ({ ...s, done: s.done + 1, fin: { ...s.fin, [run.adapter]: run } })),
        onPhase: phase => { setScan(s => ({ ...s, phase })); setMsg(phase); } });
      await load();
      setMsg(`Search complete: ${r.added} new jobs added, ${r.duplicate} duplicates merged.`);
    } catch (e) { setMsg((e as Error).message === 'cancelled' ? 'Search cancelled.' : (e as Error).message); await load(); }
    finally { setScan(s => ({ ...s, running: false })); setBusy(false); }
  }, [load]);

  // Replacement for scheduled daily searches (not possible without a server): refresh on open when stale, if the user opted in.
  const auto = useRef(false);
  useEffect(() => {
    if (!st || auto.current || !st.profile || !st.prefs?.autoRefresh || !st.prefs.roles.length) return;
    auto.current = true;
    if (!st.lastSearch || Date.now() - +new Date(st.lastSearch) > 24 * 3600e3) void runScan();
  }, [st, runScan]);

  const ctx: Ctx = {
    st, busy, msg, setMsg, scan, load, runScan, cancelScan: () => abort.current?.abort(),
    upload: async f => { if (f) await guard('Reading your resume…', async () => (await api.resume(f)) || 'Resume read. Check your profile, then search.'); },
    importExt: () => guard('Importing…', async () => { const r = await api.importExtension(); return `Imported ${r.received}: ${r.added} added, ${r.duplicate} duplicates, ${r.received - r.added - r.duplicate} rejected (no verifiable https link).`; }),
    updateJob: async (id, patch) => { await api.updateJob(id, patch); await load(); },
    savePrefs: p => guard('Saving…', async () => { await api.savePrefs(p); return 'Preferences saved and matches updated.'; }),
    saveProfile: (p, prefs) => guard('Saving profile…', async () => { await api.saveProfile(p); await api.savePrefs(prefs); return 'Profile confirmed. All matches were recalculated.'; }),
    slotAction: f => guard('Working…', async () => { await f(); }),
  };
  return <C.Provider value={ctx}>{children}</C.Provider>;
}

export function useRoute(): [string, string] {
  const read = () => { const [, r = 'overview', p = ''] = location.hash.split('/'); return [r, decodeURIComponent(p)] as [string, string]; };
  const [route, setRoute] = useState(read);
  useEffect(() => { const h = () => { setRoute(read()); scrollTo({ top: 0 }); }; addEventListener('hashchange', h); return () => removeEventListener('hashchange', h); }, []);
  return route;
}
