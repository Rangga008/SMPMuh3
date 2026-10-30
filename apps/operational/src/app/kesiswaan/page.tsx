'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  STUDENT_STATUS_LABELS,
  type StudentDto,
} from '@smpmuh3/types';
import { Badge, Button, Field, Input, Modal, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { DataTable } from '@/components/data-table';
import { PageTitle } from '@/components/widgets';
import { createStudent, listStudents } from '@/lib/api';

const tone = (s: string) => (s === 'ACTIVE' ? 'primary' : 'neutral');

export default function StudentsPage() {
  const [rows, setRows] = useState<StudentDto[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback((q: { search?: string; status?: string }) => {
    setLoading(true);
    listStudents(q)
      .then(setRows)
      .catch(() => setError('Gagal memuat data siswa.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load({});
  }, [load]);

  function onSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    load({ search, status });
  }

  async function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const val = (k: string) => String(f.get(k) ?? '').trim() || undefined;
    setError(null);
    setBusy(true);
    try {
      await createStudent({
        name: val('name'),
        nis: val('nis'),
        nisn: val('nisn'),
        gender: val('gender'),
        birthPlace: val('birthPlace'),
        birthDate: val('birthDate'),
        address: val('address'),
      });
      e.currentTarget.reset();
      setShowForm(false);
      load({ search, status });
    } catch {
      setError('Gagal menambah siswa — NIS/NISN mungkin sudah dipakai.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <PageTitle
        title="Data Siswa"
        subtitle="Kelola data kesiswaan"
        actions={
          <Button size="sm" variant={showForm ? 'ghost' : 'primary'} onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Tutup' : '+ Tambah Siswa'}
          </Button>
        }
      />

      {error ? (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
      ) : null}

      {showForm ? (
        <Modal
          open
          onClose={() => setShowForm(false)}
          title="Tambah Siswa"
          size="xl"
        >
          <form onSubmit={onCreate} className="grid gap-4 sm:grid-cols-2">
            <Field label="Nama Lengkap" className="sm:col-span-2">
              <Input name="name" required />
            </Field>
            <Field label="NIS">
              <Input name="nis" />
            </Field>
            <Field label="NISN">
              <Input name="nisn" />
            </Field>
            <Field label="Jenis Kelamin">
              <Select name="gender" defaultValue="">
                <option value="">Pilih…</option>
                <option value="MALE">Laki-laki</option>
                <option value="FEMALE">Perempuan</option>
              </Select>
            </Field>
            <Field label="Tempat Lahir">
              <Input name="birthPlace" />
            </Field>
            <Field label="Tanggal Lahir">
              <Input name="birthDate" type="date" />
            </Field>
            <Field label="Alamat">
              <Input name="address" />
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={busy}>
                {busy ? 'Menyimpan…' : 'Simpan'}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      <form
        onSubmit={onSearch}
        className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl border border-sand-200 bg-white p-4 shadow-card"
      >
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
        <Button type="submit">Terapkan</Button>
      </form>

      <DataTable
        head={['Nama', 'NIS', 'NISN', 'L/P', 'Status', '']}
        loading={loading}
        error={error}
        empty={rows.length === 0 ? 'Belum ada siswa.' : undefined}
      >
        {rows.map((s) => (
          <tr key={s.id}>
            <td className="px-5 py-3.5 font-semibold text-sand-900">{s.name}</td>
            <td className="px-5 py-3.5 text-sand-600">{s.nis ?? '—'}</td>
            <td className="px-5 py-3.5 text-sand-600">{s.nisn ?? '—'}</td>
            <td className="px-5 py-3.5 text-sand-600">
              {s.gender === 'MALE' ? 'L' : s.gender === 'FEMALE' ? 'P' : '—'}
            </td>
            <td className="px-5 py-3.5">
              <Badge tone={tone(s.status)}>{STUDENT_STATUS_LABELS[s.status]}</Badge>
            </td>
            <td className="px-5 py-3.5 text-right">
              <Link href={`/kesiswaan/${s.id}`} className="text-sm font-semibold text-primary-700 hover:text-primary-800">
                Detail →
              </Link>
            </td>
          </tr>
        ))}
      </DataTable>
    </Shell>
  );
}
