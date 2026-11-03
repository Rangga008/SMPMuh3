'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Field, Input, Select } from '@smpmuh3/ui';
import Link from 'next/link';
import { Shell } from '@/components/shell';
import { PageTitle, StatCard, Widget } from '@/components/widgets';
import { Donut, TrendChart } from '@/components/finance-charts';
import { printEl } from '@/components/payroll-slip';
import {
  getFinanceSummary,
  getSchool,
  listAcademicYears,
  listCashAccounts,
  listFinanceTransactions,
  type AcademicYear,
  type CashAccountView,
  type FinanceSummary,
  type FinanceTransaction,
  type School,
} from '@/lib/api';
import { PERMISSIONS } from '@smpmuh3/types';
import { me } from '@/lib/api';

const rupiah = (n: number) => `Rp${n.toLocaleString('id-ID')}`;
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });

const SRC_LABEL: Record<string, string> = {
  manual: 'Manual', spmb: 'SPMB', billing: 'Tagihan', expense: 'Pengeluaran',
  payroll: 'Payroll', savings: 'Tabungan', loan: 'Pinjaman', bank: 'Bank',
};

export default function KeuanganPage() {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [yearId, setYearId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [accounts, setAccounts] = useState<CashAccountView[]>([]);
  const [recent, setRecent] = useState<FinanceTransaction[]>([]);
  const [school, setSchool] = useState<School | null>(null);
  const [allowed, setAllowed] = useState(true);
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    me().then((u) => setAllowed(u.permissions.includes(PERMISSIONS.FINANCE_READ))).catch(() => undefined);
    listAcademicYears()
      .then((ys) => {
        setYears(ys);
        const active = ys.find((y) => y.isActive) ?? ys[0];
        if (active) setYearId(active.id);
      })
      .catch(() => undefined);
    listCashAccounts().then(setAccounts).catch(() => undefined);
    getSchool().then(setSchool).catch(() => undefined);
  }, []);

  const load = useCallback(() => {
    getFinanceSummary({
      ...(yearId ? { academicYearId: yearId } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    })
      .then(setSummary)
      .catch(() => undefined);
    listFinanceTransactions({
      ...(yearId ? { academicYearId: yearId } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      take: '8',
    })
      .then((r) => setRecent(r.items))
      .catch(() => undefined);
  }, [yearId, from, to]);

  useEffect(load, [load]);

  const incCatData = (summary?.byCategory ?? []).filter((c) => c.type === 'INCOME').map((c) => ({ name: c.name, total: c.total }));
  const expCatData = (summary?.byCategory ?? []).filter((c) => c.type === 'EXPENSE').map((c) => ({ name: c.name, total: c.total }));
  const incCatTotal = incCatData.reduce((s, c) => s + c.total, 0);
  const expCatTotal = expCatData.reduce((s, c) => s + c.total, 0);

  return (
    <Shell>
      <PageTitle title="Dashboard Keuangan" subtitle="Ringkasan dan grafik arus kas sekolah" />
      {!allowed ? (
        <Widget title="Akses">Anda tidak memiliki izin melihat keuangan.</Widget>
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl border border-sand-200 bg-white p-4 shadow-card">
            <Field label="Tahun Ajaran" className="w-48">
              <Select value={yearId} onChange={(e) => setYearId(e.target.value)} aria-label="Tahun ajaran">
                <option value="">Semua</option>
                {years.map((y) => (
                  <option key={y.id} value={y.id}>{y.name}{y.isActive ? ' (aktif)' : ''}</option>
                ))}
              </Select>
            </Field>
            <Field label="Dari" className="w-36">
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Dari tanggal" />
            </Field>
            <Field label="Sampai" className="w-36">
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Sampai tanggal" />
            </Field>
          </div>

          <div className="mb-5 grid gap-4 sm:grid-cols-3">
            <StatCard label="Pemasukan" value={rupiah(summary?.income ?? 0)} />
            <StatCard label="Pengeluaran" value={rupiah(summary?.expense ?? 0)} accent="accent" />
            <StatCard label="Saldo" value={rupiah(summary?.balance ?? 0)} />
          </div>

          {summary && (summary.monthly.length > 0 || summary.byCategory.length > 0) ? (
            <div ref={chartRef}>
              {/* Kepala cetak — kelas 'hidden' tak berlaku di jendela print */}
              <div className="hidden">
                <div className="ctr b2" style={{ paddingBottom: 8 }}>
                  <div className="b" style={{ fontSize: 16 }}>{school?.name ?? 'Sekolah'}</div>
                  <div className="xs">{school?.address ?? ''}</div>
                  <div className="up mt2">Grafik Keuangan</div>
                  <div className="xs">
                    Pemasukan {rupiah(summary.income)} · Pengeluaran {rupiah(summary.expense)} · Saldo {rupiah(summary.balance)}
                    {' '}· Digenerate {new Date().toLocaleString('id-ID')}
                  </div>
                </div>
              </div>

              <Widget
                title="Tren Bulanan"
                className="mb-5"
                action={
                  <span className="flex items-center gap-3">
                    <span className="flex items-center gap-1.5 text-xs text-sand-500"><span className="h-2.5 w-2.5 rounded-sm bg-green-600" /> Pemasukan</span>
                    <span className="flex items-center gap-1.5 text-xs text-sand-500"><span className="h-2.5 w-2.5 rounded-sm bg-red-600" /> Pengeluaran</span>
                    <Button variant="outline" size="sm" onClick={() => printEl(chartRef.current, 'Grafik Keuangan')}>PDF</Button>
                  </span>
                }
              >
                {summary.monthly.length === 0 ? (
                  <p className="py-6 text-sm text-sand-500">Belum ada transaksi.</p>
                ) : (
                  <TrendChart data={summary.monthly} />
                )}
              </Widget>

              <div className="mb-5 grid items-start gap-5 lg:grid-cols-2">
                <Widget title="Pemasukan per Kategori">
                  {incCatData.length === 0 ? (
                    <p className="py-4 text-sm text-sand-500">Belum ada pemasukan.</p>
                  ) : (
                    <Donut data={incCatData} total={incCatTotal} />
                  )}
                </Widget>
                <Widget title="Pengeluaran per Kategori">
                  {expCatData.length === 0 ? (
                    <p className="py-4 text-sm text-sand-500">Belum ada pengeluaran.</p>
                  ) : (
                    <Donut data={expCatData} total={expCatTotal} />
                  )}
                </Widget>
              </div>
            </div>
          ) : null}

          <div className="grid items-start gap-5 lg:grid-cols-3">
            <Widget title="Saldo per Kas" className="lg:col-span-1"
              action={<Link href="/keuangan/kas" className="text-xs font-semibold text-primary-700 hover:underline">Kelola →</Link>}>
              <ul className="space-y-2.5">
                {accounts.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                    <Link href={`/keuangan/kas/${a.id}`} className="text-sand-700 hover:text-primary-700 hover:underline">
                      {a.name}
                    </Link>
                    <span className={`font-bold tabular-nums ${(a.balance ?? 0) >= 0 ? 'text-primary-800' : 'text-red-600'}`}>
                      {rupiah(a.balance ?? 0)}
                    </span>
                  </li>
                ))}
                {accounts.length === 0 ? <li className="text-sm text-sand-500">Belum ada akun kas.</li> : null}
              </ul>
            </Widget>

            <Widget title="Transaksi Terbaru" className="lg:col-span-2"
              action={<Link href="/keuangan/harian" className="text-xs font-semibold text-primary-700 hover:underline">Semua →</Link>}>
              {recent.length === 0 ? (
                <p className="py-4 text-sm text-sand-500">Belum ada transaksi pada periode ini.</p>
              ) : (
                <ul className="divide-y divide-sand-100">
                  {recent.map((t) => (
                    <li key={t.id} className="flex items-center gap-4 py-2.5 text-sm">
                      <span className="w-16 shrink-0 text-xs text-sand-400">{fmtDate(t.occurredAt)}</span>
                      <span className="min-w-0 flex-1 truncate font-medium text-sand-800" title={t.description ?? ''}>
                        {t.description ?? '—'}
                        <span className="ml-1.5 text-xs font-normal text-sand-400">{SRC_LABEL[t.source] ?? t.source}</span>
                      </span>
                      <span className="text-xs text-sand-500">{t.category?.name ?? ''}</span>
                      <span className={`shrink-0 font-bold tabular-nums ${t.type === 'INCOME' ? 'text-primary-700' : 'text-red-600'}`}>
                        {t.type === 'INCOME' ? '+' : '−'}{rupiah(t.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Widget>
          </div>
        </>
      )}
    </Shell>
  );
}
