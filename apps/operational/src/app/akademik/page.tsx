'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Badge, Button } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { PageTitle, Widget } from '@/components/widgets';
import type { StudentDto } from '@smpmuh3/types';
import {
  createClass,
  createSubject,
  enrollStudent,
  listAcademicYears,
  listClasses,
  listStudents,
  listSubjects,
  type AcademicYear,
  type ClassView,
  type SubjectView,
} from '@/lib/api';

const inputCls =
  'h-10 w-full rounded-lg border border-sand-300 px-3 text-sm focus-visible:focus-ring';

export default function AkademikPage() {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [yearId, setYearId] = useState('');
  const [subjects, setSubjects] = useState<SubjectView[]>([]);
  const [classes, setClasses] = useState<ClassView[]>([]);
  const [students, setStudents] = useState<StudentDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (yId?: string) => {
    try {
      const [s, c, st] = await Promise.all([
        listSubjects(),
        listClasses((yId ?? yearId) || undefined),
        listStudents({ status: 'ACTIVE' }),
      ]);
      setSubjects(s);
      setClasses(c);
      setStudents(st);
    } catch {
      setError('Gagal memuat data akademik');
    }
  }, [yearId]);

  useEffect(() => {
    listAcademicYears()
      .then((ys) => {
        setYears(ys);
        const active = ys.find((y) => y.isActive);
        if (active) setYearId(active.id);
        load(active?.id);
      })
      .catch(() => setError('Gagal memuat tahun ajaran'));
  }, []);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal');
    } finally {
      setBusy(false);
    }
  }

  function onSubject(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    run(() =>
      createSubject({
        code: fd.get('code'),
        name: fd.get('name'),
        gradeLevel: fd.get('gradeLevel') ? Number(fd.get('gradeLevel')) : undefined,
      }),
    ).then(() => (e.target as HTMLFormElement).reset());
  }

  function onClass(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    run(() =>
      createClass({
        name: fd.get('name'),
        gradeLevel: Number(fd.get('gradeLevel')),
        academicYearId: yearId,
      }),
    ).then(() => (e.target as HTMLFormElement).reset());
  }

  function onEnroll(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    run(() =>
      enrollStudent({
        studentId: fd.get('studentId'),
        classId: fd.get('classId'),
        academicYearId: yearId,
      }),
    ).then(() => (e.target as HTMLFormElement).reset());
  }

  const activeYear = years.find((y) => y.id === yearId);

  return (
    <Shell>
      <PageTitle title="Akademik" subtitle="Mata pelajaran, kelas (rombel), dan penempatan siswa" />
      {error ? (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="mb-4 flex items-center gap-3">
        <label className="text-sm font-semibold text-sand-900">
          Tahun ajaran
          <select
            value={yearId}
            onChange={(e) => {
              setYearId(e.target.value);
              load(e.target.value);
            }}
            className={`${inputCls} ml-2 inline-block w-auto`}
          >
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name} {y.isActive ? '(aktif)' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Widget title={`Mata Pelajaran (${subjects.length})`}>
          <ul className="mb-3 flex flex-col gap-1.5 text-sm">
            {subjects.map((s) => (
              <li key={s.id} className="flex items-center justify-between">
                <span className="font-medium text-sand-900">{s.name}</span>
                <span className="text-xs text-sand-500">
                  {s.code}
                  {s.gradeLevel ? ` · K${s.gradeLevel}` : ''}
                </span>
              </li>
            ))}
            {subjects.length === 0 ? <li className="text-sand-500">Belum ada.</li> : null}
          </ul>
          <form onSubmit={onSubject} className="grid gap-2">
            <div className="grid grid-cols-3 gap-2">
              <input required name="code" placeholder="Kode *" maxLength={16} className={inputCls} />
              <input required name="name" placeholder="Nama mapel *" className={`${inputCls} col-span-2`} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select name="gradeLevel" className={inputCls}>
                <option value="">Semua tingkat</option>
                {[7, 8, 9].map((g) => (
                  <option key={g} value={g}>Kelas {g}</option>
                ))}
              </select>
              <Button type="submit" size="sm" variant="outline" disabled={busy}>
                + Mapel
              </Button>
            </div>
          </form>
        </Widget>

        <Widget title={`Rombel ${activeYear ? `· ${activeYear.name}` : ''} (${classes.length})`}>
          <ul className="mb-3 flex flex-col gap-1.5 text-sm">
            {classes.map((c) => (
              <li key={c.id} className="flex items-center justify-between">
                <span>
                  <span className="font-medium text-sand-900">{c.name}</span>
                  <span className="ml-2 text-xs text-sand-500">K{c.gradeLevel}</span>
                </span>
                <Badge tone="neutral">{c._count?.enrollments ?? 0} siswa</Badge>
              </li>
            ))}
            {classes.length === 0 ? <li className="text-sand-500">Belum ada.</li> : null}
          </ul>
          <form onSubmit={onClass} className="grid grid-cols-2 gap-2">
            <input required name="name" placeholder="Nama, mis. 7A *" className={inputCls} />
            <select required name="gradeLevel" className={inputCls}>
              <option value="">Tingkat *</option>
              {[7, 8, 9].map((g) => (
                <option key={g} value={g}>Kelas {g}</option>
              ))}
            </select>
            <Button type="submit" size="sm" variant="outline" disabled={busy || !yearId} className="col-span-2">
              + Rombel
            </Button>
          </form>
        </Widget>

        <Widget title="Tempatkan Siswa ke Rombel">
          <p className="mb-3 text-xs text-sand-500">
            Pilih siswa aktif dan rombel (satu rombel per tahun ajaran).
          </p>
          <form onSubmit={onEnroll} className="grid gap-2">
            <select required name="studentId" className={inputCls}>
              <option value="">Pilih siswa *</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.nis ? `(${s.nis})` : ''}
                </option>
              ))}
            </select>
            <select required name="classId" className={inputCls}>
              <option value="">Pilih rombel *</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <Button type="submit" size="sm" variant="outline" disabled={busy || !yearId}>
              Tempatkan
            </Button>
          </form>
        </Widget>
      </div>
    </Shell>
  );
}
