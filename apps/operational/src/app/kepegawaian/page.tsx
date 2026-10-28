'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Badge, Button, Card } from '@smpmuh3/ui';
import { DataTable } from '@/components/data-table';
import { Shell } from '@/components/shell';
import { PageTitle } from '@/components/widgets';
import {
  createEmployee,
  listEmployees,
  type EmployeeDto,
} from '@/lib/api';

const inputCls =
  'h-10 w-full rounded-lg border border-sand-300 px-3 text-sm focus-visible:focus-ring';

export default function KepegawaianPage() {
  const [rows, setRows] = useState<EmployeeDto[]>([]);
  const [type, setType] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listEmployees(type || undefined));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat');
    } finally {
      setLoading(false);
    }
  }, [type]);

  useEffect(() => {
    listEmployees(type || undefined).then(setRows).catch(() => undefined).finally(() => setLoading(false));
  }, [type]);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      await createEmployee({
        name: fd.get('name'),
        nip: fd.get('nip') || undefined,
        type: fd.get('type'),
        email: fd.get('email') || undefined,
        phone: fd.get('phone') || undefined,
      });
      setShowForm(false);
      (e.target as HTMLFormElement).reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <PageTitle
        title="Data Pegawai"
        subtitle="Guru dan staf sekolah"
        actions={
          <Button onClick={() => setShowForm((v) => !v)} size="sm">
            {showForm ? 'Tutup' : '+ Tambah Pegawai'}
          </Button>
        }
      />
      {error ? (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {showForm ? (
        <Card className="mb-4">
          <h2 className="mb-4 font-bold text-sand-950">Pegawai Baru</h2>
          <form onSubmit={onCreate} className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold text-sand-900 sm:col-span-2">
              Nama lengkap *
              <input required name="name" minLength={3} className={inputCls} />
            </label>
            <label className="text-sm font-semibold text-sand-900">
              NIP
              <input name="nip" className={inputCls} />
            </label>
            <label className="text-sm font-semibold text-sand-900">
              Jenis
              <select name="type" className={inputCls}>
                <option value="TEACHER">Guru</option>
                <option value="STAFF">Staf</option>
              </select>
            </label>
            <label className="text-sm font-semibold text-sand-900">
              Email
              <input type="email" name="email" className={inputCls} />
            </label>
            <label className="text-sm font-semibold text-sand-900">
              Telepon
              <input name="phone" className={inputCls} />
            </label>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={busy}>
                {busy ? 'Menyimpan…' : 'Simpan'}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      <div className="mb-4">
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="h-10 rounded-lg border border-sand-300 px-3 text-sm"
          aria-label="Filter jenis"
        >
          <option value="">Semua</option>
          <option value="TEACHER">Guru</option>
          <option value="STAFF">Staf</option>
        </select>
      </div>

      <DataTable
        head={['NIP', 'Nama', 'Jenis', 'Kontak', 'Status']}
        loading={loading}
        error={error}
        empty={rows.length === 0 ? 'Belum ada pegawai.' : undefined}
      >
        {rows.map((e) => (
          <tr key={e.id} className="hover:bg-sand-50">
            <td className="px-4 py-3 font-mono text-xs text-sand-700">
              {e.nip ?? '—'}
            </td>
            <td className="px-4 py-3 font-medium text-sand-900">{e.name}</td>
            <td className="px-4 py-3">
              <Badge tone={e.type === 'TEACHER' ? 'primary' : 'neutral'}>
                {e.type === 'TEACHER' ? 'Guru' : 'Staf'}
              </Badge>
            </td>
            <td className="px-4 py-3 text-sm text-sand-600">
              {e.email ?? e.phone ?? '—'}
            </td>
            <td className="px-4 py-3">
              <Badge tone={e.isActive ? 'primary' : 'neutral'}>
                {e.isActive ? 'Aktif' : 'Nonaktif'}
              </Badge>
            </td>
          </tr>
        ))}
      </DataTable>
    </Shell>
  );
}
