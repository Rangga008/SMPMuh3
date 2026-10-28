import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Container } from './container';

export interface SectionProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
  /** Rendered element — defaults to <section>. */
}

/** Page section with consistent vertical rhythm. */
export function Section({ children, className, ...props }: SectionProps) {
  return (
    <section className={cn('py-14 sm:py-18 lg:py-22', className)} {...props}>
      <Container>{children}</Container>
    </section>
  );
}

export interface SectionHeadingProps {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: 'left' | 'center';
  className?: string;
}

/** Eyebrow + h2 + description block used at the top of sections. */
export function SectionHeading({
  eyebrow,
  title,
  description,
  align = 'center',
  className,
}: SectionHeadingProps) {
  return (
    <div
      className={cn(
        'mb-12 flex flex-col gap-3 sm:mb-16',
        align === 'center' ? 'items-center text-center' : 'items-start',
        className,
      )}
    >
      {eyebrow ? (
        <span
          className={cn(
            'flex items-center gap-2 text-sm font-bold tracking-widest text-primary-700 uppercase',
            'before:h-0.5 before:w-8 before:rounded-full before:bg-accent-500 before:content-[""]',
          )}
        >
          {eyebrow}
        </span>
      ) : null}
      <h2 className="max-w-2xl text-3xl font-extrabold tracking-tight text-sand-950 text-balance sm:text-4xl">
        {title}
      </h2>
      {description ? (
        <p className="max-w-2xl text-base text-sand-700 text-pretty sm:text-lg">
          {description}
        </p>
      ) : null}
    </div>
  );
}
