'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { STUDENT_STATUS_LABELS } from '@smpmuh3/types';
import { Badge, Button, Card } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { PageTitle, Widget } from '@/components/widgets';
import {
  addAchievement,
  addViolation,
  getStudent,
  updateStudent,
  type StudentDetail,
} from '@/lib/api';

const inputCls =
  'h-10 w-full rounded-lg border border-sand-300 px-3 text-sm focus-visible:focus-ring';

export default function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [s, setS] = useState<StudentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    getStudent(id).then(setS).catch((e) => setError(e.message));
  }, [id]);
  useEffect(load, [load]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal');
    } finally {
      setBusy(false);
    }
  }

  function onAchievement(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    run(() =>
      addAchievement(id, {
        title: fd.get('title'),
        level: fd.get('level') || undefined,
        year: fd.get('year') ? Number(fd.get('year')) : undefined,
        description: fd.get('description') || undefined,
      }),
    ).then(() => (e.target as HTMLFormElement).reset());
  }

  function onViolation(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    run(() =>
      addViolation(id, {
        type: fd.get('type'),
        date: fd.get('date'),
        points: fd.get('points') ? Number(fd.get('points')) : 0,
        description: fd.get('description') || undefined,
      }),
    ).then(() => (e.target as HTMLFormElement).reset());
  }

  function onEdit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    run(() =>
      updateStudent(id, {
        name: fd.get('name'),
        nis: fd.get('nis') || undefined,
        nisn: fd.get('nisn') || undefined,
        status: fd.get('status'),
        force: true,
      }),
    );
  }

  return (
    <Shell>
      <PageTitle
        title={s ? s.name : 'Siswa'}
        subtitle={s ? `NIS ${s.nis ?? '—'} · NISN ${s.nisn ?? '—'}` : undefined}
        actions={
          <Link
            href="/kesiswaan"
            className="text-sm font-semibold text-primary-800 hover:underline"
          >
            ← Kembali
          </Link>
        }
      />
      {error ? (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {!s ? (
        <p className="text-sand-500">Memuat…</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-bold text-sand-950">Data Siswa</h2>
              <Badge tone={s.status === 'ACTIVE' ? 'primary' : 'neutral'}>
                {STUDENT_STATUS_LABELS[s.status]}
              </Badge>
            </div>
            <form onSubmit={onEdit} className="flex flex-col gap-3">
              <label className="text-sm font-semibold text-sand-900">
                Nama
                <input
                  name="name"
                  defaultValue={s.name}
                  minLength={3}
                  className={inputCls}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm font-semibold text-sand-900">
                  NIS
                  <input name="nis" defaultValue={s.nis ?? ''} className={inputCls} />
                </label>
                <label className="text-sm font-semibold text-sand-900">
                  NISN
                  <input name="nisn" defaultValue={s.nisn ?? ''} pattern="\d{10}" className={inputCls} />
                </label>
              </div>
              <label className="text-sm font-semibold text-sand-900">
                Status
                <select name="status" defaultValue={s.status} className={inputCls}>
                  {Object.entries(STUDENT_STATUS_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <Button type="submit" disabled={busy} size="sm">
                {busy ? 'Menyimpan…' : 'Simpan Perubahan'}
              </Button>
            </form>
            <div className="mt-4 border-t border-sand-100 pt-3 text-sm">
              <p className="font-semibold text-sand-900">Rombel</p>
              {s.enrollments.length === 0 ? (
                <p className="text-sand-500">Belum masuk rombel.</p>
              ) : (
                <ul className="text-sand-700">
                  {s.enrollments.map((e) => (
                    <li key={e.id}>
                      {e.class.name} · {e.academicYear.name}
                    </li>
                  ))}
                </ul>
              )}
              {s.parent ? (
                <p className="mt-2 text-sand-600">
                  Orang tua: {s.parent.name} ({s.parent.email})
                </p>
              ) : null}
            </div>
          </Card>

          <div className="flex flex-col gap-4">
            <Widget title={`Prestasi (${s.achievements.length})`}>
              <ul className="mb-3 flex flex-col gap-2 text-sm">
                {s.achievements.map((a) => (
                  <li key={a.id} className="rounded-lg bg-sand-100 px-3 py-2">
                    <span className="font-medium text-sand-900">{a.title}</span>
                    <span className="ml-2 text-xs text-sand-500">
                      {[a.level, a.year].filter(Boolean).join(' · ')}
                    </span>
                  </li>
                ))}
                {s.achievements.length === 0 ? (
                  <li className="text-sand-500">Belum ada.</li>
                ) : null}
              </ul>
              <form onSubmit={onAchievement} className="grid gap-2">
                <input required name="title" placeholder="Judul prestasi *" className={inputCls} />
                <div className="grid grid-cols-2 gap-2">
                  <input name="level" placeholder="Tingkat" className={inputCls} />
                  <input name="year" type="number" placeholder="Tahun" className={inputCls} />
                </div>
                <Button type="submit" size="sm" variant="outline" disabled={busy}>
                  Tambah Prestasi
                </Button>
              </form>
            </Widget>

            <Widget title={`Pelanggaran (${s.violations.length})`}>
              <ul className="mb-3 flex flex-col gap-2 text-sm">
                {s.violations.map((v) => (
                  <li key={v.id} className="rounded-lg bg-red-50 px-3 py-2">
                    <span className="font-medium text-red-900">{v.type}</span>
                    <span className="ml-2 text-xs text-red-600">
                      {new Date(v.date).toLocaleDateString('id-ID')} · {v.points} poin
                    </span>
                  </li>
                ))}
                {s.violations.length === 0 ? (
                  <li className="text-sand-500">Tidak ada catatan.</li>
                ) : null}
              </ul>
              <form onSubmit={onViolation} className="grid gap-2">
                <input required name="type" placeholder="Jenis pelanggaran *" className={inputCls} />
                <div className="grid grid-cols-2 gap-2">
                  <input required name="date" type="date" className={inputCls} />
                  <input name="points" type="number" placeholder="Poin" className={inputCls} />
                </div>
                <Button type="submit" size="sm" variant="outline" disabled={busy}>
                  Catat Pelanggaran
                </Button>
              </form>
            </Widget>
          </div>
        </div>
      )}
    </Shell>
  );
}
