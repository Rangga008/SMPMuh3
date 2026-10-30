import Link from 'next/link';
import type { ReactNode } from 'react';
import { spmbConfig } from '@/config/spmb.config';

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="relative flex min-h-[calc(100dvh-4rem)] items-center justify-center overflow-hidden bg-gradient-to-b from-primary-50 via-sand-50 to-sand-100 px-4 py-10 sm:px-6">
      <div aria-hidden="true" className="pattern-islami pointer-events-none absolute inset-0" />
      <div className="relative w-full max-w-md">
        <div className="text-center">
          <Link
            href="/"
            className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary-700 text-base font-extrabold text-white shadow-card focus-visible:focus-ring"
          >
            M3
          </Link>
          <h1 className="mt-5 text-2xl font-extrabold tracking-tight text-sand-950">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-1.5 text-sm text-sand-600">{subtitle}</p>
          ) : null}
        </div>

        <div className="mt-6 rounded-3xl border border-sand-200 bg-white p-6 shadow-card sm:p-8">
          {children}
        </div>

        {footer ? (
          <p className="mt-5 text-center text-sm text-sand-600">{footer}</p>
        ) : null}

        <p className="mt-6 text-center text-xs text-sand-500">
          {spmbConfig.school.name} · TA {spmbConfig.academicYear}
        </p>
      </div>
    </main>
  );
}
