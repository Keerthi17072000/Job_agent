import { useEffect, useState } from 'react';
import { AppProvider, useApp, useRoute } from './state.tsx';
import { ConfirmHost, cn } from './ui.tsx';
import { ICONS, Icon, ResumeInput } from './views/common.tsx';
import Overview from './views/Overview.tsx';
import JobsView from './views/JobsView.tsx';
import JobDetail from './views/JobDetail.tsx';
import ApplicationsView from './views/ApplicationsView.tsx';
import ProfileView from './views/ProfileView.tsx';
import SourcesView from './views/SourcesView.tsx';
import SettingsView from './views/SettingsView.tsx';
import ResumeView from './views/ResumeView.tsx';
import CompanyView from './views/CompanyView.tsx';
import ProfileSwitcher from './views/ProfileSwitcher.tsx';

const NAV: [string, string, keyof typeof ICONS][] = [['overview', 'Overview', 'overview'], ['jobs', 'Jobs', 'jobs'], ['saved', 'Saved', 'saved'], ['applications', 'Applications', 'applications'], ['company', 'Company lookup', 'company'], ['resume', 'Resume and ATS score', 'resume'], ['profile', 'Profile', 'profile'], ['sources', 'Sources', 'sources'], ['settings', 'Settings', 'settings']];
const TITLES: Record<string, string> = { overview: 'Overview', jobs: 'Jobs', saved: 'Saved jobs', applications: 'Applications', company: 'Company lookup', resume: 'Resume and ATS score', profile: 'Profile', sources: 'Sources', settings: 'Settings', job: 'Job details' };

function useTheme() {
  const [t, setT] = useState<string | null>(() => { try { return localStorage.getItem('ja.theme'); } catch { return null; } });
  useEffect(() => {
    if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
    try { t ? localStorage.setItem('ja.theme', t) : localStorage.removeItem('ja.theme'); } catch { /* storage blocked: theme just will not persist */ }
  }, [t]);
  const dark = t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  return [dark, () => setT(dark ? 'light' : 'dark')] as const;
}

function Shell() {
  const { st, msg, busy, scan } = useApp();
  const [route, param] = useRoute();
  const [dark, toggleTheme] = useTheme();
  const active = route === 'job' ? 'jobs' : route;
  const saved = st?.jobs.filter(j => j.saved).length ?? 0;

  return <div className="min-h-screen">
    <ResumeInput />
    <ConfirmHost />
    <div className="progress-bar" style={{ width: scan.running ? `${Math.max(6, (scan.done / scan.total) * 100)}%` : '100%', opacity: scan.running ? 1 : 0 }} aria-hidden />
    <nav aria-label="Main" className="fixed inset-x-3 bottom-3 z-40 flex items-center justify-around rounded-full bg-rail p-1.5 shadow-2xl md:inset-x-auto md:bottom-auto md:left-4 md:top-1/2 md:-translate-y-1/2 md:flex-col md:gap-1.5 md:p-2">
      <a href="#/overview" aria-label="Job Agent home" className="hidden size-11 place-items-center rounded-full bg-lime text-lime-ink md:grid"><Icon d={ICONS.search} /></a>
      {NAV.map(([id, label, icon]) => <a key={id} href={`#/${id}`} aria-label={label} title={label} aria-current={active === id ? 'page' : undefined}
        className={cn('relative grid size-10 place-items-center rounded-full text-white/60 md:size-11 transition-all hover:text-white', active === id && 'bg-white/15 text-white')}><Icon d={ICONS[icon]} />
        {id === 'saved' && saved > 0 && <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-lime px-1 text-[10px] font-extrabold text-lime-ink">{saved}</span>}</a>)}
    </nav>

    <div className="shell-pad px-4 pb-28 pt-5 md:pb-8 md:pl-24 md:pr-6">
      <header className="app-head mx-auto mb-5 flex max-w-[1500px] items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold md:text-4xl">{TITLES[route] ?? 'Overview'}</h1>
        <div className="flex items-center gap-2">
          <ProfileSwitcher />
          <button onClick={toggleTheme} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'} className="grid size-10 place-items-center rounded-full bg-card transition-transform hover:scale-105"><Icon d={dark ? ICONS.sun : ICONS.moon} className="size-4" /></button>
        </div>
      </header>
      <main className="mx-auto max-w-[1500px]" key={route + param}>
        {!st ? <div className="grid gap-4 md:grid-cols-2"><div className="skel h-40" /><div className="skel h-40" /></div>
          : route === 'jobs' ? <JobsView /> : route === 'saved' ? <JobsView savedOnly /> : route === 'job' ? <JobDetail id={param} /> : route === 'applications' ? <ApplicationsView /> : route === 'resume' ? <ResumeView /> : route === 'company' ? <CompanyView />
          : route === 'profile' ? <ProfileView /> : route === 'sources' ? <SourcesView /> : route === 'settings' ? <SettingsView dark={dark} toggleTheme={toggleTheme} /> : <Overview />}
      </main>
    </div>

    {msg && <div role="status" className="toast fixed bottom-24 left-1/2 z-50 flex max-w-[92vw] items-center gap-3 rounded-full bg-ink px-5 py-3 text-sm font-medium text-canvas shadow-2xl md:bottom-6">{(busy || scan.running) && <span className="spinner" />}<span>{msg}</span></div>}
  </div>;
}

export default function App() { return <AppProvider><Shell /></AppProvider>; }
