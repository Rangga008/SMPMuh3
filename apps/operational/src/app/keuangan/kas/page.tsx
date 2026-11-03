'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge, Button, Field, Input, Modal, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { DataTable } from '@/components/data-table';
import { PageTitle, Widget } from '@/components/widgets';
import {
  createBankIncome,
  createCashAccount,
  listBankIncome,
  listCashAccounts,
  listFinanceCategories,
  updateCashAccount,
  type BankIncomeView,
  type CashAccountView,
  type FinanceCategory,
} from '@/lib/api';

const rupiah = (n: number) => `Rp${n.toLocaleString('id-ID')}`;
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

export default function KasPage() {
  const [accounts, setAccounts] = useState<CashAccountView[]>([]);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [bankRows, setBankRows] = useState<BankIncomeView[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [bankAcc, setBankAcc] = useState('');
  const [bankCat, setBankCat] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [accModal, setAccModal] = useState<CashAccountView | 'new' | null>(null);
  const [bankModal, setBankModal] = useState(false);

  const load = useCallback(async () => {
    const [accs, cats, banks] = await Promise.all([
      listCashAccounts(),
      listFinanceCategories(),
      listBankIncome({
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
        ...(bankAcc ? { cashAccountId: bankAcc } : {}),
      }),
    ]);
    setAccounts(accs);
    setCategories(cats);
    setBankRows(banks);
  }, [from, to, bankAcc]);

  useEffect(() => {
    load()
      .catch(() => setError('Gagal memuat data kas.'))
      .finally(() => setLoading(false));
  }, [load]);

  async function run(fn: () => Promise<unknown>, ok: string, form?: HTMLFormElement) {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await fn();
      form?.reset();
      setNotice(ok);
      await load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Aksi gagal.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  const banks = accounts.filter((a) => a.type === 'BANK' && a.isActive);
  const incomeCats = categories.filter((c) => c.type === 'INCOME');
  const bankFiltered = bankRows.filter((b) => !bankCat || b.category?.id === bankCat);
  const editingAcc = accModal !== null && accModal !== 'new' ? accModal : null;

  return (
    <Shell>
      <PageTitle
        title="Kas & Bank"
        subtitle="Daftar akun kas — buka detail untuk buku kas per akun"
        actions={
          <span className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setBankModal(true)} disabled={banks.length === 0}>
              + Catat Transfer
            </Button>
            <Button size="sm" onClick={() => setAccModal('new')}>+ Tambah Akun</Button>
          </span>
        }
      />
      {error ? (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
      ) : null}
      {notice ? (
        <p role="status" className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{notice}</p>
      ) : null}

      <Widget title={`Akun Kas (${accounts.length})`} className="mb-5">
        <DataTable
          head={['Akun', 'Tipe', 'Saldo Awal', 'Saldo', 'Status', '']}
          loading={loading}
          error={null}
          empty={accounts.length === 0 ? 'Belum ada akun kas.' : undefined}
        >
          {accounts.map((a) => (
            <tr key={a.id}>
              <td className="px-5 py-3">
                <Link href={`/keuangan/kas/${a.id}`} className="font-semibold text-primary-700 hover:underline">
                  {a.name}
                </Link>
              </td>
              <td className="px-5 py-3">
                <Badge tone={a.type === 'BANK' ? 'primary' : 'neutral'}>{a.type === 'BANK' ? 'Bank' : 'Tunai'}</Badge>
              </td>
              <td className="whitespace-nowrap px-5 py-3 text-right text-sand-600">{rupiah(a.openingBalance)}</td>
              <td className="whitespace-nowrap px-5 py-3 text-right font-bold text-sand-900">
                {rupiah(a.balance ?? a.openingBalance)}
              </td>
              <td className="px-5 py-3">
                {a.isActive ? (
                  <Badge tone="primary">Aktif</Badge>
                ) : (
                  <Badge tone="danger">Nonaktif</Badge>
                )}
              </td>
              <td className="whitespace-nowrap px-5 py-3 text-right">
                <span className="flex justify-end gap-2">
                  <Link href={`/keuangan/kas/${a.id}`} className="text-xs font-semibold text-primary-700 hover:underline">
                    Buku Kas
                  </Link>
                  <button
                    type="button"
                    onClick={() => setAccModal(a)}
                    className="text-xs font-semibold text-sand-600 hover:underline"
                  >
                    Edit
                  </button>
                </span>
              </td>
            </tr>
          ))}
        </DataTable>
      </Widget>

      <Widget title={`Buku Bank — Transfer Masuk (${bankFiltered.length})`}>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <label className="flex min-w-36 flex-col gap-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-sand-500">Kas/Bank</span>
            <Select value={bankAcc} onChange={(e) => setBankAcc(e.target.value)} aria-label="Filter akun">
              <option value="">Semua</option>
              {banks.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </label>
          <label className="flex min-w-40 flex-col gap-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-sand-500">Kategori</span>
            <Select value={bankCat} onChange={(e) => setBankCat(e.target.value)} aria-label="Filter kategori">
              <option value="">Semua</option>
              {incomeCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-sand-500">Dari</span>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-36" aria-label="Dari tanggal" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-sand-500">Sampai</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-36" aria-label="Sampai tanggal" />
          </label>
        </div>
        <DataTable
          head={['Tanggal', 'Pengirim', 'Ke Bank', 'Kategori', 'Untuk', 'Jumlah']}
          loading={loading}
          error={null}
          empty={bankFiltered.length === 0 ? 'Belum ada transfer masuk.' : undefined}
        >
          {bankFiltered.map((b) => (
            <tr key={b.id}>
              <td className="whitespace-nowrap px-5 py-3 text-xs text-sand-500">{fmtDate(b.receivedAt)}</td>
              <td className="px-5 py-3 font-medium text-sand-900">{b.senderName}</td>
              <td className="px-5 py-3 text-xs text-sand-500">{b.account?.name ?? '—'}</td>
              <td className="px-5 py-3 text-xs text-sand-500">{b.category?.name ?? '—'}</td>
              <td className="max-w-56 truncate px-5 py-3 text-xs text-sand-500" title={b.purpose ?? ''}>{b.purpose ?? '—'}</td>
              <td className="whitespace-nowrap px-5 py-3 text-right font-bold tabular-nums text-emerald-700">{rupiah(b.amount)}</td>
            </tr>
          ))}
          {bankFiltered.length > 0 ? (
            <tr className="border-t-2 border-sand-300 bg-sand-50 font-bold">
              <td className="px-5 py-3 text-xs uppercase text-sand-500" colSpan={5}>Total</td>
              <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums text-emerald-700">
                {rupiah(bankFiltered.reduce((s, b) => s + b.amount, 0))}
              </td>
            </tr>
          ) : null}
        </DataTable>
      </Widget>

      {/* Modal catat transfer masuk */}
      <Modal open={bankModal} onClose={() => setBankModal(false)} title="Catat Transfer Masuk">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void run(
              () =>
                createBankIncome({
                  cashAccountId: String(f.get('cashAccountId')),
                  categoryId: String(f.get('categoryId')),
                  senderName: String(f.get('senderName')),
                  purpose: String(f.get('purpose')) || undefined,
                  amount: Number(f.get('amount')),
                  receivedAt: String(f.get('receivedAt')) || undefined,
                }),
              'Transfer masuk dicatat.',
            ).then((ok) => {
              if (ok) setBankModal(false);
            });
          }}
          className="grid gap-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Ke Bank">
              <Select name="cashAccountId" required>
                {banks.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Kategori">
              <Select name="categoryId" required>
                {incomeCats.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Dari (pengirim)">
              <Input name="senderName" required placeholder="Nama pengirim transfer" />
            </Field>
            <Field label="Untuk">
              <Input name="purpose" placeholder="mis. SPP Nov a.n. Ahmad" />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Jumlah">
              <Input name="amount" type="number" min={1} required placeholder="250000" />
            </Field>
            <Field label="Tanggal">
              <Input name="receivedAt" type="date" />
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setBankModal(false)}>Batal</Button>
            <Button type="submit" disabled={busy}>Catat</Button>
          </div>
        </form>
      </Modal>

      {/* Modal akun */}
      <Modal
        open={accModal !== null}
        onClose={() => setAccModal(null)}
        title={editingAcc ? `Edit Akun ${editingAcc.name}` : 'Tambah Akun Kas'}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void run(
              () =>
                editingAcc
                  ? updateCashAccount(editingAcc.id, {
                      name: String(f.get('name')),
                      type: String(f.get('type')),
                      openingBalance: Number(f.get('openingBalance')) || 0,
                      isActive: f.get('isActive') === 'on',
                    })
                  : createCashAccount({
                      name: String(f.get('name')),
                      type: String(f.get('type')),
                      openingBalance: Number(f.get('openingBalance')) || 0,
                    }),
              editingAcc ? 'Akun diperbarui.' : 'Akun ditambahkan.',
            ).then((ok) => {
              if (ok) setAccModal(null);
            });
          }}
          className="grid gap-3"
        >
          <Field label="Nama Akun">
            <Input name="name" required defaultValue={editingAcc?.name ?? ''} placeholder="Kas Koperasi" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tipe">
              <Select name="type" defaultValue={editingAcc?.type ?? 'CASH'}>
                <option value="CASH">Tunai</option>
                <option value="BANK">Bank</option>
              </Select>
            </Field>
            <Field label="Saldo Awal">
              <Input name="openingBalance" type="number" min={0} defaultValue={editingAcc?.openingBalance ?? 0} />
            </Field>
          </div>
          {editingAcc ? (
            <label className="flex items-center gap-2 text-sm font-medium text-sand-700">
              <input name="isActive" type="checkbox" defaultChecked={editingAcc.isActive} className="size-4 accent-primary-700" />
              Aktif
            </label>
          ) : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setAccModal(null)}>Batal</Button>
            <Button type="submit" disabled={busy}>Simpan</Button>
          </div>
        </form>
      </Modal>
    </Shell>
  );
}
