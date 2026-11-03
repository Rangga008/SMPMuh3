'use client';

import { useEffect, useRef, useState } from 'react';
import { Input } from '@smpmuh3/ui';

/**
 * Pemilih ketik-cari generik — ketik dulu, hasil muncul di dropdown.
 * Dua mode:
 *  - Uncontrolled + `name`: render hidden input agar ikut FormData (dipakai di form modal).
 *  - Controlled: `value` + `onPick`.
 */
export function SearchSelect<T extends { id: string }>({
  name,
  required,
  placeholder = 'Ketik untuk mencari…',
  load,
  label,
  sub,
  value,
  onPick,
  disabled,
}: {
  name?: string;
  required?: boolean;
  placeholder?: string;
  /** Ambil opsi — boleh query server atau filter lokal. */
  load: (q: string) => Promise<T[]>;
  label: (item: T) => string;
  sub?: (item: T) => string | null | undefined;
  value?: T | null;
  onPick?: (item: T | null) => void;
  disabled?: boolean;
}) {
  const controlled = onPick !== undefined;
  const [inner, setInner] = useState<T | null>(null);
  const picked = controlled ? (value ?? null) : inner;
  const pick = (item: T | null) => (controlled ? onPick(item) : setInner(item));

  const [q, setQ] = useState('');
  const [rows, setRows] = useState<T[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (picked || disabled) {
      setRows([]);
      return;
    }
    const t = setTimeout(() => {
      setLoading(true);
      load(q)
        .then((r) => {
          setRows(r.slice(0, 10));
          setOpen(true);
        })
        .catch(() => setRows([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [q, picked, disabled, load]);

  // Tutup dropdown saat klik di luar.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  if (picked) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl border border-primary-300 bg-primary-50 px-3 py-2">
        {name ? <input type="hidden" name={name} value={picked.id} /> : null}
        <p className="min-w-0 text-sm font-semibold text-sand-900">
          <span className="block truncate">{label(picked)}</span>
          {sub?.(picked) ? <span className="block truncate text-xs font-normal text-sand-500">{sub(picked)}</span> : null}
        </p>
        <button type="button" onClick={() => pick(null)} className="shrink-0 text-xs font-semibold text-primary-700 hover:underline">
          Ganti
        </button>
      </div>
    );
  }

  return (
    <div ref={boxRef} className="relative">
      {name ? <input type="hidden" name={name} value="" /> : null}
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => rows.length > 0 && setOpen(true)}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        autoComplete="off"
      />
      {open && !disabled ? (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-sand-200 bg-white shadow-lg">
          {loading ? <li className="px-3 py-2 text-xs text-sand-400">Mencari…</li> : null}
          {!loading && rows.length === 0 ? (
            <li className="px-3 py-2 text-xs text-sand-400">Tidak ditemukan.</li>
          ) : null}
          {rows.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => {
                  pick(item);
                  setQ('');
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-sand-50"
              >
                <span className="truncate font-medium text-sand-900">{label(item)}</span>
                {sub?.(item) ? <span className="shrink-0 text-xs text-sand-400">{sub(item)}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Hidden input pendamping — dipakai saat SearchSelect controlled dipakai di dalam FormData form. */
export function PickedValue({ name, value }: { name: string; value?: string | null }) {
  return <input type="hidden" name={name} value={value ?? ''} />;
}
