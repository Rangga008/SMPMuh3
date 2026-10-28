import Link from 'next/link';
import { Container, buttonClasses } from '@smpmuh3/ui';
import { spmbConfig } from '@/config/spmb.config';

export function CtaBanner() {
  const { cta, academicYear } = spmbConfig;

  return (
    <div className="pattern-islami-light relative overflow-hidden bg-gradient-to-br from-primary-800 via-primary-700 to-primary-900">
      <div
        aria-hidden="true"
        className="absolute inset-x-0 -top-24 h-48 bg-gradient-to-b from-white/10 to-transparent"
      />
      <Container className="relative flex flex-col items-center gap-6 py-16 text-center sm:py-20">
        <h2 className="max-w-2xl text-3xl font-extrabold tracking-tight text-balance text-white sm:text-4xl">
          Daftarkan putra-putri Anda sekarang
        </h2>
        <p className="max-w-xl text-pretty text-primary-100">
          Pendaftaran tahun ajaran {academicYear} dilakukan secara online.
          Prosesnya cepat dan dapat dipantau kapan saja.
        </p>
        <Link
          href={cta.register.href}
          className={buttonClasses({
            variant: 'secondary',
            size: 'lg',
            className: 'shadow-lift',
          })}
        >
          {cta.register.label}
        </Link>
      </Container>
    </div>
  );
}
