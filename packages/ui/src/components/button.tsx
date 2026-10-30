import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const base =
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-xl font-semibold ' +
  'shadow-sm transition-all duration-150 focus-visible:focus-ring ' +
  'disabled:pointer-events-none disabled:opacity-55 motion-reduce:transition-none';

const variants: Record<Variant, string> = {
  primary:
    'bg-primary-700 text-white hover:bg-primary-800 hover:shadow-md active:bg-primary-900',
  secondary:
    'bg-accent-400 text-primary-950 hover:bg-accent-300 hover:shadow-md active:bg-accent-500',
  outline:
    'border border-sand-300 bg-white text-primary-800 shadow-none ' +
    'hover:border-primary-600 hover:bg-primary-50 active:bg-primary-100',
  ghost:
    'bg-transparent text-primary-800 shadow-none hover:bg-primary-100 active:bg-primary-200/70',
  danger:
    'bg-red-600 text-white hover:bg-red-700 hover:shadow-md active:bg-red-800',
};

const sizes: Record<Size, string> = {
  sm: 'h-9 px-4 text-sm',
  md: 'h-11 px-5 text-sm sm:text-base',
  lg: 'h-12 px-7 text-base sm:text-lg',
};

export function buttonClasses(opts?: {
  variant?: Variant | undefined;
  size?: Size | undefined;
  className?: string | undefined;
}): string {
  return cn(base, variants[opts?.variant ?? 'primary'], sizes[opts?.size ?? 'md'], opts?.className);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

export function Button({ variant, size, className, children, ...props }: ButtonProps) {
  return (
    <button className={buttonClasses({ variant, size, className })} {...props}>
      {children}
    </button>
  );
}
