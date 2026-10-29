import Link from 'next/link';
import { Badge, Container, buttonClasses } from '@smpmuh3/ui';
import { spmbConfig } from '@/config/spmb.config';

const statusBadge: Record<string, { tone: 'primary' | 'accent' | 'neutral'; label: string }> = {
  open: { tone: 'primary', label: 'Pendaftaran dibuka' },
  soon: { tone: 'accent', label: 'Segera dibuka' },
  closed: { tone: 'neutral', label: 'Pendaftaran ditutup' },
};

function SunMotif({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 100 100" className={className}>
      {/* Subtle Muhammadiyah sun-ray motif */}
      <g stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        {[...Array(12)].map((_, i) => {
          const a = (i * Math.PI) / 6;
          return (
            <line
              key={i}
              x1={50 + 34 * Math.cos(a)}
              y1={50 + 34 * Math.sin(a)}
              x2={50 + 44 * Math.cos(a)}
              y2={50 + 44 * Math.sin(a)}
            />
          );
        })}
      </g>
      <circle cx="50" cy="50" r="26" fill="currentColor" opacity="0.4" />
    </svg>
  );
}

export function Hero() {
  const { school, academicYear, registration, cta } = spmbConfig;
  const status = statusBadge[registration.status]!;

  const facts = [
    { label: 'Status', value: status.label },
    { label: 'Tahun Ajaran', value: academicYear },
    { label: 'Proses', value: '100% Online' },
  ];

  return (
    <div className="pattern-islami relative overflow-hidden bg-gradient-to-b from-primary-100/60 via-sand-50 to-sand-50">
      <div
        aria-hidden="true"
        className="absolute -top-32 -right-32 size-[28rem] rounded-full bg-primary-200/40 blur-3xl motion-reduce:hidden"
      />
      <div
        aria-hidden="true"
        className="absolute -bottom-40 -left-32 size-[28rem] rounded-full bg-accent-200/35 blur-3xl motion-reduce:hidden"
      />
      <SunMotif className="absolute top-20 right-[10%] size-24 text-primary-400/30 max-md:hidden" />
      <SunMotif className="absolute bottom-24 left-[6%] size-16 text-accent-500/25 max-lg:hidden" />

      <Container className="relative flex flex-col items-center gap-6 pt-16 pb-14 text-center sm:pt-24 sm:pb-16">
        <Badge tone={status.tone}>
          {status.label} · Tahun Ajaran {academicYear}
        </Badge>
        <h1 className="max-w-3xl text-4xl font-extrabold tracking-tight text-balance text-sand-950 sm:text-5xl lg:text-6xl">
          Sistem Penerimaan{' '}
          <span className="relative whitespace-nowrap text-primary-800">
            Murid Baru
            <svg
              aria-hidden="true"
              viewBox="0 0 220 12"
              className="absolute -bottom-2 left-0 w-full text-accent-400"
            >
              <path
                d="M3 9c40-6 140-6 214-3"
                stroke="currentColor"
                strokeWidth="5"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
          </span>
        </h1>
        <p className="max-w-xl text-lg font-semibold text-primary-800">
          {school.name}
        </p>
        <p className="max-w-2xl text-base text-pretty text-sand-700 sm:text-lg">
          {school.description} Daftarkan putra-putri Anda melalui jalur
          pendaftaran online — mudah, jelas, dan terpantau.
        </p>
        <div className="mt-2 flex flex-col items-center gap-3 sm:flex-row">
          <Link
            href={cta.register.href}
            className={buttonClasses({
              variant: 'primary',
              size: 'lg',
              className: 'shadow-lift',
            })}
          >
            {cta.register.label}
          </Link>
          <Link
            href={cta.checkStatus.href}
            className={buttonClasses({ variant: 'outline', size: 'lg' })}
          >
            {cta.checkStatus.label}
          </Link>
        </div>
        <p className="text-sm text-sand-600">{registration.note}</p>

        <dl className="mt-6 grid w-full max-w-2xl grid-cols-1 gap-px overflow-hidden rounded-2xl border border-sand-200 bg-sand-200 shadow-card sm:grid-cols-3">
          {facts.map((fact) => (
            <div key={fact.label} className="bg-white px-6 py-5">
              <dt className="text-xs font-bold tracking-wider text-sand-500 uppercase">
                {fact.label}
              </dt>
              <dd className="mt-1 text-base font-bold text-primary-800">
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>
      </Container>
    </div>
  );
}
