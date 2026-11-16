// Small shadcn/ui-style primitives (same class conventions), written by hand to avoid the CLI.
import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes } from 'react';

export const cn = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(' ');

export const Card = ({ className, ...p }: HTMLAttributes<HTMLDivElement>) =>
  <div className={cn('min-w-0 rounded-xl border border-line bg-card p-4', className)} {...p} />;

export const Button = ({ className, variant = 'primary', ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'outline' | 'ghost' }) =>
  <button className={cn('inline-flex h-9 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
    variant === 'primary' && 'bg-brand text-white hover:opacity-90 dark:text-canvas',
    variant === 'outline' && 'border border-line bg-card hover:bg-sunk',
    variant === 'ghost' && 'text-brand-ink hover:bg-brand-soft', className)} {...p} />;

const TONE = { mute: 'bg-sunk text-mute', brand: 'bg-brand-soft text-brand-ink', good: 'bg-good-soft text-good', warn: 'bg-warn-soft text-warn', bad: 'bg-bad-soft text-bad' };
export const Badge = ({ className, tone = 'mute', ...p }: HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof TONE }) =>
  <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium', TONE[tone], className)} {...p} />;

const field = 'h-9 w-full rounded-lg border border-line bg-card px-3 text-sm placeholder:text-mute/70';
export const Input = ({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) => <input className={cn(field, className)} {...p} />;
export const Select = ({ className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => <select className={cn(field, className)} {...p} />;
export const Label = ({ className, ...p }: HTMLAttributes<HTMLLabelElement>) => <label className={cn('block space-y-1 text-xs font-medium text-mute', className)} {...p} />;

/** Circular match score. */
export function ScoreRing({ score }: { score: number }) {
  const color = score >= 80 ? 'var(--color-good)' : score >= 60 ? 'var(--color-warn)' : 'var(--color-mute)';
  return <div role="img" aria-label={`${score} percent match`} className="grid size-14 shrink-0 place-items-center rounded-full"
    style={{ background: `conic-gradient(${color} ${score * 3.6}deg, var(--color-sunk) 0)` }}>
    <div className="grid size-11 place-items-center rounded-full bg-card font-display text-sm font-bold tabular-nums">{score}</div></div>;
}
