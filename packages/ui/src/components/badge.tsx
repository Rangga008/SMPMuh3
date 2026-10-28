import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn';

type Tone = 'primary' | 'accent' | 'neutral';

const tones: Record<Tone, string> = {
  primary: 'bg-primary-50 text-primary-800 ring-primary-200',
  accent: 'bg-accent-100 text-accent-800 ring-accent-200',
  neutral: 'bg-sand-100 text-sand-700 ring-sand-200',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  children: ReactNode;
}

export function Badge({ tone = 'primary', children, className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset',
        tones[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
