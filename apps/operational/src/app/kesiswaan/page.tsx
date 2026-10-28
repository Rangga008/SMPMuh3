'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  STUDENT_STATUSES,
  STUDENT_STATUS_LABELS,
  type StudentDto,
  type StudentStatus,
} from '@smpmuh3/types';
import { Badge, Button, Card } from '@smpmuh3/ui';
import { DataTable } from '@/components/data-table';
import { Shell } from '@/components/shell';
import { PageTitle } from '@/components/widgets';
import { createStudent, listStudents } from '@/lib/api';

const inputCls =
  'h-10 w-full rounded-lg border border-sand-300 px-3 text-sm focus-visible:focus-ring';

export default function KesiswaanPage() {
  const [rows, setRows] = useState<StudentDto[]>([]);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listStudents({ status, search: search || undefined }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat');
    } finally {
      setLoading(false);
    }
  }, [status, search]);

  useEffect(() => {
    listStudents({ status }).then(setRows).catch(() => undefined).finally(() => setLoading(false));
  }, [status]);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      await createStudent({
        name: fd.get('name'),
        nis: fd.get('nis') || undefined,
        nisn: fd.get('nisn') || undefined,
        gender: fd.get('gender') || undefined,
        birthPlace: fd.get('birthPlace') || undefined,
        birthDate: fd.get('birthDate') || undefined,
        force: true,
      });
      setShowForm(false);
      (e.target as HTMLFormElement).reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <PageTitle
        title="Data Siswa"
        subtitle="Manajemen data induk siswa"
        actions={
          <Button onClick={() => setShowForm((v) => !v)} size="sm">
            {showForm ? 'Tutup' : '+ Tambah Siswa'}
          </Button>
        }
      />
      {error ? (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {showForm ? (
        <Card className="mb-4">
          <h2 className="mb-4 font-bold text-sand-950">Siswa Baru</h2>
          <form onSubmit={onCreate} className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold text-sand-900 sm:col-span-2">
              Nama lengkap *
              <input required name="name" minLength={3} className={inputCls} />
            </label>
            <label className="text-sm font-semibold text-sand-900">
              NIS
              <input name="nis" className={inputCls} />
            </label>
            <label className="text-sm font-semibold text-sand-900">
              NISN (10 digit)
              <input name="nisn" pattern="\d{10}" className={inputCls} />
            </label>
            <label className="text-sm font-semibold text-sand-900">
              Jenis kelamin
              <select name="gender" className={inputCls}>
                <option value="">—</option>
                <option value="MALE">Laki-laki</option>
                <option value="FEMALE">Perempuan</option>
              </select>
            </label>
            <label className="text-sm font-semibold text-sand-900">
              Tanggal lahir
              <input type="date" name="birthDate" className={inputCls} />
            </label>
            <label className="text-sm font-semibold text-sand-900">
              Tempat lahir
              <input name="birthPlace" className={inputCls} />
            </label>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={busy}>
                {busy ? 'Menyimpan…' : 'Simpan'}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
        className="mb-4 flex flex-wrap gap-2"
      >
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="h-10 rounded-lg border border-sand-300 px-3 text-sm"
          aria-label="Filter status"
        >
          <option value="">Semua status</option>
          {STUDENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STUDENT_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nama / NIS / NISN…"
          className="h-10 w-64 rounded-lg border border-sand-300 px-3 text-sm"
        />
        <Button type="submit" size="sm" variant="outline">
          Cari
        </Button>
      </form>

      <DataTable
        head={['NIS/NISN', 'Nama', 'JK', 'Status', '']}
        loading={loading}
        error={error}
        empty={rows.length === 0 ? 'Belum ada siswa.' : undefined}
      >
        {rows.map((s) => (
          <tr key={s.id} className="hover:bg-sand-50">
            <td className="px-4 py-3 font-mono text-xs text-sand-700">
              {s.nis ?? '—'} / {s.nisn ?? '—'}
            </td>
            <td className="px-4 py-3 font-medium text-sand-900">{s.name}</td>
            <td className="px-4 py-3 text-sand-600">
              {s.gender === 'MALE' ? 'L' : s.gender === 'FEMALE' ? 'P' : '—'}
            </td>
            <td className="px-4 py-3">
              <Badge tone={s.status === 'ACTIVE' ? 'primary' : 'neutral'}>
                {STUDENT_STATUS_LABELS[s.status as StudentStatus] ?? s.status}
              </Badge>
            </td>
            <td className="px-4 py-3 text-right">
              <Link
                href={`/kesiswaan/${s.id}`}
                className="font-semibold text-primary-800 hover:underline"
              >
                Detail →
              </Link>
            </td>
          </tr>
        ))}
      </DataTable>
    </Shell>
  );
}
