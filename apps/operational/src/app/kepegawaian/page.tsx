'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Field, Input, Modal, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { DataTable } from '@/components/data-table';
import { PageTitle } from '@/components/widgets';
import {
  createEmployee,
  listEmployees,
  listRoles,
  type EmployeeDto,
  type RoleOption,
} from '@/lib/api';

const typeLabel = (t: string) => (t === 'TEACHER' ? 'Guru' : 'Staf');

export default function EmployeesPage() {
  const [rows, setRows] = useState<EmployeeDto[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [type, setType] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [withAccount, setWithAccount] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback((t: string) => {
    setLoading(true);
    listEmployees(t || undefined)
      .then(setRows)
      .catch(() => setError('Gagal memuat data pegawai.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load('');
    listRoles()
      .then(setRoles)
      .catch(() => setRoles([]));
  }, [load]);

  async function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const val = (k: string) => String(f.get(k) ?? '').trim() || undefined;
    const wantsAccount = f.get('makeAccount') === 'on';
    setError(null);
    if (wantsAccount && !val('password')) {
      setError('Password wajib diisi untuk membuat akun.');
      return;
    }
    if (wantsAccount && !val('roleKey')) {
      setError('Pilih role untuk akun pegawai.');
      return;
    }
    setBusy(true);
    try {
      await createEmployee({
        name: val('name'),
        nip: val('nip'),
        type: val('type'),
        email: val('email'),
        phone: val('phone'),
        ...(wantsAccount
          ? { password: val('password'), roleKey: val('roleKey') }
          : {}),
      });
      e.currentTarget.reset();
      setWithAccount(false);
      setShowForm(false);
      load(type);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Gagal menambah pegawai.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <PageTitle
        title="Data Pegawai"
        subtitle="Guru dan staf sekolah — bisa sekaligus dibuatkan akun beserta role kerjanya"
        actions={
          <Button size="sm" variant={showForm ? 'ghost' : 'primary'} onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Tutup' : '+ Tambah Pegawai'}
          </Button>
        }
      />

      {error ? (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
      ) : null}

      {showForm ? (
        <Modal
          open
          onClose={() => setShowForm(false)}
          title="Tambah Pegawai"
          description="Data pegawai — opsional sekaligus buatkan akun login beserta rolenya."
          size="xl"
        >
          <form onSubmit={onCreate} className="grid gap-4 sm:grid-cols-2">
            <Field label="Nama Lengkap" className="sm:col-span-2">
              <Input name="name" required />
            </Field>
            <Field label="NIP">
              <Input name="nip" />
            </Field>
            <Field label="Jenis">
              <Select name="type" required defaultValue="TEACHER">
                <option value="TEACHER">Guru</option>
                <option value="STAFF">Staf</option>
              </Select>
            </Field>
            <Field label="Email" hint="Diperlukan untuk login akun">
              <Input name="email" type="email" />
            </Field>
            <Field label="Telepon" hint="Bisa dipakai login jika email kosong">
              <Input name="phone" />
            </Field>

            <div className="sm:col-span-2 rounded-2xl border border-dashed border-sand-300 bg-sand-50/70 p-4">
              <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold text-sand-800">
                <input
                  type="checkbox"
                  name="makeAccount"
                  checked={withAccount}
                  onChange={(e) => setWithAccount(e.target.checked)}
                  className="size-4 accent-primary-700"
                />
                Buatkan akun login untuk pegawai ini
              </label>
              {withAccount ? (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Field label="Role / Bidang Kerja" hint="Menentukan modul yang bisa diakses">
                    <Select name="roleKey" required defaultValue="">
                      <option value="" disabled>Pilih role…</option>
                      {roles
                        .filter((r) => r.key !== 'spmb_parent')
                        .map((r) => (
                          <option key={r.key} value={r.key}>
                            {r.name}
                          </option>
                        ))}
                    </Select>
                  </Field>
                  <Field label="Password Awal" hint="Min. 8 karakter — berikan ke pegawai">
                    <Input name="password" type="password" minLength={8} required />
                  </Field>
                </div>
              ) : null}
            </div>

            <div className="sm:col-span-2">
              <Button type="submit" disabled={busy}>
                {busy ? 'Menyimpan…' : 'Simpan'}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      <div className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl border border-sand-200 bg-white p-4 shadow-card">
        <label className="flex min-w-40 flex-1 flex-col gap-1.5 sm:min-w-52">
          <span className="text-xs font-bold uppercase tracking-wider text-sand-500">Jenis Pegawai</span>
          <Select value={type} onChange={(e) => { setType(e.target.value); load(e.target.value); }}>
            <option value="">Semua</option>
            <option value="TEACHER">Guru</option>
            <option value="STAFF">Staf</option>
          </Select>
        </label>
      </div>

      <DataTable
        head={['Nama', 'NIP', 'Jenis', 'Kontak', 'Akun', 'Status']}
        loading={loading}
        error={error}
        empty={rows.length === 0 ? 'Belum ada pegawai.' : undefined}
      >
        {rows.map((e) => (
          <tr key={e.id}>
            <td className="px-5 py-3.5 font-semibold text-sand-900">{e.name}</td>
            <td className="px-5 py-3.5 text-sand-600">{e.nip ?? '—'}</td>
            <td className="px-5 py-3.5 text-sand-600">{typeLabel(e.type)}</td>
            <td className="px-5 py-3.5 text-sand-600">
              {e.email ?? '—'}
              {e.phone ? <span className="block text-xs text-sand-400">{e.phone}</span> : null}
            </td>
            <td className="px-5 py-3.5">
              {e.userId ? (
                <Badge tone="primary">Ada akun</Badge>
              ) : (
                <span className="text-xs text-sand-400">—</span>
              )}
            </td>
            <td className="px-5 py-3.5">
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
