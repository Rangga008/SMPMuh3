'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AuthUser } from '@smpmuh3/types';
import { cn } from '@smpmuh3/ui';
import { navFor, type NavItem } from '@/config/nav';
import { getTokens, logout, me } from '@/lib/api';

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const inner = (
    <>
      <span aria-hidden="true">{item.icon}</span>
      <span className="truncate">{item.label}</span>
      {!item.enabled ? (
        <span className="ml-auto rounded-full bg-sand-200 px-2 py-0.5 text-[10px] font-semibold text-sand-600">
          segera
        </span>
      ) : null}
    </>
  );
  const cls = cn(
    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium',
    active
      ? 'bg-primary-100 text-primary-900'
      : item.enabled
        ? 'text-sand-700 hover:bg-sand-100'
        : 'cursor-default text-sand-400',
  );
  return item.enabled && item.href ? (
    <Link href={item.href} className={cls}>
      {inner}
    </Link>
  ) : (
    <span className={cls} aria-disabled="true">
      {inner}
    </span>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!getTokens()) {
      router.replace('/masuk');
      return;
    }
    me()
      .then(setUser)
      .catch(() => {
        logout();
        router.replace('/masuk');
      });
  }, [router]);

  const nav = useMemo(
    () => (user ? navFor(user.permissions) : []),
    [user],
  );

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sand-500">
        Memuat…
      </div>
    );
  }

  const sidebar = (
    <nav aria-label="Navigasi modul" className="flex h-full flex-col">
      <Link
        href="/"
        className="flex items-center gap-3 px-4 py-5 focus-visible:focus-ring"
      >
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary-700 text-sm font-extrabold text-white">
          M3
        </span>
        <span className="font-bold text-sand-950">Admin Sekolah</span>
      </Link>
      <ul className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        {nav.map((item) => (
          <li key={item.key}>
            <NavLink
              item={item}
              active={
                item.href === '/'
                  ? pathname === '/'
                  : item.href !== undefined && pathname.startsWith(item.href)
              }
            />
            {item.children?.length ? (
              <ul className="ml-6 mt-1 space-y-0.5 border-s border-sand-200 pl-2">
                {item.children.map((c) => (
                  <li key={c.key}>
                    <NavLink item={c} active={pathname === c.href} />
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="border-t border-sand-200 p-3">
        <p className="truncate px-2 text-sm font-semibold text-sand-900">
          {user.name}
        </p>
        <p className="mb-2 truncate px-2 text-xs text-sand-500">{user.email}</p>
        <button
          type="button"
          onClick={() => {
            logout();
            router.push('/masuk');
          }}
          className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-sand-700 hover:bg-sand-100 focus-visible:focus-ring"
        >
          Keluar
        </button>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen bg-sand-50">
      {/* Mobile topbar */}
      <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-sand-200 bg-white px-4 py-3 lg:hidden">
        <button
          type="button"
          aria-label={open ? 'Tutup menu' : 'Buka menu'}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex size-10 items-center justify-center rounded-lg border border-sand-300 text-sand-800 focus-visible:focus-ring"
        >
          {open ? '✕' : '☰'}
        </button>
        <span className="font-bold text-sand-950">Admin Sekolah</span>
      </header>

      <div className="lg:flex">
        {/* Sidebar */}
        <aside className="hidden w-64 shrink-0 border-r border-sand-200 bg-white lg:sticky lg:top-0 lg:block lg:h-screen">
          {sidebar}
        </aside>
        {open ? (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div
              className="absolute inset-0 bg-sand-950/40"
              onClick={() => setOpen(false)}
            />
            <aside className="absolute inset-y-0 left-0 w-72 bg-white shadow-xl">
              {sidebar}
            </aside>
          </div>
        ) : null}

        <main id="konten" className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
