'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Input, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { DataTable } from '@/components/data-table';
import { PageTitle, StatCard, Widget } from '@/components/widgets';
import { listClasses, listSavingsSummary, type ClassView } from '@/lib/api';

const rupiah = (n: number) => `Rp${n.toLocaleString('id-ID')}`;

type Row = {
  id: string;
  name: string;
  nis?: string | null;
  className?: string | null;
  gradeLevel?: number | null;
  balance: number;
};

export default function TabunganPage() {
  const [search, setSearch] = useState('');
  const [classId, setClassId] = useState('');
  const [grade, setGrade] = useState('');
  const [classes, setClasses] = useState<ClassView[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    listSavingsSummary({
      ...(search ? { search } : {}),
      ...(classId ? { classId } : {}),
      ...(grade ? { gradeLevel: grade } : {}),
    })
      .then(setRows)
      .catch(() => setError('Gagal memuat tabungan.'))
      .finally(() => setLoading(false));
  }, [search, classId, grade]);

  useEffect(() => {
    listClasses().then(setClasses).catch(() => undefined);
  }, []);

  useEffect(() => {
    const t = setTimeout(load, search ? 350 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const totalSaldo = rows.reduce((s, r) => s + r.balance, 0);
  const menabung = rows.filter((r) => r.balance > 0).length;
  const grades = [...new Set(classes.map((c) => c.gradeLevel).filter((g): g is number => g != null))].sort();

  return (
    <Shell>
      <PageTitle title="Tabungan Siswa" subtitle="Saldo semua siswa — klik siswa untuk buku tabungannya" />
      {error ? (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
      ) : null}

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatCard label="Total Dana Tabungan" value={rupiah(totalSaldo)} />
        <StatCard label="Siswa Menabung" value={`${menabung} / ${rows.length}`} />
        <StatCard label="Saldo Tertinggi" value={rupiah(rows.reduce((m, r) => Math.max(m, r.balance), 0))} />
      </div>

      <div className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl border border-sand-200 bg-white p-4 shadow-card">
        <label className="flex min-w-32 flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-sand-500">Jenjang</span>
          <Select value={grade} onChange={(e) => { setGrade(e.target.value); setClassId(''); }} aria-label="Filter jenjang">
            <option value="">Semua</option>
            {grades.map((g) => (
              <option key={g} value={g}>Kelas {g}</option>
            ))}
          </Select>
        </label>
        <label className="flex min-w-40 flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-sand-500">Kelas</span>
          <Select value={classId} onChange={(e) => setClassId(e.target.value)} aria-label="Filter kelas">
            <option value="">Semua</option>
            {classes.filter((c) => !grade || c.gradeLevel === Number(grade)).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </label>
        <label className="flex min-w-44 flex-1 flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-sand-500">Pencarian</span>
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama siswa…"
            aria-label="Cari siswa"
          />
        </label>
      </div>

      <Widget title="Saldo per Siswa">
        <DataTable
          head={['NIS', 'Siswa', 'Kelas', 'Saldo', '']}
          loading={loading}
          error={null}
          empty={rows.length === 0 ? 'Tidak ada siswa pada filter ini.' : undefined}
        >
          {[...rows].sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name)).map((s) => (
            <tr key={s.id} className="cursor-pointer">
              <td className="px-5 py-3 text-xs text-sand-500">{s.nis ?? '—'}</td>
              <td className="px-5 py-3 font-medium text-sand-900">
                <Link href={`/keuangan/tabungan/${s.id}`} className="hover:text-primary-700 hover:underline">
                  {s.name}
                </Link>
              </td>
              <td className="px-5 py-3 text-xs text-sand-500">{s.className ?? '—'}</td>
              <td className={`px-5 py-3 font-bold tabular-nums ${s.balance > 0 ? 'text-primary-800' : 'text-sand-400'}`}>
                {rupiah(s.balance)}
              </td>
              <td className="px-5 py-3 text-right">
                <Link href={`/keuangan/tabungan/${s.id}`} className="text-xs font-semibold text-primary-700 hover:underline">
                  Buku
                </Link>
              </td>
            </tr>
          ))}
        </DataTable>
      </Widget>
    </Shell>
  );
}
