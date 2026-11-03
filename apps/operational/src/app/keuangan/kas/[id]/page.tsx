'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Badge, Button, Input } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { DataTable } from '@/components/data-table';
import { PageTitle, Widget } from '@/components/widgets';
import { getAccountLedger, type AccountLedger } from '@/lib/api';

const rupiah = (n: number) => `Rp${n.toLocaleString('id-ID')}`;
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

export default function KasDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [ledger, setLedger] = useState<AccountLedger | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      setLedger(await getAccountLedger(id, { ...(from ? { from } : {}), ...(to ? { to } : {}) }));
      setError(null);
    } catch {
      setError('Gagal memuat buku kas.');
    } finally {
      setLoading(false);
    }
  }, [id, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalIn = ledger?.items.filter((m) => m.direction === 'IN').reduce((s, m) => s + m.amount, 0) ?? 0;
  const totalOut = ledger?.items.filter((m) => m.direction === 'OUT').reduce((s, m) => s + m.amount, 0) ?? 0;

  return (
    <Shell>
      <PageTitle
        title={ledger ? `Buku Kas — ${ledger.account.name}` : 'Buku Kas'}
        subtitle="Gerakan masuk/keluar dan saldo berjalan per akun"
        actions={
          <Link
            href="/keuangan/kas"
            className="rounded-xl border border-sand-200 bg-white px-3 py-2 text-sm font-semibold text-primary-700 shadow-sm hover:bg-sand-50"
          >
            ← Daftar Kas
          </Link>
        }
      />
      {error ? (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
      ) : null}

      {ledger ? (
        <div className="mb-5 grid gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-sand-200 bg-white p-4 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-wide text-sand-500">Akun</p>
            <p className="mt-1 font-bold text-sand-900">
              {ledger.account.name}{' '}
              <Badge tone={ledger.account.type === 'BANK' ? 'primary' : 'neutral'}>
                {ledger.account.type === 'BANK' ? 'Bank' : 'Tunai'}
              </Badge>
            </p>
          </div>
          <div className="rounded-2xl border border-sand-200 bg-white p-4 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-wide text-sand-500">Masuk periode ini</p>
            <p className="mt-1 text-lg font-extrabold text-emerald-700">{rupiah(totalIn)}</p>
          </div>
          <div className="rounded-2xl border border-sand-200 bg-white p-4 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-wide text-sand-500">Keluar periode ini</p>
            <p className="mt-1 text-lg font-extrabold text-red-600">{rupiah(totalOut)}</p>
          </div>
          <div className="rounded-2xl border border-sand-200 bg-white p-4 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-wide text-sand-500">Saldo akhir</p>
            <p className="mt-1 text-lg font-extrabold text-primary-800">{rupiah(ledger.closing)}</p>
          </div>
        </div>
      ) : null}

      <Widget
        title="Buku Kas"
        action={
          <span className="flex items-center gap-2">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-36 text-xs" aria-label="Dari tanggal" />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-36 text-xs" aria-label="Sampai tanggal" />
            <Button size="sm" variant="outline" onClick={() => void load()}>Terapkan</Button>
          </span>
        }
      >
        <DataTable
          head={['Tanggal', 'Uraian', 'Masuk', 'Keluar', 'Saldo']}
          loading={loading}
          error={null}
          empty={!ledger || ledger.items.length === 0 ? 'Belum ada gerakan pada periode ini.' : undefined}
        >
          {ledger ? (
            <tr className="bg-sand-50">
              <td className="px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-sand-500" colSpan={4}>
                Saldo awal periode
              </td>
              <td className="px-5 py-2.5 text-right font-bold text-sand-900">{rupiah(ledger.opening)}</td>
            </tr>
          ) : null}
          {ledger?.items.map((m) => (
            <tr key={m.id}>
              <td className="px-5 py-3 text-sand-600">{fmtDate(m.occurredAt)}</td>
              <td className="px-5 py-3 text-sand-800">{m.description ?? m.refType}</td>
              <td className="px-5 py-3 text-right font-semibold text-emerald-700">
                {m.direction === 'IN' ? rupiah(m.amount) : '—'}
              </td>
              <td className="px-5 py-3 text-right font-semibold text-red-600">
                {m.direction === 'OUT' ? rupiah(m.amount) : '—'}
              </td>
              <td className="px-5 py-3 text-right font-bold text-sand-900">{rupiah(m.balance)}</td>
            </tr>
          ))}
          {ledger && ledger.items.length > 0 ? (
            <tr className="bg-sand-50">
              <td className="px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-sand-500" colSpan={4}>
                Saldo akhir
              </td>
              <td className="px-5 py-2.5 text-right font-extrabold text-primary-800">{rupiah(ledger.closing)}</td>
            </tr>
          ) : null}
        </DataTable>
      </Widget>
    </Shell>
  );
}
