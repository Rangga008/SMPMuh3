import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 rounded-full font-semibold ' +
  'transition-colors duration-150 focus-visible:focus-ring ' +
  'disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none';

const variants: Record<Variant, string> = {
  primary:
    'bg-primary-700 text-white hover:bg-primary-800 active:bg-primary-900',
  secondary:
    'bg-accent-300 text-accent-950 hover:bg-accent-400 active:bg-accent-500',
  outline:
    'border-2 border-primary-700 text-primary-800 hover:bg-primary-50 ' +
    'active:bg-primary-100',
  ghost: 'text-primary-800 hover:bg-primary-50 active:bg-primary-100',
};

const sizes: Record<Size, string> = {
  sm: 'h-9 px-4 text-sm',
  md: 'h-11 px-6 text-base',
  lg: 'h-13 px-8 text-lg',
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
