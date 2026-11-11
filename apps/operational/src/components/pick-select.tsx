'use client';

import { useEffect, useRef, useState } from 'react';
import { cn, inputClasses } from '@smpmuh3/ui';

export interface PickSelectOption {
  value: string;
  label: string;
  hint?: string;
}

/**
 * Dropdown dengan pencarian dari daftar opsi siap-pakai — ketik untuk
 * menyaring, lalu pilih. (Untuk pencarian async ke server pakai SearchSelect.)
 * Kompatibel FormData: nilai terpilih dikirim lewat hidden input `name`.
 * Bisa controlled (value+onChange) maupun uncontrolled (defaultValue).
 */
export function PickSelect({
  name,
  options,
  value,
  defaultValue,
  onChange,
  placeholder = 'Ketik untuk mencari…',
  required,
  disabled,
  emptyLabel,
  className,
}: {
  name?: string;
  options: PickSelectOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  /** Label opsi kosong (nilai '') — mis. "— Tidak ada —" / "Semua". */
  emptyLabel?: string;
  className?: string;
}) {
  const isControlled = value !== undefined;
  const [inner, setInner] = useState(defaultValue ?? '');
  const val = isControlled ? value! : inner;
  const setVal = (v: string) => {
    if (!isControlled) setInner(v);
    onChange?.(v);
  };

  const selected = options.find((o) => o.value === val);
  const [text, setText] = useState(selected?.label ?? '');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Sinkron teks saat nilai berubah dari luar.
  useEffect(() => {
    setText(selected?.label ?? '');
  }, [selected?.label]);

  // Tutup dropdown saat klik di luar.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const all: PickSelectOption[] = emptyLabel
    ? [{ value: '', label: emptyLabel }, ...options]
    : options;
  const q = text.trim().toLowerCase();
  const filtered =
    !q || q === (selected?.label ?? '').toLowerCase()
      ? all
      : all.filter((o) => o.label.toLowerCase().includes(q));

  const pick = (o: PickSelectOption) => {
    setVal(o.value);
    setText(o.label);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className={cn('relative', className)}>
      {name ? <input type="hidden" name={name} value={val} /> : null}
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        required={required && !val}
        disabled={disabled}
        value={text}
        placeholder={placeholder}
        className={cn(inputClasses, 'pr-8')}
        onFocus={() => {
          setOpen(true);
          setHi(0);
        }}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setHi(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setHi((h) => Math.min(h + 1, filtered.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHi((h) => Math.max(h - 1, 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            const item = filtered[hi] ?? filtered[0];
            if (item) pick(item);
          } else if (e.key === 'Escape') {
            setOpen(false);
            setText(selected?.label ?? '');
          }
        }}
        onBlur={() => {
          // Kembalikan teks ke label terpilih bila user tak memilih apapun.
          window.setTimeout(() => {
            if (!open) setText(selected?.label ?? '');
          }, 150);
        }}
      />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sand-400">
        ▾
      </span>
      {open && filtered.length ? (
        <ul
          role="listbox"
          className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-sand-200 bg-white py-1 shadow-lg"
        >
          {filtered.map((o, i) => (
            <li key={`${o.value}-${i}`} role="option" aria-selected={o.value === val}>
              <button
                type="button"
                className={cn(
                  'flex w-full items-center justify-between gap-2 px-3.5 py-2 text-left text-sm',
                  i === hi ? 'bg-primary-50 text-primary-800' : 'text-sand-700 hover:bg-sand-50',
                  o.value === val ? 'font-semibold' : '',
                )}
                onMouseEnter={() => setHi(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(o);
                }}
              >
                <span>{o.label}</span>
                {o.hint ? <span className="text-xs text-sand-400">{o.hint}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {open && !filtered.length ? (
        <div className="absolute z-30 mt-1 w-full rounded-xl border border-sand-200 bg-white px-3.5 py-2.5 text-sm text-sand-400 shadow-lg">
          Tidak ada yang cocok.
        </div>
      ) : null}
    </div>
  );
}
