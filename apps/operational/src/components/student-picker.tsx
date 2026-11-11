'use client';

import { useEffect, useRef, useState } from 'react';
import { Input } from '@smpmuh3/ui';
import type { StudentDto } from '@smpmuh3/types';
import { listStudents } from '@/lib/api';

/**
 * Pemilih siswa — ketik nama/NIS untuk mencari, klik hasil untuk memilih.
 * Dipakai form tambah prestasi & anggota ekskul.
 */
export function StudentPicker({
  value,
  onChange,
  excludeIds,
  placeholder = 'Ketik nama / NIS / NISN siswa…',
}: {
  value: StudentDto | null;
  onChange: (s: StudentDto | null) => void;
  excludeIds?: string[];
  placeholder?: string;
}) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<StudentDto[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!q || q.length < 2) {
      setRows([]);
      return;
    }
    const t = setTimeout(() => {
      setBusy(true);
      listStudents({ search: q, status: 'ACTIVE' })
        .then(setRows)
        .catch(() => setRows([]))
        .finally(() => setBusy(false));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  if (value) {
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-primary-50 px-3 py-1.5 text-sm font-semibold text-primary-800">
        {value.name}
        {value.nis ? <span className="text-xs font-normal text-primary-600">NIS {value.nis}</span> : null}
        <button
          type="button"
          aria-label="Batal pilih"
          className="text-primary-500 hover:text-primary-800"
          onClick={() => onChange(null)}
        >
          ✕
        </button>
      </span>
    );
  }

  const visible = rows.filter((s) => !excludeIds?.includes(s.id));

  return (
    <div ref={boxRef} className="relative">
      <Input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {open && q.length >= 2 ? (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-sand-200 bg-white py-1 shadow-lg">
          {busy ? (
            <li className="px-3 py-2 text-xs text-sand-400">Mencari…</li>
          ) : visible.length === 0 ? (
            <li className="px-3 py-2 text-xs text-sand-400">Tidak ditemukan.</li>
          ) : (
            visible.slice(0, 20).map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-primary-50"
                  onClick={() => {
                    onChange(s);
                    setQ('');
                    setOpen(false);
                  }}
                >
                  <span className="font-semibold text-sand-900">{s.name}</span>
                  <span className="text-xs text-sand-400">
                    {s.nis ? `NIS ${s.nis}` : s.nisn ? `NISN ${s.nisn}` : ''}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
