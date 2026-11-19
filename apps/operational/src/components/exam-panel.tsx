'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge, Button, Field, Input, Modal, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { PageTitle, Widget } from '@/components/widgets';
import { DataTable } from '@/components/data-table';
import { RowBtn, rowActionClasses } from '@/components/row-btn';
import { useConfirm } from '@/components/confirm-dialog';
import { usePermission } from '@/lib/use-permission';
import { PERMISSIONS } from '@smpmuh3/types';
import { ApiError, downloadFile, listClasses, type ClassView } from '@/lib/api';
import {
  examAnalysis, examAnswersMatrix, examMonitor,
  examResults, exportExamResults, getExam, listMonitorExams, regenerateExamCode,
  updateExam, updateExamGrade,
  type ExamQuestion, type ExamView, type ItemAnalysis, type MonitorClass,
} from '@/lib/api-ops';

const STATUS: Record<ExamView['status'], { label: string; tone: 'neutral' | 'primary' | 'danger' }> = {
  DRAFT: { label: 'Draf — siswa belum bisa masuk', tone: 'neutral' },
  OPEN: { label: 'Dibuka — siswa masuk sesuai jadwal ujian', tone: 'primary' },
  CLOSED: { label: 'Ditutup', tone: 'danger' },
};
const TYPE_LABEL: Record<string, string> = {
  MCQ: 'Pilihan Ganda', MCQ_COMPLEX: 'PG Kompleks',
  TRUE_FALSE: 'Benar/Salah', TRUE_FALSE_COMPLEX: 'B-S Kompleks', MATCHING: 'Menjodohkan',
};
const dt = (s: string) =>
  new Date(s).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};
const mmss = (sec: number) => `${Math.floor(sec / 60)}m ${sec % 60}d`;


/** Panel kelola ujian pendamping sebuah asesmen — dipakai di tab "Ujian &
 *  Monitor" halaman detail asesmen (embedded) dan rute mandiri /kurikulum/ujian/[id]
 *  untuk proktor/pengawas. */
