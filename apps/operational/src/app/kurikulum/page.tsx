'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Field, Input, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { PageTitle, Widget } from '@/components/widgets';
import {
  createClass,
  createSubject,
  listAcademicYears,
  listClasses,
  listSubjects,
  type AcademicYear,
  type ClassView,
  type SubjectView,
} from '@/lib/api';

export default function AcademicPage() {
  const [year, setYear] = useState<AcademicYear | null>(null);
  const [subjects, setSubjects] = useState<SubjectView[]>([]);
  const [classes, setClasses] = useState<ClassView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async (yearId?: string) => {
    const [subs, cls] = await Promise.all([
      listSubjects(),
      listClasses(yearId),
    ]);
    setSubjects(subs);
    setClasses(cls);
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
        subtitle={`Mata pelajaran & rombel${year ? ` — TA ${year.name}` : ''}`}
      />

      {error ? (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
      ) : null}
      {notice ? (
        <p role="status" className="mb-4 rounded-xl bg-primary-50 px-4 py-3 text-sm font-medium text-primary-800">{notice}</p>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <Widget title={`Mata Pelajaran (${subjects.length})`}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              run(
                () =>
                  createSubject({
                    code: String(f.get('code')),
                    name: String(f.get('name')),
                    gradeLevel: Number(f.get('gradeLevel')) || undefined,
                  }),
                'Mapel ditambahkan.',
                e.currentTarget,
              );
            }}
            className="mb-4 grid gap-3 rounded-2xl border border-sand-200 bg-sand-50 p-4 sm:grid-cols-[100px_1fr_100px_auto] sm:items-end"
          >
            <Field label="Kode"><Input name="code" required placeholder="MTK" /></Field>
            <Field label="Nama"><Input name="name" required placeholder="Matematika" /></Field>
            <Field label="Tingkat"><Input name="gradeLevel" type="number" min={7} max={9} placeholder="7" /></Field>
            <Button type="submit" disabled={busy} variant="outline">Tambah</Button>
          </form>
          <ul className="space-y-2">
            {subjects.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 rounded-xl border border-sand-200 bg-sand-50 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-sand-900">{s.name}</p>
                  <p className="text-xs text-sand-500">
                    {s.code}
                    {s.gradeLevel ? ` · Kelas ${s.gradeLevel}` : ''}
                    {s.curriculum ? ` · ${s.curriculum.name}` : ''}
                  </p>
                </div>
              </li>
            ))}
            {subjects.length === 0 ? (
              <li className="py-6 text-center text-sm text-sand-500">Belum ada mapel.</li>
            ) : null}
          </ul>
        </Widget>

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
          <ul className="grid gap-2 sm:grid-cols-2">
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
              <li className="col-span-2 py-6 text-center text-sm text-sand-500">Belum ada rombel.</li>
            ) : null}
          </ul>
        </Widget>
      </div>
    </Shell>
  );
}
