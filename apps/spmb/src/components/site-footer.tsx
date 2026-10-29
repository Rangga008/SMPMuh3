import Link from 'next/link';
import { Container } from '@smpmuh3/ui';
import { spmbConfig } from '@/config/spmb.config';

export function SiteFooter() {
  const { school, cta } = spmbConfig;

  return (
    <footer className="pattern-islami-light bg-primary-950 text-primary-100">
      <Container className="grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-3">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="flex size-9 items-center justify-center rounded-lg bg-accent-400 text-sm font-extrabold text-primary-950"
            >
              M3
            </span>
            <p className="text-base font-bold text-white">{school.name}</p>
          </div>
          <p className="max-w-xs text-sm leading-relaxed text-primary-200/90">
            {school.description}
          </p>
        </div>

        <nav aria-label="Tautan situs" className="flex flex-col gap-3">
          <p className="text-sm font-bold tracking-wide text-accent-300 uppercase">
            Navigasi
          </p>
          <ul className="flex flex-col gap-2 text-sm text-primary-200">
            <li><Link className="hover:text-white focus-visible:focus-ring rounded" href="/#jadwal">Jadwal pendaftaran</Link></li>
            <li><Link className="hover:text-white focus-visible:focus-ring rounded" href="/#syarat">Syarat pendaftaran</Link></li>
            <li><Link className="hover:text-white focus-visible:focus-ring rounded" href="/#biaya">Informasi biaya</Link></li>
            <li><Link className="hover:text-white focus-visible:focus-ring rounded" href={cta.checkStatus.href}>{cta.checkStatus.label}</Link></li>
          </ul>
        </nav>

        <div className="flex flex-col gap-3">
          <p className="text-sm font-bold tracking-wide text-accent-300 uppercase">
            Siap mendaftar?
          </p>
          <Link
            href={cta.register.href}
            className="w-fit rounded-full bg-accent-400 px-6 py-2.5 text-sm font-bold text-primary-950 transition-colors hover:bg-accent-300 focus-visible:focus-ring"
          >
            {cta.register.label}
          </Link>
        </div>
      </Container>
      <div className="border-t border-white/10">
        <Container className="flex flex-col gap-1 py-5 text-xs text-primary-300 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} {school.name}</p>
          <p>SPMB — Sistem Penerimaan Murid Baru</p>
        </Container>
      </div>
    </footer>
  );
}
