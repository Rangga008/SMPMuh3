'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Field, Input, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { DataTable } from '@/components/data-table';
import { PageTitle, Widget } from '@/components/widgets';
import {
  incomeByStudent,
  listClasses,
  savingsReport,
  type ClassView,
  type IncomeStudentRow,
} from '@/lib/api';

const rp = (n: number) => (n ? `Rp${n.toLocaleString('id-ID')}` : '—');
const KIND_LABEL: Record<string, string> = {
  spp: 'SPP', dsp: 'DSP', dsp_dp: 'DSP (DP)', seragam: 'Seragam', kat: 'KAT',
  daftar_ulang: 'Daftar Ulang', registration_fee: 'Pendaftaran', installment: 'Cicilan',
  pendaftaran: 'Pendaftaran', tabungan: 'Tabungan', other: 'Lainnya',
};
const mShort = (m: string) =>
  new Date(`${m}-15`).toLocaleDateString('id-ID', { month: 'short', year: '2-digit' });

/** Laporan pemasukan per siswa (per tipe × per bulan) + laporan tabungan. */
export default function LaporanSiswaPage() {
  const [tab, setTab] = useState<'pemasukan' | 'tabungan'>('pemasukan');
  const now = new Date();
  const defFrom = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const [from, setFrom] = useState(defFrom);
  const [to, setTo] = useState(defFrom);
  const [classId, setClassId] = useState('');
  const [search, setSearch] = useState('');
  const [classes, setClasses] = useState<ClassView[]>([]);
  const [income, setIncome] = useState<{ months: string[]; kinds: string[]; rows: IncomeStudentRow[] } | null>(null);
  const [savings, setSavings] = useState<Awaited<ReturnType<typeof savingsReport>> | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [savMode, setSavMode] = useState<'days' | 'months'>('months');

  useEffect(() => { listClasses().then(setClasses).catch(() => undefined); }, []);

  const load = useCallback(() => {
    if (!from || !to) return;
    setLoading(true); setErr('');
    const q = { from, to, ...(classId ? { classId } : {}) };
    if (tab === 'pemasukan') {
      incomeByStudent({ ...q, ...(search ? { search } : {}) })
        .then(setIncome).catch((e) => setErr(e.message)).finally(() => setLoading(false));
    } else {
      savingsReport(q)
        .then(setSavings).catch((e) => setErr(e.message)).finally(() => setLoading(false));
    }
  }, [tab, from, to, classId, search]);
  useEffect(load, [load]);

  return (
    <Shell>
      <PageTitle title="Laporan Pemasukan & Tabungan Siswa" subtitle="Pemasukan per siswa per tipe tagihan per rentang bulan — dan rekap tabungan per tanggal/bulan" />
      <div className="mb-4 flex gap-2">
        {([['pemasukan', 'Pemasukan per Siswa'], ['tabungan', 'Tabungan']] as const).map(([id, l]) => (
          <Button key={id} variant={tab === id ? 'primary' : 'secondary'} onClick={() => setTab(id)}>{l}</Button>
        ))}
      </div>
      <Widget title="Filter">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Dari bulan"><Input type="month" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="Sampai bulan"><Input type="month" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          <Field label="Kelas">
            <Select value={classId} onChange={(e) => setClassId(e.target.value)}>
              <option value="">Semua kelas</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          {tab === 'pemasukan' && (
            <Field label="Cari siswa"><Input placeholder="Nama…" value={search} onChange={(e) => setSearch(e.target.value)} /></Field>
          )}
          {tab === 'tabungan' && (
            <Field label="Tampilan">
              <Select value={savMode} onChange={(e) => setSavMode(e.target.value as 'days' | 'months')}>
                <option value="months">Per bulan</option>
                <option value="days">Per tanggal nabung</option>
              </Select>
            </Field>
          )}
        </div>
      </Widget>
      {err && <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{err}</p>}
      {loading && <p className="text-sm text-slate-500">Memuat…</p>}

      {tab === 'pemasukan' && income && !loading && (
        <Widget title={`Pemasukan ${mShort(from)} — ${mShort(to)} (${income.rows.length} siswa)`}>
          {income.rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">Tidak ada pemasukan pada rentang ini.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-sand-200 text-left text-xs uppercase text-sand-400">
                    <th className="pb-2 pr-4">Siswa</th>
                    <th className="pb-2 pr-4">Kelas</th>
                    {income.months.map((m) => (
                      <th key={m} className="pb-2 pr-4 text-right" colSpan={income.kinds.length}>{mShort(m)}</th>
                    ))}
                    <th className="pb-2 text-right">Total</th>
                  </tr>
                  <tr className="border-b border-sand-200 text-left text-[10px] uppercase text-sand-400">
                    <th /><th />
                    {income.months.map((m) => income.kinds.map((k) => (
                      <th key={`${m}-${k}`} className="pb-2 pr-3 text-right font-normal">{KIND_LABEL[k] ?? k}</th>
                    )))}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {income.rows.map((r) => (
                    <tr key={r.student.id} className="border-b border-sand-100 hover:bg-sand-50">
                      <td className="py-2 pr-4 font-medium">{r.student.name}</td>
                      <td className="py-2 pr-4 text-sand-600">{r.className ?? '—'}</td>
                      {income.months.map((m) => income.kinds.map((k) => (
                        <td key={`${m}-${k}`} className="py-2 pr-3 text-right tabular-nums text-sand-700">
                          {r.months[m]?.[k] ? rp(r.months[m][k]) : <span className="text-sand-300">·</span>}
                        </td>
                      )))}
                      <td className="py-2 text-right font-bold text-emerald-700 tabular-nums">{rp(r.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Widget>
      )}

      {tab === 'tabungan' && savings && !loading && (
        <Widget title={`Tabungan ${mShort(from)} — ${mShort(to)} (${savings.length} siswa)`}>
          {savings.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">Tidak ada aktivitas tabungan pada rentang ini.</p>
          ) : savMode === 'months' ? (
            <DataTable head={['Siswa', 'Bulan', 'Setor', 'Tarik', 'Saldo Bersih']}>
              {savings.flatMap((r) =>
                r.months.map((m) => (
                  <tr key={`${r.student.id}-${m.month}`}>
                    <td className="px-5 py-2.5 font-medium">{r.student.name}</td>
                    <td className="px-5 py-2.5">{mShort(m.month)}</td>
                    <td className="px-5 py-2.5 text-emerald-700">{rp(m.in)}</td>
                    <td className="px-5 py-2.5 text-red-600">{m.out ? rp(m.out) : '—'}</td>
                    <td className="px-5 py-2.5 font-bold">{rp(m.in - m.out)}</td>
                  </tr>
                )),
              )}
            </DataTable>
          ) : (
            <DataTable head={['Siswa', 'Tanggal', 'Setor', 'Tarik']}>
              {savings.flatMap((r) =>
                r.days.map((d) => (
                  <tr key={`${r.student.id}-${d.date}`}>
                    <td className="px-5 py-2.5 font-medium">{r.student.name}</td>
                    <td className="px-5 py-2.5">{new Date(`${d.date}T12:00:00`).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</td>
                    <td className="px-5 py-2.5 text-emerald-700">{rp(d.in)}</td>
                    <td className="px-5 py-2.5 text-red-600">{d.out ? rp(d.out) : '—'}</td>
                  </tr>
                )),
              )}
            </DataTable>
          )}
        </Widget>
      )}
    </Shell>
  );
}
