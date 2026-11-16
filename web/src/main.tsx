import { Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';

/** Last line of defence: a crash shows what happened and a way out instead of a blank page. */
class Boundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  reset = async () => {
    try { indexedDB.deleteDatabase('jobagent'); Object.keys(localStorage).filter(k => k.startsWith('ja.')).forEach(k => localStorage.removeItem(k)); } catch { /* blocked storage: reload anyway */ }
    location.hash = ''; location.reload();
  };
  render() {
    if (!this.state.error) return this.props.children;
    return <div className="mx-auto max-w-lg space-y-4 p-8 text-center"><h1 className="text-2xl font-extrabold">Something went wrong</h1>
      <p className="rounded-2xl bg-card p-4 font-mono text-sm">{this.state.error.message}</p>
      <p className="text-sm text-mute">Reloading usually fixes it. If it keeps happening, reset the data stored in this browser (your resume and jobs on this device will be removed).</p>
      <div className="flex justify-center gap-3"><button className="h-10 rounded-full bg-ink px-5 text-sm font-semibold text-canvas" onClick={() => location.reload()}>Reload</button>
        <button className="h-10 rounded-full border border-line bg-card px-5 text-sm font-semibold" onClick={this.reset}>Reset stored data</button></div></div>;
  }
}

createRoot(document.getElementById('root')!).render(<Boundary><App /></Boundary>);
