'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, Field, Input, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { PageTitle, Widget } from '@/components/widgets';
import { DataTable } from '@/components/data-table';
import {
  downloadLedgerXlsx, downloadRecapXlsx, downloadStatsXlsx, examResults, exportExamResults,
  getAttendanceRecap, getClassSubjectStats, getGradeLedger, listExams, syncExamGrades,
  type ExamView,
} from '@/lib/api-ops';
import { printHtml } from '@/lib/print';
import { listAcademicYears, listClasses, type AcademicYear, type ClassView } from '@/lib/api';

type Tab = 'ledger' | 'ujian' | 'stats' | 'absen';
const GRADES = [7, 8, 9];

export default function LedgerPage() {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [classes, setClasses] = useState<ClassView[]>([]);
  const [exams, setExams] = useState<ExamView[]>([]);
  const [yearId, setYearId] = useState('');
  const [grade, setGrade] = useState<number | ''>('');
  const [classId, setClassId] = useState('');
  const [examId, setExamId] = useState('');
  const [tab, setTab] = useState<Tab>('ledger');
  const [ledger, setLedger] = useState<Awaited<ReturnType<typeof getGradeLedger>> | null>(null);
  const [ujian, setUjian] = useState<Awaited<ReturnType<typeof examResults>> | null>(null);
  const [stats, setStats] = useState<Awaited<ReturnType<typeof getClassSubjectStats>>>([]);
  const [recap, setRecap] = useState<Awaited<ReturnType<typeof getAttendanceRecap>> | null>(null);
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 8) + '01');
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  useEffect(() => {
    listAcademicYears().then((ys) => {
      setYears(ys);
      const a = ys.find((x) => x.isActive) ?? ys[0];
      if (a) setYearId(a.id);
    });
  }, []);

  useEffect(() => {
    if (!yearId) return;
    listClasses(yearId).then((cs) => {
      setClasses(cs);
      setClassId((c) => (cs.some((x) => x.id === c) ? c : cs[0]?.id ?? ''));
    });
    listExams(yearId).then(setExams).catch(() => setExams([]));
  }, [yearId]);

  const classOptions = useMemo(
    () => classes.filter((c) => (grade ? c.gradeLevel === grade : true)),
    [classes, grade],
  );
  // Ujian yang mencakup kelas terpilih — kelas kosong = semua ujian jenjang/tahun ini.
  const examOptions = useMemo(
    () => exams.filter((x) => !classId || x.classIds.includes(classId)),
    [exams, classId],
  );

  useEffect(() => {
    if (classOptions.length && !classOptions.some((c) => c.id === classId)) {
      setClassId(classOptions[0]!.id);
    }
  }, [classOptions, classId]);

  /** Tombol export per tab — Excel (.xlsx server) + PDF (jendela cetak). */
  const esc = (v: unknown) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  const tbl = (head: string[], rows: (string | number)[][], align?: ('l' | 'c')[]) =>
    `<table border="1" cellpadding="5" cellspacing="0" style="width:100%;font-size:11px"><thead><tr style="background:#eee">${
      head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${
      rows.map((r) => `<tr>${r.map((c, i) => `<td${align?.[i] === 'c' ? ' align="center"' : ''}>${esc(c)}</td>`).join('')}</tr>`).join('')
    }</tbody></table>`;
  const kop = (judul: string, sub: string) =>
    `<h3 style="margin:0">${esc(judul)}</h3><p style="margin:2px 0 12px;font-size:11px;color:#444">${esc(sub)}</p>`;

  const exportActions = {
    ledger: ledger ? (
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => downloadLedgerXlsx(classId, yearId)}>⬇ Excel</Button>
        <Button size="sm" variant="outline" onClick={() => printHtml(`Ledger ${ledger.class.name}`,
          kop(`DAFTAR NILAI — ${ledger.class.name}`, `Tahun ajaran ${years.find((y) => y.id === yearId)?.name ?? ''}`) +
          tbl(['No', 'NIS', 'Siswa', ...ledger.subjects.map((s) => s.code)],
            ledger.students.map((s, i) => [i + 1, s.nis ?? '', s.name, ...s.scores.map((sc) => sc ?? '—')]),
            ['c', 'c', 'l', ...ledger.subjects.map(() => 'c' as const)]),
          { landscape: true })}>🖨 PDF</Button>
      </div>
    ) : undefined,
    ujian: examId && ujian ? (
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => exportExamResults(examId, classId || undefined)}>⬇ Excel</Button>
        <Button size="sm" variant="outline" onClick={() => printHtml(`Nilai ${ujian.exam.title}`,
          kop(`NILAI UJIAN — ${ujian.exam.title}`, `Skor maksimal ${ujian.exam.maxScore}`) +
          ujian.classes.map((c) => `<p style="font-size:11px;font-weight:bold;margin:10px 0 4px">Kelas ${esc(c.className)}</p>` +
            tbl(['NIS', 'Siswa', 'Status', 'Skor', 'Nilai Akhir'],
              c.students.map((s) => [s.nis ?? '', s.name,
                s.status === 'SUBMITTED' ? 'Selesai' : s.status === 'IN_PROGRESS' ? 'Mengerjakan' : 'Belum',
                s.score != null ? `${s.score}/${s.maxScore ?? '?'}` : '—', s.gradeScore ?? '—']),
              ['c', 'l', 'c', 'c', 'c'])).join(''))}>🖨 PDF</Button>
      </div>
    ) : undefined,
    stats: classId && stats.length ? (
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => downloadStatsXlsx(classId, yearId)}>⬇ Excel</Button>
        <Button size="sm" variant="outline" onClick={() => printHtml('Statistik Mapel',
          kop(`STATISTIK MAPEL — ${ledger?.class.name ?? ''}`, `Tahun ajaran ${years.find((y) => y.id === yearId)?.name ?? ''}`) +
          tbl(['Kode', 'Mata Pelajaran', 'Penilaian', 'Rata-rata', 'Min', 'Max'],
            stats.map((s) => [s.subject.code, s.subject.name, s.count, s.avg ?? '—', s.min ?? '—', s.max ?? '—']),
            ['c', 'l', 'c', 'c', 'c', 'c']))}>🖨 PDF</Button>
      </div>
    ) : undefined,
    absen: classId && recap ? (
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => downloadRecapXlsx(classId, from, to)}>⬇ Excel</Button>
        <Button size="sm" variant="outline" onClick={() => printHtml(`Rekap Absen ${recap.class.name}`,
          kop(`REKAP ABSEN — ${recap.class.name}`, `${recap.daysTaken} hari · ${from} s.d. ${to}`) +
          tbl(['No', 'NIS', 'Siswa', 'H', 'S', 'I', 'A', '% Hadir'],
            recap.students.map((s, i) => [i + 1, s.nis ?? '', s.name, s.present, s.sick, s.permit, s.absent, s.presentPct != null ? `${s.presentPct}%` : '—']),
            ['c', 'c', 'l', 'c', 'c', 'c', 'c', 'c']))}>🖨 PDF</Button>
      </div>
    ) : undefined,
  };

  const load = useCallback(() => {
    if (!yearId) return;
    if (classId) {
      getGradeLedger(classId, yearId).then(setLedger).catch(() => setError('Gagal memuat ledger.'));
      getClassSubjectStats(classId, yearId).then(setStats).catch(() => {});
      getAttendanceRecap(classId, from, to).then(setRecap).catch(() => {});
    }
    if (examId) {
      examResults(examId, classId || undefined).then(setUjian).catch(() => setUjian(null));
    } else {
      setUjian(null);
    }
  }, [classId, yearId, examId, from, to]);
  useEffect(load, [load]);

  return (
    <Shell>
      <PageTitle title="Ledger & Rekap Kelas" subtitle="Pilih jenjang → kelas → ujian: daftar nilai per asesmen, nilai ujian CBT, statistik mapel, dan rekap kehadiran." />
      {error ? <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {syncMsg ? <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{syncMsg}</p> : null}

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-sand-200 bg-white p-4 shadow-card">
        <Field label="Tahun Ajaran">
          <Select value={yearId} onChange={(e) => { setYearId(e.target.value); setClassId(''); setExamId(''); }} searchable>
            {years.map((y) => <option key={y.id} value={y.id}>{y.name}{y.isActive ? ' (aktif)' : ''}</option>)}
          </Select>
        </Field>
        <Field label="Jenjang">
          <Select value={grade} onChange={(e) => setGrade(e.target.value ? Number(e.target.value) : '')} searchable>
            <option value="">Semua</option>
            {GRADES.map((g) => <option key={g} value={g}>Kelas {g}</option>)}
          </Select>
        </Field>
        <Field label="Kelas">
          <Select value={classId} onChange={(e) => { setClassId(e.target.value); setExamId(''); }} searchable>
            {classOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Ujian (khusus tab Nilai Ujian)">
          <Select value={examId} onChange={(e) => { setExamId(e.target.value); if (e.target.value) setTab('ujian'); }} searchable>
            <option value="">— pilih ujian —</option>
            {examOptions.map((x) => (
              <option key={x.id} value={x.id}>{x.title} · {x.code} · {x.assessment.subject.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Dari"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="Sampai"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <div className="flex gap-2">
          {(['ledger', 'ujian', 'stats', 'absen'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`rounded-xl px-3 py-2 text-sm font-bold ${tab === t ? 'bg-primary-700 text-white' : 'bg-sand-100 text-sand-600'}`}>
              {t === 'ledger' ? 'Daftar Nilai' : t === 'ujian' ? 'Nilai Ujian' : t === 'stats' ? 'Statistik Mapel' : 'Rekap Absen'}
            </button>
          ))}
        </div>
      </div>

      {tab === 'ledger' && ledger && (
        <Widget title={`Daftar Nilai — ${ledger.class.name}`} subtitle="Nilai akhir per mapel (gabungan semua asesmen)." action={exportActions.ledger}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-sand-200 text-sand-500">
                  <th className="px-4 py-2 font-bold">Siswa</th>
                  {ledger.subjects.map((s) => (
                    <th key={s.id} className="px-2 py-2 text-center font-bold" title={s.name}>{s.code}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ledger.students.map((s) => (
                  <tr key={s.id} className="border-b border-sand-50">
                    <td className="whitespace-nowrap px-4 py-2 font-medium text-sand-900">{s.name}
                      <span className="ml-1 text-[10px] text-sand-400">{s.nis ?? ''}</span></td>
                    {s.scores.map((sc, i) => (
                      <td key={i} className="px-2 py-2 text-center font-semibold text-sand-800">{sc ?? '—'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Widget>
      )}

      {tab === 'ujian' && (
        <Widget
          title={ujian ? `Nilai Ujian — ${ujian.exam.title}` : 'Nilai Ujian'}
          subtitle={examId ? 'Hasil pengerjaan ujian CBT per siswa (skor mentah & nilai akhir).' : 'Pilih ujian di filter atas.'}
          action={examId ? (
            <div className="flex gap-2">
              {exportActions.ujian}
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  syncExamGrades(examId)
                    .then((r) => { setSyncMsg(`Tersinkron: ${r.synced}/${r.total} nilai masuk ledger.`); load(); })
                    .catch((e) => setError(e instanceof Error ? e.message : 'Gagal sinkron.'));
                }}
              >↻ Sinkron ke Ledger</Button>
            </div>
          ) : undefined}
        >
          {!examId ? (
            <p className="px-5 py-6 text-sm text-sand-400">Pilih ujian CBT dari dropdown <b>Ujian</b> di atas untuk melihat daftar nilai.</p>
          ) : !ujian || ujian.classes.every((c) => c.students.length === 0) ? (
            <p className="px-5 py-6 text-sm text-sand-400">Belum ada hasil untuk ujian ini{ujian ? '' : ' / ujian tidak ditemukan'}.</p>
          ) : (
            ujian.classes.map((c) => (
              <div key={c.classId} className="border-b border-sand-100 last:border-0">
                <p className="bg-sand-50 px-5 py-2 text-xs font-bold uppercase tracking-wide text-sand-600">
                  Kelas {c.className} · Kelas {c.gradeLevel}
                </p>
                <DataTable head={['NIS', 'Siswa', 'Status', 'Skor', 'Nilai Akhir']}>
                  {c.students.map((s) => (
                    <tr key={s.studentId}>
                      <td className="px-5 py-2.5 text-sand-500">{s.nis ?? '—'}</td>
                      <td className="px-5 py-2.5 font-medium text-sand-900">{s.name}</td>
                      <td className="px-5 py-2.5">
                        <Badge tone={s.status === 'SUBMITTED' ? 'primary' : s.status === 'IN_PROGRESS' ? 'accent' : 'neutral'}>
                          {s.status === 'SUBMITTED' ? 'Selesai' : s.status === 'IN_PROGRESS' ? 'Mengerjakan' : 'Belum'}
                        </Badge>
                      </td>
                      <td className="px-5 py-2.5 font-semibold">{s.score != null ? `${s.score}/${s.maxScore ?? '?'}` : '—'}</td>
                      <td className="px-5 py-2.5 font-bold text-primary-700">{s.gradeScore ?? '—'}</td>
                    </tr>
                  ))}
                </DataTable>
              </div>
            ))
          )}
        </Widget>
      )}

      {tab === 'stats' && (
        <Widget title={`Statistik per Mapel — ${ledger?.class.name ?? ''}`} action={exportActions.stats}>
          <DataTable head={['Kode', 'Mata Pelajaran', 'Penilaian', 'Rata-rata', 'Min', 'Max']}
            empty={!stats.length ? 'Belum ada nilai.' : undefined}>
            {stats.map((s) => (
              <tr key={s.subject.id}>
                <td className="px-5 py-2.5 font-bold text-sand-900">{s.subject.code}</td>
                <td className="px-5 py-2.5 text-sand-700">{s.subject.name}</td>
                <td className="px-5 py-2.5 text-sand-600">{s.count}</td>
                <td className="px-5 py-2.5 font-bold text-primary-700">{s.avg ?? '—'}</td>
                <td className="px-5 py-2.5 text-emerald-700">{s.min ?? '—'}</td>
                <td className="px-5 py-2.5 text-red-600">{s.max ?? '—'}</td>
              </tr>
            ))}
          </DataTable>
        </Widget>
      )}

      {tab === 'absen' && recap && (
        <Widget title={`Rekap Absen — ${recap.class.name}`} subtitle={`${recap.daysTaken} hari terekam · ${from} s.d. ${to}`} action={exportActions.absen}>
          <DataTable head={['NIS', 'Siswa', 'Hadir', 'Sakit', 'Izin', 'Alpha', '% Hadir']}
            empty={!recap.students.length ? 'Belum ada data.' : undefined}>
            {recap.students.map((s) => (
              <tr key={s.id}>
                <td className="px-5 py-2.5 text-sand-500">{s.nis ?? '—'}</td>
                <td className="px-5 py-2.5 font-medium text-sand-900">{s.name}</td>
                <td className="px-5 py-2.5 text-emerald-700 font-semibold">{s.present}</td>
                <td className="px-5 py-2.5 text-sky-700">{s.sick}</td>
                <td className="px-5 py-2.5 text-amber-600">{s.permit}</td>
                <td className="px-5 py-2.5 text-red-600">{s.absent}</td>
                <td className="px-5 py-2.5 font-bold">{s.presentPct ?? '—'}%</td>
              </tr>
            ))}
          </DataTable>
        </Widget>
      )}
    </Shell>
  );
}
