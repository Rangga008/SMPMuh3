'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Field, Input, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { PageTitle, Widget } from '@/components/widgets';
import { DataTable } from '@/components/data-table';
import {
  getClassAttendance,
  getMyTeachingToday,
  saveClassAttendance,
  type ClassAttendanceRow,
  type TeacherSession,
} from '@/lib/api-ops';
import { ApiError, listClasses, listAcademicYears } from '@/lib/api';

const mm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}.${String(m % 60).padStart(2, '0')}`;
const STATUS_TONE: Record<string, 'primary' | 'accent' | 'neutral' | 'danger'> = {
  PRESENT: 'primary', SICK: 'accent', PERMIT: 'neutral', ABSENT: 'danger',
};
const STATUS_LABEL: Record<string, string> = {
  PRESENT: 'Hadir', SICK: 'Sakit', PERMIT: 'Izin', ABSENT: 'Alpha',
};

export default function AbsenKelasPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [sessions, setSessions] = useState<TeacherSession[]>([]);
  const [classId, setClassId] = useState('');
  const [rows, setRows] = useState<ClassAttendanceRow[]>([]);
  const [search, setSearch] = useState('');
  const [taken, setTaken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [allClasses, setAllClasses] = useState<{ id: string; name: string }[]>([]);

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
      if (!cid) return;
      getClassAttendance(cid, date)
        .then((r) => {
          setRows(r.students);
          setTaken(r.taken);
        })
        .catch((e) => setError(e instanceof ApiError ? e.message : 'Gagal memuat.'));
    },
    [date],
  );

  const filtered = rows.filter(
    (s) => !search || s.name.toLowerCase().includes(search.toLowerCase()) || (s.nis ?? '').includes(search),
  );

  const cycle = (id: string) =>
    setRows((rs) =>
      rs.map((s) => {
        if (s.id !== id) return s;
        const order = ['PRESENT', 'SICK', 'PERMIT', 'ABSENT'];
        const next = order[(order.indexOf(s.status) + 1) % order.length] ?? 'PRESENT';
        return { ...s, status: next };
      }),
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

  const counts = rows.reduce(
    (a, s) => ({ ...a, [s.status]: (a[s.status] ?? 0) + 1 }),
    {} as Record<string, number>,
  );

  return (
    <Shell>
      <PageTitle title="Absen Kelas" subtitle="Absensi siswa harian — pilih kelas dari jadwal mengajar Anda, lalu tandai yang tidak hadir." />
      {error ? <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p> : null}
      {notice ? <p role="status" className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{notice}</p> : null}

      <div className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl border border-sand-200 bg-white p-4 shadow-card">
        <Field label="Tanggal">
          <Input type="date" value={date} onChange={(e) => { setDate(e.target.value); setRows([]); setClassId(''); }} />
        </Field>
        <Field label="Kelas (jadwal Anda hari ini)" className="flex-1 min-w-56">
          <Select value={classId} onChange={(e) => pickClass(e.target.value)}>
            <option value="">— Pilih kelas —</option>
            <optgroup label="Jadwal mengajar Anda">
              {sessions.map((s) => (
                <option key={s.assignmentId} value={s.class.id}>
                  {s.class.name} — {s.subject.name} ({mm(s.startMinute)}–{mm(s.endMinute)})
                </option>
              ))}
            </optgroup>
            <optgroup label="Semua kelas">
              {allClasses.filter((c) => !sessions.some((s) => s.class.id === c.id)).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </optgroup>
          </Select>
        </Field>
        {rows.length ? (
          <Field label="Cari siswa">
            <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nama / NIS…" />
          </Field>
        ) : null}
      </div>

      {rows.length ? (
        <Widget
          title={`Daftar Siswa${taken ? ' — sudah diabsen' : ''}`}
          subtitle="Semua default Hadir — klik status untuk mengubah (Sakit/Izin/Alpha), lalu Simpan."
          action={
            <div className="flex items-center gap-3">
              <span className="flex gap-2 text-xs">
                {Object.entries(counts).map(([k, v]) => (
                  <Badge key={k} tone={STATUS_TONE[k] ?? 'neutral'}>{STATUS_LABEL[k]} {v}</Badge>
                ))}
              </span>
              <Button onClick={save} disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan Absen'}</Button>
            </div>
          }
        >
          <DataTable
            head={['NIS', 'Nama', 'Status', 'Catatan']}
            loading={false}
            empty={filtered.length === 0 ? 'Tidak ada siswa cocok.' : undefined}
          >
            {filtered.map((s) => (
              <tr key={s.id}>
                <td className="px-5 py-2.5 text-sand-500">{s.nis ?? '—'}</td>
                <td className="px-5 py-2.5 font-medium text-sand-900">{s.name}</td>
                <td className="px-5 py-2.5">
                  <div className="flex gap-1">
                    {['PRESENT', 'SICK', 'PERMIT', 'ABSENT'].map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setStatus(s.id, st)}
                        className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                          s.status === st
                            ? st === 'PRESENT'
                              ? 'bg-emerald-600 text-white'
                              : st === 'SICK'
                                ? 'bg-sky-600 text-white'
                                : st === 'PERMIT'
                                  ? 'bg-amber-500 text-white'
                                  : 'bg-red-600 text-white'
                            : 'bg-sand-100 text-sand-500 hover:bg-sand-200'
                        }`}
                      >
                        {STATUS_LABEL[st]}
                      </button>
                    ))}
                  </div>
                </td>
                <td className="px-5 py-2.5">
                  {s.status !== 'PRESENT' ? (
                    <Input
                      value={s.note ?? ''}
                      onChange={(e) => setRows((rs) => rs.map((x) => (x.id === s.id ? { ...x, note: e.target.value } : x)))}
                      placeholder="Catatan…"
                    />
                  ) : (
                    <span className="text-sand-300">—</span>
                  )}
                </td>
              </tr>
            ))}
          </DataTable>
        </Widget>
      ) : classId ? (
        <p className="text-sm text-sand-500">Memuat daftar siswa…</p>
      ) : (
        <Widget title="Pilih kelas untuk mulai">
          <p className="px-5 py-4 text-sm text-sand-500">
            Kelas dari jadwal mengajar Anda hari ini tampil di atas. Semua siswa ditandai <b>Hadir</b> secara otomatis — cukup ubah yang tidak hadir.
          </p>
        </Widget>
      )}
    </Shell>
  );
}
