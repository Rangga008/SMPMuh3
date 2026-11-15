'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { cn } from '@smpmuh3/ui';
import { AUTH_EVENT, getTokens, me } from '@/lib/api';

const TABS = [
  { href: '/', label: 'Beranda', icon: '⌂' },
  { href: '/cek-status', label: 'Cek Status', icon: '🔍' },
  { href: '/daftar', label: 'Daftar', icon: '✏' },
] as const;

const active = (pathname: string, href: string) =>
  href === '/' ? pathname === '/' : pathname.startsWith(href);

/** Bottom navigation mobile — aksi utama orang tua selalu terjangkau jempol. */
export function BottomNav() {
  const pathname = usePathname();
  const [authed, setAuthed] = useState(false);

  const check = useCallback(() => {
    if (!getTokens()?.accessToken) {
      setAuthed(false);
      return;
    }
    me().then(
      () => setAuthed(true),
      () => setAuthed(false),
    );
  }, []);

  useEffect(check, [check, pathname]);
  useEffect(() => {
    window.addEventListener(AUTH_EVENT, check);
    return () => window.removeEventListener(AUTH_EVENT, check);
  }, [check]);

  const account = authed
    ? { href: '/akun', label: 'Akun Saya', icon: '👤' }
    : { href: '/masuk', label: 'Masuk', icon: '👤' };

  return (
    <nav
      aria-label="Navigasi cepat"
      className="fixed inset-x-0 bottom-0 z-50 flex items-stretch border-t border-sand-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_12px_rgba(0,0,0,0.06)] backdrop-blur lg:hidden"
    >
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={cn(
            'flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-semibold',
            active(pathname, t.href) ? 'text-primary-700' : 'text-sand-500',
          )}
        >
          <span aria-hidden="true" className="text-xl leading-none">{t.icon}</span>
          {t.label}
          <span className={cn('h-0.5 w-6 rounded-full', active(pathname, t.href) ? 'bg-primary-600' : 'bg-transparent')} />
        </Link>
      ))}
      <Link
        href={account.href}
        className={cn(
          'flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-semibold',
          active(pathname, account.href) ? 'text-primary-700' : 'text-sand-500',
        )}
      >
        <span aria-hidden="true" className="text-xl leading-none">{account.icon}</span>
        {account.label}
        <span className={cn('h-0.5 w-6 rounded-full', active(pathname, account.href) ? 'bg-primary-600' : 'bg-transparent')} />
      </Link>
    </nav>
  );
}
