'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Input } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { PageTitle, Widget } from '@/components/widgets';
import {
  clearClassAttendance,
  getClassAttendance,
  getMyTeachingToday,
  saveClassAttendance,
  type ClassAttendanceRow,
  type TeacherSession,
} from '@/lib/api-ops';
import { ApiError, listClasses, listAcademicYears } from '@/lib/api';
import { cn } from '@smpmuh3/ui';
import { useConfirm } from '@/components/confirm-dialog';

const mm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}.${String(m % 60).padStart(2, '0')}`;
const DOW_FULL = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const fmtDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return `${DOW_FULL[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};
const shift = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const STATUSES = ['PRESENT', 'SICK', 'PERMIT', 'ABSENT'] as const;
const STATUS_LABEL: Record<string, string> = {
  PRESENT: 'Hadir', SICK: 'Sakit', PERMIT: 'Izin', ABSENT: 'Alpha',
};
const STATUS_SHORT: Record<string, string> = {
  PRESENT: 'H', SICK: 'S', PERMIT: 'I', ABSENT: 'A',
};
const STATUS_ACTIVE_CLS: Record<string, string> = {
  PRESENT: 'bg-emerald-600 text-white border-emerald-600',
  SICK: 'bg-sky-600 text-white border-sky-600',
  PERMIT: 'bg-amber-500 text-white border-amber-500',
  ABSENT: 'bg-red-600 text-white border-red-600',
};

export default function AbsenKelasPage() {
  const { confirm, dialog } = useConfirm();
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [sessions, setSessions] = useState<TeacherSession[]>([]);
  const [classId, setClassId] = useState('');
  const [rows, setRows] = useState<ClassAttendanceRow[]>([]);
  const [search, setSearch] = useState('');
  const [taken, setTaken] = useState(false);
  const [takenBy, setTakenBy] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [allClasses, setAllClasses] = useState<{ id: string; name: string }[]>([]);
  const [otherOpen, setOtherOpen] = useState(false);

  useEffect(() => {
    getMyTeachingToday(date).then((r) => setSessions(r.sessions)).catch(() => setSessions([]));
    listAcademicYears()
      .then((ys) => {
        const y = ys.find((x) => x.isActive) ?? ys[0];
        if (y) return listClasses(y.id);
        return [];
      })
      .then(setAllClasses)
      .catch(() => {});
  }, [date]);

  const pickClass = useCallback(
    (cid: string) => {
      setClassId(cid);
      setRows([]);
      setError(null);
      setNotice(null);
      if (!cid) return;
      setLoading(true);
      getClassAttendance(cid, date)
        .then((r) => {
          setRows(r.students);
          setTaken(r.taken);
          setTakenBy(r.takenBy ?? null);
        })
        .catch((e) => setError(e instanceof ApiError ? e.message : 'Gagal memuat.'))
        .finally(() => setLoading(false));
    },
    [date],
  );

  const changeDate = (d: string) => {
    setDate(d);
    setRows([]);
    setClassId('');
    setNotice(null);
    setError(null);
  };

  const filtered = rows.filter(
    (s) => !search || s.name.toLowerCase().includes(search.toLowerCase()) || (s.nis ?? '').includes(search),
  );

  const setStatus = (id: string, status: string) =>
    setRows((rs) => rs.map((s) => (s.id === id ? { ...s, status } : s)));

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await saveClassAttendance({
        classId,
        date,
        rows: rows.map((s) => ({ studentId: s.id, status: s.status, ...(s.note ? { note: s.note } : {}) })),
      });
      setNotice(`Absen ${rows.length} siswa tersimpan.`);
      setTaken(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal menyimpan.');
    } finally {
      setBusy(false);
    }
  };

  const counts = useMemo(
    () => rows.reduce((a, s) => ({ ...a, [s.status]: (a[s.status] ?? 0) + 1 }), {} as Record<string, number>),
    [rows],
  );

  const otherClasses = allClasses.filter((c) => !sessions.some((s) => s.class.id === c.id));
  const pickedSession = sessions.find((s) => s.class.id === classId);
  const pickedName = pickedSession?.class.name ?? allClasses.find((c) => c.id === classId)?.name ?? '';

  return (
    <Shell>
      <PageTitle title="Absen Kelas" subtitle="Pilih tanggal, ketuk kelas dari jadwal Anda, lalu tandai siswa yang tidak hadir." />
      {error ? <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p> : null}
      {notice ? <p role="status" className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{notice}</p> : null}

      {/* Tanggal — geser harian cepat */}
      <div className="mb-4 flex items-center gap-2 rounded-2xl border border-sand-200 bg-white p-3 shadow-card">
        <button
          type="button"
          aria-label="Hari sebelumnya"
          onClick={() => changeDate(shift(date, -1))}
          className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sand-100 text-lg font-bold text-sand-700 active:bg-sand-200"
        >
          ‹
        </button>
        <label className="min-w-0 flex-1 cursor-pointer text-center">
          <span className="block text-sm font-bold text-sand-900">{fmtDate(date)}</span>
          <span className="text-[11px] text-sand-400">{date === today ? 'Hari ini — ketuk untuk ganti tanggal' : 'Ketuk untuk ganti tanggal'}</span>
          <input
            type="date"
            value={date}
            onChange={(e) => changeDate(e.target.value)}
            className="sr-only"
            aria-label="Pilih tanggal absen"
          />
        </label>
        <button
          type="button"
          aria-label="Hari berikutnya"
          onClick={() => changeDate(shift(date, 1))}
          className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sand-100 text-lg font-bold text-sand-700 active:bg-sand-200"
        >
          ›
        </button>
      </div>

      {/* Kelas dari jadwal mengajar */}
      {!classId ? (
        <>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-sand-500">
            Jadwal mengajar Anda {date === today ? 'hari ini' : 'tanggal ini'}
          </p>
          {sessions.length === 0 ? (
            <Widget title="Tidak ada jadwal">
              <p className="px-1 py-2 text-sm text-sand-500">
                Tidak ada jadwal mengajar Anda di tanggal ini — lupa absen kemarin? Pilih tanggal lain, atau buka <b>kelas lain</b> di bawah.
              </p>
            </Widget>
          ) : (
            <div className="grid gap-2.5 sm:grid-cols-2">
              {sessions.map((s) => (
                <button
                  key={s.assignmentId}
                  type="button"
                  onClick={() => pickClass(s.class.id)}
                  className="flex items-center gap-3 rounded-2xl border border-sand-200 bg-white p-4 text-left shadow-card transition-colors active:border-primary-300 active:bg-primary-50"
                >
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-700 text-sm font-extrabold text-white">
                    {s.class.name.replace(/\D/g, '') || s.class.name.slice(0, 2)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold text-sand-900">
                      {s.class.name} · {s.subject.name}
                    </span>
                    <span className="block text-xs text-sand-500">
                      {mm(s.startMinute)}–{mm(s.endMinute)}
                    </span>
                  </span>
                  <span aria-hidden className="text-sand-300">›</span>
                </button>
              ))}
            </div>
          )}

          {otherClasses.length ? (
            <div className="mt-5">
              <button
                type="button"
                onClick={() => setOtherOpen((v) => !v)}
                aria-expanded={otherOpen}
                className="flex w-full items-center justify-between rounded-2xl border border-dashed border-sand-300 bg-sand-50 px-4 py-3 text-sm font-semibold text-sand-600"
              >
                Kelas lain ({otherClasses.length}) — untuk absen cadangan/admin
                <span aria-hidden className={cn('transition-transform', otherOpen && 'rotate-180')}>▾</span>
              </button>
              {otherOpen ? (
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  {otherClasses.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => pickClass(c.id)}
                      className="flex items-center gap-3 rounded-2xl border border-sand-200 bg-white p-3 text-left shadow-card transition-colors active:border-primary-300 active:bg-primary-50"
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sand-200 text-xs font-extrabold text-sand-700">
                        {c.name.replace(/\D/g, '') || c.name.slice(0, 2)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-bold text-sand-900">{c.name}</span>
                      <span aria-hidden className="text-sand-300">›</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      ) : (
        <>
          {/* Header kelas terpilih */}
          <div className="mb-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() => { setClassId(''); setRows([]); }}
              className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-sand-200 bg-white text-sand-600 shadow-card"
              aria-label="Kembali ke pilihan kelas"
            >
              ‹
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate font-extrabold text-sand-900">
                {pickedName}
                {pickedSession ? <span className="font-medium text-sand-500"> · {pickedSession.subject.name}</span> : null}
              </p>
              <p className="text-xs text-sand-500">
                {rows.length} siswa{taken ? ` · sudah diabsen${takenBy ? ` oleh ${takenBy}` : ''} — simpan lagi untuk revisi` : ''}
              </p>
            </div>
            {taken ? (
              <>
                <Badge tone="primary">Terabsen</Badge>
                <button
                  type="button"
                  title="Hapus seluruh absen kelas ini tanggal ini"
                  onClick={async () => {
                    if (!(await confirm(`Hapus absen ${pickedName} tanggal ${fmtDate(date)}? Data bisa diisi ulang.`))) return;
                    setBusy(true);
                    try {
                      await clearClassAttendance(classId, date);
                      pickClass(classId);
                      setNotice('Absen kelas dikosongkan.');
                    } catch (e) { setError(e instanceof ApiError ? e.message : 'Gagal menghapus.'); }
                    finally { setBusy(false); }
                  }}
                  className="shrink-0 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-600 active:bg-red-100"
                >
                  Reset
                </button>
              </>
            ) : null}
          </div>

          {loading ? (
            <p className="py-8 text-center text-sm text-sand-500">Memuat daftar siswa…</p>
          ) : rows.length ? (
            <>
              <div className="mb-3 flex items-center gap-2">
                <Input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari nama / NIS…"
                  className="flex-1"
                />
                <button
                  type="button"
                  onClick={() => setRows((rs) => rs.map((s) => ({ ...s, status: 'PRESENT' })))}
                  className="shrink-0 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-bold text-emerald-700"
                >
                  Semua Hadir
                </button>
              </div>

              {/* Roster — kartu per siswa, tombol status besar */}
              <ul className="space-y-2 pb-24">
                {filtered.map((s) => (
                  <li key={s.id} className="rounded-2xl border border-sand-200 bg-white p-3 shadow-card">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-sand-900">{s.name}</p>
                        <p className="text-xs text-sand-500">{s.nis ?? '—'}</p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        {STATUSES.map((st) => (
                          <button
                            key={st}
                            type="button"
                            title={STATUS_LABEL[st]}
                            onClick={() => setStatus(s.id, st)}
                            className={cn(
                              'flex size-9 items-center justify-center rounded-xl border text-sm font-extrabold transition-colors',
                              s.status === st
                                ? STATUS_ACTIVE_CLS[st]
                                : 'border-sand-200 bg-sand-50 text-sand-400 active:bg-sand-200',
                            )}
                          >
                            {STATUS_SHORT[st]}
                          </button>
                        ))}
                        {taken ? (
                          <button
                            type="button"
                            title="Hapus absen siswa ini tanggal ini"
                            onClick={async () => {
                              if (!(await confirm(`Hapus absen ${s.name}?`))) return;
                              try {
                                await clearClassAttendance(classId, date, s.id);
                                pickClass(classId);
                              } catch (e) { setError(e instanceof ApiError ? e.message : 'Gagal menghapus.'); }
                            }}
                            className="flex size-9 items-center justify-center rounded-xl border border-sand-200 bg-sand-50 text-xs font-bold text-sand-400 active:bg-red-50 active:text-red-600"
                          >
                            ✕
                          </button>
                        ) : null}
                      </div>
                    </div>
                    {s.status !== 'PRESENT' ? (
                      <Input
                        value={s.note ?? ''}
                        onChange={(e) => setRows((rs) => rs.map((x) => (x.id === s.id ? { ...x, note: e.target.value } : x)))}
                        placeholder={`Catatan ${STATUS_LABEL[s.status]} (opsional)…`}
                        className="mt-2"
                      />
                    ) : null}
                  </li>
                ))}
                {filtered.length === 0 ? (
                  <li className="py-8 text-center text-sm text-sand-500">Tidak ada siswa cocok dengan pencarian.</li>
                ) : null}
              </ul>

              {/* Bar simpan sticky — di atas bottom-nav */}
              <div className="fixed inset-x-0 bottom-[57px] z-30 border-t border-sand-200 bg-white/95 px-4 py-2.5 backdrop-blur lg:bottom-0">
                <div className="mx-auto flex max-w-6xl items-center gap-3">
                  <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                    {STATUSES.filter((st) => counts[st]).map((st) => (
                      <span key={st} className={cn('rounded-lg px-2 py-1 text-[11px] font-bold text-white', STATUS_ACTIVE_CLS[st])}>
                        {STATUS_LABEL[st]} {counts[st]}
                      </span>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={save}
                    disabled={busy}
                    className="shrink-0 rounded-xl bg-primary-700 px-5 py-2.5 text-sm font-extrabold text-white shadow-card transition active:scale-95 disabled:opacity-60"
                  >
                    {busy ? 'Menyimpan…' : 'Simpan Absen'}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <p className="py-8 text-center text-sm text-sand-500">Tidak ada siswa di kelas ini.</p>
          )}
        </>
      )}
      {dialog}
    </Shell>
  );
}
