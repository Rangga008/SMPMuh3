'use client';

import { useState } from 'react';
import { Input } from '@smpmuh3/ui';

const fmtId = (n: string) => n.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/**
 * Input rupiah — pengguna mengetik angka, tampilan otomatis berformat
 * ribuan + pratinjau "Terbaca: Rp…" di bawah. Nilai mentah tetap tersedia
 * lewat `name` untuk FormData.
 */
export function RpInput({
  name,
  defaultValue,
  placeholder = '0',
  disabled,
}: {
  name: string;
  defaultValue?: number | string | null | undefined;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [raw, setRaw] = useState(defaultValue != null && defaultValue !== '' ? String(defaultValue) : '');
  const display = raw ? fmtId(raw) : '';
  return (
    <div>
      <input type="hidden" name={name} value={raw} />
      <Input
        type="text"
        inputMode="numeric"
        value={display}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => setRaw(e.target.value.replace(/[^\d]/g, '').slice(0, 15))}
      />
      {raw ? (
        <p className="mt-1 text-[11px] font-medium text-emerald-700">
          Terbaca: Rp{fmtId(raw)}
        </p>
      ) : null}
    </div>
  );
}
