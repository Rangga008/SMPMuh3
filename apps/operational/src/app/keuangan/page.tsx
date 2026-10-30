'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, Button, Field, Input, Modal, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { DataTable } from '@/components/data-table';
import { PageTitle, StatCard, Widget } from '@/components/widgets';
import {
  createFinanceCategory,
  createFinanceTransaction,
  deleteFinanceTransaction,
  getFinanceSummary,
  listAcademicYears,
  listFinanceBudgets,
  listFinanceCategories,
  listFinanceTransactions,
  updateFinanceTransaction,
  upsertFinanceBudget,
  type AcademicYear,
  type FinanceBudget,
  type FinanceCategory,
  type FinanceSummary,
  type FinanceTransaction,
} from '@/lib/api';
import { me } from '@/lib/api';
import { PERMISSIONS } from '@smpmuh3/types';

const rupiah = (n: number) => `Rp${n.toLocaleString('id-ID')}`;
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

export default function KeuanganPage() {
  const [canManage, setCanManage] = useState(false);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [budgets, setBudgets] = useState<FinanceBudget[]>([]);
  const [rows, setRows] = useState<FinanceTransaction[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Filter realtime
  const [yearId, setYearId] = useState('');
  const [type, setType] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');

  // Modal state
  const [txModal, setTxModal] = useState<FinanceTransaction | 'new' | null>(null);
  const [catModal, setCatModal] = useState(false);
  const [budgetModal, setBudgetModal] = useState(false);

  const loadSummary = useCallback(() => {
    getFinanceSummary({
      ...(yearId ? { academicYearId: yearId } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    })
      .then(setSummary)
      .catch(() => undefined);
  }, [yearId, from, to]);

  const loadTx = useCallback(() => {
    setLoading(true);
    listFinanceTransactions({
      ...(type ? { type } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(yearId ? { academicYearId: yearId } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(search ? { search } : {}),
    })
      .then((r) => {
        setRows(r.items);
        setTotal(r.total);
      })
      .catch(() => setError('Gagal memuat transaksi.'))
      .finally(() => setLoading(false));
  }, [type, categoryId, yearId, from, to, search]);

  const loadBudgets = useCallback(() => {
    if (!yearId) {
      setBudgets([]);
      return;
    }
    listFinanceBudgets(yearId).then(setBudgets).catch(() => undefined);
  }, [yearId]);

  // Inisialisasi: sesi, tahun ajaran, kategori.
  useEffect(() => {
    me()
      .then((u) =>
        setCanManage(u.permissions.includes(PERMISSIONS.FINANCE_MANAGE)),
      )
      .catch(() => undefined);
    listAcademicYears()
      .then((ys) => {
        setYears(ys);
        const active = ys.find((y) => y.isActive);
        if (active) setYearId(active.id);
      })
      .catch(() => undefined);
    listFinanceCategories().then(setCategories).catch(() => undefined);
  }, []);

  // Filter realtime — pencarian di-debounce.
  const firstRun = useRef(true);
  useEffect(() => {
    const t = setTimeout(
      () => {
        setError(null);
        loadTx();
        loadSummary();
      },
      firstRun.current ? 0 : search ? 350 : 120,
    );
    firstRun.current = false;
    return () => clearTimeout(t);
  }, [loadTx, loadSummary, search]);

  useEffect(() => {
    loadBudgets();
  }, [loadBudgets]);

  function refreshAll() {
    loadTx();
    loadSummary();
    loadBudgets();
  }

  async function run(fn: () => Promise<unknown>, msg: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setNotice(msg);
      refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Aksi gagal.');
    } finally {
      setBusy(false);
    }
  }

  function onSaveTx(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const dto = {
      type: f.get('type') as 'INCOME' | 'EXPENSE',
      categoryId: String(f.get('categoryId')),
      amount: Number(f.get('amount')),
      ...(f.get('occurredAt') ? { occurredAt: String(f.get('occurredAt')) } : {}),
      ...(f.get('description')
        ? { description: String(f.get('description')) }
        : {}),
      ...(yearId ? { academicYearId: yearId } : {}),
    };
    void run(async () => {
      if (txModal && txModal !== 'new') {
        const { type: _t, ...patch } = dto;
        await updateFinanceTransaction(txModal.id, patch);
      } else {
        await createFinanceTransaction(dto);
      }
      setTxModal(null);
    }, 'Transaksi tersimpan.');
  }

  function onSaveCategory(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void run(async () => {
      await createFinanceCategory({
        name: String(f.get('name')),
        type: f.get('type') as 'INCOME' | 'EXPENSE',
      });
      setCatModal(false);
      setCategories(await listFinanceCategories());
    }, 'Kategori ditambahkan.');
  }

  function onSaveBudget(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void run(async () => {
      await upsertFinanceBudget({
        academicYearId: yearId,
        categoryId: String(f.get('categoryId')),
        amount: Number(f.get('amount')),
        ...(f.get('note') ? { note: String(f.get('note')) } : {}),
      });
      setBudgetModal(false);
    }, 'Anggaran disimpan.');
  }

  const incomeCats = categories.filter((c) => c.type === 'INCOME');
  const expenseCats = categories.filter((c) => c.type === 'EXPENSE');
  const txEditing = txModal !== null && txModal !== 'new' ? txModal : null;

  return (
    <Shell>
      <PageTitle
        title="Keuangan"
        subtitle="Pemasukan, pengeluaran, dan anggaran — pembayaran SPMB tercatat otomatis"
        actions={
          canManage ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setCatModal(true)}>
                + Kategori
              </Button>
              <Button size="sm" onClick={() => setTxModal('new')}>
                + Catat Transaksi
              </Button>
            </>
          ) : undefined
        }
      />
      {error ? (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
      ) : null}
      {notice ? (
        <p role="status" className="mb-4 rounded-xl bg-primary-50 px-4 py-3 text-sm font-medium text-primary-800">{notice}</p>
      ) : null}

      <div className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl border border-sand-200 bg-white p-4 shadow-card">
        <label className="flex min-w-36 flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-sand-500">Periode</span>
          <Select value={yearId} onChange={(e) => setYearId(e.target.value)} aria-label="Filter periode">
            <option value="">Semua</option>
            {years.map((y) => (
              <option key={y.id} value={y.id}>{y.name}{y.isActive ? ' (aktif)' : ''}</option>
            ))}
          </Select>
        </label>
        <label className="flex min-w-32 flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-sand-500">Jenis</span>
          <Select value={type} onChange={(e) => setType(e.target.value)} aria-label="Filter jenis">
            <option value="">Semua</option>
            <option value="INCOME">Pemasukan</option>
            <option value="EXPENSE">Pengeluaran</option>
          </Select>
        </label>
        <label className="flex min-w-40 flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-sand-500">Kategori</span>
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Filter kategori">
            <option value="">Semua kategori</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-sand-500">Dari</span>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Dari tanggal" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-sand-500">Sampai</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Sampai tanggal" />
        </label>
        <label className="flex min-w-40 flex-1 flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-sand-500">Pencarian</span>
          <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Deskripsi / no. invoice…" aria-label="Cari transaksi" />
        </label>
      </div>

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatCard label="Pemasukan" value={rupiah(summary?.income ?? 0)} />
        <StatCard label="Pengeluaran" value={rupiah(summary?.expense ?? 0)} accent="accent" />
        <StatCard label="Saldo" value={rupiah(summary?.balance ?? 0)} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Widget title={`Transaksi (${total})`}>
            <DataTable
              head={['Tanggal', 'Deskripsi', 'Kategori', 'Sumber', 'Jumlah', ...(canManage ? [''] : [])]}
              loading={loading}
              error={null}
              empty={rows.length === 0 ? 'Belum ada transaksi.' : undefined}
            >
              {rows.map((t) => (
                <tr key={t.id}>
                  <td className="whitespace-nowrap px-5 py-3 text-xs text-sand-500">{fmtDate(t.occurredAt)}</td>
                  <td className="max-w-72 px-5 py-3">
                    <p className="truncate font-medium text-sand-900" title={t.description ?? ''}>
                      {t.description ?? '—'}
                    </p>
                    {t.recordedBy?.name ? (
                      <p className="text-[10px] text-sand-400">oleh {t.recordedBy.name}</p>
                    ) : null}
                  </td>
                  <td className="px-5 py-3 text-sand-600">{t.category?.name ?? '—'}</td>
                  <td className="px-5 py-3">
                    {t.source === 'spmb' ? (
                      <Badge tone="primary">SPMB</Badge>
                    ) : (
                      <Badge tone="neutral">Manual</Badge>
                    )}
                  </td>
                  <td className={`whitespace-nowrap px-5 py-3 text-right font-bold ${t.type === 'INCOME' ? 'text-primary-700' : 'text-red-600'}`}>
                    {t.type === 'INCOME' ? '+' : '−'}{rupiah(t.amount)}
                  </td>
                  {canManage ? (
                    <td className="px-5 py-3 text-right">
                      {t.source === 'manual' ? (
                        <span className="flex justify-end gap-2">
                          <button type="button" onClick={() => setTxModal(t)} className="text-xs font-semibold text-primary-700 hover:underline">
                            Ubah
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm('Hapus transaksi ini?'))
                                void run(() => deleteFinanceTransaction(t.id), 'Transaksi dihapus.');
                            }}
                            className="text-xs font-semibold text-red-600 hover:underline"
                          >
                            Hapus
                          </button>
                        </span>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              ))}
            </DataTable>
          </Widget>
        </div>

        <div className="space-y-5">
          <Widget title="Per Kategori">
            {summary && summary.byCategory.length > 0 ? (
              <ul className="space-y-2.5">
                {summary.byCategory.map((c) => (
                  <li key={`${c.categoryId}-${c.type}`} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-sand-700">{c.name}</span>
                    <span className={`font-bold ${c.type === 'INCOME' ? 'text-primary-700' : 'text-red-600'}`}>
                      {rupiah(c.total)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-sand-500">Belum ada data pada periode ini.</p>
            )}
          </Widget>

          <Widget
            title="Anggaran vs Realisasi"
            action={
              canManage && yearId ? (
                <Button variant="outline" size="sm" onClick={() => setBudgetModal(true)}>
                  Atur
                </Button>
              ) : undefined
            }
          >
            {!yearId ? (
              <p className="text-sm text-sand-500">Pilih periode untuk melihat anggaran.</p>
            ) : budgets.length === 0 ? (
              <p className="text-sm text-sand-500">Belum ada anggaran pada periode ini.</p>
            ) : (
              <ul className="space-y-3">
                {budgets.map((b) => {
                  const pct = b.amount > 0 ? Math.min(100, Math.round((b.realized / b.amount) * 100)) : 0;
                  return (
                    <li key={b.id}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-sand-800">{b.category?.name}</span>
                        <span className="text-xs text-sand-500">
                          {rupiah(b.realized)} / {rupiah(b.amount)}
                        </span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-sand-100">
                        <div
                          className={`h-full rounded-full ${pct >= 100 ? 'bg-red-500' : 'bg-primary-500'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="mt-0.5 text-[10px] text-sand-400">
                        {pct}% terealisasi{b.note ? ` · ${b.note}` : ''}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </Widget>
        </div>
      </div>

      {/* Modal tambah/ubah transaksi */}
      <Modal
        open={txModal !== null}
        onClose={() => setTxModal(null)}
        title={txEditing ? 'Ubah Transaksi' : 'Catat Transaksi'}
      >
        <form onSubmit={onSaveTx} className="grid gap-4">
          <Field label="Jenis">
            <Select name="type" required defaultValue={txEditing?.type ?? 'EXPENSE'} disabled={!!txEditing}>
              <option value="EXPENSE">Pengeluaran</option>
              <option value="INCOME">Pemasukan</option>
            </Select>
          </Field>
          <Field label="Kategori">
            <Select name="categoryId" required defaultValue={txEditing?.categoryId ?? ''}>
              <option value="" disabled>Pilih kategori…</option>
              <optgroup label="Pemasukan">
                {incomeCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </optgroup>
              <optgroup label="Pengeluaran">
                {expenseCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </optgroup>
            </Select>
          </Field>
          <Field label="Jumlah (Rp)">
            <Input name="amount" type="number" min={1} required defaultValue={txEditing?.amount ?? ''} placeholder="0" />
          </Field>
          <Field label="Tanggal">
            <Input name="occurredAt" type="date" defaultValue={txEditing?.occurredAt?.slice(0, 10) ?? new Date().toISOString().slice(0, 10)} />
          </Field>
          <Field label="Deskripsi">
            <Input name="description" defaultValue={txEditing?.description ?? ''} placeholder="Keterangan transaksi" />
          </Field>
          <Button type="submit" disabled={busy}>Simpan</Button>
        </form>
      </Modal>

      {/* Modal kategori */}
      <Modal open={catModal} onClose={() => setCatModal(false)} title="Kategori Baru">
        <form onSubmit={onSaveCategory} className="grid gap-4">
          <Field label="Nama Kategori">
            <Input name="name" required placeholder="mis. Iuran Kegiatan" />
          </Field>
          <Field label="Jenis">
            <Select name="type" required>
              <option value="EXPENSE">Pengeluaran</option>
              <option value="INCOME">Pemasukan</option>
            </Select>
          </Field>
          <Button type="submit" disabled={busy}>Simpan</Button>
        </form>
      </Modal>

      {/* Modal anggaran */}
      <Modal open={budgetModal} onClose={() => setBudgetModal(false)} title="Atur Anggaran">
        <form onSubmit={onSaveBudget} className="grid gap-4">
          <Field label="Kategori">
            <Select name="categoryId" required>
              <option value="" disabled>Pilih kategori…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.type === 'INCOME' ? 'masuk' : 'keluar'})</option>
              ))}
            </Select>
          </Field>
          <Field label="Anggaran (Rp)">
            <Input name="amount" type="number" min={0} required placeholder="0" />
          </Field>
          <Field label="Catatan">
            <Input name="note" placeholder="opsional" />
          </Field>
          <Button type="submit" disabled={busy}>Simpan</Button>
        </form>
      </Modal>
    </Shell>
  );
}
