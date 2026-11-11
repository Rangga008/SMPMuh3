'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { STUDENT_STATUS_LABELS, type StudentDto } from '@smpmuh3/types';
import { Badge, Button, Input, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { DataTable } from '@/components/data-table';
import { PageTitle } from '@/components/widgets';
import { rowActionClasses } from '@/components/row-btn';
import { listStudents } from '@/lib/api';

const tone = (s: string) => (s === 'ACTIVE' ? 'primary' : 'neutral');

/** Daftar siswa untuk Tata Usaha — berbeda dengan Data Siswa kesiswaan:
    baris langsung menuju Lembar Buku Induk, bukan detail siswa. */
export default function BukuIndukListPage() {
  const [rows, setRows] = useState<StudentDto[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((q: { search?: string; status?: string }) => {
    setLoading(true);
    listStudents(q)
      .then(setRows)
      .catch(() => setError('Gagal memuat data siswa.'))
      .finally(() => setLoading(false));
  }, []);

  const firstRun = useRef(true);
  useEffect(() => {
    const t = setTimeout(() => load({ search, status }), firstRun.current ? 0 : 350);
    firstRun.current = false;
    return () => clearTimeout(t);
  }, [search, status, load]);

  return (
    <Shell>
      <PageTitle
        title="Buku Induk"
        subtitle="Lembar buku induk peserta didik — pilih siswa untuk membuka & mengisi bukunya."
      />

      {error ? (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
      ) : null}

      <div className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl border border-sand-200 bg-white p-4 shadow-card">
        <label className="flex min-w-40 flex-[2] flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-sand-500">Pencarian</span>
          <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nama / NIS / NISN…" />
        </label>
        <label className="flex min-w-40 flex-1 flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-sand-500">Status</span>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Semua</option>
            {Object.entries(STUDENT_STATUS_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
        </label>
      </div>

      <DataTable
        head={['Nama', 'NIS', 'NISN', 'L/P', 'Kelas', 'Status', '']}
        loading={loading}
        error={error}
        empty={rows.length === 0 ? 'Tidak ada siswa.' : undefined}
      >
        {rows.map((s) => (
          <tr key={s.id}>
            <td className="px-5 py-3.5 font-semibold text-sand-900">{s.name}</td>
            <td className="px-5 py-3.5 text-sand-600">{s.nis ?? '—'}</td>
            <td className="px-5 py-3.5 text-sand-600">{s.nisn ?? '—'}</td>
            <td className="px-5 py-3.5 text-sand-600">
              {s.gender === 'MALE' ? 'L' : s.gender === 'FEMALE' ? 'P' : '—'}
            </td>
            <td className="px-5 py-3.5 text-sand-600">
              {(s as StudentDto & { enrollments?: { class?: { name: string } | null }[] }).enrollments?.[0]?.class?.name ?? '—'}
            </td>
            <td className="px-5 py-3.5">
              <Badge tone={tone(s.status)}>{STUDENT_STATUS_LABELS[s.status]}</Badge>
            </td>
            <td className="px-5 py-3.5 text-right">
              <Link href={`/kesiswaan/${s.id}/induk`} className={rowActionClasses('primary')}>
                Buku Induk →
              </Link>
            </td>
          </tr>
        ))}
      </DataTable>
    </Shell>
  );
}
