'use client';

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ChangeEvent, FocusEventHandler } from 'react';
import { cn } from '../lib/cn';
import { selectClasses } from './field-classes';

export interface ParsedOption {
  value: string;
  label: string;
  disabled?: boolean;
  /** Nama grup bila berasal dari <optgroup>. */
  group?: string | undefined;
}

/** Event tiruan <select> — cukup untuk handler yang membaca e.target.value. */
const synthEvent = (value: string, name?: string) =>
  ({
    target: { value, name: name ?? '' },
    currentTarget: { value, name: name ?? '' },
    preventDefault: () => undefined,
    stopPropagation: () => undefined,
  }) as unknown as ChangeEvent<HTMLSelectElement>;

/**
 * Combobox ketik-cari yang meniru API <select> — dipakai internal oleh
 * <Select> saat jumlah opsinya banyak. Mendukung controlled (value+onChange),
 * uncontrolled (defaultValue+name untuk FormData), optgroup (jadi header),
 * dan opsi disabled.
 */
export function SearchableSelect({
  options,
  name,
  value,
  defaultValue,
  onChange,
  onBlur,
  required,
  disabled,
  placeholder,
  className,
  style,
  id,
  autoFocus,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledby,
  'aria-describedby': ariaDescribedby,
}: {
  options: ParsedOption[];
  name?: string | undefined;
  value?: string | number | readonly string[] | undefined;
  defaultValue?: string | number | readonly string[] | undefined;
  onChange?: ((e: ChangeEvent<HTMLSelectElement>) => void) | undefined;
  onBlur?: FocusEventHandler | undefined;
  required?: boolean | undefined;
  disabled?: boolean | undefined;
  placeholder?: string | undefined;
  className?: string | undefined;
  style?: CSSProperties | undefined;
  id?: string | undefined;
  autoFocus?: boolean | undefined;
  'aria-label'?: string | undefined;
  'aria-labelledby'?: string | undefined;
  'aria-describedby'?: string | undefined;
}) {
  const isControlled = value !== undefined;
  // Paritas <select> native: tanpa defaultValue, opsi pertama (non-disabled)
  // terpilih otomatis — ikut terkirim di FormData.
  const [inner, setInner] = useState(() => {
    if (defaultValue !== undefined) return String(defaultValue);
    return options.find((o) => !o.disabled)?.value ?? '';
  });
  const val = isControlled ? String(value ?? '') : inner;
  const setVal = (v: string) => {
    if (!isControlled) setInner(v);
    onChange?.(synthEvent(v, name));
  };

  const selected = options.find((o) => o.value === val);
  const emptyLabel = options.find((o) => o.value === '')?.label;
  // Nilai '' → tampil sebagai placeholder agar `required` tetap jalan.
  const shownText = val === '' ? '' : (selected?.label ?? val);
  const shownPlaceholder = val === '' ? (emptyLabel ?? placeholder ?? 'Ketik untuk mencari…') : (placeholder ?? 'Ketik untuk mencari…');

  const [text, setText] = useState(shownText);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    setText(shownText);
  }, [shownText]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  // Scroll item tersorot ke tampilan.
  useEffect(() => {
    if (open) listRef.current?.querySelector('[data-hi="1"]')?.scrollIntoView({ block: 'nearest' });
  }, [hi, open]);

  const q = text.trim().toLowerCase();
  const searching = q !== '' && q !== shownText.toLowerCase();
  const filtered = searching ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;

  const pick = (o: ParsedOption) => {
    if (o.disabled) return;
    setVal(o.value);
    setText(o.value === '' ? '' : o.label);
    setOpen(false);
  };

  // Baris datar: header grup disisipkan di antara opsi.
  type Row = { kind: 'group'; label: string } | { kind: 'opt'; opt: ParsedOption; idx: number };
  const rows: Row[] = [];
  let lastGroup: string | undefined;
  let idx = 0;
  for (const o of filtered) {
    if (o.group !== lastGroup) {
      lastGroup = o.group;
      if (o.group) rows.push({ kind: 'group', label: o.group });
    }
    rows.push({ kind: 'opt', opt: o, idx: idx++ });
  }
  const selectable = rows.filter((r): r is Row & { kind: 'opt' } => r.kind === 'opt' && !r.opt.disabled);

  const moveHi = (dir: 1 | -1) => {
    if (!selectable.length) return;
    const cur = selectable.findIndex((r) => r.idx === hi);
    const next = selectable[(cur + dir + selectable.length) % selectable.length];
    setHi(next?.idx ?? 0);
  };

  return (
    <div ref={wrapRef} className="relative" style={style}>
      {name ? <input type="hidden" name={name} value={val} /> : null}
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        aria-describedby={ariaDescribedby}
        id={id}
        required={required}
        disabled={disabled}
        autoFocus={autoFocus}
        autoComplete="off"
        value={text}
        placeholder={shownPlaceholder}
        className={cn(selectClasses, 'cursor-text', className)}
        onFocus={() => {
          setOpen(true);
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
            moveHi(1);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setOpen(true);
            moveHi(-1);
          } else if (e.key === 'Enter') {
            e.preventDefault();
            const row = selectable.find((r) => r.idx === hi) ?? selectable[0];
            if (row) pick(row.opt);
          } else if (e.key === 'Escape') {
            setOpen(false);
            setText(shownText);
          }
        }}
        onBlur={(e) => {
          onBlur?.(e);
          window.setTimeout(() => {
            if (!open) setText(shownText);
          }, 150);
        }}
      />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sand-400">▾</span>
      {open ? (
        <ul
          ref={listRef}
          role="listbox"
          className="absolute z-40 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-sand-200 bg-white py-1 shadow-lg"
        >
          {rows.map((r, i) =>
            r.kind === 'group' ? (
              <li key={`g-${r.label}-${i}`} className="px-3.5 pb-1 pt-2 text-xs font-bold uppercase tracking-wide text-sand-400">
                {r.label}
              </li>
            ) : (
              <li key={`o-${r.opt.value}-${i}`} role="option" aria-selected={r.opt.value === val}>
                <button
                  type="button"
                  data-hi={r.idx === hi ? 1 : undefined}
                  disabled={r.opt.disabled}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 px-3.5 py-2 text-left text-sm',
                    r.idx === hi ? 'bg-primary-50 text-primary-800' : 'text-sand-700 hover:bg-sand-50',
                    r.opt.value === val ? 'font-semibold' : '',
                    r.opt.disabled ? 'cursor-not-allowed opacity-50' : '',
                  )}
                  onMouseEnter={() => setHi(r.idx)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(r.opt);
                  }}
                >
                  <span>{r.opt.label}</span>
                  {r.opt.value === val ? <span className="text-primary-600">✓</span> : null}
                </button>
              </li>
            ),
          )}
          {!rows.length ? (
            <li className="px-3.5 py-2.5 text-sm text-sand-400">Tidak ada yang cocok.</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
