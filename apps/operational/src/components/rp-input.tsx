'use client';

import { useState } from 'react';
import { Input } from '@smpmuh3/ui';

const fmtId = (n: string) => n.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const digits = (v: string) => v.replace(/[^\d]/g, '').slice(0, 15);

/**
 * Input rupiah — pengguna mengetik angka, tampilan otomatis berformat
 * ribuan + pratinjau "Terbaca: Rp…" di bawah. Nilai mentah tetap tersedia
 * lewat `name` untuk FormData. Dukung mode tak-terkontrol (`defaultValue`)
 * maupun terkontrol (`value` + `onChange` — callback menerima digit mentah).
 */
export function RpInput({
  name,
  defaultValue,
  value,
  onChange,
  placeholder = '0',
  disabled,
  className,
  inputClassName,
  hidePreview,
  ...rest
}: {
  name?: string;
  defaultValue?: number | string | null | undefined;
  value?: string | number | null | undefined;
  onChange?: ((raw: string) => void) | undefined;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  hidePreview?: boolean;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'defaultValue' | 'onChange' | 'type' | 'name'>) {
  const controlled = value !== undefined;
  const [inner, setInner] = useState(
    defaultValue != null && defaultValue !== '' ? digits(String(defaultValue)) : '',
  );
  const raw = controlled ? digits(String(value ?? '')) : inner;
  const display = raw ? fmtId(raw) : '';
  return (
    <div className={className}>
      {name ? <input type="hidden" name={name} value={raw} /> : null}
      <Input
        type="text"
        inputMode="numeric"
        className={inputClassName}
        {...rest}
        value={display}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => {
          const next = digits(e.target.value);
          if (!controlled) setInner(next);
          onChange?.(next);
        }}
      />
      {!hidePreview && raw ? (
        <p className="mt-1 text-[11px] font-medium text-emerald-700">
          Terbaca: Rp{fmtId(raw)}
        </p>
      ) : null}
    </div>
  );
}
