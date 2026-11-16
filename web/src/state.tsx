import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, PORTALS, type Job, type Prefs, type Profile, type Run, type State } from './api.ts';

export interface Scan { running: boolean; done: number; total: number; fin: Record<string, Run>; phase: string }
export interface Ctx {
  ext: string; portalBusy: string; portalSearch: (id: string) => Promise<void>; portalSearchAll: () => Promise<void>; checkExtension: () => Promise<void>;
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
  const [ext, setExt] = useState(''), [portalBusy, setPortalBusy] = useState('');
  const checkExtension = useCallback(async () => setExt(await api.extensionStatus()), []);
  useEffect(() => { void checkExtension(); const t = setTimeout(checkExtension, 2500); return () => clearTimeout(t); }, [checkExtension]); // the content script may attach just after load

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

  const describe = (r: { name: string; found: number; added: number; blocked?: string; error?: string }) =>
    r.blocked ? `${r.name} asked for a login or verification. Its tab is open: finish that yourself, then search again.` : r.error ? `${r.name}: ${r.error}` : `${r.name}: ${r.found} listings read, ${r.added} new.`;
  const portalSearch = async (id: string) => {
    setPortalBusy(id); setBusy(true); setMsg(`Searching ${PORTALS.find(p => p.id === id)?.name} through your browser…`);
    try { setMsg(describe(await api.portalSearch(id))); await load(); } catch (e) { setMsg((e as Error).message); } finally { setPortalBusy(''); setBusy(false); }
  };
  const portalSearchAll = async () => {
    setBusy(true);
    try {
      for (const p of PORTALS.filter(x => x.extension)) {
        setPortalBusy(p.id); setMsg(`Searching ${p.name} through your browser…`);
        const r = await api.portalSearch(p.id); setMsg(describe(r)); await load();
        await new Promise(res => setTimeout(res, 3500)); // unhurried: one page per portal
      }
      setMsg('Portal searches finished.');
    } catch (e) { setMsg((e as Error).message); } finally { setPortalBusy(''); setBusy(false); }
  };

  const ctx: Ctx = {
    ext, portalBusy, portalSearch, portalSearchAll, checkExtension,
    st, busy, msg, setMsg, scan, load, runScan, cancelScan: () => abort.current?.abort(),
    upload: async f => {
      if (!f) return;
      let note = '';
      await guard('Reading your resume…', async () => { note = await api.resume(f); });
      const s = await api.state();
      if (!s.profile) return; // reading failed; guard already showed why
      if (s.prefs?.roles.length) { setMsg(`${note ? note + ' ' : ''}Resume read. Searching for ${s.prefs.roles.slice(0, 2).join(', ')}…`); await runScan(true); }
      else setMsg('Resume read, but no job title was found. Add a target role in Profile, then search.');
    },
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
