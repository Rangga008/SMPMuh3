'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge, Button } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { PageTitle, Widget } from '@/components/widgets';
import { useConfirm } from '@/components/confirm-dialog';
import { usePermission } from '@/lib/use-permission';
import { PERMISSIONS } from '@smpmuh3/types';
import { ApiError } from '@/lib/api';
import {
  examMonitor, listMonitorExams, unblockAttempt, forceSubmitAttempt, resetAttempt, regenCredential,
  type ExamView, type MonitorClass, type MonitorFlag,
} from '@/lib/api-ops';

const STATUS: Record<ExamView['status'], { label: string; tone: 'neutral' | 'primary' | 'danger' }> = {
  DRAFT: { label: 'Draf', tone: 'neutral' },
  OPEN: { label: 'Berlangsung', tone: 'primary' },
  CLOSED: { label: 'Selesai', tone: 'danger' },
};
const FLAG_LABEL: Record<MonitorFlag, string> = {
  SELESAI_CEPAT: 'Selesai terlalu cepat',
  TANPA_JAWABAN: 'Submit tanpa jawaban',
  MASUK_BERKALI: 'Keluar-masuk berkali-kali',
};
const dt = (s: string) =>
  new Date(s).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const mmss = (sec: number) => `${Math.floor(sec / 60)}m ${sec % 60}d`;

type ExamListItem = ExamView & { classes: { id: string; name: string; gradeLevel: number }[] };
type MonStudent = MonitorClass['students'][number];

/** Monitor CBT hierarkis: jenjang → ujian → kelas → siswa.
 *  Responsif — pengawas banyak memantau lewat HP, jadi detail siswa memakai
 *  daftar kartu (bukan tabel lebar) lengkap dengan aksi pengawas per siswa. */
