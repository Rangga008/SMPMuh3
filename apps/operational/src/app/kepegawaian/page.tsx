'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, Button, Field, Input, Modal, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { DataTable } from '@/components/data-table';
import { PageTitle } from '@/components/widgets';
import {
  createEmployee,
  downloadEmployeeTemplate,
  importEmployees,
  listEmployees,
  listRoles,
  type EmployeeDto,
  type RoleOption,
} from '@/lib/api';

const typeLabel = (t: string) => (t === 'TEACHER' ? 'Guru' : 'Staf');
const DEPT_LABEL: Record<string, string> = {
  KURIKULUM: 'Kurikulum', KESISWAAN: 'Kesiswaan', TATA_USAHA: 'Tata Usaha',
  KEUANGAN: 'Keuangan', HUMAS: 'Humas', LAINNYA: 'Lainnya',
};

export default function EmployeesPage() {
  const [rows, setRows] = useState<EmployeeDto[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [type, setType] = useState('');
  const [dept, setDept] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [withAccount, setWithAccount] = useState(false);
  const [busy, setBusy] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; updated: number; skipped: number; errors: { row: number; name: string; error: string }[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback((t: string, d: string, q: string) => {
    setLoading(true);
    listEmployees(t || undefined, q || undefined, d || undefined)
      .then(setRows)
      .catch(() => setError('Gagal memuat data pegawai.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    listRoles().then(setRoles).catch(() => setRoles([]));
  }, []);

  // Realtime — search di-debounce.
  const firstRun = useRef(true);
  useEffect(() => {
    const t = setTimeout(() => load(type, dept, search), firstRun.current ? 0 : search ? 350 : 100);
    firstRun.current = false;
    return () => clearTimeout(t);
  }, [type, dept, search, load]);

  async function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const res = await importEmployees(file);
      setImportResult(res);
      load(type, dept, search);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import gagal.');
    } finally {
      setBusy(false);
    }
  }

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
        department: val('department') || null,
        isDeptHead: val('isDeptHead') === 'on',
        ...(wantsAccount
          ? { password: val('password'), roleKey: val('roleKey') }
          : {}),
      });
      e.currentTarget.reset();
      setWithAccount(false);
      setShowForm(false);
      setNotice('Pegawai ditambahkan.');
      load(type, dept, search);
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
          <span className="flex items-center gap-2">
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onImport} />
            <Button size="sm" variant="outline" onClick={() => downloadEmployeeTemplate().catch(() => setError('Gagal mengunduh template.'))}>
              Template
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
              Import Excel
            </Button>
            <Button size="sm" variant={showForm ? 'ghost' : 'primary'} onClick={() => setShowForm((v) => !v)}>
              {showForm ? 'Tutup' : '+ Tambah Pegawai'}
            </Button>
          </span>
        }
      />

      {error ? (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
      ) : null}
      {notice ? (
        <p role="status" className="mb-4 rounded-xl bg-primary-50 px-4 py-3 text-sm font-medium text-primary-800">{notice}</p>
      ) : null}
      {importResult ? (
        <div className="mb-4 rounded-xl border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-primary-900">
          <p className="font-bold">
            Import selesai — {importResult.created} dibuat, {importResult.updated} diperbarui, {importResult.skipped} dilewati.
          </p>
          {importResult.errors.length ? (
            <ul className="mt-1 list-disc pl-5 text-xs text-amber-800">
              {importResult.errors.slice(0, 8).map((e2, i) => (
                <li key={i}>Baris {e2.row} {e2.name ? `(${e2.name})` : ''}: {e2.error}</li>
              ))}
              {importResult.errors.length > 8 ? <li>…dan {importResult.errors.length - 8} lainnya</li> : null}
            </ul>
          ) : null}
        </div>
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
            <Field label="Bidang" hint="Untuk fitur Bidang Saya & kepala bidang">
              <Select name="department" defaultValue="">
                <option value="">— Belum ditugaskan —</option>
                <option value="KURIKULUM">Kurikulum</option>
                <option value="KESISWAAN">Kesiswaan</option>
                <option value="TATA_USAHA">Tata Usaha</option>
                <option value="KEUANGAN">Keuangan</option>
                <option value="HUMAS">Humas</option>
                <option value="LAINNYA">Lainnya</option>
              </Select>
            </Field>
            <Field label="Jabatan Bidang">
              <label className="flex h-10 items-center gap-2 text-sm font-semibold text-sand-700">
                <input type="checkbox" name="isDeptHead" className="size-4 accent-primary-700" />
                Kepala bidang
              </label>
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
        <label className="flex min-w-36 flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-sand-500">Jenis</span>
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Semua</option>
            <option value="TEACHER">Guru</option>
            <option value="STAFF">Staf</option>
          </Select>
        </label>
        <label className="flex min-w-36 flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-sand-500">Bidang</span>
          <Select value={dept} onChange={(e) => setDept(e.target.value)}>
            <option value="">Semua</option>
            {Object.entries(DEPT_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </Select>
        </label>
        <label className="flex min-w-40 flex-1 flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-sand-500">Pencarian</span>
          <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nama / NIP…" />
        </label>
      </div>

      <DataTable
        head={['Nama', 'NIP', 'Jenis', 'Bidang', 'Kontak', 'Akun', 'Status']}
        loading={loading}
        error={error}
        empty={rows.length === 0 ? 'Belum ada pegawai.' : undefined}
      >
        {rows.map((e) => (
          <tr key={e.id}>
            <td className="px-5 py-3.5">
              <Link href={`/kepegawaian/${e.id}`} className="font-semibold text-sand-900 hover:text-primary-700 hover:underline">
                {e.name}
              </Link>
            </td>
            <td className="px-5 py-3.5 text-sand-600">{e.nip ?? '—'}</td>
            <td className="px-5 py-3.5 text-sand-600">{typeLabel(e.type)}</td>
            <td className="px-5 py-3.5 text-sand-600">
              {e.department ? (DEPT_LABEL[e.department] ?? e.department) : '—'}
              {e.isDeptHead ? <Badge tone="accent" className="ml-1">Kepala</Badge> : null}
            </td>
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
