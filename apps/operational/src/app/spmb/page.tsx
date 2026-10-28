'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  REGISTRATION_STATUSES,
  REGISTRATION_STATUS_LABELS,
  type RegistrationStatus,
} from '@smpmuh3/types';
import { Badge } from '@smpmuh3/ui';
import { DataTable } from '@/components/data-table';
import { Shell } from '@/components/shell';
import { PageTitle } from '@/components/widgets';
import {
  listAdminRegistrations,
  type AdminRegistration,
} from '@/lib/api';

const inputCls =
  'h-10 rounded-lg border border-sand-300 px-3 text-sm focus-visible:focus-ring';

function SpmbList() {
  const params = useSearchParams();
  const [rows, setRows] = useState<AdminRegistration[]>([]);
  const [status, setStatus] = useState(params.get('status') ?? '');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (q: { status?: string | undefined; search?: string | undefined }) => {
    setLoading(true);
    setError(null);
    try {
      setRows(await listAdminRegistrations(q));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat');
    } finally {
      setLoading(false);
    }
    },
    [],
  );

  useEffect(() => {
    load({ status: params.get('status') ?? '' });
  }, [load, params]);

  function onFilter(e: FormEvent) {
    e.preventDefault();
    load({ status, search: search || undefined });
  }

  return (
    <>
      <PageTitle
        title="Pendaftar SPMB"
        subtitle="Verifikasi dan kelola pendaftaran siswa baru"
      />
      <form
        onSubmit={onFilter}
        className="mb-4 flex flex-wrap items-center gap-2"
      >
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Filter status"
          className={inputCls}
        >
          <option value="">Semua status</option>
          {REGISTRATION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {REGISTRATION_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nomor / nama / email…"
          aria-label="Cari pendaftar"
          className={`${inputCls} w-64`}
        />
        <button
          type="submit"
          className="h-10 rounded-lg bg-primary-700 px-4 text-sm font-semibold text-white hover:bg-primary-800 focus-visible:focus-ring"
        >
          Terapkan
        </button>
      </form>

      <DataTable
        head={['Nomor', 'Calon Siswa', 'Orang Tua', 'Jalur', 'Status', '']}
        loading={loading}
        error={error}
        empty={
          rows.length === 0 ? 'Tidak ada pendaftaran yang cocok.' : undefined
        }
      >
        {rows.map((r) => (
          <tr key={r.id} className="hover:bg-sand-50">
            <td className="px-4 py-3 font-mono text-xs font-semibold text-sand-800">
              {r.number}
            </td>
            <td className="px-4 py-3 font-medium text-sand-900">
              {r.candidate.name}
            </td>
            <td className="px-4 py-3 text-sand-600">{r.parent?.email}</td>
            <td className="px-4 py-3 text-sand-600">{r.pathway}</td>
            <td className="px-4 py-3">
              <Badge tone={r.status === 'ACCEPTED' ? 'primary' : 'accent'}>
                {REGISTRATION_STATUS_LABELS[r.status as RegistrationStatus] ??
                  r.status}
              </Badge>
            </td>
            <td className="px-4 py-3 text-right">
              <Link
                href={`/spmb/${r.id}`}
                className="font-semibold text-primary-800 hover:underline focus-visible:focus-ring rounded"
              >
                Detail →
              </Link>
            </td>
          </tr>
        ))}
      </DataTable>
    </>
  );
}

export default function SpmbPage() {
  return (
    <Shell>
      <Suspense fallback={<p className="text-sand-500">Memuat…</p>}>
        <SpmbList />
      </Suspense>
    </Shell>
  );
}
