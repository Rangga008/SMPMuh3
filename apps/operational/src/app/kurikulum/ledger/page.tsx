'use client';

import { useCallback, useEffect, useState } from 'react';
import { Field, Input, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { PageTitle, Widget } from '@/components/widgets';
import { DataTable } from '@/components/data-table';
import { getAttendanceRecap, getClassSubjectStats, getGradeLedger } from '@/lib/api-ops';
import { listAcademicYears, listClasses, type AcademicYear, type ClassView } from '@/lib/api';

type Tab = 'ledger' | 'stats' | 'absen';

export default function LedgerPage() {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [classes, setClasses] = useState<ClassView[]>([]);
  const [yearId, setYearId] = useState('');
  const [classId, setClassId] = useState('');
  const [tab, setTab] = useState<Tab>('ledger');
  const [ledger, setLedger] = useState<Awaited<ReturnType<typeof getGradeLedger>> | null>(null);
  const [stats, setStats] = useState<Awaited<ReturnType<typeof getClassSubjectStats>>>([]);
  const [recap, setRecap] = useState<Awaited<ReturnType<typeof getAttendanceRecap>> | null>(null);
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 8) + '01');
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listAcademicYears().then((ys) => {
      setYears(ys);
      const a = ys.find((x) => x.isActive) ?? ys[0];
      if (a) setYearId(a.id);
    });
  }, []);
  useEffect(() => {
    if (!yearId) return;
    listClasses(yearId).then((cs) => { setClasses(cs); if (cs[0]) setClassId((c) => c || cs[0]!.id); });
  }, [yearId]);

  const load = useCallback(() => {
    if (!classId || !yearId) return;
    getGradeLedger(classId, yearId).then(setLedger).catch(() => setError('Gagal memuat ledger.'));
    getClassSubjectStats(classId, yearId).then(setStats).catch(() => {});
    getAttendanceRecap(classId, from, to).then(setRecap).catch(() => {});
  }, [classId, yearId, from, to]);
  useEffect(load, [load]);

  return (
    <Shell>
      <PageTitle title="Ledger & Rekap Kelas" subtitle="Daftar nilai per siswa per mapel, statistik per mapel, dan rekap kehadiran." />
      {error ? <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-sand-200 bg-white p-4 shadow-card">
        <Field label="Tahun Ajaran">
          <Select value={yearId} onChange={(e) => { setYearId(e.target.value); setClassId(''); }}>
            {years.map((y) => <option key={y.id} value={y.id}>{y.name}{y.isActive ? ' (aktif)' : ''}</option>)}
          </Select>
        </Field>
        <Field label="Kelas">
          <Select value={classId} onChange={(e) => setClassId(e.target.value)}>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Dari"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="Sampai"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <div className="flex gap-2">
          {(['ledger', 'stats', 'absen'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`rounded-xl px-3 py-2 text-sm font-bold ${tab === t ? 'bg-primary-700 text-white' : 'bg-sand-100 text-sand-600'}`}>
              {t === 'ledger' ? 'Daftar Nilai' : t === 'stats' ? 'Statistik Mapel' : 'Rekap Absen'}
            </button>
          ))}
        </div>
      </div>

      {tab === 'ledger' && ledger && (
        <Widget title={`Daftar Nilai — ${ledger.class.name}`}>
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

      {tab === 'stats' && (
        <Widget title={`Statistik per Mapel — ${ledger?.class.name ?? ''}`}>
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
        <Widget title={`Rekap Absen — ${recap.class.name}`} subtitle={`${recap.daysTaken} hari terekam · ${from} s.d. ${to}`}>
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
