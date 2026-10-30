'use client';

import { useEffect, useState } from 'react';
import { cn } from '@smpmuh3/ui';

/**
 * Toggle tema gelap/terang situs publik — persist di localStorage('theme'),
 * diterapkan via class `.dark` pada <html> (token warna di styles.css
 * beradaptasi otomatis).
 */
export function ThemeToggle({ mobile = false }: { mobile?: boolean }) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('theme');
    const prefers = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initial = saved ? saved === 'dark' : prefers;
    setDark(initial);
    document.documentElement.classList.toggle('dark', initial);
  }, []);

  const toggle = () => {
    setDark((d) => {
      const next = !d;
      localStorage.setItem('theme', next ? 'dark' : 'light');
      document.documentElement.classList.toggle('dark', next);
      return next;
    });
  };

  const icon = dark ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-5">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4" strokeLinecap="round" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-5">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  if (mobile) {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-label={dark ? 'Beralih ke tema terang' : 'Beralih ke tema gelap'}
        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-sand-800 transition-colors hover:bg-primary-50 hover:text-primary-800 focus-visible:focus-ring"
      >
        <span aria-hidden="true">{icon}</span>
        {dark ? 'Tema Terang' : 'Tema Gelap'}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? 'Beralih ke tema terang' : 'Beralih ke tema gelap'}
      title={dark ? 'Tema terang' : 'Tema gelap'}
      className={cn(
        'flex size-10 items-center justify-center rounded-xl border border-sand-300',
        'bg-white text-sand-800 shadow-xs transition-colors',
        'hover:bg-sand-100 focus-visible:focus-ring',
      )}
    >
      {icon}
    </button>
  );
}
