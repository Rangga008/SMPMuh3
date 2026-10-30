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
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
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
  action,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className={cn(
        'rounded-3xl border border-sand-200 bg-white p-5 shadow-card sm:p-6',
        className,
      )}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-sand-500">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Big stat card used on the dashboard. */
export function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: ReactNode;
  accent?: 'primary' | 'accent' | undefined;
}) {
  return (
    <div className="rounded-3xl border border-sand-200 bg-white p-5 shadow-card">
      <p className="text-xs font-bold uppercase tracking-wider text-sand-500">
        {label}
      </p>
      <p
        className={cn(
          'mt-2 text-2xl font-extrabold tracking-tight',
          accent === 'accent' ? 'text-accent-700' : 'text-primary-800',
        )}
      >
        {value}
      </p>
    </div>
  );
}

/** Placeholder widget for modules not yet built — no invented numbers. */
export function PendingWidget({ module }: { module: string }) {
  return (
    <div className="flex h-24 items-center justify-center rounded-2xl border border-dashed border-sand-300 bg-sand-50 text-sm text-sand-400">
      Modul {module} belum tersedia
    </div>
  );
}
