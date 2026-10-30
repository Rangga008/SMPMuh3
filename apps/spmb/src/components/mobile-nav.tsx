'use client';

import { useState } from 'react';
import Link from 'next/link';
import { NAV_LINKS } from './site-header';
import { HeaderAuth } from './header-auth';

export function MobileNav() {
  const [open, setOpen] = useState(false);

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
        <nav
          aria-label="Navigasi seluler"
          className="absolute inset-x-0 top-16 border-b border-sand-200 bg-white px-4 pb-4 pt-2 shadow-soft sm:px-6"
        >
          {NAV_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="block rounded-xl px-3 py-2.5 text-sm font-medium text-sand-800 transition-colors hover:bg-primary-50 hover:text-primary-800 focus-visible:focus-ring"
            >
              {l.label}
            </Link>
          ))}
          <HeaderAuth mobile />
        </nav>
      ) : null}
    </div>
  );
}
