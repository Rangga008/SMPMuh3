'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { SchoolMark } from './school-mark';
import type { CbtLogin } from '@/lib/cbt';

export const KEY = 'cbt.login';
export interface LoginState extends CbtLogin {
  nis: string;
  password: string;
}

const NAV = [
  { href: '/dashboard', label: 'Beranda', icon: '⌂' },
  { href: '/dashboard/masuk', label: 'Kode Ujian', icon: '🔑' },
  { href: '/dashboard/jadwal', label: 'Jadwal', icon: '📅' },
  { href: '/dashboard/riwayat', label: 'Riwayat', icon: '📋' },
  { href: '/dashboard/profil', label: 'Profil', icon: '👤' },
];

export function useCbtLogin() {
  const router = useRouter();
  const [login, setLogin] = useState<LoginState | null>(null);
  useEffect(() => {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) {
      router.replace('/');
      return;
    }
    try {
      setLogin(JSON.parse(raw) as LoginState);
    } catch {
      sessionStorage.removeItem(KEY);
      router.replace('/');
    }
  }, [router]);
  return login;
}

export function cbtLogout(router: { replace: (p: string) => void }) {
  sessionStorage.removeItem(KEY);
  sessionStorage.removeItem('cbt.token');
  router.replace('/');
}

/** Shell dashboard CBT — topbar + bottom-nav mobile-first. */
export function DashShell({ title, children }: { title: string; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const login = useCbtLogin();

  return (
    <main className="min-h-dvh bg-gradient-to-b from-primary-50 via-sand-50 to-sand-100 pb-24 sm:pb-8">
      <header className="sticky top-0 z-40 border-b border-sand-200/60 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <Link href="/dashboard" aria-label="Beranda CBT" className="focus-visible:focus-ring">
            <SchoolMark className="size-9" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-extrabold text-sand-950">{title}</p>
            {login ? (
              <p className="truncate text-xs text-sand-500">
                {login.student.name} · {login.student.className}
              </p>
            ) : null}
          </div>
          <nav className="hidden items-center gap-1 sm:flex">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
                  pathname === n.href ? 'bg-primary-700 text-white' : 'text-sand-600 hover:bg-sand-100'
                }`}
              >
                {n.label}
              </Link>
            ))}
            <button
              type="button"
              onClick={() => cbtLogout(router)}
              className="rounded-xl px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50"
            >
              Keluar
            </button>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-5">{children}</div>

      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-sand-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-semibold transition-colors ${
              pathname === n.href ? 'text-primary-700' : 'text-sand-500'
            }`}
          >
            <span aria-hidden="true" className="text-lg leading-none">{n.icon}</span>
            <span className="truncate px-1">{n.label}</span>
            <span className={`h-0.5 w-5 rounded-full ${pathname === n.href ? 'bg-primary-600' : 'bg-transparent'}`} />
          </Link>
        ))}
        <button
          type="button"
          onClick={() => cbtLogout(router)}
          className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-semibold text-red-500"
        >
          <span aria-hidden="true" className="text-lg leading-none">⎋</span>
          Keluar
          <span className="h-0.5 w-5 rounded-full bg-transparent" />
        </button>
      </nav>
    </main>
  );
}
