'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge, Button, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { PageTitle, Widget } from '@/components/widgets';
import { usePermission } from '@/lib/use-permission';
import { PERMISSIONS } from '@smpmuh3/types';
import { ApiError } from '@/lib/api';
import { examMonitor, listMonitorExams, type ExamView, type MonitorClass } from '@/lib/api-ops';

const STATUS: Record<ExamView['status'], { label: string; tone: 'neutral' | 'primary' | 'danger' }> = {
  DRAFT: { label: 'Draf', tone: 'neutral' },
  OPEN: { label: 'Dibuka', tone: 'primary' },
  CLOSED: { label: 'Ditutup', tone: 'danger' },
};
const dt = (s: string) =>
  new Date(s).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const mmss = (sec: number) => `${Math.floor(sec / 60)}m ${sec % 60}d`;

/** Monitor CBT mandiri — hanya butuh permission cbt.monitor (proktor/pengawas/tendik/guru/admin). */
export default function MonitorCbtPage() {
  const [exams, setExams] = useState<ExamView[]>([]);
  const [examId, setExamId] = useState('');
  const [monitor, setMonitor] = useState<{
    examId: string;
    sessions: { id: string; name: string; classIds: string[]; startAt: string; endAt: string }[];
    classes: MonitorClass[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canReadAcademic = usePermission(PERMISSIONS.ACADEMIC_READ);

  useEffect(() => {
    listMonitorExams()
      .then((xs) => {
        setExams(xs);
        const open = xs.find((x) => x.status === 'OPEN') ?? xs[0];
        if (open) setExamId(open.id);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Gagal memuat daftar ujian.'));
  }, []);

  const exam = exams.find((x) => x.id === examId) ?? null;

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
      <PageTitle title="Monitor Ujian CBT" subtitle="Pemantauan pengerjaan — untuk proktor, pengawas, tendik, guru, dan admin." />
      {error ? <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select value={examId} onChange={(e) => setExamId(e.target.value)} className="w-80">
          <option value="">— pilih ujian —</option>
          {exams.map((x) => (
            <option key={x.id} value={x.id}>
              {x.title} · {x.assessment.subject.name} · {STATUS[x.status].label} · {dt(x.startAt)}
            </option>
          ))}
        </Select>
        {exam && canReadAcademic ? (
          <Link href={`/kurikulum/ujian/${exam.id}`} className="text-sm font-bold text-primary-700 hover:underline">
            Buka halaman ujian →
          </Link>
        ) : null}
      </div>

      {exam ? (
        <div className="mb-4 grid gap-4 lg:grid-cols-3">
          <Widget title="Kode Akses" subtitle="Siswa masuk situs CBT dengan NIS + kode ini.">
            <div className="p-4">
              <div className="rounded-2xl bg-primary-700 px-4 py-4 text-center font-mono text-2xl font-black tracking-[0.2em] text-white">
                {exam.code}
              </div>
            </div>
          </Widget>
          <div className="lg:col-span-2">
            <Widget title="Status" subtitle={`${exam._count?.attempts ?? 0} siswa masuk`}>
              <div className="space-y-1.5 p-4 text-sm text-sand-700">
                <p><Badge tone={STATUS[exam.status].tone}>{STATUS[exam.status].label}</Badge></p>
                <p>📅 {dt(exam.startAt)} → {dt(exam.endAt)}</p>
                <p>⏱ Durasi pengerjaan {exam.durationMin} menit · nilai tampil: {exam.showScore ? 'Ya' : 'Tidak'}</p>
              </div>
            </Widget>
          </div>
        </div>
      ) : null}

      <Widget title="Monitor Pengerjaan" subtitle="Status siswa per rombel — diperbarui tiap 15 detik.">
        {!examId ? (
          <p className="p-5 text-sm text-sand-400">Pilih ujian di atas.</p>
        ) : !monitor ? (
          <p className="p-5 text-sm text-sand-400">Memuat monitor…</p>
        ) : monitor.classes.length === 0 ? (
          <p className="p-5 text-sm text-sand-400">Belum ada rombel peserta.</p>
        ) : (
          <div className="grid gap-4 p-4 md:grid-cols-2">
            {monitor.classes.map((c) => (
              <div key={c.classId} className="rounded-2xl border border-sand-200">
                <div className="flex items-center justify-between border-b border-sand-100 px-4 py-2.5">
                  <div>
                    <p className="font-extrabold text-sand-900">{c.className}</p>
                    {c.session ? (
                      <p className="text-[11px] text-sand-500">{c.session.name} · {dt(c.session.startAt)}–{dt(c.session.endAt)}</p>
                    ) : (
                      <p className="text-[11px] text-sand-400">Jendela ujian utama</p>
                    )}
                  </div>
                  <Badge tone={c.done === c.total && c.total > 0 ? 'primary' : 'accent'}>
                    {c.done}/{c.total} selesai{c.working ? ` · ${c.working} mengerjakan` : ''}
                  </Badge>
                </div>
                <ul className="max-h-64 divide-y divide-sand-50 overflow-y-auto">
                  {c.students.map((s) => (
                    <li key={s.studentId} className="flex items-center justify-between px-4 py-2 text-xs">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-sand-800">{s.name}</p>
                        <p className="text-sand-400">{s.nis ?? '—'}{s.answered ? ` · ${s.answered} terjawab` : ''}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {s.remainingSec != null ? <span className="font-mono text-[10px] text-amber-600">⏱ {mmss(s.remainingSec)}</span> : null}
                        {s.status === 'SELESAI' ? (
                          <Badge tone="primary">✓ {s.score ?? 0}/{s.maxScore ?? 0}</Badge>
                        ) : s.status === 'MENGERJAKAN' ? (
                          <Badge tone="accent">Mengerjakan</Badge>
                        ) : (
                          <Badge tone="neutral">Belum masuk</Badge>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Widget>
    </Shell>
  );
}
