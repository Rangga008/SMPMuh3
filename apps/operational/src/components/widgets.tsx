import type { ReactNode } from 'react';
import { cn } from '@smpmuh3/ui';

export function PageTitle({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string | undefined;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-sand-950">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1 text-sm text-sand-600">{subtitle}</p>
        ) : null}
      </div>
      {actions}
    </div>
  );
}

export function Widget({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label={title}
      className={cn(
        'rounded-2xl border border-sand-200 bg-white p-5',
        className,
      )}
    >
      <h2 className="mb-3 text-sm font-bold tracking-wide text-sand-600 uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Placeholder widget for modules not yet built — no invented numbers. */
export function PendingWidget({ module }: { module: string }) {
  return (
    <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-sand-300 text-sm text-sand-400">
      Modul {module} belum tersedia
    </div>
  );
}
