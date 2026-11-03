'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, Button, Field, Input, Modal, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { DataTable } from '@/components/data-table';
import { PageTitle, Widget } from '@/components/widgets';
import { PERMISSIONS } from '@smpmuh3/types';
import {
  createExpense,
  getExpense,
  getFundUsage,
  listAcademicYears,
  listCashAccounts,
  listExpenses,
  listFinanceCategories,
  me,
  updateExpense,
  updateFinanceCategory,
  createFinanceCategory,
  voidExpense,
  STANDARDS,
  type AcademicYear,
  type CashAccountView,
  type ExpenseView,
  type FinanceCategory,
  type FundUsageRow,
} from '@/lib/api';

const rupiah = (n: number) => `Rp${n.toLocaleString('id-ID')}`;
const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const STD_LABEL: Record<string, string> = {
  ISI: 'Std. Isi',
  PROSES: 'Std. Proses',
  KELULUSAN: 'Std. Kelulusan',
  TENAGA: 'Std. Tenaga',
  SARANA: 'Std. Sarana',
  PENGELOLAAN: 'Std. Pengelolaan',
  PEMBIAYAAN: 'Std. Pembiayaan',
  PENILAIAN: 'Std. Penilaian',
};
const STD_FULL: Record<string, string> = {
  ISI: 'Standar Isi',
  PROSES: 'Standar Proses',
  KELULUSAN: 'Standar Kompetensi Lulusan',
  TENAGA: 'Standar Pendidik & Tenaga',
  SARANA: 'Standar Sarana Prasarana',
  PENGELOLAAN: 'Standar Pengelolaan',
  PEMBIAYAAN: 'Standar Pembiayaan',
  PENILAIAN: 'Standar Penilaian',
};

type AllocRow = { cashAccountId: string; amount: string };

function AllocRows({
  accounts,
  defaultRows,
  onChange,
}: {
  accounts: CashAccountView[];
  defaultRows?: AllocRow[] | undefined;
  onChange?: (rows: AllocRow[]) => void;
}) {
  const [rows, setRows] = useState<AllocRow[]>(
    defaultRows?.length
      ? defaultRows
      : [{ cashAccountId: accounts[0]?.id ?? '', amount: '' }],
  );

  const emit = (next: AllocRow[]) => {
    setRows(next);
    onChange?.(next);
  };

  const total = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  return (
    <div className="grid gap-2">
      {rows.map((r, i) => (
        <div key={i} className="flex items-end gap-2">
          <Select
            aria-label={`Kas ${i + 1}`}
            value={r.cashAccountId}
            onChange={(e) => {
              emit(rows.map((r, j) => (j === i ? { cashAccountId: e.target.value, amount: r.amount } : r)));
            }}
            required
          >
            <option value="">— Pilih kas —</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </Select>
          <Input
            aria-label={`Nominal ${i + 1}`}
            type="number"
            min={1}
            placeholder="Rp"
            className="w-40"
            value={r.amount}
            onChange={(e) => {
              emit(rows.map((r, j) => (j === i ? { cashAccountId: r.cashAccountId, amount: e.target.value } : r)));
            }}
            required
          />
          {rows.length > 1 ? (
            <button
              type="button"
              className="px-2 pb-2 text-lg font-bold leading-none text-red-500"
              aria-label="Hapus baris"
              onClick={() => emit(rows.filter((_, j) => j !== i))}
            >
              ×
            </button>
          ) : null}
        </div>
      ))}
      <div className="flex items-center justify-between">
        <button
          type="button"
          className="text-xs font-semibold text-primary-700 hover:underline"
          onClick={() => emit([...rows, { cashAccountId: '', amount: '' }])}
        >
          + Tambah sumber kas lain
        </button>
        <p className="text-sm font-bold text-sand-900">Total: {rupiah(total)}</p>
      </div>
      <p className="text-[11px] text-sand-400">
        Satu pengeluaran bisa ditarik dari beberapa kas — misal sewa panggung ditanggung
        KAT dulu, lalu diganti BOS setelah cair.
      </p>
    </div>
  );
}

