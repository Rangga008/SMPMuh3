'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Field, Input } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { DataTable } from '@/components/data-table';
import { PageTitle } from '@/components/widgets';
import {
  activateAcademicYear,
  createAcademicYear,
  listAcademicYears,
  type AcademicYear,
} from '@/lib/api';

const fmtDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';

export default function TahunAjaranPage() {
  const [rows, setRows] = useState<AcademicYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listAcademicYears());
      setError(null);
    } catch {
      setError('Gagal memuat tahun ajaran.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Aksi gagal.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <PageTitle
        title="Tahun Ajaran"
        subtitle="Kelola periode akademik — hanya satu yang aktif; gelombang SPMB, rombel, dan nilai mengikutinya"
      />
      {error ? (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
      ) : null}
      {notice ? (
        <p role="status" className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{notice}</p>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void run(
            () =>
              createAcademicYear({
                name: String(f.get('name')),
                startDate: String(f.get('startDate')),
                endDate: String(f.get('endDate')),
                isActive: f.get('isActive') === 'on',
              }),
            'Tahun ajaran ditambahkan.',
            e.currentTarget,
          );
        }}
        className="mb-5 grid gap-3 rounded-2xl border border-sand-200 bg-white p-4 shadow-card sm:grid-cols-[140px_1fr_1fr_auto_auto] sm:items-end"
      >
        <Field label="Nama">
          <Input name="name" required placeholder="2027/2028" pattern="\d{4}/\d{4}" />
        </Field>
        <Field label="Mulai">
          <Input name="startDate" type="date" required />
        </Field>
        <Field label="Selesai">
          <Input name="endDate" type="date" required />
        </Field>
        <label className="flex h-10 items-center gap-2 text-sm font-medium text-sand-700">
          <input name="isActive" type="checkbox" className="size-4 accent-primary-700" />
          Langsung aktif
        </label>
        <Button type="submit" disabled={busy} variant="outline">Tambah</Button>
      </form>

      <DataTable
        head={['Tahun Ajaran', 'Mulai', 'Selesai', 'Status', '']}
        loading={loading}
        error={error}
        empty={rows.length === 0 ? 'Belum ada tahun ajaran.' : undefined}
      >
        {rows.map((y) => (
          <tr key={y.id}>
            <td className="px-5 py-3 font-bold text-sand-900">{y.name}</td>
            <td className="px-5 py-3 text-sand-600">{fmtDate(y.startDate)}</td>
            <td className="px-5 py-3 text-sand-600">{fmtDate(y.endDate)}</td>
            <td className="px-5 py-3">
              {y.isActive ? (
                <Badge tone="primary">Aktif</Badge>
              ) : (
                <Badge tone="neutral">Nonaktif</Badge>
              )}
            </td>
            <td className="px-5 py-3 text-right">
              {!y.isActive ? (
                <button
                  type="button"
                  className="text-sm font-semibold text-primary-700 hover:underline"
                  onClick={() =>
                    void run(
                      () => activateAcademicYear(y.id),
                      `Tahun ajaran ${y.name} diaktifkan — yang lain otomatis nonaktif.`,
                    )
                  }
                >
                  Jadikan Aktif
                </button>
              ) : null}
            </td>
          </tr>
        ))}
      </DataTable>
    </Shell>
  );
}
