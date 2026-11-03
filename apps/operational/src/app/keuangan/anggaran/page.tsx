'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge, Button, Field, Input, Modal, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { DataTable } from '@/components/data-table';
import { PageTitle, StatCard, Widget } from '@/components/widgets';
import {
  listAcademicYears,
  listFinanceBudgets,
  listFinanceCategories,
  upsertFinanceBudget,
  me,
  type AcademicYear,
  type FinanceBudget,
  type FinanceCategory,
} from '@/lib/api';
import { PERMISSIONS } from '@smpmuh3/types';

const rupiah = (n: number) => `Rp${n.toLocaleString('id-ID')}`;

export default function AnggaranPage() {
  const [canManage, setCanManage] = useState(false);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [yearId, setYearId] = useState('');
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [budgets, setBudgets] = useState<FinanceBudget[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [budgetModal, setBudgetModal] = useState<FinanceBudget | 'new' | null>(null);

  const loadBudgets = useCallback(() => {
    if (!yearId) {
      setBudgets([]);
      return;
    }
    listFinanceBudgets(yearId).then(setBudgets).catch(() => undefined);
  }, [yearId]);

  useEffect(() => {
    me().then((u) => setCanManage(u.permissions.includes(PERMISSIONS.FINANCE_MANAGE))).catch(() => undefined);
    listAcademicYears().then((ys) => {
      setYears(ys);
      const active = ys.find((y) => y.isActive);
      if (active) setYearId(active.id);
    }).catch(() => undefined);
    listFinanceCategories().then(setCategories).catch(() => undefined);
  }, []);
  useEffect(loadBudgets, [loadBudgets]);

  async function run(fn: () => Promise<unknown>, msg: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setNotice(msg);
      loadBudgets();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Aksi gagal.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  function onSaveBudget(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void run(
      () =>
        upsertFinanceBudget({
          academicYearId: yearId,
          categoryId: String(f.get('categoryId')),
          amount: Number(f.get('amount')),
          ...(f.get('note') ? { note: String(f.get('note')) } : {}),
        }),
      'Anggaran disimpan.',
    ).then((ok) => {
      if (ok) setBudgetModal(null);
    });
  }

  const totPlan = budgets.reduce((s, b) => s + b.amount, 0);
  const totReal = budgets.reduce((s, b) => s + b.realized, 0);
  const bEditing = budgetModal !== null && budgetModal !== 'new' ? budgetModal : null;

  return (
    <Shell>
      <PageTitle
        title="Anggaran (RAB)"
        subtitle="Rencana anggaran vs realisasi per kategori dan tahun ajaran"
        actions={
          <span className="flex gap-2">
            <Link href="/keuangan/kategori" className="inline-flex items-center rounded-lg border border-sand-300 px-3 py-1.5 text-sm font-semibold text-sand-700 hover:bg-sand-50">
              Kelola Kategori →
            </Link>
            {canManage ? (
              <Button size="sm" onClick={() => setBudgetModal('new')} disabled={!yearId}>+ Anggaran</Button>
            ) : null}
          </span>
        }
      />
      {error ? (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
      ) : null}
      {notice ? (
        <p role="status" className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{notice}</p>
      ) : null}

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatCard label="Total Rencana" value={rupiah(totPlan)} />
        <StatCard label="Total Realisasi" value={rupiah(totReal)} accent="accent" />
        <StatCard label="Terealisasi" value={`${totPlan > 0 ? Math.round((totReal / totPlan) * 100) : 0}%`} />
      </div>

      <Widget
        title="Anggaran vs Realisasi"
        action={
          <Select value={yearId} onChange={(e) => setYearId(e.target.value)} className="h-9 w-44 text-xs" aria-label="Tahun ajaran">
            {years.map((y) => (
              <option key={y.id} value={y.id}>{y.name}{y.isActive ? ' (aktif)' : ''}</option>
            ))}
          </Select>
        }
      >
        <DataTable
          head={['Kategori', 'Jenis', 'Rencana', 'Realisasi', 'Selisih', '%', '']}
          loading={false}
          error={null}
          empty={budgets.length === 0 ? 'Belum ada anggaran pada TA ini.' : undefined}
        >
          {budgets.map((b) => {
            const pct = b.amount > 0 ? Math.round((b.realized / b.amount) * 100) : b.realized > 0 ? 100 : 0;
            const diff = b.amount - b.realized;
            return (
              <tr key={b.id}>
                <td className="px-5 py-3 font-medium text-sand-900">
                  {b.category?.name}
                  {b.note ? <p className="text-xs font-normal text-sand-400">{b.note}</p> : null}
                </td>
                <td className="px-5 py-3">
                  <Badge tone={b.category?.type === 'INCOME' ? 'primary' : 'accent'}>
                    {b.category?.type === 'INCOME' ? 'Masuk' : 'Keluar'}
                  </Badge>
                </td>
                <td className="px-5 py-3 text-right tabular-nums">{rupiah(b.amount)}</td>
                <td className="px-5 py-3 text-right tabular-nums">{rupiah(b.realized)}</td>
                <td className={`px-5 py-3 text-right tabular-nums ${diff < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                  {diff < 0 ? '−' : ''}{rupiah(Math.abs(diff))}
                </td>
                <td className="w-40 px-5 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-sand-100">
                      <div
                        className={`h-full rounded-full ${pct >= 100 ? 'bg-red-500' : pct > 80 ? 'bg-amber-500' : 'bg-primary-500'}`}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                    <span className="w-10 text-right text-xs tabular-nums">{pct}%</span>
                  </div>
                </td>
                <td className="px-5 py-3 text-right">
                  {canManage ? (
                    <button type="button" className="text-xs font-semibold text-primary-700 hover:underline" onClick={() => setBudgetModal(b)}>
                      Ubah
                    </button>
                  ) : null}
                </td>
              </tr>
            );
          })}
          {budgets.length > 0 ? (
            <tr className="border-t-2 border-sand-300 bg-sand-50 font-bold">
              <td className="px-5 py-3 text-xs uppercase text-sand-500" colSpan={2}>Total</td>
              <td className="px-5 py-3 text-right tabular-nums">{rupiah(totPlan)}</td>
              <td className="px-5 py-3 text-right tabular-nums">{rupiah(totReal)}</td>
              <td className="px-5 py-3 text-right tabular-nums">{rupiah(totPlan - totReal)}</td>
              <td className="px-5 py-3" colSpan={2} />
            </tr>
          ) : null}
        </DataTable>
      </Widget>

      {/* Modal anggaran */}
      <Modal open={budgetModal !== null} onClose={() => setBudgetModal(null)} title={bEditing ? 'Ubah Anggaran' : 'Atur Anggaran'}>
        <form onSubmit={onSaveBudget} className="grid gap-4">
          <Field label="Kategori">
            <Select name="categoryId" required defaultValue={bEditing?.categoryId ?? ''}>
              <option value="" disabled>Pilih kategori…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.type === 'INCOME' ? 'masuk' : 'keluar'})</option>
              ))}
            </Select>
          </Field>
          <Field label="Anggaran (Rp)">
            <Input name="amount" type="number" min={0} required defaultValue={bEditing?.amount ?? ''} placeholder="0" />
          </Field>
          <Field label="Catatan">
            <Input name="note" defaultValue={bEditing?.note ?? ''} placeholder="opsional" />
          </Field>
          <Button type="submit" disabled={busy}>Simpan</Button>
        </form>
      </Modal>
    </Shell>
  );
}