export function ExamPanel({ id, embedded = false }: { id: string; embedded?: boolean }) {
  const [exam, setExam] = useState<ExamView | null>(null);
  const [monitorOnly, setMonitorOnly] = useState(false);
  const [classes, setClasses] = useState<ClassView[]>([]);
  const [tab, setTab] = useState<'monitor' | 'hasil'>('monitor');
  const [monitor, setMonitor] = useState<{ examId: string; classes: MonitorClass[] } | null>(null);
  const [results, setResults] = useState<Awaited<ReturnType<typeof examResults>> | null>(null);
  const [analysis, setAnalysis] = useState<{ questions: ItemAnalysis[]; easiest: ItemAnalysis[]; hardest: ItemAnalysis[] } | null>(null);
  const [matrix, setMatrix] = useState<Awaited<ReturnType<typeof examAnswersMatrix>> | null>(null);
  const [matrices, setMatrices] = useState<Record<string, Awaited<ReturnType<typeof examAnswersMatrix>>>>({});
  const [resClass, setResClass] = useState('');
  const [resJenjang, setResJenjang] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [modalErr, setModalErr] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [gradeEdit, setGradeEdit] = useState<{ studentId: string; name: string; score: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const canManage = usePermission(PERMISSIONS.ACADEMIC_MANAGE);
  const canMonitor = usePermission(PERMISSIONS.CBT_MONITOR);
  const { confirm, dialog } = useConfirm();

  const examManage = canManage || exam?.canManage === true;
  const clsName = useCallback((cid: string) => classes.find((c) => c.id === cid)?.name ?? '—', [classes]);

  const load = useCallback(() => {
    getExam(id)
      .then((x) => {
        setExam(x);
        if (!classes.length) listClasses(x.academicYearId).then(setClasses).catch(() => {});
      })
      .catch((e) => {
        // Proktor/tendik tanpa academic.read: masih boleh memonitor.
        if (e instanceof ApiError && e.status === 403 && canMonitor) {
          listMonitorExams()
            .then((xs) => {
              const x = xs.find((y) => y.id === id);
              if (x) { setExam(x); setMonitorOnly(true); }
              else setError('Ujian tidak ditemukan.');
            })
            .catch(() => setError('Gagal memuat.'));
        } else setError(e instanceof ApiError ? e.message : 'Gagal memuat.');
      });
  }, [id, classes.length, canMonitor]);
  useEffect(load, [load]);

  const loadTab = useCallback(() => {
    if (tab === 'monitor' && (canMonitor || canManage)) {
      examMonitor(id).then(setMonitor).catch(() => setMonitor(null));
    } else if (tab === 'hasil') {
      examResults(id, resClass || undefined).then(setResults).catch((e) => setError(e instanceof ApiError ? e.message : 'Gagal memuat hasil.'));
      examAnalysis(id, resClass || undefined).then(setAnalysis).catch(() => setAnalysis(null));
      if (resClass) { examAnswersMatrix(id, resClass).then(setMatrix).catch(() => setMatrix(null)); setMatrices({}); }
      else if (resJenjang) {
        setMatrix(null);
        // Matriks jawaban semua rombel pada jenjang terpilih.
        examResults(id, undefined).then((r) => {
          const ids = r.classes.filter((c) => c.gradeLevel === Number(resJenjang)).map((c) => c.classId);
          Promise.all(ids.map((cid) => examAnswersMatrix(id, cid).then((m) => [cid, m] as const).catch(() => null)))
            .then((xs) => setMatrices(Object.fromEntries(xs.filter((x): x is NonNullable<typeof x> => !!x))));
        }).catch(() => setMatrices({}));
      }
      else { setMatrix(null); setMatrices({}); }
    }
  }, [id, tab, resClass, resJenjang, canMonitor, canManage]);
  useEffect(loadTab, [loadTab]);

  // Polling monitor saat ujian dibuka.
  useEffect(() => {
    if (tab !== 'monitor' || exam?.status !== 'OPEN') return;
    const t = setInterval(() => examMonitor(id).then(setMonitor).catch(() => {}), 15_000);
    return () => clearInterval(t);
  }, [tab, exam?.status, id]);

  const flash = (n: string) => { setNotice(n); setTimeout(() => setNotice(null), 4000); };
  const err = (e: unknown, fb: string) => setError(e instanceof ApiError ? e.message : fb);

  const copy = async () => {
    if (!exam) return;
    try { await navigator.clipboard.writeText(exam.code); flash('Kode tersalin.'); }
    catch { flash(`Kode: ${exam.code}`); }
  };
  const regen = async () => {
    if (!exam || !(await confirm('Ganti kode ujian? Kode lama langsung tidak berlaku.'))) return;
    try { await regenerateExamCode(exam.id); flash('Kode baru dibuat.'); load(); }
    catch (e) { err(e, 'Gagal mengganti kode.'); }
  };
  const setStatus = async (status: ExamView['status']) => {
    if (!exam) return;
    const msg = status === 'OPEN' ? 'Buka ujian ini?' : status === 'CLOSED' ? 'Tutup ujian? Pengerjaan berjalan dinilai saat deadline.' : 'Kembalikan ke draf?';
    if (!(await confirm(msg))) return;
    try { await updateExam(exam.id, { status }); load(); } catch (e) { err(e, 'Gagal mengubah status.'); }
  };

  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!exam) return;
    const f = new FormData(e.currentTarget);
    const classIds = classes.filter((c) => f.get(`cls-${c.id}`)).map((c) => c.id);
    setModalErr(null);
    if (!classIds.length) { setModalErr('Pilih minimal satu rombel peserta.'); return; }
    setBusy(true);
    try {
      await updateExam(exam.id, {
        title: String(f.get('title') ?? '').trim(),
        instructions: String(f.get('instructions') ?? '').trim() || null,
        startAt: new Date(String(f.get('startAt'))).toISOString(),
        endAt: new Date(String(f.get('endAt'))).toISOString(),
        durationMin: Number(f.get('durationMin')) || exam.durationMin,
        classIds,
        shuffle: f.get('shuffle') === 'on',
        showScore: f.get('showScore') === 'on',
      });
      setModal(false); flash('Ujian diperbarui.'); load();
    } catch (e2) { setModalErr(e2 instanceof ApiError ? e2.message : 'Gagal menyimpan.'); }
    finally { setBusy(false); }
  };

  // ---------- Soal ----------
  // Pengelolaan soal (import/edit/hapus/bacaan/gambar) disatukan di halaman
  // Bank Asesmen — ujian hanya menampilkan pratinjau & tautan ke sana.

  // ---------- Hasil ----------
  const saveGrade = async () => {
    if (!gradeEdit || !exam) return;
    setBusy(true);
    try {
      await updateExamGrade(exam.id, gradeEdit.studentId, Math.round(Number(gradeEdit.score)));
      setGradeEdit(null); flash('Nilai akhir diperbarui.');
      examResults(exam.id, resClass || undefined).then(setResults).catch(() => {});
    } catch (e) { err(e, 'Gagal menyimpan nilai.'); }
    finally { setBusy(false); }
  };

  const done = exam?.attempts?.filter((a) => a.status === 'SUBMITTED').length ?? 0;
  const total = exam?.attempts?.length ?? 0;
  const TABS = [
    ['monitor', '📺 Monitor'], ['hasil', '📊 Hasil & Analisis'],
  ] as const;

  const keyText = (q: ExamQuestion | ItemAnalysis) => {
    const opts = (q.options ?? {}) as { choices?: string[]; statements?: string[] };
    if (q.type === 'MCQ') return `Kunci: ${'ABCDE'[Number(q.key)] ?? '—'}`;
    if (q.type === 'MCQ_COMPLEX') return `Kunci: ${(Array.isArray(q.key) ? q.key as number[] : []).map((i) => 'ABCDE'[i]).join(',')}`;
    if (q.type === 'TRUE_FALSE') return `Kunci: ${q.key ? 'Benar' : 'Salah'}`;
    if (q.type === 'TRUE_FALSE_COMPLEX') return `Kunci: ${(Array.isArray(q.key) ? q.key as boolean[] : []).map((b) => (b ? 'B' : 'S')).join(',')}`;
    return '';
  };

  const body = (
    <>
      {error ? <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {notice ? <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p> : null}
      {!exam ? null : (
        <>
          {/* ---------- Header: kode + status ---------- */}
          <div className="mb-4 grid gap-4 lg:grid-cols-3">
            <Widget title="Kode Akses" subtitle="Diumumkan pengawas di ruang — siswa login NIS+password, lalu masukkan kode ini.">
              <div className="space-y-3 p-4">
                <button type="button" onClick={() => void copy()} title="Klik untuk salin"
                  className="w-full rounded-2xl bg-primary-700 px-4 py-4 text-center font-mono text-2xl font-black tracking-[0.2em] text-white transition hover:bg-primary-800">
                  {exam.code}
                </button>
                <div className="flex gap-2">
                  {examManage ? <Button size="sm" variant="outline" className="flex-1" onClick={() => void regen()}>Ganti Kode</Button> : null}
                  <Button size="sm" variant="outline" className="flex-1" onClick={load}>↻ Segarkan</Button>
                </div>
              </div>
            </Widget>
            <div className="lg:col-span-2">
              <Widget title="Pengaturan" subtitle={`${done}/${total} siswa masuk`}>
                <div className="grid gap-3 p-4 text-sm text-sand-700 sm:grid-cols-2">
                  <div className="space-y-1.5 text-xs">
                    <p><Badge tone={STATUS[exam.status].tone}>{STATUS[exam.status].label}</Badge></p>
                    <p>📅 {dt(exam.startAt)} → {dt(exam.endAt)}</p>
                    <p>⏱ {exam.durationMin} menit · {exam.questions?.length ?? exam._count?.questions ?? exam.assessment._count?.questions ?? '—'} butir</p>
                    <p>🏫 {exam.classNames?.join(', ') || '—'}</p>
                    <p>🔀 Acak: {exam.shuffle ? 'Ya' : 'Tidak'} · Nilai tampil: {exam.showScore ? 'Ya' : 'Tidak'}</p>
                  </div>
                  <div className="flex flex-col justify-end gap-2">
                    {examManage ? (
                      <div className="flex gap-2">
                        {exam.status !== 'OPEN'
                          ? <Button size="sm" className="flex-1" onClick={() => void setStatus('OPEN')}>Buka Ujian</Button>
                          : <Button size="sm" variant="outline" className="flex-1" onClick={() => void setStatus('CLOSED')}>Tutup</Button>}
                        {exam.status !== 'DRAFT' ? <Button size="sm" variant="outline" onClick={() => void setStatus('DRAFT')}>Draf</Button> : null}
                        <Button size="sm" variant="outline" onClick={() => { setModalErr(null); setModal(true); }}>Edit</Button>
                      </div>
                    ) : <p className="text-xs text-sand-400">Anda punya akses lihat/monitor — kelola oleh guru mapel/admin.</p>}
                  </div>
                </div>
              </Widget>
            </div>
          </div>

          {/* ---------- Tabs ---------- */}
          {!monitorOnly ? (
            <div className="mb-4 flex gap-1 rounded-2xl border border-sand-200 bg-white p-1 shadow-card">
              {TABS.map(([k, l]) => (
                <button key={k} type="button" onClick={() => setTab(k)}
                  className={`flex-1 rounded-xl px-3 py-2 text-sm font-bold transition ${tab === k ? 'bg-primary-700 text-white' : 'text-sand-600 hover:bg-sand-50'}`}>
                  {l}
                </button>
              ))}
            </div>
          ) : null}

          {/* ---------- MONITOR ---------- */}
          {(tab === 'monitor' || monitorOnly) && (
            <Widget title="Monitor Pengerjaan" subtitle="Status siswa per rombel — diperbarui tiap 15 detik saat ujian dibuka.">
              {!monitor ? (
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
                          <p className="text-[11px] text-sand-400">Jendela ujian utama</p>
                        </div>
                        <Badge tone={c.done === c.total && c.total > 0 ? 'primary' : 'accent'}>{c.done}/{c.total} selesai{c.working ? ` · ${c.working} mengerjakan` : ''}</Badge>
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
          )}

          {/* ---------- HASIL ---------- */}
          {tab === 'hasil' && (
            <div className="space-y-4">
              <Widget title="Rekap Nilai per Jenjang & Rombel"
                action={
                  <div className="flex items-center gap-2">
                    <Select value={resJenjang} onChange={(e) => { setResJenjang(e.target.value); setResClass(''); }} className="w-28" searchable>
                      <option value="">Semua jenjang</option>
                      {[...new Set(results?.classes.map((c) => c.gradeLevel) ?? [])].sort().map((g) => <option key={g} value={g}>Kelas {g}</option>)}
                    </Select>
                    <Select value={resClass} onChange={(e) => setResClass(e.target.value)} className="w-36" searchable>
                      <option value="">Semua rombel</option>
                      {classes.filter((c) => exam.classIds.includes(c.id) && (!resJenjang || (results?.classes.find((x) => x.classId === c.id)?.gradeLevel ?? c.gradeLevel) === Number(resJenjang))).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </Select>
                    <Button size="sm" variant="outline" onClick={() => void exportExamResults(exam.id, resClass || undefined).catch((e) => err(e, 'Gagal ekspor.'))}>⬇ Excel</Button>
                  </div>
                }>
                {!results ? <p className="p-5 text-sm text-sand-400">Memuat…</p> : [...new Set(results.classes.map((c) => c.gradeLevel))].sort().map((g) => (
                  <div key={g} className="border-b border-sand-100 last:border-0">
                    <p className="bg-primary-50 px-5 py-2 text-xs font-black uppercase tracking-wider text-primary-800">Jenjang Kelas {g}</p>
                    {results.classes.filter((c) => c.gradeLevel === g).map((c) => (
                  <div key={c.classId} className="border-b border-sand-50 last:border-0">
                    <p className="bg-sand-50 px-5 py-2 text-xs font-black uppercase tracking-wider text-sand-600">{c.className}</p>
                    <DataTable head={['NIS', 'Nama', 'Status', 'Skor', 'Nilai Akhir', '']}>
                      {c.students.map((s) => (
                        <tr key={s.studentId}>
                          <td className="px-5 py-2.5 text-xs text-sand-500">{s.nis ?? '—'}</td>
                          <td className="px-5 py-2.5 font-medium text-sand-900">{s.name}</td>
                          <td className="px-5 py-2.5">
                            <Badge tone={s.status === 'SUBMITTED' ? 'primary' : s.status === 'STARTED' ? 'accent' : 'neutral'}>
                              {s.status === 'SUBMITTED' ? 'Selesai' : s.status === 'STARTED' ? 'Mengerjakan' : 'Belum'}
                            </Badge>
                          </td>
                          <td className="px-5 py-2.5 text-xs text-sand-600">{s.status === 'SUBMITTED' ? `${s.score ?? 0}/${s.maxScore ?? 0}` : '—'}</td>
                          <td className="px-5 py-2.5 font-black text-sand-900">{s.gradeScore ?? '—'}</td>
                          <td className="px-5 py-2.5">
                            {examManage && s.status === 'SUBMITTED' ? (
                              <button type="button" className={rowActionClasses('neutral')}
                                onClick={() => setGradeEdit({ studentId: s.studentId, name: s.name, score: String(s.gradeScore ?? '') })}>
                                Edit Nilai
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </DataTable>
                  </div>
                    ))}
                  </div>
                ))}
              </Widget>

              <div className="grid gap-4 lg:grid-cols-2">
                <Widget title="Soal Termudah" subtitle="Persentase benar tertinggi">
                  <ul className="divide-y divide-sand-50">
                    {(analysis?.easiest ?? []).map((q) => (
                      <li key={q.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                        <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-50 text-xs font-black text-emerald-700">{q.number}</span>
                        <span className="min-w-0 flex-1 truncate text-sand-700">{q.prompt}</span>
                        <Badge tone="primary">{q.correctPct}%</Badge>
                      </li>
                    ))}
                    {!analysis?.easiest.length ? <li className="px-5 py-3 text-xs text-sand-400">Belum ada jawaban dinilai.</li> : null}
                  </ul>
                </Widget>
                <Widget title="Soal Tersukar" subtitle="Persentase benar terendah — bahan remedial">
                  <ul className="divide-y divide-sand-50">
                    {(analysis?.hardest ?? []).map((q) => (
                      <li key={q.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                        <span className="flex size-7 items-center justify-center rounded-lg bg-red-50 text-xs font-black text-red-700">{q.number}</span>
                        <span className="min-w-0 flex-1 truncate text-sand-700">{q.prompt}</span>
                        <Badge tone="danger">{q.correctPct}%</Badge>
                      </li>
                    ))}
                    {!analysis?.hardest.length ? <li className="px-5 py-3 text-xs text-sand-400">Belum ada jawaban dinilai.</li> : null}
                  </ul>
                </Widget>
              </div>

              <Widget title="Analisis Butir Lengkap" subtitle="Tingkat kesukaran per soal pada rombel terpilih">
                <DataTable head={['No', 'Tipe', 'Soal', 'Bobot', 'Terjawab', 'Benar', '% Benar', 'Rata2', 'Tingkat']}
                  empty={!analysis?.questions.length ? 'Belum ada soal.' : undefined}>
                  {(analysis?.questions ?? []).map((q) => (
                    <tr key={q.id}>
                      <td className="px-4 py-2.5 font-bold text-sand-900">{q.number}</td>
                      <td className="px-4 py-2.5 text-[11px] text-sand-500">{TYPE_LABEL[q.type] ?? q.type}</td>
                      <td className="max-w-72 px-4 py-2.5"><p className="truncate text-xs text-sand-700">{q.prompt}</p><p className="text-[10px] text-emerald-700">{keyText(q)}</p></td>
                      <td className="px-4 py-2.5 text-xs text-sand-600">{q.weight}</td>
                      <td className="px-4 py-2.5 text-xs text-sand-600">{q.answered}</td>
                      <td className="px-4 py-2.5 text-xs text-sand-600">{q.correct}</td>
                      <td className="px-4 py-2.5 font-bold text-sand-800">{q.correctPct ?? '—'}%</td>
                      <td className="px-4 py-2.5 text-xs text-sand-600">{q.avgScore}</td>
                      <td className="px-4 py-2.5">
                        {q.difficulty ? <Badge tone={q.difficulty === 'Mudah' ? 'primary' : q.difficulty === 'Sedang' ? 'accent' : 'danger'}>{q.difficulty}</Badge> : '—'}
                      </td>
                    </tr>
                  ))}
                </DataTable>
              </Widget>

              {(matrix && resClass ? [{ cid: resClass, m: matrix }] : Object.entries(matrices).map(([cid, m]) => ({ cid, m }))).map(({ cid, m }) => (
                <Widget key={cid} title={`Rekap Jawaban — ${classes.find((c) => c.id === cid)?.name ?? ''}`} subtitle="B = benar · S = salah · · = kosong">
                  <div className="overflow-x-auto">
                    <div className="overflow-x-auto"><table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-sand-200 text-left text-sand-500">
                          <th className="px-4 py-2">NIS</th><th className="px-4 py-2">Nama</th>
                          {m.questions.map((q) => <th key={q.id} className="px-1.5 py-2 text-center" title={q.prompt ?? ''}>{q.number}</th>)}
                          <th className="px-4 py-2 text-right">Skor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {m.students.map((s) => (
                          <tr key={s.studentId} className="border-b border-sand-50">
                            <td className="px-4 py-1.5 text-sand-500">{s.nis ?? '—'}</td>
                            <td className="px-4 py-1.5 font-medium text-sand-800">{s.name}</td>
                            {s.cells.map((c, i) => (
                              <td key={i} className={`px-1.5 py-1.5 text-center font-bold ${c === null ? 'text-sand-300' : c.isCorrect === true ? 'text-emerald-600' : c.isCorrect === false ? 'text-red-500' : 'text-sand-400'}`}>
                                {c === null ? '·' : c.isCorrect === true ? 'B' : c.isCorrect === false ? 'S' : '·'}
                              </td>
                            ))}
                            <td className="px-4 py-1.5 text-right font-black text-sand-900">{s.score ?? '—'}</td>
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
      )}

      {/* ---------- Modal edit ujian ---------- */}
      <Modal open={modal} onClose={() => setModal(false)} title="Edit Ujian" size="xl">
        {exam ? (
          <form onSubmit={save} className="space-y-4">
            {modalErr ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{modalErr}</p> : null}
            <Field label="Judul Ujian"><Input name="title" defaultValue={exam.title} /></Field>
            <Field label="Rombel Peserta">
              <div className="flex flex-wrap gap-2 rounded-xl border border-sand-200 p-3">
                {classes.map((c) => (
                  <label key={c.id} className="flex items-center gap-1.5 rounded-lg bg-sand-50 px-2.5 py-1.5 text-xs font-medium">
                    <input type="checkbox" name={`cls-${c.id}`} defaultChecked={exam.classIds.includes(c.id)} /> {c.name}
                  </label>
                ))}
              </div>
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Mulai"><Input name="startAt" type="datetime-local" defaultValue={toLocalInput(exam.startAt)} required /></Field>
              <Field label="Selesai"><Input name="endAt" type="datetime-local" defaultValue={toLocalInput(exam.endAt)} required /></Field>
              <Field label="Durasi (menit)"><Input name="durationMin" type="number" min={5} max={600} defaultValue={exam.durationMin} required /></Field>
            </div>
            <Field label="Instruksi"><Input name="instructions" defaultValue={exam.instructions ?? ''} /></Field>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="shuffle" defaultChecked={exam.shuffle} /> Acak urutan soal per siswa</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="showScore" defaultChecked={exam.showScore} /> Tampilkan nilai setelah selesai</label>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setModal(false)}>Batal</Button>
              <Button type="submit" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</Button>
            </div>
          </form>
        ) : null}
      </Modal>

      {/* ---------- Modal edit nilai ---------- */}
      <Modal open={!!gradeEdit} onClose={() => setGradeEdit(null)} title={`Nilai Akhir — ${gradeEdit?.name ?? ''}`}>
        {gradeEdit ? (
          <div className="space-y-4">
            <Field label={`Nilai akhir (0–${results?.exam.maxScore ?? 100})`}>
              <Input type="number" min={0} max={results?.exam.maxScore ?? 100} value={gradeEdit.score} onChange={(e) => setGradeEdit({ ...gradeEdit, score: e.target.value })} />
            </Field>
            <p className="text-xs text-sand-500">Tersimpan ke ledger penilaian — tercatat di log audit.</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setGradeEdit(null)}>Batal</Button>
              <Button disabled={busy} onClick={() => void saveGrade()}>{busy ? 'Menyimpan…' : 'Simpan'}</Button>
            </div>
          </div>
        ) : null}
      </Modal>
      {dialog}
    </>
  );

  if (embedded) return body;
  return (
    <Shell>
      <PageTitle
        title={exam?.title ?? 'Ujian'}
        subtitle={exam ? `${exam.subject?.name ?? exam.assessment.subject?.name ?? '—'}${exam.gradeLevel ? ` · Kelas ${exam.gradeLevel}` : ''} · ${exam.assessment.name}` : ''}
        actions={<Link href="/kurikulum/asesmen" className="text-sm font-bold text-primary-700 hover:underline">← Semua Asesmen</Link>}
      />
      {body}
    </Shell>
  );
}