export default function PengeluaranPage() {
  const [canManage, setCanManage] = useState(false);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [accounts, setAccounts] = useState<CashAccountView[]>([]);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);

  const [yearId, setYearId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [stdGroup, setStdGroup] = useState('');
  const [accountId, setAccountId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');

  const [rows, setRows] = useState<ExpenseView[]>([]);
  const [total, setTotal] = useState(0);
  const [usage, setUsage] = useState<FundUsageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [modal, setModal] = useState<false | 'create' | ExpenseView>(false);
  const [detail, setDetail] = useState<ExpenseView | null>(null);
  const [catModal, setCatModal] = useState(false);
  const [allocState, setAllocState] = useState<AllocRow[]>([]);

  const expenseCats = categories.filter((c) => c.type === 'EXPENSE');

  const load = useCallback(() => {
    setLoading(true);
    listExpenses({
      ...(yearId ? { academicYearId: yearId } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(stdGroup ? { standardGroup: stdGroup } : {}),
      ...(accountId ? { cashAccountId: accountId } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(search ? { search } : {}),
      take: '100',
    })
      .then((r) => {
        setRows(r.items);
        setTotal(r.total);
      })
      .catch(() => setError('Gagal memuat pengeluaran.'))
      .finally(() => setLoading(false));
  }, [yearId, categoryId, stdGroup, accountId, from, to, search]);

  const loadUsage = useCallback(() => {
    getFundUsage({
      ...(yearId ? { academicYearId: yearId } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    })
      .then(setUsage)
      .catch(() => setUsage([]));
  }, [yearId, from, to]);

  useEffect(() => {
    Promise.all([listAcademicYears(), listCashAccounts(), listFinanceCategories()])
      .then(([ys, accs, cats]) => {
        setYears(ys);
        setAccounts(accs);
        setCategories(cats);
        const active = ys.find((y) => y.isActive) ?? ys[0];
        if (active) setYearId(active.id);
      })
      .catch(() => undefined);
    me()
      .then((u) => setCanManage(u.permissions.includes(PERMISSIONS.FINANCE_MANAGE)))
      .catch(() => undefined);
  }, []);

  const firstRun = useRef(true);
  useEffect(() => {
    const t = setTimeout(load, firstRun.current ? 0 : search ? 350 : 100);
    firstRun.current = false;
    return () => clearTimeout(t);
  }, [load, search]);

  useEffect(() => {
    loadUsage();
  }, [loadUsage]);

  async function run(fn: () => Promise<unknown>, msg: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fn();
      setNotice(msg);
      load();
      loadUsage();
      return res;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Aksi gagal.');
      return null;
    } finally {
      setBusy(false);
    }
  }

  function payload(form: HTMLFormElement, allocs: AllocRow[]) {
    const f = new FormData(form);
    const allocations = allocs
      .filter((a) => a.cashAccountId && Number(a.amount) > 0)
      .map((a) => ({ cashAccountId: a.cashAccountId, amount: Number(a.amount) }));
    if (allocations.length === 0) {
      setError('Minimal satu alokasi kas.');
      return null;
    }
    return {
      categoryId: String(f.get('categoryId')),
      description: String(f.get('description')),
      ...(f.get('vendor') ? { vendor: String(f.get('vendor')) } : {}),
      ...(f.get('occurredAt') ? { occurredAt: String(f.get('occurredAt')) } : {}),
      ...(f.get('academicYearId') ? { academicYearId: String(f.get('academicYearId')) } : {}),
      ...(f.get('note') ? { note: String(f.get('note')) } : {}),
      allocations,
    };
  }

  return (
    <Shell>
      <PageTitle
        title="Pengeluaran"
        subtitle="Dokumen pengeluaran — satu pengeluaran bisa ditarik dari beberapa kas; kategori terkelompok ke 8 standar nasional"
        actions={
          canManage ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setCatModal(true)}>
                Kelola Kategori
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setAllocState([]);
                  setModal('create');
                }}
              >
                + Pengeluaran Baru
              </Button>
            </>
          ) : undefined
        }
      />
      {error ? (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
      ) : null}
      {notice ? (
        <p role="status" className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{notice}</p>
      ) : null}

      {usage.length > 0 ? (
        <div className="mb-5 grid gap-3 lg:grid-cols-2">
          {usage.map((u) => (
            <Widget key={u.account.id} title={`Penggunaan ${u.account.name} — ${rupiah(u.total)}`}>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-sand-400">Per kategori</p>
                  <ul className="space-y-1">
                    {u.byCategory.map((c) => (
                      <li key={c.name} className="flex justify-between gap-2 text-sm">
                        <span className="truncate text-sand-700">{c.name}</span>
                        <span className="whitespace-nowrap font-semibold text-sand-900">{rupiah(c.amount)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-sand-400">Per standar</p>
                  <ul className="space-y-1">
                    {u.byStandard.map((s) => (
                      <li key={s.name} className="flex justify-between gap-2 text-sm">
                        <span className="truncate text-sand-700">{s.name}</span>
                        <span className="whitespace-nowrap font-semibold text-sand-900">{rupiah(s.amount)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Widget>
          ))}
        </div>
      ) : null}

      <div className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl border border-sand-200 bg-white p-4 shadow-card">
        <label className="flex min-w-32 flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-sand-500">Tahun Ajaran</span>
          <Select value={yearId} onChange={(e) => setYearId(e.target.value)} aria-label="Filter tahun ajaran">
            <option value="">Semua</option>
            {years.map((y) => (
              <option key={y.id} value={y.id}>{y.name}{y.isActive ? ' (aktif)' : ''}</option>
            ))}
          </Select>
        </label>
        <label className="flex min-w-36 flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-sand-500">Kategori</span>
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Filter kategori">
            <option value="">Semua</option>
            {expenseCats.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </label>
        <label className="flex min-w-36 flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-sand-500">Standar</span>
          <Select value={stdGroup} onChange={(e) => setStdGroup(e.target.value)} aria-label="Filter standar">
            <option value="">Semua</option>
            {STANDARDS.map((s) => (
              <option key={s} value={s}>{STD_FULL[s]}</option>
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
          <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="No. / uraian / vendor…" aria-label="Cari pengeluaran" />
        </label>
      </div>

      <Widget title={`Daftar Pengeluaran (${total})`}>
        <DataTable
          head={['No. Dok', 'Tanggal', 'Uraian', 'Kategori', 'Sumber Kas', 'Total', ...(canManage ? [''] : [])]}
          loading={loading}
          error={null}
          empty={rows.length === 0 ? 'Belum ada pengeluaran.' : undefined}
        >
          {rows.map((e) => (
            <tr key={e.id}>
              <td className="whitespace-nowrap px-5 py-3 text-xs text-sand-500">{e.number}</td>
              <td className="whitespace-nowrap px-5 py-3 text-sand-600">{fmtDate(e.occurredAt)}</td>
              <td className="max-w-64 px-5 py-3">
                <p className="truncate font-medium text-sand-900" title={e.description}>{e.description}</p>
                {e.vendor ? <p className="truncate text-[10px] text-sand-400">{e.vendor}</p> : null}
              </td>
              <td className="px-5 py-3">
                <p className="text-sand-800">{e.category?.name ?? '—'}</p>
                {e.category?.standardGroup ? (
                  <p className="text-[10px] text-sand-400">{STD_LABEL[e.category.standardGroup] ?? e.category.standardGroup}</p>
                ) : null}
              </td>
              <td className="px-5 py-3 text-xs text-sand-600">
                {e.allocations?.map((a) => (
                  <p key={a.id} className="whitespace-nowrap">
                    {a.cashAccount?.name}: <b>{rupiah(a.amount)}</b>
                  </p>
                ))}
              </td>
              <td className="whitespace-nowrap px-5 py-3 text-right font-semibold text-sand-900">{rupiah(e.totalAmount)}</td>
              {canManage ? (
                <td className="whitespace-nowrap px-5 py-3 text-right">
                  <span className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        getExpense(e.id).then(setDetail).catch(() => undefined);
                      }}
                      className="text-xs font-semibold text-primary-700 hover:underline"
                    >
                      Detail
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        getExpense(e.id)
                          .then((full) => {
                            setAllocState(
                              (full.allocations ?? []).map((a) => ({
                                cashAccountId: a.cashAccountId,
                                amount: String(a.amount),
                              })),
                            );
                            setModal(full);
                          })
                          .catch(() => undefined);
                      }}
                      className="text-xs font-semibold text-sand-600 hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Batalkan ${e.number}? Gerakan kas ikut ditarik.`))
                          void run(() => voidExpense(e.id), 'Pengeluaran dibatalkan.');
                      }}
                      className="text-xs font-semibold text-red-600 hover:underline"
                    >
                      Void
                    </button>
                  </span>
                </td>
              ) : null}
            </tr>
          ))}
        </DataTable>
      </Widget>

      {/* Modal create/edit */}
      <Modal
        open={modal !== false}
        onClose={() => setModal(false)}
        title={modal === 'create' ? 'Pengeluaran Baru' : `Edit ${modal ? modal.number : ''}`}
      >
        {modal !== false ? (
          <form
            onSubmit={(ev) => {
              ev.preventDefault();
              const body = payload(ev.currentTarget, allocState);
              if (!body) return;
              const editing = modal === 'create' ? null : modal;
              void run(
                () => (editing ? updateExpense(editing.id, body) : createExpense(body)),
                editing ? 'Pengeluaran diperbarui.' : 'Pengeluaran dicatat.',
              ).then((ok) => {
                if (ok) setModal(false);
              });
            }}
            className="grid gap-3"
          >
            <Field label="Kategori" hint="Kelompok standar nasional diatur di Kelola Kategori">
              <Select
                name="categoryId"
                required
                defaultValue={modal === 'create' ? '' : modal.categoryId}
              >
                <option value="">— Pilih kategori —</option>
                {expenseCats
                  .filter((c) => c.isActive !== false)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.standardGroup ? ` · ${STD_LABEL[c.standardGroup] ?? c.standardGroup}` : ''}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Uraian">
              <Input
                name="description"
                required
                minLength={2}
                placeholder="Sewa panggung perpisahan"
                defaultValue={modal === 'create' ? '' : modal.description}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Vendor/Penerima (opsional)">
                <Input name="vendor" defaultValue={modal === 'create' ? '' : modal.vendor ?? ''} placeholder="Toko/penyedia" />
              </Field>
              <Field label="Tanggal">
                <Input
                  name="occurredAt"
                  type="date"
                  defaultValue={modal === 'create' ? new Date().toISOString().slice(0, 10) : modal.occurredAt.slice(0, 10)}
                />
              </Field>
            </div>
            <Field label="Tahun Ajaran">
              <Select name="academicYearId" defaultValue={modal === 'create' ? yearId : modal.academicYearId ?? ''}>
                <option value="">—</option>
                {years.map((y) => (
                  <option key={y.id} value={y.id}>{y.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Alokasi Sumber Kas">
              <AllocRows
                key={modal === 'create' ? 'new' : modal.id}
                accounts={accounts.filter((a) => a.isActive)}
                defaultRows={
                  modal === 'create'
                    ? undefined
                    : (modal.allocations ?? []).map((a) => ({
                        cashAccountId: a.cashAccountId,
                        amount: String(a.amount),
                      }))
                }
                onChange={setAllocState}
              />
            </Field>
            <Field label="Catatan">
              <Input name="note" defaultValue={modal === 'create' ? '' : modal.note ?? ''} placeholder="opsional" />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setModal(false)}>Batal</Button>
              <Button type="submit" disabled={busy}>Simpan</Button>
            </div>
          </form>
        ) : null}
      </Modal>

      {/* Detail */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? detail.number : ''}>
        {detail ? (
          <div className="grid gap-3 text-sm">
            <div className="grid gap-1 rounded-xl bg-sand-50 p-3">
              <p className="font-semibold text-sand-900">{detail.description}</p>
              <p className="text-xs text-sand-500">
                {fmtDate(detail.occurredAt)}
                {detail.vendor ? ` · ${detail.vendor}` : ''}
                {detail.creator?.name ? ` · dicatat ${detail.creator.name}` : ''}
              </p>
              <p className="text-xs text-sand-500">
                {detail.category?.name}
                {detail.category?.standardGroup ? ` · ${STD_FULL[detail.category.standardGroup]}` : ''}
                {detail.academicYear?.name ? ` · TA ${detail.academicYear.name}` : ''}
              </p>
              {detail.note ? <p className="mt-1 text-xs italic text-sand-500">{detail.note}</p> : null}
            </div>
            <div>
              <p className="mb-1 text-xs font-bold uppercase tracking-wider text-sand-400">Sumber Kas</p>
              <ul className="space-y-1">
                {detail.allocations?.map((a) => (
                  <li key={a.id} className="flex justify-between rounded-lg border border-sand-200 px-3 py-1.5">
                    <span className="text-sand-700">{a.cashAccount?.name}</span>
                    <b className="text-sand-900">{rupiah(a.amount)}</b>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-right font-bold text-sand-900">Total {rupiah(detail.totalAmount)}</p>
            </div>
            <Badge tone={detail.status === 'VOID' ? 'danger' : 'primary'}>
              {detail.status === 'VOID' ? 'Dibatalkan' : 'Tercatat'}
            </Badge>
          </div>
        ) : null}
      </Modal>

      {/* Kelola kategori */}
      <Modal open={catModal} onClose={() => setCatModal(false)} title="Kelola Kategori Pengeluaran">
        <div className="grid gap-4">
          <ul className="max-h-64 space-y-1 overflow-y-auto">
            {expenseCats.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-sand-200 px-3 py-2 text-sm">
                <span className={`flex-1 font-medium ${c.isActive === false ? 'text-sand-400 line-through' : 'text-sand-900'}`}>
                  {c.name}
                </span>
                <Select
                  aria-label={`Standar ${c.name}`}
                  value={c.standardGroup ?? ''}
                  disabled={!canManage}
                  onChange={(e) =>
                    void run(
                      () =>
                        updateFinanceCategory(c.id, { standardGroup: e.target.value || '' }).then((u) => {
                          setCategories((cs) => cs.map((x) => (x.id === u.id ? u : x)));
                          return u;
                        }),
                      'Standar kategori diperbarui.',
                    )
                  }
                >
                  <option value="">— Tanpa standar —</option>
                  {STANDARDS.map((s) => (
                    <option key={s} value={s}>{STD_FULL[s]}</option>
                  ))}
                </Select>
                {canManage ? (
                  <button
                    type="button"
                    className="text-xs font-semibold text-primary-700 hover:underline"
                    onClick={() =>
                      void run(
                        () =>
                          updateFinanceCategory(c.id, { isActive: c.isActive === false }).then((u) => {
                            setCategories((cs) => cs.map((x) => (x.id === u.id ? u : x)));
                            return u;
                          }),
                        c.isActive === false ? 'Kategori diaktifkan.' : 'Kategori dinonaktifkan.',
                      )
                    }
                  >
                    {c.isActive === false ? 'Aktifkan' : 'Nonaktifkan'}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          {canManage ? (
            <form
              className="grid gap-2 rounded-xl bg-sand-50 p-3"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void run(
                  () =>
                    createFinanceCategory({
                      name: String(f.get('newName')),
                      type: 'EXPENSE',
                    })
                      .then((c) => {
                        setCategories((cs) => [...cs, c]);
                        (e.target as HTMLFormElement).reset();
                        return c;
                      }),
                  'Kategori ditambahkan.',
                );
              }}
            >
              <p className="text-xs font-bold uppercase tracking-wider text-sand-500">Kategori Baru</p>
              <Input name="newName" required minLength={2} placeholder="Mis. Honor Pengawas Ujian" />
              <Button type="submit" size="sm" disabled={busy}>Tambah</Button>
            </form>
          ) : null}
        </div>
      </Modal>
    </Shell>
  );
}
