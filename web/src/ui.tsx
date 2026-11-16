// shadcn/ui-style primitives (same class conventions), written by hand, plus the motion helpers.
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';

export const cn = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(' ');
const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export const Card = ({ className, ...p }: HTMLAttributes<HTMLDivElement>) =>
  <div className={cn('min-w-0 rounded-2xl border border-line bg-card/80 p-4 backdrop-blur', className)} {...p} />;

export const Button = ({ className, variant = 'primary', ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'outline' | 'ghost' }) =>
  <button className={cn('inline-flex h-10 items-center justify-center gap-2 rounded-xl px-5 text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50',
    variant === 'primary' && 'btn-ember',
    variant === 'outline' && 'border border-line bg-card/70 hover:border-brand hover:bg-sunk',
    variant === 'ghost' && 'text-brand-ink hover:bg-brand-soft', className)} {...p} />;

const TONE = { mute: 'bg-sunk text-mute', brand: 'bg-brand-soft text-brand-ink', good: 'bg-good-soft text-good', warn: 'bg-warn-soft text-warn', bad: 'bg-bad-soft text-bad' };
export const Badge = ({ className, tone = 'mute', ...p }: HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof TONE }) =>
  <span className={cn('inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium', TONE[tone], className)} {...p} />;

const field = 'h-10 w-full rounded-xl border border-line bg-card/70 px-3 text-sm transition-colors placeholder:text-mute/60 focus:border-brand';
export const Input = ({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) => <input className={cn(field, className)} {...p} />;
export const Select = ({ className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => <select className={cn(field, className)} {...p} />;
export const Label = ({ className, ...p }: HTMLAttributes<HTMLLabelElement>) => <label className={cn('block space-y-1.5 text-xs font-medium text-mute', className)} {...p} />;

/** Fades and slides its content in once, when it scrolls into view. */
export function Reveal({ delay = 0, className, children }: { delay?: number; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (reduced() || !('IntersectionObserver' in window)) { el.classList.add('in'); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { el.classList.add('in'); io.disconnect(); } }, { threshold: 0.08 });
    io.observe(el); return () => io.disconnect();
  }, []);
  return <div ref={ref} className={cn('reveal', className)} style={{ '--d': `${delay}ms` } as CSSProperties}>{children}</div>;
}

/** Number that counts up to its target. */
export function useCountUp(target: number, ms = 800) {
  const [v, setV] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (reduced()) { setV(target); from.current = target; return; }
    const start = performance.now(), a = from.current; let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / ms), val = Math.round(a + (target - a) * (1 - Math.pow(1 - p, 3)));
      setV(val); from.current = val; if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

/** Circular match score whose arc draws itself. */
export function ScoreRing({ score }: { score: number }) {
  const r = 24, c = 2 * Math.PI * r;
  const color = score >= 80 ? 'var(--color-good)' : score >= 60 ? 'var(--color-brand2)' : 'var(--color-mute)';
  return <div role="img" aria-label={`${score} percent match`} className="relative size-16 shrink-0">
    <svg viewBox="0 0 56 56" className="size-full -rotate-90"><circle cx="28" cy="28" r={r} fill="none" stroke="var(--color-sunk)" strokeWidth="5" />
      <circle cx="28" cy="28" r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} className="ring-draw" style={{ '--c': c } as CSSProperties} /></svg>
    <span className="absolute inset-0 grid place-items-center font-display text-sm font-bold tabular-nums">{score}</span></div>;
}

/** Radar: sweeps faster while scanning; each blip is a real matched job (closer to the centre = better score). */
export function Radar({ scanning, blips }: { scanning: boolean; blips: { id: string; score: number }[] }) {
  return <div className={cn('radar', scanning && 'radar-fast')} aria-hidden>
    <div className="radar-ring" /><div className="radar-ring r2" /><div className="radar-ring r3" /><div className="radar-ring r4" /><div className="radar-cross" />
    <div className="radar-sweep" />
    {blips.map(b => {
      const h = parseInt(b.id.slice(0, 6), 16) || 1, ang = (h % 3600) / 10 * Math.PI / 180, rad = 0.94 - 0.72 * (b.score / 100);
      return <span key={b.id} className="blip" style={{ left: `${50 + rad * 46 * Math.cos(ang)}%`, top: `${50 + rad * 46 * Math.sin(ang)}%`, animationDelay: `${(h % 9) * 0.12}s, ${(h % 7) * 0.4}s` }} />;
    })}
    <div className="radar-core" />
  </div>;
}
