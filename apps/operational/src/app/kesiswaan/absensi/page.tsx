'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Field, Input, Modal, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { PageTitle, Widget } from '@/components/widgets';
import { ApiError, listAcademicYears, listClasses, listStudents, type ClassView } from '@/lib/api';
import type { StudentDto } from '@smpmuh3/types';
import {
  attendanceDailyOverview,
  attendanceReport,
  clearClassAttendance,
  getClassAttendance,
  saveClassAttendance,
  studentAttendanceHistory,
  attendanceRecapXlsxUrl,
  type AttendanceReport,
  type DailyOverview,
  type StudentHistory,
} from '@/lib/api-ops';
import { printNode } from '@/lib/print';

const ST = [
  { key: 'PRESENT', label: 'Hadir', short: 'H', cls: 'bg-emerald-600 text-white' },
  { key: 'SICK', label: 'Sakit', short: 'S', cls: 'bg-sky-600 text-white' },
  { key: 'PERMIT', label: 'Izin', short: 'I', cls: 'bg-amber-500 text-white' },
  { key: 'ABSENT', label: 'Alfa', short: 'A', cls: 'bg-red-600 text-white' },
] as const;
const ST_LABEL: Record<string, string> = { PRESENT: 'Hadir', SICK: 'Sakit', PERMITTED: 'Izin', PERMIT: 'Izin', ABSENT: 'Alfa' };
const ST_SHORT: Record<string, string> = { PRESENT: 'H', SICK: 'S', PERMITTED: 'I', PERMIT: 'I', ABSENT: 'A' };
const today = () => new Date().toISOString().slice(0, 10);
const MONTHS = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

type MarkRow = { id: string; name: string; nis?: string | null; status: string; note?: string | null };

