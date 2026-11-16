// shadcn/ui-style primitives (same class conventions), written by hand, in the dashboard theme.
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';

export const cn = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(' ');
const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export const Card = ({ className, ...p }: HTMLAttributes<HTMLDivElement>) => <div className={cn('min-w-0 rounded-3xl bg-card p-5', className)} {...p} />;

const ArrowDot = ({ lime }: { lime?: boolean }) => <span className={cn('grid size-6 place-items-center rounded-full', lime ? 'bg-lime text-lime-ink' : 'bg-ink text-canvas')}>
  <svg viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12 12 4M5.5 4H12v6.5" /></svg></span>;

type Variant = 'primary' | 'outline' | 'lime' | 'ghost';
export const buttonClass = (variant: Variant = 'primary', className?: string) => cn('inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-full px-5 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50',
  variant === 'primary' && 'bg-ink text-canvas hover:opacity-85', variant === 'lime' && 'bg-lime text-lime-ink hover:brightness-95',
  variant === 'outline' && 'border border-line bg-card hover:border-brand hover:bg-sunk', variant === 'ghost' && 'text-brand-ink hover:bg-brand-soft', className);
export const Button = ({ className, variant = 'primary', ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) => <button className={buttonClass(variant, className)} {...p} />;
export const LinkButton = ({ href, children, variant = 'outline', className }: { href: string; children: ReactNode; variant?: Variant; className?: string }) =>
  <a href={href} target="_blank" rel="noopener noreferrer" className={cn(buttonClass(variant, 'gap-2.5 pr-2'), className)}>{children}<ArrowDot lime={variant === 'primary'} /></a>;

const TONE = { mute: 'bg-sunk text-mute', brand: 'bg-brand-soft text-brand-ink', good: 'bg-good-soft text-good', warn: 'bg-warn-soft text-warn', bad: 'bg-bad-soft text-bad', lime: 'bg-lime text-lime-ink' };
export const Badge = ({ className, tone = 'mute', ...p }: HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof TONE }) =>
  <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold', TONE[tone], className)} {...p} />;

const field = 'h-10 rounded-full border border-line bg-card px-4 text-sm transition-colors placeholder:text-mute/60 focus:border-brand';
const width = (c?: string) => (/(^|\s)w-/.test(c ?? '') ? '' : 'w-full');
export const Input = ({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) => <input className={cn(field, width(className), className)} {...p} />;
export const Select = ({ className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => <select className={cn(field, width(className), className)} {...p} />;
export const Label = ({ className, ...p }: HTMLAttributes<HTMLLabelElement>) => <label className={cn('block space-y-1.5 text-xs font-semibold text-mute', className)} {...p} />;

/** Number that counts up to its target. */
export function useCountUp(target: number, ms = 700) {
  const [v, setV] = useState(0); const from = useRef(0);
  useEffect(() => {
    if (reduced()) { setV(target); from.current = target; return; }
    const start = performance.now(), a = from.current; let raf = 0;
    const tick = (t: number) => { const p = Math.min(1, (t - start) / ms), val = Math.round(a + (target - a) * (1 - Math.pow(1 - p, 3))); setV(val); from.current = val; if (p < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

/** Circular match score whose arc draws itself. */
export function ScoreRing({ score, size = 56 }: { score: number; size?: number }) {
  const r = 24, c = 2 * Math.PI * r;
  const color = score >= 75 ? 'var(--color-good)' : score >= 60 ? 'var(--color-brand)' : 'var(--color-mute)';
  return <div role="img" aria-label={`${score} percent match`} className="relative shrink-0" style={{ width: size, height: size }}>
    <svg viewBox="0 0 56 56" className="size-full -rotate-90"><circle cx="28" cy="28" r={r} fill="none" stroke="var(--color-sunk)" strokeWidth="5" />
      <circle cx="28" cy="28" r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} className="ring-draw" style={{ '--c': c } as CSSProperties} /></svg>
    <span className="absolute inset-0 grid place-items-center text-sm font-extrabold tabular-nums">{score}</span></div>;
}

/** Company initial in a pastel tile, like the logo tiles in the reference. */
const TILES = ['bg-brand-soft text-brand-ink', 'bg-lime text-lime-ink', 'bg-warn-soft text-warn', 'bg-good-soft text-good', 'bg-bad-soft text-bad'];
export const Avatar = ({ name }: { name: string }) => <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl text-sm font-extrabold', TILES[[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % TILES.length])}>{(name.trim()[0] ?? '?').toUpperCase()}</span>;
