'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Field, Input, Modal, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { PageTitle, Widget } from '@/components/widgets';
import {
  createAssignment,
  createSchedule,
  deleteSchedule,
  listAcademicYears,
  listAssignments,
  listClasses,
  listEmployees,
  listSchedules,
  listSubjects,
  type AcademicYear,
  type AssignmentView,
  type ClassView,
  type EmployeeDto,
  type ScheduleView,
  type SubjectView,
} from '@/lib/api';

const DAYS = ['', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const toMin = (hhmm: string) => {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const toHHMM = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}.${String(min % 60).padStart(2, '0')}`;

export default function JadwalPage() {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [yearId, setYearId] = useState('');
  const [classes, setClasses] = useState<ClassView[]>([]);
  const [classId, setClassId] = useState('');
  const [employees, setEmployees] = useState<EmployeeDto[]>([]);
  const [subjects, setSubjects] = useState<SubjectView[]>([]);
  const [assignments, setAssignments] = useState<AssignmentView[]>([]);
  const [schedules, setSchedules] = useState<ScheduleView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [showEntry, setShowEntry] = useState(false);

  useEffect(() => {
    Promise.all([listAcademicYears(), listEmployees('TEACHER'), listSubjects()])
      .then(([ys, emps, subs]) => {
        setYears(ys);
        setEmployees(emps);
        setSubjects(subs);
        const active = ys.find((y) => y.isActive) ?? ys[0];
        if (active) setYearId(active.id);
      })
      .catch(() => setError('Gagal memuat data awal.'));
  }, []);

  const refresh = useCallback(async () => {
    const [cls, asg, sch] = await Promise.all([
      listClasses(yearId || undefined),
      listAssignments(yearId || undefined),
      listSchedules(classId || undefined, yearId || undefined),
    ]);
    setClasses(cls);
    setAssignments(asg);
    setSchedules(sch);
    const first = cls[0];
    if (first && !cls.some((c) => c.id === classId)) setClassId(first.id);
  }, [yearId, classId]);

  useEffect(() => {
    if (yearId) void refresh();
  }, [yearId, refresh]);

  const classAssignments = useMemo(
    () => assignments.filter((a) => a.class.id === classId),
    [assignments, classId],
  );

  async function run(fn: () => Promise<unknown>, ok: string) {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await fn();
      await refresh();
      setNotice(ok);
      setShowAssign(false);
      setShowEntry(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Aksi gagal.');
    } finally {
      setBusy(false);
    }
  }

  const byDay = useMemo(() => {
    const map = new Map<number, ScheduleView[]>();
    for (const s of schedules) {
      const list = map.get(s.day) ?? [];
      list.push(s);
      map.set(s.day, list);
    }
    return map;
  }, [schedules]);

  return (
    <Shell>
      <PageTitle
        title="Jadwal & Penugasan Guru"
        subtitle="Atur guru pengampu per rombel, lalu susun jadwal mingguan"
        actions={
          <span className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowAssign(true)}>
              + Penugasan
            </Button>
            <Button size="sm" onClick={() => setShowEntry(true)} disabled={classAssignments.length === 0}>
              + Entri Jadwal
            </Button>
          </span>
        }
      />
      {error ? (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
      ) : null}
      {notice ? (
        <p role="status" className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{notice}</p>
      ) : null}

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <Field label="Tahun Ajaran" className="w-44">
          <Select value={yearId} onChange={(e) => setYearId(e.target.value)}>
            {years.map((y) => (
              <option key={y.id} value={y.id}>{y.name}{y.isActive ? ' (aktif)' : ''}</option>
            ))}
          </Select>
        </Field>
        <Field label="Rombel" className="w-44">
          <Select value={classId} onChange={(e) => setClassId(e.target.value)}>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-5 xl:grid-cols-[320px_1fr]">
        {/* ---------- Penugasan ---------- */}
        <Widget title={`Penugasan Kelas ${classes.find((c) => c.id === classId)?.name ?? ''}`}>
          <ul className="space-y-2">
            {classAssignments.map((a) => (
              <li key={a.id} className="rounded-xl border border-sand-200 bg-sand-50 px-3.5 py-2.5">
                <p className="text-sm font-bold text-sand-900">{a.subject.name}</p>
                <p className="text-xs text-sand-500">{a.employee.name} · {a.subject.code}</p>
              </li>
            ))}
            {classAssignments.length === 0 ? (
              <li className="py-6 text-center text-sm text-sand-500">
                Belum ada penugasan — tambahkan dulu.
              </li>
            ) : null}
          </ul>
        </Widget>

        {/* ---------- Grid jadwal ---------- */}
        <Widget title="Jadwal Mingguan">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {DAYS.slice(1).map((name, i) => {
              const day = i + 1;
              const entries = byDay.get(day) ?? [];
              return (
                <div key={day} className="rounded-2xl border border-sand-200 bg-sand-50 p-3">
                  <p className="mb-2 text-xs font-bold uppercase tracking-wider text-sand-500">{name}</p>
                  {entries.length === 0 ? (
                    <p className="py-3 text-center text-xs text-sand-400">Kosong</p>
                  ) : (
                    <ul className="space-y-2">
                      {entries.map((s) => (
                        <li key={s.id} className="group rounded-xl bg-white px-3 py-2 shadow-sm">
                          <p className="text-xs font-bold text-primary-800">{s.assignment.subject.name}</p>
                          <p className="text-[11px] text-sand-500">{s.assignment.employee.name}</p>
                          <p className="mt-1 flex items-center justify-between text-[11px] font-semibold text-sand-600">
                            <span>{toHHMM(s.startMinute)}–{toHHMM(s.endMinute)}{s.room ? ` · ${s.room}` : ''}</span>
                            <button
                              type="button"
                              aria-label="Hapus entri"
                              className="text-red-500 opacity-0 transition-opacity group-hover:opacity-100"
                              onClick={() => void run(() => deleteSchedule(s.id), 'Entri dihapus.')}
                            >
                              ✕
                            </button>
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </Widget>
      </div>

      {/* ---------- Modal penugasan ---------- */}
      <Modal open={showAssign} onClose={() => setShowAssign(false)} title="Tambah Penugasan Guru">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void run(
              () =>
                createAssignment({
                  employeeId: String(f.get('employeeId')),
                  subjectId: String(f.get('subjectId')),
                  classId,
                  academicYearId: yearId,
                }),
              'Penugasan ditambahkan.',
            );
          }}
        >
          <Field label="Guru">
            <Select name="employeeId" required>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.name}{e.nip ? ` · ${e.nip}` : ''}</option>
              ))}
            </Select>
          </Field>
          <Field label="Mata Pelajaran">
            <Select name="subjectId" required>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
              ))}
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setShowAssign(false)}>Batal</Button>
            <Button type="submit" disabled={busy}>Simpan</Button>
          </div>
        </form>
      </Modal>

      {/* ---------- Modal entri jadwal ---------- */}
      <Modal open={showEntry} onClose={() => setShowEntry(false)} title="Tambah Entri Jadwal">
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void run(
              () =>
                createSchedule({
                  assignmentId: String(f.get('assignmentId')),
                  day: Number(f.get('day')),
                  startMinute: toMin(String(f.get('start'))),
                  endMinute: toMin(String(f.get('end'))),
                  room: String(f.get('room') ?? '') || undefined,
                }),
              'Entri jadwal ditambahkan.',
            );
          }}
        >
          <Field label="Penugasan" className="sm:col-span-2">
            <Select name="assignmentId" required>
              {classAssignments.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.subject.name} — {a.employee.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Hari">
            <Select name="day" required defaultValue="1">
              {DAYS.slice(1).map((d, i) => (
                <option key={i + 1} value={i + 1}>{d}</option>
              ))}
            </Select>
          </Field>
          <Field label="Ruangan">
            <Input name="room" placeholder="R.7A / Lab" />
          </Field>
          <Field label="Mulai">
            <Input name="start" type="time" required defaultValue="07:00" />
          </Field>
          <Field label="Selesai">
            <Input name="end" type="time" required defaultValue="07:45" />
          </Field>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="ghost" onClick={() => setShowEntry(false)}>Batal</Button>
            <Button type="submit" disabled={busy}>Simpan</Button>
          </div>
        </form>
      </Modal>
    </Shell>
  );
}
