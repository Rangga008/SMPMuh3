'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AuthUser } from '@smpmuh3/types';
import { cn } from '@smpmuh3/ui';
import { navFor, type NavItem } from '@/config/nav';
import { getSchool, getTokens, logout, me, type School } from '@/lib/api';

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const inner = (
    <>
      <span aria-hidden="true" className="w-5 text-center opacity-80">
        {item.icon}
      </span>
      <span className="truncate">{item.label}</span>
      {!item.enabled ? (
        <span className="ml-auto rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-sky-300">
          segera
        </span>
      ) : null}
    </>
  );
  const cls = cn(
    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors motion-reduce:transition-none',
    active
      ? 'bg-white/15 font-bold text-white shadow-sm'
      : item.enabled
        ? 'text-sky-200 hover:bg-white/10 hover:text-white'
        : 'cursor-default text-sky-300/40',
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

/** Item nav dengan submenu — dropdown collapsible; terbuka otomatis bila anak aktif. */
function NavGroup({ item, pathname }: { item: NavItem; pathname: string }) {
  const childActive = item.children?.some((c) => c.href && pathname.startsWith(c.href)) ?? false;
  const [open, setOpen] = useState(childActive);
  useEffect(() => {
    if (childActive) setOpen(true);
  }, [childActive]);

  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors motion-reduce:transition-none',
          childActive
            ? 'bg-white/10 font-bold text-white'
            : item.enabled
              ? 'text-sky-200 hover:bg-white/10 hover:text-white'
              : 'cursor-default text-sky-300/40',
        )}
      >
        <span aria-hidden="true" className="w-5 text-center opacity-80">
          {item.icon}
        </span>
        <span className="truncate">{item.label}</span>
        {!item.enabled ? (
          <span className="ml-auto rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-sky-300">
            segera
          </span>
        ) : (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            className={cn('ml-auto size-3.5 transition-transform motion-reduce:transition-none', open && 'rotate-180')}
          >
            <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      {open && item.children?.length ? (
        <ul className="ml-5 mt-1 space-y-0.5 border-s border-white/10 pl-2.5">
          {item.children.map((c) => (
            <li key={c.key}>
              <NavLink item={c} active={pathname === c.href} />
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/* Module-level user cache — survives client-side navigation so the Shell
 * does not re-fetch /auth/me and flash its loading state on every page. */
let cachedUser: AuthUser | null = null;
let cachedSchool: School | null | undefined;

export function Shell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(cachedUser);
  const [school, setSchool] = useState<School | null>(cachedSchool ?? null);
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(false);

  // Tema gelap/terang — disimpan di localStorage, diterapkan via class
  // `.dark` di <html> (token warna di styles.css otomatis beradaptasi).
  useEffect(() => {
    const saved = localStorage.getItem('theme');
    const prefers = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initial = saved ? saved === 'dark' : prefers;
    setDark(initial);
    document.documentElement.classList.toggle('dark', initial);
  }, []);

  const toggleTheme = () => {
    setDark((d) => {
      const next = !d;
      localStorage.setItem('theme', next ? 'dark' : 'light');
      document.documentElement.classList.toggle('dark', next);
      return next;
    });
  };

  useEffect(() => {
    if (!getTokens()) {
      router.replace('/masuk');
      return;
    }
    // Tampilkan cache seketika (tanpa flash), lalu selalu revalidasi di
    // background agar permission baru (mis. finance) langsung muncul.
    if (cachedUser) setUser(cachedUser);
    const refresh = () =>
      me()
        .then((u) => {
          cachedUser = u;
          setUser(u);
        })
        .catch(() => {
          if (!cachedUser) {
            logout();
            router.replace('/masuk');
          }
        });
    void refresh();
    // Revalidasi saat jendela kembali fokus — perubahan permission oleh
    // admin lain langsung terlihat tanpa perlu reload.
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    // Logo/nama sekolah untuk brand sidebar.
    if (cachedSchool === undefined) {
      getSchool()
        .then((s) => {
          cachedSchool = s;
          setSchool(s);
        })
        .catch(() => {
          cachedSchool = null;
        });
    }
    return () => window.removeEventListener('focus', onFocus);
  }, [router]);

  const nav = useMemo(
    () => (user ? navFor(user.permissions) : []),
    [user],
  );

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-sand-100/70">
        <div className="flex flex-col items-center gap-3">
          <span
            aria-hidden="true"
            className="size-8 animate-spin rounded-full border-[3px] border-primary-200 border-t-primary-700 motion-reduce:animate-none"
          />
          <p className="text-sm font-medium text-sand-500">Memuat…</p>
        </div>
      </div>
    );
  }

  const sidebar = (
    <nav
      aria-label="Navigasi modul"
      className="pattern-islami-light flex h-full flex-col bg-primary-950 text-sky-100"
    >
      <Link
        href="/"
        className="flex items-center gap-3 border-b border-white/10 px-4 py-5 focus-visible:focus-ring"
      >
        {school?.logoUrl ? (
          <img
            src="/logo.png"
            alt=""
            className="size-9 shrink-0 rounded-xl bg-[#ffffff] object-contain p-0.5"
          />
        ) : (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-400 text-sm font-extrabold text-primary-950">
            M3
          </span>
        )}
        <span className="truncate font-extrabold tracking-tight text-white">
          {school?.name ?? 'Admin Sekolah'}
        </span>
      </Link>

      <ul className="dark-scroll flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {nav.map((item) =>
          item.children?.length ? (
            <NavGroup key={item.key} item={item} pathname={pathname} />
          ) : (
            <li key={item.key}>
              <NavLink
                item={item}
                active={
                  item.href === '/'
                    ? pathname === '/'
                    : item.href !== undefined && pathname.startsWith(item.href)
                }
              />
            </li>
          ),
        )}
      </ul>

      <div className="border-t border-white/10 p-3">
        <Link
          href="/profil"
          title="Lihat profil saya"
          className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2.5 transition-colors hover:bg-white/10 focus-visible:focus-ring"
        >
          <span
            aria-hidden="true"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-400 text-xs font-extrabold text-primary-950"
          >
            {(user.name || user.email || '?').slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-white">
              {user.name}
            </span>
            <span className="block truncate text-xs text-sky-300">
              {user.email}
            </span>
          </span>
          <span aria-hidden="true" className="text-sky-300/70">
            ›
          </span>
        </Link>
        <Link
          href="/pengaturan/profil"
          className="mt-2 flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-sky-200 transition-colors hover:bg-white/10 hover:text-white focus-visible:focus-ring"
        >
          <span aria-hidden="true" className="w-5 text-center">
            ⚙
          </span>
          Pengaturan
        </Link>
        <button
          type="button"
          onClick={() => {
            cachedUser = null;
            logout();
            router.push('/masuk');
          }}
          className="mt-1 flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-red-300 transition-colors hover:bg-red-500/10 hover:text-red-200 focus-visible:focus-ring"
        >
          <span aria-hidden="true" className="w-5 text-center">
            ⎋
          </span>
          Keluar
        </button>
      </div>
    </nav>
  );

  /** Tombol ikon tema — dipasang di topbar atas (mobile & desktop). */
  const themeButton = (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={dark ? 'Beralih ke tema terang' : 'Beralih ke tema gelap'}
      title={dark ? 'Tema Terang' : 'Tema Gelap'}
      className="flex size-10 items-center justify-center rounded-xl border border-sand-200 bg-white text-sand-600 shadow-sm transition-colors hover:bg-sand-50 hover:text-primary-700 focus-visible:focus-ring"
    >
      <span aria-hidden="true" className="text-base leading-none">
        {dark ? '☀' : '☾'}
      </span>
    </button>
  );

  return (
    <div className="min-h-screen bg-sand-100/70">
      {/* Mobile topbar */}
      <header className="pattern-islami-light sticky top-0 z-40 flex items-center gap-3 border-b border-white/10 bg-primary-950 px-4 py-3 lg:hidden">
        <button
          type="button"
          aria-label={open ? 'Tutup menu' : 'Buka menu'}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex size-10 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:focus-ring"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-5">
            {open ? (
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            ) : (
              <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
            )}
          </svg>
        </button>
        {school?.logoUrl ? (
          <img src="/logo.png" alt="" className="size-8 rounded-lg bg-[#ffffff] object-contain p-0.5" />
        ) : null}
        <span className="truncate font-extrabold tracking-tight text-white">
          {school?.name ?? 'Admin Sekolah'}
        </span>
        <span className="ml-auto flex items-center gap-2">
          <Link
            href="/profil"
            aria-label="Profil saya"
            title="Profil saya"
            className="flex size-10 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-sm font-extrabold text-white transition-colors hover:bg-white/20 focus-visible:focus-ring"
          >
            {(user.name || user.email || '?').slice(0, 1).toUpperCase()}
          </Link>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={dark ? 'Beralih ke tema terang' : 'Beralih ke tema gelap'}
            title={dark ? 'Tema Terang' : 'Tema Gelap'}
            className="flex size-10 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:focus-ring"
          >
            <span aria-hidden="true" className="text-base leading-none">
              {dark ? '☀' : '☾'}
            </span>
          </button>
        </span>
      </header>

      <div className="lg:flex">
        {/* Sidebar desktop */}
        <aside className="hidden w-64 shrink-0 lg:sticky lg:top-0 lg:block lg:h-screen">
          {sidebar}
        </aside>
        {/* Drawer mobile */}
        {open ? (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div
              className="absolute inset-0 bg-black/55"
              onClick={() => setOpen(false)}
            />
            <aside className="absolute inset-y-0 left-0 w-72 shadow-2xl">
              {sidebar}
            </aside>
          </div>
        ) : null}

        <main id="konten" className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
          {/* Pill aksi atas — desktop: profil + toggle tema */}
          <div className="pointer-events-none sticky top-4 z-30 -mt-1 mb-4 hidden justify-end lg:flex">
            <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-sand-200 bg-white/80 p-1.5 shadow-soft backdrop-blur">
              <Link
                href="/profil"
                title="Profil saya"
                className="flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-sm font-semibold text-sand-700 transition-colors hover:bg-sand-100 focus-visible:focus-ring"
              >
                <span
                  aria-hidden="true"
                  className="flex size-7 items-center justify-center rounded-full bg-primary-700 text-[11px] font-extrabold text-white"
                >
                  {(user.name || user.email || '?').slice(0, 1).toUpperCase()}
                </span>
                <span className="max-w-40 truncate">{user.name}</span>
              </Link>
              {themeButton}
            </div>
          </div>
          <div key={pathname} className="page-fade mx-auto max-w-6xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
