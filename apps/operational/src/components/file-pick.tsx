'use client';

import { useRef, useState } from 'react';

/**
 * Pemilih file seragam — drop-zone dengan ikon + status nama file.
 * Input file transparan menutupi seluruh kotak (fokusable → `required`
 * & FormData tetap berfungsi). `file`+`onPick` untuk mode terkontrol,
 * atau cukup `name` agar ikut FormData form induk.
 */
export function FilePick({
  name,
  accept,
  required,
  file,
  onPick,
  buttonLabel = 'Pilih file',
  emptyText = 'Belum ada file',
}: {
  name?: string;
  accept?: string;
  required?: boolean;
  file?: File | null;
  onPick?: (f: File | null) => void;
  buttonLabel?: string;
  emptyText?: string;
}) {
  const [internal, setInternal] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const shown = file !== undefined ? file : internal;
  const setF = (f: File | null) => { setInternal(f); onPick?.(f); };
  const fmtSize = (n: number) => (n > 1024 * 1024 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

  return (
    <span
      className={`group relative flex items-center gap-3 rounded-xl border-2 border-dashed px-4 py-3 transition-colors ${
        drag ? 'border-primary-500 bg-primary-50' : shown ? 'border-primary-300 bg-primary-50/40' : 'border-sand-300 bg-sand-50/60 hover:border-sand-400 hover:bg-sand-50'
      }`}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault(); setDrag(false);
        const f = e.dataTransfer.files?.[0] ?? null;
        if (f && inputRef.current) {
          const dt = new DataTransfer();
          dt.items.add(f);
          inputRef.current.files = dt.files;
        }
        setF(f);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        name={name}
        accept={accept}
        required={required && !shown}
        aria-label={buttonLabel}
        className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
        onChange={(e) => setF(e.target.files?.[0] ?? null)}
      />
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl text-lg ${shown ? 'bg-primary-100 text-primary-700' : 'bg-sand-200/70 text-sand-500'}`}>
        {shown ? '📄' : '📎'}
      </span>
      <span className="min-w-0 flex-1">
        {shown ? (
          <>
            <span className="block truncate text-sm font-semibold text-sand-900">{shown.name}</span>
            <span className="block text-xs text-sand-500">{fmtSize(shown.size)} · klik untuk ganti</span>
          </>
        ) : (
          <>
            <span className="block text-sm font-semibold text-sand-700">{buttonLabel}</span>
            <span className="block text-xs text-sand-400">{emptyText === 'Belum ada file' ? 'klik atau seret file ke sini' : emptyText}</span>
          </>
        )}
      </span>
      {shown ? (
        <button
          type="button"
          title="Hapus pilihan"
          className="relative z-20 flex size-7 shrink-0 items-center justify-center rounded-lg text-sand-400 transition hover:bg-red-50 hover:text-red-600"
          onClick={(e) => { e.stopPropagation(); if (inputRef.current) inputRef.current.value = ''; setF(null); }}
        >✕</button>
      ) : null}
    </span>
  );
}
