import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@smpmuh3/ui';

export type RowTone = 'primary' | 'neutral' | 'danger' | 'success';

const BASE =
  'inline-flex h-7 shrink-0 items-center justify-center gap-1 whitespace-nowrap ' +
  'rounded-lg border px-2.5 text-xs font-semibold transition-colors ' +
  'focus-visible:focus-ring disabled:pointer-events-none disabled:opacity-55 ' +
  'motion-reduce:transition-none';

export const ROW_TONES: Record<RowTone, string> = {
  primary:
    'border-primary-200 bg-primary-50 text-primary-800 ' +
    'hover:border-primary-300 hover:bg-primary-100',
  neutral:
    'border-sand-300 bg-white text-sand-700 hover:bg-sand-50 hover:text-sand-900',
  danger: 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100',
  success:
    'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100',
};

/** Kelas tombol aksi baris — juga dipakai pada <Link>/<a> agar tampak sama. */
export const rowActionClasses = (tone: RowTone = 'primary', className?: string) =>
  cn(BASE, ROW_TONES[tone], className);

/**
 * Tombol aksi kecil untuk sel tabel — menggantikan tautan-teks `hover:underline`
 * agar aksi terlihat jelas sebagai tombol.
 */
export function RowBtn({
  tone = 'primary',
  className,
  children,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: RowTone;
  children: ReactNode;
}) {
  return (
    <button type={type} className={rowActionClasses(tone, className)} {...props}>
      {children}
    </button>
  );
}
