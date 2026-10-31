import Link from 'next/link';
import { spmbConfig } from '@/config/spmb.config';
import { getSchoolPublic } from '@/lib/school';
import { HeaderAuth } from './header-auth';
import { MobileNav } from './mobile-nav';
import { ThemeToggle } from './theme-toggle';

export const NAV_LINKS = [
  { href: '/', label: 'Beranda' },
  { href: '/#alur', label: 'Alur' },
  { href: '/#jalur', label: 'Jalur' },
  { href: '/#biaya', label: 'Biaya' },
  { href: '/#syarat', label: 'Syarat' },
  { href: '/#gelombang', label: 'Gelombang' },
  { href: '/#brosur', label: 'Brosur' },
  { href: '/#kontak', label: 'Kontak' },
];

export async function SiteHeader() {
  const school = await getSchoolPublic();
  const schoolName = school?.name ?? spmbConfig.school.name;
  return (
    <header className="sticky top-0 z-50 border-b border-sand-200/80 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5 focus-visible:focus-ring">
          {school?.hasLogo ? (
            <img
              src={`/logo.png?v=${school.logoVersion ?? 1}`}
              alt={schoolName}
              className="size-9 shrink-0 rounded-xl object-contain"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-700 text-xs font-extrabold tracking-tight text-white"
            >
              M3
            </span>
          )}
          <span className="flex flex-col leading-tight">
            <span className="text-sm font-extrabold tracking-tight text-sand-950">
              SPMB
            </span>
            <span className="hidden text-[11px] font-medium text-sand-500 sm:block">
              {schoolName}
            </span>
          </span>
        </Link>

        <nav aria-label="Navigasi utama" className="mx-auto hidden items-center gap-1 lg:flex">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-sand-700 transition-colors hover:bg-sand-100 hover:text-primary-800 focus-visible:focus-ring"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 sm:ml-auto lg:ml-0">
          <span className="hidden sm:block">
            <ThemeToggle />
          </span>
          <HeaderAuth />
        </div>

        <MobileNav />
      </div>
    </header>
  );
}