// ---------- Modal editor absen satu kelas (dipakai harian & revisi admin) ----------
function ClassEditor({ classId, className, date, takenBy, onClose, onSaved }: {
  classId: string; className: string; date: string; takenBy?: string | null | undefined;
  onClose: () => void; onSaved: () => void;
}) {
  const [rows, setRows] = useState<MarkRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    getClassAttendance(classId, date).then((r) => setRows(r.students)).catch((e) => setErr(e instanceof ApiError ? e.message : 'Gagal memuat.'));
  }, [classId, date]);
  const filtered = rows.filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase()) || (r.nis ?? '').includes(q));
  const counts = ST.map((s) => ({ ...s, n: rows.filter((r) => r.status === s.key || (s.key === 'PERMIT' && r.status === 'PERMITTED')).length }));
  async function save() {
    setBusy(true); setErr(null);
    try {
      await saveClassAttendance({ classId, date, rows: rows.map((r) => ({ studentId: r.id, status: r.status, ...(r.note ? { note: r.note } : {}) })) });
      onSaved();
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Gagal menyimpan.'); } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title={`Absen ${className} — ${date}`} size="xl">
      {takenBy ? <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Sudah diabsen oleh <b>{takenBy}</b> — perubahan akan tercatat sebagai <b>revisi</b>.</p> : null}
      {err ? <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{err}</p> : null}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama/NIS…" className="w-56" />
        <span className="flex gap-1.5">{counts.map((c) => <Badge key={c.key} tone={c.key === 'PRESENT' ? 'primary' : c.key === 'ABSENT' ? 'danger' : 'accent'}>{c.label} {c.n}</Badge>)}</span>
        <span className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setRows((r) => r.map((x) => ({ ...x, status: 'PRESENT' })))}>Semua Hadir</Button>
          <Button size="sm" onClick={() => void save()} disabled={busy || !rows.length}>{busy ? 'Menyimpan…' : 'Simpan'}</Button>
        </span>
      </div>
      <div className="max-h-[55vh] overflow-y-auto">
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-b border-sand-100">
                <td className="py-2 pr-2"><span className="block font-medium text-sand-900">{r.name}</span><span className="text-xs text-sand-400">{r.nis ?? '—'}</span></td>
                <td className="py-2"><span className="flex gap-1">{ST.map((s) => (
                  <button key={s.key} type="button" onClick={() => setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, status: s.key } : x)))}
                    className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${r.status === s.key || (s.key === 'PERMIT' && r.status === 'PERMITTED') ? s.cls : 'bg-sand-100 text-sand-500 hover:bg-sand-200'}`}>{s.label}</button>
                ))}</span></td>
                <td className="py-2 pl-2 w-40">{r.status !== 'PRESENT' ? <Input value={r.note ?? ''} onChange={(e) => setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, note: e.target.value } : x)))} placeholder="Catatan…" /> : null}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
        {!filtered.length ? <p className="py-6 text-center text-sm text-sand-400">Memuat…</p> : null}
      </div>
    </Modal>
  );
}

// ---------- Modal riwayat satu siswa ----------
function HistoryModal({ studentId, yearId, onClose }: { studentId: string; yearId?: string; onClose: () => void }) {
  const [h, setH] = useState<StudentHistory | null>(null);
  useEffect(() => { studentAttendanceHistory(studentId, yearId).then(setH).catch(() => setH(null)); }, [studentId, yearId]);
  return (
    <Modal open onClose={onClose} title={h ? `Riwayat Absen — ${h.student.name}` : 'Riwayat Absen'} size="xl">
      {!h ? <p className="py-6 text-center text-sm text-sand-400">Memuat…</p> : (
        <>
          <div className="mb-4 grid grid-cols-3 gap-2 text-center sm:grid-cols-5">
            {([['present', 'Hadir', 'text-emerald-700 bg-emerald-50'], ['sick', 'Sakit', 'text-sky-700 bg-sky-50'], ['permit', 'Izin', 'text-amber-700 bg-amber-50'], ['absent', 'Alfa', 'text-red-700 bg-red-50'], ['total', 'Hari tercatat', 'text-sand-700 bg-sand-100']] as const).map(([k, l, c]) => (
              <div key={k} className={`rounded-xl px-3 py-2 ${c}`}><div className="text-xl font-bold">{h.counts[k]}</div><div className="text-[11px] font-medium">{l}</div></div>
            ))}
          </div>
          <div className="max-h-[50vh] overflow-y-auto">
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-sand-500"><th className="py-1.5">Tanggal</th><th>Kelas</th><th>Status</th><th>Catatan</th></tr></thead>
              <tbody>
                {h.records.map((r) => (
                  <tr key={String(r.date)} className="border-t border-sand-100">
                    <td className="py-1.5">{String(r.date).slice(0, 10)}</td>
                    <td>{r.class}</td>
                    <td><Badge tone={r.status === 'PRESENT' ? 'primary' : r.status === 'ABSENT' ? 'danger' : 'accent'}>{ST_LABEL[r.status] ?? r.status}{r.revised ? ' ✎' : ''}</Badge></td>
                    <td className="text-sand-500">{r.note ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            {!h.records.length ? <p className="py-6 text-center text-sm text-sand-400">Belum ada catatan absen.</p> : null}
          </div>
        </>
      )}
    </Modal>
  );
}

// ================================ HALAMAN ================================
export default function AbsensiPage() {
  const [tab, setTab] = useState<'harian' | 'laporan'>('harian');
  const [years, setYears] = useState<{ id: string; name: string; isActive: boolean }[]>([]);
  const [yearId, setYearId] = useState('');
  const [classes, setClasses] = useState<ClassView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // ---- Harian ----
  const [date, setDate] = useState(today());
  const [ov, setOv] = useState<DailyOverview | null>(null);
  const [ovLoading, setOvLoading] = useState(false);
  const [editor, setEditor] = useState<{ classId: string; name: string; takenBy?: string | null } | null>(null);
  const [hist, setHist] = useState<string | null>(null);

  // ---- Laporan ----
  const [scope, setScope] = useState<'all' | 'grades' | 'classes' | 'students'>('all');
  const [gradeSel, setGradeSel] = useState<number[]>([]);
  const [classSel, setClassSel] = useState<string[]>([]);
  const [studentSel, setStudentSel] = useState<StudentDto[]>([]);
  const [studentQ, setStudentQ] = useState('');
  const [studentOpts, setStudentOpts] = useState<StudentDto[]>([]);
  const [mode, setMode] = useState<'day' | 'range' | 'month' | 'months'>('day');
  const [rDate, setRDate] = useState(today());
  const [rFrom, setRFrom] = useState(today().slice(0, 8) + '01');
  const [rTo, setRTo] = useState(today());
  const [rYear, setRYear] = useState(new Date().getFullYear());
  const [rMonth, setRMonth] = useState(new Date().getMonth() + 1);
  const [rep, setRep] = useState<AttendanceReport | null>(null);
  const [repLoading, setRepLoading] = useState(false);
  const repRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listAcademicYears().then(async (ys) => {
      setYears(ys);
      const active = ys.find((y) => y.isActive) ?? ys[0];
      if (active) {
        setYearId(active.id);
        setClasses(await listClasses(active.id));
      }
    }).catch(() => setError('Gagal memuat tahun ajaran.'));
  }, []);

  const loadOverview = useCallback(() => {
    if (!date) return;
    setOvLoading(true);
    attendanceDailyOverview(date, yearId || undefined)
      .then(setOv).catch((e) => setError(e instanceof ApiError ? e.message : 'Gagal memuat ikhtisar.'))
      .finally(() => setOvLoading(false));
  }, [date, yearId]);
  useEffect(() => { if (tab === 'harian') loadOverview(); }, [tab, loadOverview]);

  // Cari siswa untuk laporan per-siswa.
  useEffect(() => {
    if (scope !== 'students' || studentQ.length < 2) { setStudentOpts([]); return; }
    const t = setTimeout(() => { listStudents({ search: studentQ }).then((r) => setStudentOpts(r.slice(0, 8))).catch(() => {}); }, 250);
    return () => clearTimeout(t);
  }, [studentQ, scope, yearId]);

  const gradeLevels = useMemo(() => [...new Set(classes.map((c) => c.gradeLevel))].sort((a, b) => a - b), [classes]);

  async function runReport() {
    setRepLoading(true); setError(null); setRep(null);
    try {
      const q: Parameters<typeof attendanceReport>[0] = { mode };
      if (yearId) q.academicYearId = yearId;
      if (scope === 'grades' && gradeSel.length) q.gradeLevels = gradeSel;
      if (scope === 'classes') q.classIds = classSel;
      if (scope === 'students') q.studentIds = studentSel.map((s) => s.id);
      if (scope === 'classes' && !classSel.length) throw new Error('Pilih minimal satu kelas.');
      if (scope === 'students' && !studentSel.length) throw new Error('Pilih minimal satu siswa.');
      if (mode === 'day') q.date = rDate;
      else if (mode === 'month') { q.year = rYear; q.month = rMonth; }
      else { q.from = rFrom; q.to = rTo; }
      setRep(await attendanceReport(q));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat laporan.');
    } finally { setRepLoading(false); }
  }

  const cellCls = (status: string | null) =>
    status === 'PRESENT' ? 'text-emerald-700' : status === 'SICK' ? 'text-sky-700' : status === 'PERMITTED' ? 'text-amber-700' : status === 'ABSENT' ? 'font-bold text-red-700' : 'text-sand-300';

  return (
    <Shell>
      <PageTitle title="Absensi Siswa" subtitle="Ikhtisar kehadiran harian, revisi, dan laporan kehadiran"
        actions={
          <div className="flex gap-1 rounded-xl bg-sand-100 p-1">
            {([['harian', 'Ikhtisar Harian'], ['laporan', 'Laporan']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${tab === k ? 'bg-white text-sand-900 shadow-sm' : 'text-sand-500 hover:text-sand-700'}`}>{l}</button>
            ))}
          </div>
        } />
      {error ? <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p> : null}
      {notice ? <p role="status" className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{notice}</p> : null}

      {/* ======================== IKHTISAR HARIAN ======================== */}
      {tab === 'harian' ? (
        <>
          <div className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl border border-sand-200 bg-white p-4 shadow-card">
            <Field label="Tanggal" className="w-44"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            {ov ? (
              <div className="flex flex-wrap gap-2 pb-0.5">
                <Badge tone="primary">Terabsen {ov.summary.takenClasses}/{ov.summary.classes} kelas</Badge>
                <Badge tone="primary">Hadir {ov.summary.present}</Badge>
                <Badge tone="accent">Sakit {ov.summary.sick}</Badge>
                <Badge tone="accent">Izin {ov.summary.permit}</Badge>
                <Badge tone="danger">Alfa {ov.summary.absent}</Badge>
                {ov.summary.recorded < ov.summary.students ? <Badge tone="neutral">{ov.summary.students - ov.summary.recorded} belum tercatat</Badge> : null}
              </div>
            ) : null}
            <Button size="sm" variant="outline" className="ml-auto" onClick={loadOverview} disabled={ovLoading}>{ovLoading ? 'Memuat…' : 'Muat Ulang'}</Button>
          </div>

          {!ov ? <p className="py-8 text-center text-sm text-sand-400">{ovLoading ? 'Memuat…' : 'Pilih tanggal.'}</p> : (
            <div className="space-y-5">
              {[...new Set(ov.classes.map((c) => c.gradeLevel))].map((g) => (
                <Widget key={g} title={`Kelas ${g}`}>
                  <div className="overflow-x-auto">
                    <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm">
                      <thead><tr className="border-b border-sand-200 text-left text-xs uppercase tracking-wide text-sand-500">
                        <th className="px-4 py-2">Rombel</th><th className="px-4 py-2">Siswa</th><th className="px-4 py-2">Status Absen</th>
                        <th className="px-4 py-2 text-center">H</th><th className="px-4 py-2 text-center">S</th><th className="px-4 py-2 text-center">I</th><th className="px-4 py-2 text-center">A</th>
                        <th className="px-4 py-2 text-right">Aksi</th>
                      </tr></thead>
                      <tbody>
                        {ov.classes.filter((c) => c.gradeLevel === g).map((c) => (
                          <tr key={c.classId} className="border-b border-sand-100 last:border-0 hover:bg-sand-50/60">
                            <td className="px-4 py-2.5 font-semibold text-sand-900">{c.name}</td>
                            <td className="px-4 py-2.5 text-sand-600">{c.students}</td>
                            <td className="px-4 py-2.5">
                              {c.taken
                                ? <span className="text-xs"><Badge tone="primary">Sudah</Badge> <span className="text-sand-500">oleh {c.takenBy ?? '—'}{c.revisedBy ? ` · direvisi ${c.revisedBy}` : ''}</span></span>
                                : <Badge tone="neutral">Belum diabsen</Badge>}
                            </td>
                            {(['present', 'sick', 'permit', 'absent'] as const).map((k) => (
                              <td key={k} className={`px-4 py-2.5 text-center font-semibold ${k === 'absent' && c[k] ? 'text-red-600' : k === 'present' ? 'text-emerald-700' : 'text-sand-700'}`}>{c.taken ? c[k] : '—'}</td>
                            ))}
                            <td className="px-4 py-2.5 text-right">
                              <span className="inline-flex gap-1.5">
                                <Button size="sm" variant={c.taken ? 'outline' : 'primary'} onClick={() => setEditor({ classId: c.classId, name: c.name, ...(c.takenBy ? { takenBy: c.takenBy } : {}) })}>
                                  {c.taken ? 'Detail / Revisi' : 'Absen Sekarang'}
                                </Button>
                                {c.taken ? (
                                  <Button size="sm" variant="outline" onClick={() => {
                                    if (!window.confirm(`Hapus seluruh absen ${c.name} tanggal ${date}?`)) return;
                                    clearClassAttendance(c.classId, date)
                                      .then(() => { setNotice(`Absen ${c.name} tanggal itu dihapus.`); loadOverview(); })
                                      .catch((e) => setError(e instanceof ApiError ? e.message : 'Gagal menghapus.'));
                                  }}>Clear</Button>
                                ) : null}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table></div>
                  </div>
                </Widget>
              ))}
            </div>
          )}
        </>
      ) : null}

      {/* ======================== LAPORAN ======================== */}
      {tab === 'laporan' ? (
        <>
          <div className="mb-5 space-y-3 rounded-2xl border border-sand-200 bg-white p-4 shadow-card">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Cakupan" className="w-44">
                <Select value={scope} onChange={(e) => setScope(e.target.value as typeof scope)} searchable={false}>
                  <option value="all">Semua rombel</option>
                  <option value="grades">Per jenjang (pilih)</option>
                  <option value="classes">Per kelas (pilih)</option>
                  <option value="students">Per siswa (pilih)</option>
                </Select>
              </Field>
              <Field label="Periode" className="w-44">
                <Select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} searchable={false}>
                  <option value="day">Per hari</option>
                  <option value="range">Rentang tanggal</option>
                  <option value="month">Per bulan</option>
                  <option value="months">Beberapa bulan (jumlah)</option>
                </Select>
              </Field>
              {mode === 'day' ? <Field label="Tanggal"><Input type="date" value={rDate} onChange={(e) => setRDate(e.target.value)} /></Field> : null}
              {mode === 'month' ? (
                <>
                  <Field label="Bulan"><Select value={String(rMonth)} onChange={(e) => setRMonth(Number(e.target.value))} searchable={false}>{MONTHS.slice(1).map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</Select></Field>
                  <Field label="Tahun"><Input type="number" value={rYear} onChange={(e) => setRYear(Number(e.target.value))} className="w-24" /></Field>
                </>
              ) : null}
              {mode === 'range' || mode === 'months' ? (
                <>
                  <Field label="Dari"><Input type="date" value={rFrom} onChange={(e) => setRFrom(e.target.value)} /></Field>
                  <Field label="Sampai"><Input type="date" value={rTo} onChange={(e) => setRTo(e.target.value)} /></Field>
                </>
              ) : null}
              <Button onClick={() => void runReport()} disabled={repLoading}>{repLoading ? 'Memuat…' : 'Tampilkan'}</Button>
              {rep ? <Button variant="outline" onClick={() => repRef.current && printNode(repRef.current, { title: 'Laporan Absensi', landscape: rep.dates.length > 8, css: '.att-rep table{width:100%;font-size:9pt}.att-rep th,.att-rep td{border:1px solid #999;padding:2px 5px;text-align:center}.att-rep .hol{background:#fee2e2}.att-rep h3{margin:14px 0 4px;font-size:12pt}.att-rep h4{margin:10px 0 3px;font-size:10.5pt}' })}>🖨 Cetak</Button> : null}
              {rep && yearId ? <Button variant="outline" onClick={() => { const [y = 0, m = 0] = rDate.split('-').map(Number); window.open(attendanceRecapXlsxUrl(yearId, mode === 'month' ? rYear : y, mode === 'month' ? rMonth : m), '_blank'); }}>Excel (format Dapodik)</Button> : null}
            </div>

            {scope === 'grades' ? (
              <div className="flex flex-wrap gap-2">
                {gradeLevels.map((g) => (
                  <button key={g} type="button" onClick={() => setGradeSel((s) => (s.includes(g) ? s.filter((x) => x !== g) : [...s, g]))}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${gradeSel.includes(g) ? 'border-primary-600 bg-primary-50 text-primary-700' : 'border-sand-300 bg-white text-sand-600 hover:border-sand-400'}`}>
                    Kelas {g}
                  </button>
                ))}
              </div>
            ) : null}
            {scope === 'classes' ? (
              <div className="flex flex-wrap gap-2">
                {classes.map((c) => (
                  <button key={c.id} type="button" onClick={() => setClassSel((s) => (s.includes(c.id) ? s.filter((x) => x !== c.id) : [...s, c.id]))}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${classSel.includes(c.id) ? 'border-primary-600 bg-primary-50 text-primary-700' : 'border-sand-300 bg-white text-sand-600 hover:border-sand-400'}`}>
                    {c.name}
                  </button>
                ))}
              </div>
            ) : null}
            {scope === 'students' ? (
              <div>
                <Input type="search" value={studentQ} onChange={(e) => setStudentQ(e.target.value)} placeholder="Ketik nama/NIS siswa…" className="w-72" />
                {studentOpts.length ? (
                  <ul className="mt-1 max-h-44 w-72 overflow-y-auto rounded-xl border border-sand-200 bg-white shadow-lg">
                    {studentOpts.map((s) => (
                      <li key={s.id}><button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-primary-50" onClick={() => { if (!studentSel.some((x) => x.id === s.id)) setStudentSel((x) => [...x, s]); setStudentQ(''); setStudentOpts([]); }}>
                        {s.name} <span className="text-xs text-sand-400">{s.nis ?? ''}</span>
                      </button></li>
                    ))}
                  </ul>
                ) : null}
                {studentSel.length ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {studentSel.map((s) => (
                      <span key={s.id} className="flex items-center gap-1.5 rounded-lg bg-primary-50 px-2.5 py-1 text-sm font-medium text-primary-800">
                        {s.name}<button type="button" onClick={() => setStudentSel((x) => x.filter((y) => y.id !== s.id))} className="text-primary-400 hover:text-primary-700">✕</button>
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* Hasil laporan — markup polos + kelas .att-rep agar printNode setia */}
          {rep ? (
            <div ref={repRef} className="att-rep space-y-4">
              <div className="rounded-2xl border border-sand-200 bg-white p-4">
                <h2 className="text-base font-bold text-sand-900">LAPORAN KEHADIRAN SISWA — {rep.academicYear.name}</h2>
                <p className="text-xs text-sand-500">Periode {rep.from} s.d. {rep.to}{rep.holidays.length ? ` · Hari libur: ${rep.holidays.map((h) => `${h.date.slice(8, 10)} ${h.name}`).join(', ')}` : ''}</p>
              </div>
              {rep.groups.map((g) => (
                <div key={g.gradeLevel}>
                  <h3 className="mb-1 text-sm font-extrabold uppercase tracking-wide text-sand-700">Kelas {g.gradeLevel}</h3>
                  {g.classes.map((c) => (
                    <div key={c.classId} className="mb-3 overflow-x-auto rounded-2xl border border-sand-200 bg-white">
                      <h4 className="border-b border-sand-100 bg-sand-50 px-4 py-2 text-sm font-bold text-sand-800">{c.name} <span className="font-normal text-sand-400">({c.students.length} siswa)</span></h4>
                      <div className="overflow-x-auto"><table className="w-full min-w-max text-xs">
                        <thead>
                          <tr className="border-b border-sand-200 text-left text-sand-500">
                            <th className="sticky left-0 bg-white px-3 py-2">Siswa</th>
                            {rep.dates.map((d, i) => {
                              const cell0 = c.students[0]?.cells[i];
                              return <th key={d} className={`px-1 py-2 text-center ${cell0?.holiday ? 'hol bg-red-100 text-red-700' : ''}`} title={cell0?.dayName + (cell0?.holidayName ? ` — ${cell0.holidayName}` : '')}>{Number(d.slice(8))}<br /><span className="font-normal">{cell0?.dayName.slice(0, 3)}</span></th>;
                            })}
                            <th className="px-2 py-2 text-center text-emerald-700">H</th><th className="px-2 py-2 text-center text-sky-700">S</th><th className="px-2 py-2 text-center text-amber-700">I</th><th className="px-2 py-2 text-center text-red-700">A</th>
                          </tr>
                        </thead>
                        <tbody>
                          {c.students.map((s) => (
                            <tr key={s.id} className="border-b border-sand-100 last:border-0 hover:bg-sand-50/50">
                              <td className="sticky left-0 bg-white px-3 py-1.5">
                                <button type="button" className="text-left font-medium text-sand-900 hover:text-primary-700 hover:underline" onClick={() => setHist(s.id)}>{s.name}</button>
                                <span className="block text-[10px] text-sand-400">{s.nis ?? ''}</span>
                              </td>
                              {s.cells.map((cell) => (
                                <td key={cell.date} className={`px-1 py-1.5 text-center ${cell.holiday ? 'hol bg-red-50' : ''} ${cellCls(cell.status)}`} title={cell.note ?? undefined}>
                                  {cell.status ? ST_SHORT[cell.status] ?? '?' : (cell.holiday ? '' : '·')}
                                </td>
                              ))}
                              <td className="px-2 py-1.5 text-center font-semibold text-emerald-700">{s.totals.present || ''}</td>
                              <td className="px-2 py-1.5 text-center font-semibold text-sky-700">{s.totals.sick || ''}</td>
                              <td className="px-2 py-1.5 text-center font-semibold text-amber-700">{s.totals.permit || ''}</td>
                              <td className="px-2 py-1.5 text-center font-semibold text-red-700">{s.totals.absent || ''}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table></div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : repLoading ? <p className="py-8 text-center text-sm text-sand-400">Memuat laporan…</p> : (
            <Widget title="Atur laporan"><p className="px-4 py-4 text-sm text-sand-500">Pilih cakupan &amp; periode lalu tekan <b>Tampilkan</b>. Kolom tanggal merah = hari libur (Minggu / agenda kalender LIBUR). Klik nama siswa untuk melihat riwayat.</p></Widget>
          )}
        </>
      ) : null}

      {editor ? <ClassEditor classId={editor.classId} className={editor.name} date={date} takenBy={editor.takenBy} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); setNotice('Absensi tersimpan.'); loadOverview(); }} /> : null}
      {hist ? <HistoryModal studentId={hist} yearId={yearId} onClose={() => setHist(null)} /> : null}
    </Shell>
  );
}
