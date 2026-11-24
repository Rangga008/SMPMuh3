'use client';

import { useState } from 'react';
import type { InputHTMLAttributes } from 'react';
import { cn } from '../lib/cn';
import { inputClasses } from './field-classes';

const Eye = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeOff = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden>
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
    <path d="m1 1 22 22" />
    <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3.5 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
    <line x1="9.88" x2="14.12" y1="9.88" y2="14.12" />
  </svg>
);

/**
 * Input sandi dengan tombol mata — default tersembunyi, klik untuk
 * menampilkan. Drop-in pengganti `<Input type="password">`.
 */
export function PasswordInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        className={cn(inputClasses, 'pr-10', className)}
        {...props}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={show ? 'Sembunyikan sandi' : 'Tampilkan sandi'}
        title={show ? 'Sembunyikan sandi' : 'Tampilkan sandi'}
        onClick={() => setShow((s) => !s)}
        className="absolute inset-y-0 right-0 grid w-10 place-items-center text-sand-400 transition hover:text-sand-600"
      >
        {show ? <EyeOff /> : <Eye />}
      </button>
    </div>
  );
}
