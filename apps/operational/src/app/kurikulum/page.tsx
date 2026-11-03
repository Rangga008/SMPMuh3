'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, Field, Input, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { PageTitle, Widget } from '@/components/widgets';
import {
  createClass,
  listAcademicYears,
  listClasses,
  type AcademicYear,
  type ClassView,
} from '@/lib/api';

export default function AcademicPage() {
  const [year, setYear] = useState<AcademicYear | null>(null);
  const [classes, setClasses] = useState<ClassView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async (yearId?: string) => {
    setClasses(await listClasses(yearId));
  }, []);

  useEffect(() => {
    listAcademicYears()
      .then((ys) => {
        const active = ys.find((y) => y.isActive) ?? null;
        setYear(active);
        return refresh(active?.id);
      })
      .catch(() => setError('Gagal memuat data kurikulum.'));
  }, [refresh]);

  async function run(fn: () => Promise<unknown>, ok: string, form?: HTMLFormElement) {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await fn();
      await refresh(year?.id);
      form?.reset();
      setNotice(ok);
    } catch {
      setError('Aksi gagal — periksa data yang diisi.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <PageTitle
        title="Kurikulum"
        subtitle={`Rombel / kelas${year ? ` — TA ${year.name}` : ''}`}
      />

      {error ? (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
      ) : null}
      {notice ? (
        <p role="status" className="mb-4 rounded-xl bg-primary-50 px-4 py-3 text-sm font-medium text-primary-800">{notice}</p>
      ) : null}

      <p className="mb-4 text-sm text-sand-600">
        Kode mapel, tahun ajaran, semester, dan data kurikulum kini dikelola di{' '}
        <Link href="/master-data/mapel" className="font-semibold text-primary-700 hover:underline">
          Master Data
        </Link>
        .
      </p>

      <Widget title={`Rombel (${classes.length})`}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            run(
              () =>
                createClass({
                  name: String(f.get('name')),
                  gradeLevel: Number(f.get('gradeLevel')),
                  academicYearId: year?.id,
                }),
              'Rombel ditambahkan.',
              e.currentTarget,
            );
          }}
          className="mb-4 grid gap-3 rounded-2xl border border-sand-200 bg-sand-50 p-4 sm:grid-cols-[1fr_120px_auto] sm:items-end"
        >
          <Field label="Nama Rombel"><Input name="name" required placeholder="7A" /></Field>
          <Field label="Tingkat">
            <Select name="gradeLevel" required defaultValue="7">
              <option value="7">7</option>
              <option value="8">8</option>
              <option value="9">9</option>
            </Select>
          </Field>
          <Button type="submit" disabled={busy} variant="outline">Tambah</Button>
        </form>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((c) => (
            <li key={c.id} className="rounded-xl border border-sand-200 bg-sand-50 px-4 py-3">
              <p className="text-sm font-semibold text-sand-900">{c.name}</p>
              <p className="text-xs text-sand-500">
                Kelas {c.gradeLevel} · {c._count?.enrollments ?? 0} siswa
                {c.homeroom ? ` · Wali: ${c.homeroom.name}` : ''}
              </p>
            </li>
          ))}
          {classes.length === 0 ? (
            <li className="col-span-full py-6 text-center text-sm text-sand-500">Belum ada rombel.</li>
          ) : null}
        </ul>
      </Widget>
    </Shell>
  );
}
