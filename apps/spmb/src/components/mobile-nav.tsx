'use client';

import Link from 'next/link';
import { useState } from 'react';
import { buttonClasses } from '@smpmuh3/ui';

interface NavLink {
  href: string;
  label: string;
}

interface MobileNavProps {
  links: NavLink[];
  registerHref: string;
  registerLabel: string;
}

export function MobileNav({ links, registerHref, registerLabel }: MobileNavProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="mobile-nav"
        aria-label={open ? 'Tutup menu' : 'Buka menu'}
        onClick={() => setOpen((v) => !v)}
        className="focus-ring inline-flex size-10 items-center justify-center rounded-lg text-sand-900"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          className="size-6"
        >
          {open ? (
            <path
              d="m6 6 12 12M18 6 6 18"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          ) : (
            <path
              d="M4 7h16M4 12h16M4 17h16"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          )}
        </svg>
      </button>

      {open ? (
        <nav
          id="mobile-nav"
          aria-label="Menu utama"
          className="absolute inset-x-0 top-full border-b border-sand-200 bg-white shadow-lg"
        >
          <ul className="flex flex-col px-5 py-4">
            {links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-3 py-3 font-medium text-sand-800 hover:bg-primary-50 focus-visible:focus-ring"
                >
                  {link.label}
                </Link>
              </li>
            ))}
            <li className="mt-2 border-t border-sand-100 pt-4 pb-2">
              <Link
                href={registerHref}
                onClick={() => setOpen(false)}
                className={buttonClasses({ variant: 'primary', className: 'w-full' })}
              >
                {registerLabel}
              </Link>
            </li>
          </ul>
        </nav>
      ) : null}
    </div>
  );
}
