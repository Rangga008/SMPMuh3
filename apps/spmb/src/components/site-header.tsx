import Link from 'next/link';
import { Container, buttonClasses } from '@smpmuh3/ui';
import { spmbConfig } from '@/config/spmb.config';
import { MobileNav } from './mobile-nav';

const navLinks = [
  { href: '/#tentang', label: 'Tentang' },
  { href: '/#jalur', label: 'Jalur' },
  { href: '/#jadwal', label: 'Jadwal' },
  { href: '/#syarat', label: 'Syarat' },
  { href: '/#biaya', label: 'Biaya' },
  { href: '/#faq', label: 'FAQ' },
  { href: '/#kontak', label: 'Kontak' },
];

export function SiteHeader() {
  const { cta, school, registration, academicYear } = spmbConfig;

  return (
    <header className="sticky top-0 z-40 border-b border-sand-200/80 bg-white/95 backdrop-blur-sm">
      <Container className="flex h-16 items-center justify-between gap-4">
        <Link href="/" className="flex min-w-0 items-center gap-3 focus-visible:focus-ring rounded-lg">
          {/* TODO: replace with the official school logo */}
          <span
            aria-hidden="true"
            className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-700 text-sm font-extrabold text-white"
          >
            M3
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold text-sand-950 sm:text-base">
              {school.shortName}
            </span>
            <span className="block text-xs text-sand-600">
              SPMB {academicYear}
              {registration.status === 'open' ? ` · ${registration.periodLabel}` : ''}
            </span>
          </span>
        </Link>

        <nav aria-label="Menu utama" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-sand-700 hover:bg-primary-50 hover:text-primary-800 focus-visible:focus-ring"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href={cta.checkStatus.href}
            className={buttonClasses({ variant: 'ghost', size: 'sm', className: 'hidden lg:inline-flex' })}
          >
            {cta.checkStatus.label}
          </Link>
          <Link
            href={cta.register.href}
            className={buttonClasses({ variant: 'primary', size: 'sm' })}
          >
            {cta.register.label}
          </Link>
          <MobileNav
            links={navLinks}
            registerHref={cta.register.href}
            registerLabel={cta.register.label}
          />
        </div>
      </Container>
    </header>
  );
}