export default function MonitorCbtPage() {
  const { confirm, dialog } = useConfirm();
  const [exams, setExams] = useState<ExamListItem[]>([]);
  const [grade, setGrade] = useState<number | null>(null);
  const [examId, setExamId] = useState('');
  const [classId, setClassId] = useState<string | null>(null);
  const [monitor, setMonitor] = useState<{ examId: string; classes: MonitorClass[] } | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pwInfo, setPwInfo] = useState<{ name: string; password: string } | null>(null);
  const canReadAcademic = usePermission(PERMISSIONS.ACADEMIC_READ);

  useEffect(() => {
    listMonitorExams()
      .then(setExams)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Gagal memuat daftar ujian.'));
  }, []);

  const grades = [...new Set(exams.flatMap((x) => x.classes.map((c) => c.gradeLevel)))].sort((a, b) => a - b);
  const filtered = grade === null ? exams : exams.filter((x) => x.classes.some((c) => c.gradeLevel === grade));
  const exam = exams.find((x) => x.id === examId) ?? null;
  const monClasses = (monitor?.classes ?? []).filter((c) => grade === null || c.gradeLevel === grade);
  const openClass = monClasses.find((c) => c.classId === classId) ?? null;

  // Polling monitor tiap 15 detik selama ujian dipilih.
  useEffect(() => {
    if (!examId) { setMonitor(null); return; }
    let alive = true;
    const poll = () => examMonitor(examId).then((m) => { if (alive) setMonitor(m); }).catch(() => {});
    poll();
    const t = setInterval(poll, 15_000);
    return () => { alive = false; clearInterval(t); };
  }, [examId]);

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 4000);
  };

  // ---------- Aksi pengawas per sesi siswa ----------
  const attemptAction = async (kind: 'unblock' | 'submit' | 'reset', s: MonStudent) => {
    const msgs = {
      unblock: `Buka blokir sesi ${s.name}? Pelanggaran dihitung ulang dari nol dan sisa waktu dibekukan saat diblokir.`,
      submit: `Kumpulkan jawaban ${s.name} sekarang? Dinilai apa adanya.`,
      reset: `Reset pengerjaan ${s.name}? Sesi, jawaban & nilai dihapus — siswa masuk ulang dari awal.`,
    } as const;
    if (!(await confirm(msgs[kind]))) return;
    setBusyId(s.studentId);
    try {
      if (kind === 'unblock') await unblockAttempt(examId, s.studentId);
      else if (kind === 'submit') await forceSubmitAttempt(examId, s.studentId);
      else await resetAttempt(examId, s.studentId);
      flash(kind === 'unblock' ? `Sesi ${s.name} dibuka kembali.` : kind === 'submit' ? `Jawaban ${s.name} dikumpulkan.` : `Pengerjaan ${s.name} direset.`);
      const m = await examMonitor(examId).catch(() => null);
      if (m) setMonitor(m);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Aksi gagal.');
    } finally {
      setBusyId(null);
    }
  };

  /** Password login baru — diumumkan ke siswa yang lupa. Berlaku semua ujian. */
  const regenPw = async (s: MonStudent) => {
    if (!(await confirm(`Buat password login baru untuk ${s.name}? Password lama tidak berlaku lagi — berlaku di semua ujian.`))) return;
    setBusyId(s.studentId);
    try {
      const r = await regenCredential(examId, s.studentId);
      setPwInfo({ name: s.name, password: r.password });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal membuat password.');
    } finally {
      setBusyId(null);
    }
  };

  // Filter siswa oleh pencarian — nama atau NIS, berlaku di semua kelas.
  const q = query.trim().toLowerCase();
  const matchStudent = (s: MonStudent) =>
    !q || s.name.toLowerCase().includes(q) || (s.nis ?? '').toLowerCase().includes(q);

  /** Satu baris/kartu siswa — responsif: info ringkas + badge + aksi pengawas. */
  const studentRow = (s: MonStudent) => (
    <li key={s.studentId} className={`px-4 py-3 ${s.flags.length || s.status === 'DIBLOKIR' ? 'bg-red-50/60' : ''}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-sand-900">{s.name}</p>
          <p className="text-[11px] text-sand-400">
            {s.nis ?? '—'}
            {s.answered ? ` · ${s.answered} terjawab` : ''}
            {(s.enterCount ?? 0) > 0 ? ` · masuk ${s.enterCount}×` : ''}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {(s.violations ?? 0) > 0 ? (
            <span title={`${s.violations} pelanggaran proteksi`} className="rounded-lg bg-amber-100 px-1.5 py-0.5 text-[10px] font-black text-amber-700">⚠{s.violations}</span>
          ) : null}
          {s.remainingSec != null ? <span className="font-mono text-[10px] font-bold text-amber-600">⏱ {mmss(s.remainingSec)}</span> : null}
          {s.status === 'SELESAI' ? <Badge tone="primary">✓ {s.score ?? 0}/{s.maxScore ?? 0}</Badge>
            : s.status === 'DIBLOKIR' ? <Badge tone="danger">⛔ Diblokir</Badge>
            : s.status === 'MENGERJAKAN' ? <Badge tone="accent">Mengerjakan</Badge>
            : <Badge tone="neutral">Belum masuk</Badge>}
        </div>
      </div>
      {s.flags.length ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {s.flags.map((f) => <Badge key={f} tone="danger">⚠ {FLAG_LABEL[f]}</Badge>)}
        </div>
      ) : null}
      {s.status !== 'BELUM' ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {s.status === 'DIBLOKIR' ? (
            <button type="button" disabled={busyId === s.studentId}
              className="rounded-lg bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
              onClick={() => void attemptAction('unblock', s)}>
              ✓ Buka Blokir
            </button>
          ) : null}
          {s.status === 'MENGERJAKAN' || s.status === 'DIBLOKIR' ? (
            <button type="button" disabled={busyId === s.studentId}
              className="rounded-lg bg-sand-100 px-2.5 py-1 text-[11px] font-bold text-sand-600 transition hover:bg-sand-200 disabled:opacity-50"
              onClick={() => void attemptAction('submit', s)}>
              ⏏ Kumpulkan
            </button>
          ) : null}
          <button type="button" disabled={busyId === s.studentId}
            className="rounded-lg bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-600 transition hover:bg-red-100 disabled:opacity-50"
            onClick={() => void attemptAction('reset', s)}>
            ↺ Reset
          </button>
          <button type="button" disabled={busyId === s.studentId}
            className="rounded-lg bg-primary-50 px-2.5 py-1 text-[11px] font-bold text-primary-700 transition hover:bg-primary-100 disabled:opacity-50"
            onClick={() => void regenPw(s)}>
            🔑 Password
          </button>
        </div>
      ) : null}
    </li>
  );

  return (
    <Shell>
      <PageTitle title="Monitor Ujian CBT" subtitle="Pilih jenjang → ujian → kelas untuk memantau pengerjaan siswa." />
      {dialog}
      {error ? <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {notice ? <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p> : null}

      {/* Langkah 1 — jenjang */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-sand-500">Jenjang:</span>
        <button onClick={() => { setGrade(null); setExamId(''); setClassId(null); }}
          className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${grade === null ? 'border-primary-600 bg-primary-50 text-primary-700' : 'border-sand-300 bg-white text-sand-600 hover:border-sand-400'}`}>
          Semua
        </button>
        {grades.map((g) => (
          <button key={g} onClick={() => { setGrade(g); setExamId(''); setClassId(null); }}
            className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${grade === g ? 'border-primary-600 bg-primary-50 text-primary-700' : 'border-sand-300 bg-white text-sand-600 hover:border-sand-400'}`}>
            Kelas {g}
          </button>
        ))}
      </div>

      {/* Langkah 2 — ujian */}
      {!examId ? (
        <Widget title={`Pilih Ujian${grade ? ` — Kelas ${grade}` : ''}`}>
          {filtered.length === 0 ? (
            <p className="p-5 text-sm text-sand-400">Belum ada ujian untuk jenjang ini.</p>
          ) : (
            <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((x) => (
                <button key={x.id} onClick={() => setExamId(x.id)}
                  className="rounded-2xl border border-sand-200 bg-white p-4 text-left shadow-card transition hover:border-primary-400 hover:shadow-md">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-extrabold text-sand-900">{x.title}</p>
                    <Badge tone={STATUS[x.status].tone}>{STATUS[x.status].label}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-sand-500">{x.subject?.name ?? x.assessment.subject?.name ?? '—'} · {x.assessment.name}</p>
                  <p className="mt-1 text-xs text-sand-500">{dt(x.startAt)} → {dt(x.endAt)}</p>
                  <p className="mt-2 text-xs text-sand-600">
                    {x.classes.map((c) => c.name).join(', ')} · {x._count?.attempts ?? 0} masuk
                  </p>
                </button>
              ))}
            </div>
          )}
        </Widget>
      ) : null}

      {/* Langkah 3 — kelas (atau detail siswa bila kelas dibuka) */}
      {exam ? (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-sand-200 bg-white p-4 shadow-card">
            <button onClick={() => { setExamId(''); setClassId(null); }} className="text-sm font-semibold text-primary-700 hover:underline">← Ujian lain</button>
            <div className="min-w-0 flex-1">
              <p className="truncate font-extrabold text-sand-900">{exam.title} <span className="font-mono text-sm font-bold text-primary-700">{exam.code}</span></p>
              <p className="text-xs text-sand-500">{exam.subject?.name ?? exam.assessment.subject?.name ?? '—'} · {dt(exam.startAt)}–{dt(exam.endAt)} · durasi {exam.durationMin} mnt</p>
            </div>
            <Badge tone={STATUS[exam.status].tone}>{STATUS[exam.status].label}</Badge>
            {canReadAcademic ? <Link href={`/kurikulum/ujian/${exam.id}`}><Button size="sm" variant="outline">Halaman ujian →</Button></Link> : null}
          </div>

          {/* Pencarian siswa — memfilter lintas kelas saat diisi. */}
          <div className="mb-4">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="🔍 Cari siswa — nama atau NIS…"
              className="w-full max-w-md rounded-xl border border-sand-200 bg-white px-4 py-2.5 text-sm shadow-card outline-none transition focus:border-primary-400"
            />
            {q ? <p className="mt-1.5 text-xs text-sand-500">Menampilkan siswa yang cocok di semua kelas — kosongkan untuk kembali per kelas.</p> : null}
          </div>

          {!monitor ? <p className="p-5 text-sm text-sand-400">Memuat monitor…</p> : null}

          {/* Mode pencarian: siswa cocok dari semua kelas, dikelompokkan per kelas */}
          {monitor && q ? (
            <div className="space-y-4">
              {monClasses.map((c) => {
                const hits = c.students.filter(matchStudent);
                if (!hits.length) return null;
                return (
                  <Widget key={c.classId} title={`${c.className} — ${hits.length} cocok`}>
                    <ul className="divide-y divide-sand-100">
                      {[...hits].sort((a, b) => (b.flags.length - a.flags.length) || a.name.localeCompare(b.name)).map(studentRow)}
                    </ul>
                  </Widget>
                );
              })}
              {!monClasses.some((c) => c.students.some(matchStudent)) ? (
                <p className="p-5 text-sm text-sand-400">Tidak ada siswa yang cocok dengan “{query}”.</p>
              ) : null}
            </div>
          ) : null}

          {/* Daftar kelas — kartu ringkasan; klik untuk detail siswa */}
          {monitor && !q && !openClass ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {monClasses.length === 0 ? <p className="text-sm text-sand-400">Tidak ada rombel pada jenjang ini.</p> : monClasses.map((c) => (
                <button key={c.classId} onClick={() => setClassId(c.classId)}
                  className={`rounded-2xl border bg-white p-4 text-left shadow-card transition hover:shadow-md ${c.violations ? 'border-red-300 hover:border-red-500' : 'border-sand-200 hover:border-primary-400'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-extrabold text-sand-900">{c.className}</p>
                      <p className="text-[11px] text-sand-500">{exam ? `${dt(exam.startAt)}–${dt(exam.endAt)}` : 'Jendela ujian utama'}</p>
                    </div>
                    {c.violations ? <Badge tone="danger">⚠ {c.violations}</Badge> : null}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
                    <Badge tone="primary">{c.done}/{c.total} selesai</Badge>
                    {c.working ? <Badge tone="accent">{c.working} mengerjakan</Badge> : null}
                    <Badge tone="neutral">{c.total - c.done - c.working} belum</Badge>
                  </div>
                </button>
              ))}
            </div>
          ) : null}

          {/* Detail siswa satu kelas — daftar kartu responsif (bukan tabel). */}
          {monitor && !q && openClass ? (
            <Widget title={`${openClass.className} — ${openClass.done}/${openClass.total} selesai`}
              subtitle={exam ? `Jendela ${dt(exam.startAt)}–${dt(exam.endAt)}` : 'Jendela ujian utama'}
              action={<Button size="sm" variant="outline" onClick={() => setClassId(null)}>← Semua kelas</Button>}>
              <ul className="divide-y divide-sand-100">
                {[...openClass.students].sort((a, b) => (b.flags.length - a.flags.length) || a.name.localeCompare(b.name)).map(studentRow)}
              </ul>
            </Widget>
          ) : null}
        </>
      ) : null}

      {/* Modal password baru — bisa disalin, hanya tampil sekali. */}
      {pwInfo ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-sand-950/60 p-4" onClick={() => setPwInfo(null)}>
          <div className="w-full max-w-xs rounded-2xl bg-white p-6 text-center shadow-card" onClick={(e) => e.stopPropagation()}>
            <p className="text-xs font-bold uppercase tracking-wide text-sand-400">Password login baru</p>
            <p className="mt-1 text-sm font-semibold text-sand-700">{pwInfo.name}</p>
            <button type="button"
              onClick={() => void navigator.clipboard?.writeText(pwInfo.password).catch(() => {})}
              title="Klik untuk salin"
              className="mt-3 w-full rounded-xl bg-primary-700 px-4 py-3 font-mono text-xl font-black tracking-[0.2em] text-white transition hover:bg-primary-800">
              {pwInfo.password}
            </button>
            <p className="mt-2 text-[11px] leading-relaxed text-sand-500">Klik untuk menyalin. Umumkan ke siswa — password lama tidak berlaku dan ini tidak ditampilkan lagi.</p>
            <Button size="sm" className="mt-4 w-full" onClick={() => setPwInfo(null)}>Tutup</Button>
          </div>
        </div>
      ) : null}
    </Shell>
  );
}
