'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Field, Input, Modal, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { DataTable } from '@/components/data-table';
import { PageTitle, Widget } from '@/components/widgets';
import {
  createFinanceTransaction,
  deleteFinanceTransaction,
  listAcademicYears,
  listFinanceCategories,
  listFinanceTransactions,
  updateFinanceTransaction,
  listCashAccounts,
  type AcademicYear,
  type CashAccountView,
  type FinanceCategory,
  type FinanceTransaction,
} from '@/lib/api';
import { me } from '@/lib/api';
import { PERMISSIONS } from '@smpmuh3/types';

import { RowBtn } from '@/components/row-btn';
import { useConfirm } from '@/components/confirm-dialog';
const rupiah = (n: number) => `Rp${n.toLocaleString('id-ID')}`;
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
const today = () => new Date().toISOString().slice(0, 10);

const SRC_LABEL: Record<string, string> = {
  manual: 'Manual', spmb: 'SPMB', billing: 'Tagihan', expense: 'Pengeluaran',
  payroll: 'Payroll', savings: 'Tabungan', loan: 'Pinjaman', bank: 'Bank',
};

export default function HarianPage() {
  const { confirm, dialog } = useConfirm();
  const [canManage, setCanManage] = useState(false);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [accounts, setAccounts] = useState<CashAccountView[]>([]);
  const [rows, setRows] = useState<FinanceTransaction[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Filter
  const [yearId, setYearId] = useState('');
  const [type, setType] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [search, setSearch] = useState('');

  // Quick entry (modal)
  const [qModal, setQModal] = useState(false);
  const [qType, setQType] = useState<'EXPENSE' | 'INCOME'>('EXPENSE');

  // Modal
  const [txModal, setTxModal] = useState<FinanceTransaction | null>(null);
  const [txDetail, setTxDetail] = useState<FinanceTransaction | null>(null);

  const loadTx = useCallback(() => {
    setLoading(true);
    listFinanceTransactions({
      ...(type ? { type } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(accountId ? { cashAccountId: accountId } : {}),
      ...(yearId ? { academicYearId: yearId } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(search ? { search } : {}),
      take: '300',
    })
      .then((r) => {
        setRows(r.items);
        setTotal(r.total);
      })
      .catch(() => setError('Gagal memuat transaksi.'))
      .finally(() => setLoading(false));
  }, [type, categoryId, accountId, yearId, from, to, search]);

  useEffect(() => {
    me().then((u) => setCanManage(u.permissions.includes(PERMISSIONS.FINANCE_MANAGE))).catch(() => undefined);
    listAcademicYears()
      .then((ys) => {
        setYears(ys);
        const active = ys.find((y) => y.isActive);
        if (active) setYearId(active.id);
      })
      .catch(() => undefined);
    listFinanceCategories().then(setCategories).catch(() => undefined);
    listCashAccounts().then(setAccounts).catch(() => undefined);
  }, []);

  const firstRun = useRef(true);
  useEffect(() => {
    const t = setTimeout(loadTx, firstRun.current ? 0 : search ? 350 : 120);
    firstRun.current = false;
    return () => clearTimeout(t);
  }, [loadTx, search]);

  async function run(fn: () => Promise<unknown>, msg: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setNotice(msg);
      loadTx();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Aksi gagal.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  function onQuickAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void run(
      () =>
        createFinanceTransaction({
          type: f.get('type') as 'INCOME' | 'EXPENSE',
          categoryId: String(f.get('categoryId')),
          amount: Number(f.get('amount')),
          ...(f.get('occurredAt') ? { occurredAt: String(f.get('occurredAt')) } : {}),
          ...(f.get('description') ? { description: String(f.get('description')) } : {}),
          ...(f.get('cashAccountId') ? { cashAccountId: String(f.get('cashAccountId')) } : {}),
          ...(yearId ? { academicYearId: yearId } : {}),
        }),
      'Tercatat.',
    ).then((ok) => {
      if (ok) setQModal(false);
    });
  }

  function onSaveTx(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!txModal) return;
    const f = new FormData(e.currentTarget);
    void run(
      () =>
        updateFinanceTransaction(txModal.id, {
          categoryId: String(f.get('categoryId')),
          amount: Number(f.get('amount')),
          ...(f.get('occurredAt') ? { occurredAt: String(f.get('occurredAt')) } : {}),
          ...(f.get('description') ? { description: String(f.get('description')) } : {}),
          ...(f.get('cashAccountId') ? { cashAccountId: String(f.get('cashAccountId')) } : { cashAccountId: null }),
        }),
      'Transaksi diperbarui.',
    ).then((ok) => {
      if (ok) setTxModal(null);
    });
  }

  const incomeCats = categories.filter((c) => c.type === 'INCOME' && c.isActive !== false);
  const expenseCats = categories.filter((c) => c.type === 'EXPENSE' && c.isActive !== false);
  const quickCats = qType === 'EXPENSE' ? expenseCats : incomeCats;
  const inToday = rows.filter((t) => t.type === 'INCOME').reduce((s, t) => s + t.amount, 0);
  const outToday = rows.filter((t) => t.type === 'EXPENSE').reduce((s, t) => s + t.amount, 0);

  return (
    <Shell>
      <PageTitle
        title="Keuangan Harian"
        subtitle="Catat pemasukan & pengeluaran harian — pemberian tamu, ATK, dsb."
        actions={
          canManage ? (
            <Button size="sm" onClick={async () => setQModal(true)}>+ Catat Transaksi</Button>
          ) : undefined
        }
      />
      {error ? (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
      ) : null}
      {notice ? (
        <p role="status" className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{notice}</p>
      ) : null}

      {/* Modal catat transaksi */}
      <Modal open={qModal} onClose={() => setQModal(false)} title="Catat Transaksi">
        <form onSubmit={onQuickAdd} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Jenis">
              <Select name="type" value={qType} onChange={(e) => setQType(e.target.value as 'EXPENSE' | 'INCOME')}>
                <option value="EXPENSE">Pengeluaran</option>
                <option value="INCOME">Pemasukan</option>
              </Select>
            </Field>
            <Field label="Kategori">
              <Select key={qType} name="categoryId" required defaultValue="">
                <option value="" disabled>Pilih…</option>
                {quickCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Jumlah (Rp)">
              <Input name="amount" type="number" min={1} required placeholder="0" />
            </Field>
            <Field label="Tanggal">
              <Input name="occurredAt" type="date" defaultValue={today()} />
            </Field>
          </div>
          <Field label="Uraian">
            <Input name="description" placeholder="mis. Pemberian tamu, beli ATK…" />
          </Field>
          <Field label="Kas" hint="Kosong = akun default">
            <Select name="cashAccountId" defaultValue="">
              <option value="">Default</option>
              {accounts.filter((a) => a.isActive).map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={async () => setQModal(false)}>Batal</Button>
            <Button type="submit" disabled={busy}>Simpan</Button>
          </div>
        </form>
      </Modal>

      {/* Filter */}
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
        <label className="flex min-w-28 flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-sand-500">Jenis</span>
          <Select value={type} onChange={(e) => setType(e.target.value)} aria-label="Filter jenis">
            <option value="">Semua</option>
            <option value="INCOME">Pemasukan</option>
            <option value="EXPENSE">Pengeluaran</option>
          </Select>
        </label>
        <label className="flex min-w-36 flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-sand-500">Kategori</span>
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Filter kategori">
            <option value="">Semua</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </label>
        <label className="flex min-w-32 flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-sand-500">Kas</span>
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)} aria-label="Filter kas">
            <option value="">Semua</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
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

      <Widget
        title={`Transaksi (${total})`}
        action={
          <span className="flex gap-4 text-xs font-semibold">
            <span className="text-primary-700">Masuk {rupiah(inToday)}</span>
            <span className="text-red-600">Keluar {rupiah(outToday)}</span>
          </span>
        }
>
        <DataTable
          head={['Tanggal', 'Deskripsi', 'Kategori', 'Jumlah', '']}
          loading={loading}
          error={null}
          empty={rows.length === 0 ? 'Belum ada transaksi pada rentang ini.' : undefined}
>
          {rows.map((t) => (
            <tr key={t.id} className="cursor-pointer" onClick={async () => setTxDetail(t)}>
              <td className="whitespace-nowrap px-5 py-3 text-xs text-sand-500">{fmtDate(t.occurredAt)}</td>
              <td className="max-w-72 px-5 py-3">
                <p className="truncate font-medium text-sand-900" title={t.description ?? ''}>
                  {t.description ?? '—'}
                </p>
                <p className="text-[10px] text-sand-400">
                  {SRC_LABEL[t.source] ?? t.source}
                  {t.cashAccount?.name ? ` · ${t.cashAccount.name}` : ''}
                  {t.recordedBy?.name ? ` · ${t.recordedBy.name}` : ''}
                </p>
              </td>
              <td className="px-5 py-3 text-sand-600">{t.category?.name ?? '—'}</td>
              <td className={`whitespace-nowrap px-5 py-3 text-right font-bold ${t.type === 'INCOME' ? 'text-primary-700' : 'text-red-600'}`}>
                {t.type === 'INCOME' ? '+' : '−'}{rupiah(t.amount)}
              </td>
              <td className="px-5 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                <span className="flex justify-end gap-2">
                  {canManage && t.source === 'manual' ? (
                    <>
                      <RowBtn type="button" onClick={async () => setTxModal(t)}>
                        Ubah
                      </RowBtn>
                      <RowBtn tone="danger" type="button" onClick={async () => { if (await confirm('Hapus transaksi ini?')) void run(() => deleteFinanceTransaction(t.id), 'Transaksi dihapus.'); }}>
                        Hapus
                      </RowBtn>
                    </>
                  ) : null}
                </span>
              </td>
            </tr>
          ))}
        </DataTable>
      </Widget>

      {/* Modal ubah transaksi */}
      <Modal open={txModal !== null} onClose={() => setTxModal(null)} title="Ubah Transaksi">
        {txModal ? (
          <form onSubmit={onSaveTx} className="grid gap-4">
            <Field label="Kategori">
              <Select name="categoryId" required defaultValue={txModal.categoryId ?? ''}>
                <optgroup label="Pemasukan">
                  {incomeCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </optgroup>
                <optgroup label="Pengeluaran">
                  {expenseCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </optgroup>
              </Select>
            </Field>
            <Field label="Jumlah (Rp)">
              <Input name="amount" type="number" min={1} required defaultValue={txModal.amount} placeholder="0" />
            </Field>
            <Field label="Kas / Bank" hint="Kosong = akun default">
              <Select name="cashAccountId" defaultValue={txModal.cashAccountId ?? ''} aria-label="Akun kas">
                <option value="">Otomatis (default)</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}{a.type === 'BANK' ? ' (bank)' : ''}</option>
                ))}
              </Select>
            </Field>
            <Field label="Tanggal">
              <Input name="occurredAt" type="date" defaultValue={txModal.occurredAt.slice(0, 10)} />
            </Field>
            <Field label="Deskripsi">
              <Input name="description" defaultValue={txModal.description ?? ''} placeholder="Keterangan transaksi" />
            </Field>
            <Button type="submit" disabled={busy}>Simpan</Button>
          </form>
        ) : null}
      </Modal>

      {/* Modal detail transaksi */}
      <Modal open={txDetail !== null} onClose={() => setTxDetail(null)} title="Detail Transaksi">
        {txDetail ? (
          <div className="space-y-3 text-sm">
            <div className="grid gap-2 rounded-2xl bg-sand-50 p-4 sm:grid-cols-2">
              <div>
                <p className="text-xs text-sand-500">Deskripsi</p>
                <p className="font-semibold">{txDetail.description ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-sand-500">Jumlah</p>
                <p className={`font-extrabold ${txDetail.type === 'INCOME' ? 'text-primary-700' : 'text-red-600'}`}>
                  {txDetail.type === 'INCOME' ? '+' : '−'}{rupiah(txDetail.amount)}
                </p>
              </div>
              <div>
                <p className="text-xs text-sand-500">Kategori</p>
                <p className="font-semibold">{txDetail.category?.name ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-sand-500">Kas / Bank</p>
                <p className="font-semibold">{txDetail.cashAccount?.name ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-sand-500">Sumber</p>
                <p className="font-semibold">
                  {SRC_LABEL[txDetail.source] ?? txDetail.source}
                  {txDetail.source !== 'manual' ? (
                    <span className="ml-1 text-xs font-normal text-sand-400">(otomatis)</span>
                  ) : null}
                </p>
              </div>
              <div>
                <p className="text-xs text-sand-500">Tanggal</p>
                <p className="font-semibold">{fmtDate(txDetail.occurredAt)}</p>
              </div>
              <div>
                <p className="text-xs text-sand-500">Dicatat oleh</p>
                <p className="font-semibold">{txDetail.recordedBy?.name ?? '—'}</p>
              </div>
            </div>
            {txDetail.source !== 'manual' ? (
              <p className="rounded-xl bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
                Transaksi ini dibuat otomatis oleh sistem — ubah/batalkan dari dokumen sumbernya.
              </p>
            ) : null}
          </div>
        ) : null}
      </Modal>
          {dialog}
      </Shell>
  );
}
