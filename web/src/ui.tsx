// Small shadcn/ui-style primitives (same class conventions), written by hand to avoid the CLI.
import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes } from 'react';

export const cn = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(' ');

export const Card = ({ className, ...p }: HTMLAttributes<HTMLDivElement>) =>
  <div className={cn('rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900', className)} {...p} />;

export const Button = ({ className, variant = 'default', ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'outline' }) =>
  <button className={cn('inline-flex h-9 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-teal-600 disabled:opacity-50',
    variant === 'default' ? 'bg-teal-700 text-white hover:bg-teal-800' : 'border border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800', className)} {...p} />;

export const Badge = ({ className, ...p }: HTMLAttributes<HTMLSpanElement>) =>
  <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium', className)} {...p} />;

const field = 'h-9 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900';
export const Input = ({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) => <input className={cn(field, className)} {...p} />;
export const Select = ({ className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => <select className={cn(field, className)} {...p} />;
