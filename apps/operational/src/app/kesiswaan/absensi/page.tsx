'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Field, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { PageTitle, Widget } from '@/components/widgets';
import {
  listAcademicYears,
  listAttendance,
  listClasses,
  listEnrollments,
  markAttendance,
  type ClassView,
} from '@/lib/api';

const STATUS_OPTS = [
  { key: 'PRESENT', label: 'Hadir', tone: 'bg-primary-700 text-white' },
  { key: 'SICK', label: 'Sakit', tone: 'bg-amber-500 text-white' },
  { key: 'PERMITTED', label: 'Izin', tone: 'bg-accent-500 text-white' },
  { key: 'ABSENT', label: 'Alfa', tone: 'bg-red-500 text-white' },
] as const;

type StatusKey = (typeof STATUS_OPTS)[number]['key'];

interface RosterRow {
  studentId: string;
  name: string;
  nis?: string | null;
  status: StatusKey;
}

export default function AbsensiPage() {
  const [classes, setClasses] = useState<ClassView[]>([]);
  const [classId, setClassId] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listAcademicYears()
      .then(async (ys) => {
        const active = ys.find((y) => y.isActive) ?? ys[0];
        const cls = await listClasses(active?.id);
        setClasses(cls);
        const first = cls[0];
        if (first) setClassId(first.id);
      })
      .catch(() => setError('Gagal memuat rombel.'));
  }, []);

  const loadRoster = useCallback(async () => {
    if (!classId || !date) {
      setRoster([]);
      return;
    }
    setLoading(true);
    try {
      const [enrollments, existing] = await Promise.all([
        listEnrollments(classId),
        listAttendance(classId, date).catch(() => []),
      ]);
      const byStudent = new Map(existing.map((a) => [a.studentId, a.status as StatusKey]));
      setRoster(
        enrollments.map((e) => ({
          studentId: e.student.id,
          name: e.student.name,
          nis: e.student.nis ?? null,
          status: byStudent.get(e.student.id) ?? 'PRESENT',
        })),
      );
      setError(null);
    } catch {
      setError('Gagal memuat daftar siswa.');
    } finally {
      setLoading(false);
    }
  }, [classId, date]);

  useEffect(() => {
    void loadRoster();
  }, [loadRoster]);

  const setAll = (s: StatusKey) =>
    setRoster((r) => r.map((x) => ({ ...x, status: s })));
  const setOne = (id: string, s: StatusKey) =>
    setRoster((r) => r.map((x) => (x.studentId === id ? { ...x, status: s } : x)));

  const counts = STATUS_OPTS.map((o) => ({
    ...o,
    n: roster.filter((r) => r.status === o.key).length,
  }));

  async function onSave() {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await markAttendance({
        classId,
        date,
        records: roster.map((r) => ({ studentId: r.studentId, status: r.status })),
      });
      setNotice(`Absensi ${date} tersimpan (${roster.length} siswa).`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan absensi.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <PageTitle title="Absensi Siswa" subtitle="Catat kehadiran harian per rombel" />
      {error ? (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
      ) : null}
      {notice ? (
        <p role="status" className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{notice}</p>
      ) : null}

      <div className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl border border-sand-200 bg-white p-4 shadow-card">
        <Field label="Rombel" className="w-48">
          <Select value={classId} onChange={(e) => setClassId(e.target.value)}>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Tanggal" className="w-44">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-11 w-full rounded-xl border border-sand-300 bg-white px-4 text-sm text-sand-900 shadow-xs focus:border-primary-600 focus-visible:focus-ring"
          />
        </Field>
        <span className="flex gap-1.5 pb-0.5">
          {counts.map((c) => (
            <Badge key={c.key} tone={c.key === 'PRESENT' ? 'primary' : c.key === 'ABSENT' ? 'danger' : 'accent'}>
              {c.label} {c.n}
            </Badge>
          ))}
        </span>
        <span className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setAll('PRESENT')}>
            Semua Hadir
          </Button>
          <Button size="sm" onClick={() => void onSave()} disabled={busy || roster.length === 0}>
            {busy ? 'Menyimpan…' : 'Simpan Absensi'}
          </Button>
        </span>
      </div>

      <Widget title={`Daftar Siswa (${roster.length})`}>
        {loading ? (
          <p className="py-6 text-center text-sm text-sand-400">Memuat…</p>
        ) : roster.length === 0 ? (
          <p className="py-6 text-center text-sm text-sand-500">
            {classId ? 'Belum ada siswa di rombel ini.' : 'Pilih rombel dulu.'}
          </p>
        ) : (
          <ul className="divide-y divide-sand-100">
            {roster.map((r) => (
              <li key={r.studentId} className="flex flex-wrap items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-sand-900">{r.name}</span>
                  {r.nis ? <span className="text-xs text-sand-400">NIS {r.nis}</span> : null}
                </span>
                <span className="flex gap-1">
                  {STATUS_OPTS.map((o) => (
                    <button
                      key={o.key}
                      type="button"
                      onClick={() => setOne(r.studentId, o.key)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                        r.status === o.key ? o.tone : 'bg-sand-100 text-sand-500 hover:bg-sand-200'
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Widget>
    </Shell>
  );
}
