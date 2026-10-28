import type { ReactNode } from 'react';
import { Card, Container } from '@smpmuh3/ui';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';

interface AuthShellProps {
  title: string;
  subtitle?: string | undefined;
  children: ReactNode;
}

/** Shared branded shell for the single-card auth/status pages. */
export function AuthShell({ title, subtitle, children }: AuthShellProps) {
  return (
    <>
      <SiteHeader />
      <main
        id="konten"
        className="pattern-islami bg-gradient-to-b from-primary-100/60 via-sand-50 to-sand-50"
      >
        <Container className="flex flex-col items-center py-16 sm:py-24">
          <Card className="w-full max-w-md p-7 sm:p-8">
            <div className="mb-6 flex items-center gap-3.5">
              <span
                aria-hidden="true"
                className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary-700 text-sm font-extrabold text-white"
              >
                M3
              </span>
              <div className="flex flex-col gap-0.5">
                <h1 className="text-xl font-extrabold text-sand-950 sm:text-2xl">
                  {title}
                </h1>
                {subtitle ? (
                  <p className="text-sm text-sand-600">{subtitle}</p>
                ) : null}
              </div>
            </div>
            {children}
          </Card>
        </Container>
      </main>
      <SiteFooter />
    </>
  );
}
