'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Field, Input, Modal, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { PageTitle, Widget } from '@/components/widgets';
import { SearchSelect } from '@/components/search-select';
import { useConfirm } from '@/components/confirm-dialog';
import { PERMISSIONS } from '@smpmuh3/types';
import { usePermission } from '@/lib/use-permission';
import {
  createAssignment,
  createSchedule,
  deleteAssignment,
  deleteSchedule,
  listAcademicYears,
  listAssignments,
  listClasses,
  listEmployees,
  listSchedules,
  listSubjects,
  updateAssignment,
  updateSchedule,
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
  const [editAssign, setEditAssign] = useState<AssignmentView | null>(null);
  const [editEmployee, setEditEmployee] = useState<EmployeeDto | null>(null);
  const [editEntry, setEditEntry] = useState<ScheduleView | null>(null);
  const canManage = usePermission(PERMISSIONS.ACADEMIC_MANAGE);
  const { confirm, dialog } = useConfirm();

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
      setEditAssign(null);
      setEditEntry(null);
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
          canManage ? (
            <span className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowAssign(true)}>
                + Penugasan
              </Button>
              <Button size="sm" onClick={() => setShowEntry(true)} disabled={classAssignments.length === 0}>
                + Entri Jadwal
              </Button>
            </span>
          ) : undefined
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

      <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        {/* ---------- Penugasan ---------- */}
        <Widget title={`Penugasan Kelas ${classes.find((c) => c.id === classId)?.name ?? ''}`}>
          <ul className="space-y-2">
            {classAssignments.map((a) => (
              <li key={a.id} className="rounded-xl border border-sand-200 bg-sand-50 px-3.5 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-sand-900">{a.subject.name}</p>
                    <p className="text-xs text-sand-500">{a.employee.name} · {a.subject.code}</p>
                  </div>
                  {canManage ? (
                    <span className="flex shrink-0 gap-1 pt-0.5">
                      <button
                        type="button"
                        title="Ubah guru/mapel"
                        className="rounded-lg px-1.5 py-0.5 text-xs text-primary-700 hover:bg-primary-50"
                        onClick={() => {
                          setEditAssign(a);
                          setEditEmployee(
                            employees.find((e) => e.id === a.employee.id) ??
                              ({ id: a.employee.id, name: a.employee.name } as EmployeeDto),
                          );
                        }}
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        title="Hapus penugasan"
                        className="rounded-lg px-1.5 py-0.5 text-xs text-red-600 hover:bg-red-50"
                        onClick={() =>
                          void (async () => {
                            const n = a.schedules?.length ?? 0;
                            const ok = await confirm({
                              title: `Hapus penugasan ${a.subject.name}?`,
                              body: `${a.employee.name} · ${n} entri jadwal ikut terhapus.`,
                              confirmLabel: 'Ya, hapus',
                            });
                            if (ok) void run(() => deleteAssignment(a.id), 'Penugasan dihapus.');
                          })()
                        }
                      >
                        🗑
                      </button>
                    </span>
                  ) : null}
                </div>
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
                            {canManage ? (
                              <span className="flex gap-0.5">
                                <button
                                  type="button"
                                  aria-label="Ubah entri"
                                  title="Ubah hari/jam"
                                  className="text-primary-600 hover:underline"
                                  onClick={() => setEditEntry(s)}
                                >
                                  ✎
                                </button>
                                <button
                                  type="button"
                                  aria-label="Hapus entri"
                                  title="Hapus entri"
                                  className="text-red-500 hover:underline"
                                  onClick={() =>
                                    void (async () => {
                                      const ok = await confirm({
                                        title: 'Hapus entri jadwal?',
                                        body: `${s.assignment.subject.name} — ${DAYS[s.day]} ${toHHMM(s.startMinute)}–${toHHMM(s.endMinute)}`,
                                        confirmLabel: 'Ya, hapus',
                                      });
                                      if (ok) void run(() => deleteSchedule(s.id), 'Entri dihapus.');
                                    })()
                                  }
                                >
                                  ✕
                                </button>
                              </span>
                            ) : null}
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
            <SearchSelect
              name="employeeId"
              required
              placeholder="Ketik nama guru…"
              load={(q) =>
                Promise.resolve(
                  employees.filter((e) => e.name.toLowerCase().includes(q.trim().toLowerCase())),
                )
              }
              label={(e) => e.name}
              sub={(e) => e.nip}
            />
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

      {/* ---------- Modal ubah penugasan ---------- */}
      <Modal
        open={editAssign !== null}
        onClose={() => setEditAssign(null)}
        title={`Ubah Penugasan — ${editAssign?.subject.name ?? ''}`}
      >
        {editAssign ? (
          <form
            key={editAssign.id}
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const emp = String(f.get('employeeId') ?? '');
              const sub = String(f.get('subjectId') ?? '');
              void run(
                () =>
                  updateAssignment(editAssign.id, {
                    ...(emp ? { employeeId: emp } : {}),
                    ...(sub ? { subjectId: sub } : {}),
                  }),
                'Penugasan diperbarui.',
              );
            }}
          >
            <p className="rounded-xl bg-sand-50 px-3 py-2 text-xs text-sand-500">
              Kelas {editAssign.class.name} — salah input guru atau mapel bisa diperbaiki di sini.
            </p>
            <Field label="Guru">
              <SearchSelect
                name="employeeId"
                required
                placeholder="Ketik nama guru…"
                value={editEmployee}
                onPick={setEditEmployee}
                load={(q) =>
                  Promise.resolve(
                    employees.filter((e) => e.name.toLowerCase().includes(q.trim().toLowerCase())),
                  )
                }
                label={(e) => e.name}
                sub={(e) => e.nip}
              />
            </Field>
            <Field label="Mata Pelajaran">
              <Select name="subjectId" required defaultValue={editAssign.subject.id}>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                ))}
              </Select>
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setEditAssign(null)}>Batal</Button>
              <Button type="submit" disabled={busy}>Simpan</Button>
            </div>
          </form>
        ) : null}
      </Modal>

      {/* ---------- Modal ubah entri jadwal ---------- */}
      <Modal
        open={editEntry !== null}
        onClose={() => setEditEntry(null)}
        title="Ubah Entri Jadwal"
      >
        {editEntry ? (
          <form
            key={editEntry.id}
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(
                () =>
                  updateSchedule(editEntry.id, {
                    day: Number(f.get('day')),
                    startMinute: toMin(String(f.get('start'))),
                    endMinute: toMin(String(f.get('end'))),
                    room: String(f.get('room') ?? ''),
                  }),
                'Entri jadwal diperbarui.',
              );
            }}
          >
            <p className="rounded-xl bg-sand-50 px-3 py-2 text-xs text-sand-500 sm:col-span-2">
              {editEntry.assignment.subject.name} — {editEntry.assignment.employee.name} ·{' '}
              {editEntry.assignment.class.name}
            </p>
            <Field label="Hari">
              <Select name="day" required defaultValue={String(editEntry.day)}>
                {DAYS.slice(1).map((d, i) => (
                  <option key={i + 1} value={i + 1}>{d}</option>
                ))}
              </Select>
            </Field>
            <Field label="Ruangan">
              <Input name="room" defaultValue={editEntry.room ?? ''} placeholder="R.7A / Lab" />
            </Field>
            <Field label="Mulai">
              <Input
                name="start"
                type="time"
                required
                defaultValue={`${String(Math.floor(editEntry.startMinute / 60)).padStart(2, '0')}:${String(editEntry.startMinute % 60).padStart(2, '0')}`}
              />
            </Field>
            <Field label="Selesai">
              <Input
                name="end"
                type="time"
                required
                defaultValue={`${String(Math.floor(editEntry.endMinute / 60)).padStart(2, '0')}:${String(editEntry.endMinute % 60).padStart(2, '0')}`}
              />
            </Field>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button type="button" variant="ghost" onClick={() => setEditEntry(null)}>Batal</Button>
              <Button type="submit" disabled={busy}>Simpan</Button>
            </div>
          </form>
        ) : null}
      </Modal>
      {dialog}
    </Shell>
  );
}
