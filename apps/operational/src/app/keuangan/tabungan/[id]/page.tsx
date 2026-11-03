'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { PERMISSIONS } from '@smpmuh3/types';
import { Button, Field, Input, Modal, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { DataTable } from '@/components/data-table';
import { PageTitle, Widget } from '@/components/widgets';
import {
  createSavingsEntry,
  getStudentSavings,
  listCashAccounts,
  me,
  type CashAccountView,
  type SavingsEntryView,
} from '@/lib/api';

const rupiah = (n: number) => `Rp${n.toLocaleString('id-ID')}`;
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

export default function BukuTabunganPage() {
  const { id } = useParams<{ id: string }>();
  const [canManage, setCanManage] = useState(false);
  const [accounts, setAccounts] = useState<CashAccountView[]>([]);
  const [student, setStudent] = useState<{ name: string; nis?: string | null; kelas?: string | null } | null>(null);
  const [entries, setEntries] = useState<SavingsEntryView[]>([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [entryModal, setEntryModal] = useState<'IN' | 'OUT' | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    getStudentSavings(id)
      .then((r) => {
        setEntries(r.items);
        setBalance(r.balance);
        const s = r.student;
        if (s) {
          setStudent({
            name: s.name,
            nis: s.nis ?? null,
            kelas: s.enrollments?.[0]?.class?.name ?? null,
          });
        }
      })
      .catch(() => setError('Gagal memuat buku tabungan.'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    me().then((u) => setCanManage(u.permissions.includes(PERMISSIONS.FINANCE_MANAGE))).catch(() => undefined);
    listCashAccounts().then(setAccounts).catch(() => undefined);
    load();
  }, [load]);

  async function run(fn: () => Promise<unknown>, msg: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setNotice(msg);
      load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Aksi gagal.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  const activeAccounts = accounts.filter((a) => a.isActive);
  const totalIn = entries.filter((e) => e.direction === 'IN').reduce((s, e) => s + e.amount, 0);
  const totalOut = entries.filter((e) => e.direction === 'OUT').reduce((s, e) => s + e.amount, 0);

  return (
    <Shell>
      <PageTitle
        title={`Buku Tabungan — ${student?.name ?? '…'}`}
        subtitle={student ? `NIS ${student.nis ?? '—'}${student.kelas ? ` · ${student.kelas}` : ''}` : undefined}
        actions={
          <span className="flex gap-2">
            <Link href="/keuangan/tabungan" className="inline-flex items-center rounded-lg border border-sand-300 px-3 py-1.5 text-sm font-semibold text-sand-700 hover:bg-sand-50">
              ← Semua Siswa
            </Link>
            <Link href={`/kesiswaan/${id}`} className="inline-flex items-center rounded-lg border border-sand-300 px-3 py-1.5 text-sm font-semibold text-sand-700 hover:bg-sand-50">
              Profil Siswa →
            </Link>
            {canManage ? (
              <>
                <Button size="sm" variant="outline" onClick={() => setEntryModal('IN')}>+ Setor</Button>
                <Button size="sm" variant="outline" onClick={() => setEntryModal('OUT')} disabled={balance <= 0}>− Tarik</Button>
              </>
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
        <div className="rounded-xl border border-current/10 p-4">
          <div className="text-sm opacity-60">Total Setoran</div>
          <div className="mt-1 text-2xl font-bold text-green-600">{rupiah(totalIn)}</div>
        </div>
        <div className="rounded-xl border border-current/10 p-4">
          <div className="text-sm opacity-60">Total Penarikan</div>
          <div className="mt-1 text-2xl font-bold text-red-600">{rupiah(totalOut)}</div>
        </div>
        <div className="rounded-xl border border-current/10 p-4">
          <div className="text-sm opacity-60">Saldo Saat Ini</div>
          <div className="mt-1 text-2xl font-bold text-cyan-700">{rupiah(balance)}</div>
        </div>
      </div>

      <Widget title="Gerakan Tabungan">
        <DataTable
          head={['Tanggal', 'Keterangan', 'Setor', 'Tarik', 'Saldo']}
          loading={loading}
          error={null}
          empty={entries.length === 0 ? 'Belum ada gerakan tabungan.' : undefined}
        >
          {entries.map((e) => (
            <tr key={e.id}>
              <td className="whitespace-nowrap px-5 py-3 text-sand-600">{fmtDate(e.occurredAt)}</td>
              <td className="px-5 py-3 text-sand-800">
                {e.note ?? (e.direction === 'IN' ? 'Setoran' : 'Penarikan')}
                <span className="ml-1 text-xs text-sand-400">
                  {e.cashAccount?.name ?? ''}{e.recordedBy?.name ? ` · ${e.recordedBy.name}` : ''}
                </span>
              </td>
              <td className="px-5 py-3 text-right font-semibold text-emerald-700">
                {e.direction === 'IN' ? rupiah(e.amount) : '—'}
              </td>
              <td className="px-5 py-3 text-right font-semibold text-red-600">
                {e.direction === 'OUT' ? rupiah(e.amount) : '—'}
              </td>
              <td className="px-5 py-3 text-right font-bold text-sand-900">{rupiah(e.balance)}</td>
            </tr>
          ))}
        </DataTable>
      </Widget>

      {/* Modal setor/tarik */}
      <Modal
        open={entryModal !== null}
        onClose={() => setEntryModal(null)}
        title={entryModal === 'IN' ? `Setor Tabungan — ${student?.name ?? ''}` : `Tarik Tabungan — ${student?.name ?? ''}`}
      >
        {entryModal ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(
                () =>
                  createSavingsEntry({
                    studentId: id,
                    direction: entryModal,
                    amount: Number(f.get('amount')),
                    ...(f.get('cashAccountId') ? { cashAccountId: String(f.get('cashAccountId')) } : {}),
                    ...(f.get('note') ? { note: String(f.get('note')) } : {}),
                    ...(f.get('occurredAt') ? { occurredAt: String(f.get('occurredAt')) } : {}),
                  }),
                entryModal === 'IN' ? 'Setoran dicatat.' : 'Penarikan dicatat.',
              ).then((ok) => {
                if (ok) setEntryModal(null);
              });
            }}
            className="grid gap-3"
          >
            {entryModal === 'OUT' ? (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Saldo tersedia: <b>{rupiah(balance)}</b> — penarikan melebihi saldo ditolak.
              </p>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Jumlah">
                <Input name="amount" type="number" min={1} max={entryModal === 'OUT' ? balance : undefined} required placeholder="0" />
              </Field>
              <Field label="Tanggal">
                <Input name="occurredAt" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
              </Field>
            </div>
            <Field label="Kas">
              <Select name="cashAccountId" required defaultValue={activeAccounts.find((a) => a.key === 'tunai')?.id ?? activeAccounts[0]?.id ?? ''}>
                {activeAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Keterangan">
              <Input name="note" placeholder={entryModal === 'IN' ? 'Setoran tunai' : 'Penarikan'} />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setEntryModal(null)}>Batal</Button>
              <Button type="submit" disabled={busy}>Simpan</Button>
            </div>
          </form>
        ) : null}
      </Modal>
    </Shell>
  );
}
