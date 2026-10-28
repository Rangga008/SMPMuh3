import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface ContainerProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

/** Centered content column, responsive gutters. */
export function Container({ children, className, ...props }: ContainerProps) {
  return (
    <div
      className={cn('mx-auto w-full max-w-6xl px-5 sm:px-8 lg:px-10', className)}
      {...props}
    >
      {children}
    </div>
  );
}
