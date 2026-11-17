'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge, Button } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { PageTitle, Widget } from '@/components/widgets';
import { usePermission } from '@/lib/use-permission';
import { PERMISSIONS } from '@smpmuh3/types';
import { ApiError } from '@/lib/api';
import { examMonitor, listMonitorExams, type ExamView, type MonitorClass, type MonitorFlag } from '@/lib/api-ops';

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

/** Monitor CBT hierarkis: jenjang → ujian → kelas → siswa. */
export default function MonitorCbtPage() {
  const [exams, setExams] = useState<ExamListItem[]>([]);
  const [grade, setGrade] = useState<number | null>(null);
  const [examId, setExamId] = useState('');
  const [classId, setClassId] = useState<string | null>(null);
  const [monitor, setMonitor] = useState<{
    examId: string;
    sessions: { id: string; name: string; classIds: string[]; startAt: string; endAt: string }[];
    classes: MonitorClass[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  return (
    <Shell>
      <PageTitle title="Monitor Ujian CBT" subtitle="Pilih jenjang → ujian → kelas untuk memantau pengerjaan siswa." />
      {error ? <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

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

          {!monitor ? <p className="p-5 text-sm text-sand-400">Memuat monitor…</p> : null}

          {/* Daftar kelas — kartu ringkasan; klik untuk detail siswa */}
          {monitor && !openClass ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {monClasses.length === 0 ? <p className="text-sm text-sand-400">Tidak ada rombel pada jenjang ini.</p> : monClasses.map((c) => (
                <button key={c.classId} onClick={() => setClassId(c.classId)}
                  className={`rounded-2xl border bg-white p-4 text-left shadow-card transition hover:shadow-md ${c.violations ? 'border-red-300 hover:border-red-500' : 'border-sand-200 hover:border-primary-400'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-extrabold text-sand-900">{c.className}</p>
                      <p className="text-[11px] text-sand-500">{c.session ? `${c.session.name} · ${dt(c.session.startAt)}–${dt(c.session.endAt)}` : 'Jendela ujian utama'}</p>
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

          {/* Detail siswa satu kelas */}
          {monitor && openClass ? (
            <Widget title={`${openClass.className} — ${openClass.done}/${openClass.total} selesai`}
              subtitle={openClass.session ? `${openClass.session.name} · ${dt(openClass.session.startAt)}–${dt(openClass.session.endAt)}` : 'Jendela ujian utama'}
              action={<Button size="sm" variant="outline" onClick={() => setClassId(null)}>← Semua kelas</Button>}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-sand-200 text-left text-xs uppercase tracking-wide text-sand-500">
                      <th className="px-5 py-2">Siswa</th><th className="px-5 py-2">Status</th><th className="px-5 py-2">Jawaban</th><th className="px-5 py-2">Sisa Waktu</th><th className="px-5 py-2">Masuk</th><th className="px-5 py-2">Pelanggaran</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...openClass.students].sort((a, b) => (b.flags.length - a.flags.length) || a.name.localeCompare(b.name)).map((s) => (
                      <tr key={s.studentId} className={`border-b border-sand-100 last:border-0 ${s.flags.length ? 'bg-red-50/60' : 'hover:bg-sand-50/60'}`}>
                        <td className="px-5 py-2.5">
                          <p className="font-semibold text-sand-900">{s.name}</p>
                          <p className="text-xs text-sand-400">{s.nis ?? '—'}</p>
                        </td>
                        <td className="px-5 py-2.5">
                          {s.status === 'SELESAI' ? <Badge tone="primary">✓ {s.score ?? 0}/{s.maxScore ?? 0}</Badge>
                            : s.status === 'MENGERJAKAN' ? <Badge tone="accent">Mengerjakan</Badge>
                            : <Badge tone="neutral">Belum masuk</Badge>}
                        </td>
                        <td className="px-5 py-2.5 text-sand-600">{s.answered || '—'}</td>
                        <td className="px-5 py-2.5 font-mono text-xs text-amber-700">{s.remainingSec != null ? mmss(s.remainingSec) : '—'}</td>
                        <td className="px-5 py-2.5 text-xs text-sand-500">{s.enterCount ?? 0}×</td>
                        <td className="px-5 py-2.5">
                          {s.flags.length ? (
                            <span className="flex flex-wrap gap-1">
                              {s.flags.map((f) => <Badge key={f} tone="danger">⚠ {FLAG_LABEL[f]}</Badge>)}
                            </span>
                          ) : <span className="text-xs text-sand-300">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Widget>
          ) : null}
        </>
      ) : null}
    </Shell>
  );
}
