'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_LINKS } from './site-header';
import { HeaderAuth } from './header-auth';
import { ThemeToggle } from './theme-toggle';

const ICONS: Record<string, string> = {
  Beranda: '⌂',
  Alur: '🧭',
  Biaya: '💳',
  Gelombang: '🌊',
  Titipan: '🤝',
  Kontak: '📞',
};

/** Menu hamburger → bottom sheet tile-grid (konsisten dgn app, enak di HP). */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="ml-auto lg:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? 'Tutup menu' : 'Buka menu'}
        onClick={() => setOpen((v) => !v)}
        className="flex size-10 items-center justify-center rounded-xl border border-sand-300 bg-white text-sand-800 shadow-xs transition-colors hover:bg-sand-100 focus-visible:focus-ring"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-5">
          {open ? (
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          ) : (
            <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
          )}
        </svg>
      </button>

      {open ? (
        <div className="fixed inset-0 z-[70]">
          <button
            type="button"
            aria-label="Tutup menu"
            className="absolute inset-0 bg-black/55 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <nav
            aria-label="Navigasi seluler"
            className="absolute inset-x-0 bottom-0 max-h-[80dvh] overflow-y-auto rounded-t-3xl border-t border-sand-200 bg-white shadow-soft"
          >
            <div className="flex items-center justify-between px-5 pb-2 pt-4">
              <p className="font-extrabold text-sand-900">Menu</p>
              <button
                type="button"
                aria-label="Tutup menu"
                onClick={() => setOpen(false)}
                className="flex size-9 items-center justify-center rounded-xl bg-sand-100 text-sand-600"
              >
                ✕
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2.5 px-5 pb-3">
              {NAV_LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="flex flex-col items-center gap-1.5 rounded-2xl border border-sand-200 bg-sand-50 p-3.5 text-center text-sand-800 transition-colors active:bg-primary-50"
                >
                  <span aria-hidden="true" className="text-xl leading-none">
                    {ICONS[l.label] ?? '▪'}
                  </span>
                  <span className="text-xs font-semibold">{l.label}</span>
                </Link>
              ))}
            </div>
            <div className="border-t border-sand-100 px-5 py-3 pb-8">
              <ThemeToggle mobile />
              <HeaderAuth mobile />
            </div>
          </nav>
        </div>
      ) : null}
    </div>
  );
}
