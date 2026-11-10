'use client';

import { useState } from 'react';
import { Button } from '@smpmuh3/ui';

/**
 * Pemilih file seragam untuk semua modal — tombol bergaya konsisten dengan
 * input file transparan di atasnya (tetap fokusable → `required` & FormData
 * berfungsi normal). Pakai `file`+`onPick` untuk mode terkontrol (upload
 * ditunda sampai submit), atau cukup `name` agar ikut FormData form induk.
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
  const shown = file !== undefined ? file : internal;
  return (
    <span className="flex items-center gap-3">
      <span className="relative inline-block">
        <Button type="button" variant="outline" size="sm" tabIndex={-1} className="pointer-events-none">
          📎 {shown ? 'Ganti pilihan' : buttonLabel}
        </Button>
        <input
          type="file"
          name={name}
          accept={accept}
          required={required}
          aria-label={buttonLabel}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setInternal(f);
            onPick?.(f);
          }}
        />
      </span>
      <span className="min-w-0 truncate text-sm text-sand-600">{shown ? shown.name : emptyText}</span>
    </span>
  );
}
