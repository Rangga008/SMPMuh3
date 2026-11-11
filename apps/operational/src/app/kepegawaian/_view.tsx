'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, Button, Field, Input, Modal, Select } from '@smpmuh3/ui';
import {
  ADDITIONAL_DUTIES,
  ADDITIONAL_DUTY_LABELS,
  EMPLOYEE_TYPE_LABELS,
  GTK_GROUP,
  GTK_TYPE_LABELS,
  STAFF_KINDS,
  STAFF_KIND_LABELS,
  type AdditionalDuty,
  type EmployeeType,
  type GtkType,
  type StaffKind,
} from '@smpmuh3/types';
import { Shell } from '@/components/shell';
import { DataTable } from '@/components/data-table';
import { PageTitle } from '@/components/widgets';
import {
  createEmployee,
  deleteEmployee,
  downloadEmployeeTemplate,
  importEmployees,
  listEmployees,
  listRoles,
  previewEmployeeImport,
  type EmployeeDto,
  type EmployeeImportPreviewRow,
  type EmployeeImportResult,
  type RoleOption,
} from '@/lib/api';
import { RowBtn } from '@/components/row-btn';
import { useConfirm } from '@/components/confirm-dialog';

const DEPT_LABEL: Record<string, string> = {
  KURIKULUM: 'Kurikulum', KESISWAAN: 'Kesiswaan', TATA_USAHA: 'Tata Usaha',
  KEUANGAN: 'Keuangan', SARPRAS: 'Sarpras', LAYSUS: 'Laysus',
};

/** Jabatan pokok untuk tampilan — kind tendik, atau 'Guru'/'Tendik'. */
const jabatanLabel = (e: EmployeeDto) =>
  e.staffKind
    ? (STAFF_KIND_LABELS[e.staffKind as StaffKind] ?? e.staffKind)
    : GTK_TYPE_LABELS[GTK_GROUP[e.type] ?? 'TENDIK'];
const dutyLabel = (d?: string | null) =>
  d ? (ADDITIONAL_DUTY_LABELS[d as AdditionalDuty] ?? d) : '—';
const jenisLabel = (t: string) =>
  GTK_TYPE_LABELS[GTK_GROUP[t] ?? 'TENDIK'] ??
  EMPLOYEE_TYPE_LABELS[t as EmployeeType] ??
  t;

export function EmployeesView({ jenis }: { jenis: GtkType }) {
  const { confirm, dialog } = useConfirm();
  const [rows, setRows] = useState<EmployeeDto[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [kind, setKind] = useState('');
  const [dept, setDept] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [withAccount, setWithAccount] = useState(false);
  const [formJenis, setFormJenis] = useState<GtkType>(jenis);
  const [busy, setBusy] = useState(false);
  // Import modal — langkah: instruksi → pilih file → preview → konfirmasi → hasil.
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<EmployeeImportPreviewRow[] | null>(null);
  const [makeAccounts, setMakeAccounts] = useState(true);
  const [importResult, setImportResult] = useState<EmployeeImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback((k: string, d: string, q: string) => {
    setLoading(true);
    listEmployees(jenis, q || undefined, d || undefined, k || undefined)
      .then((r) => {
        setRows(r);
        setLoadError(null);
      })
      .catch(() => setLoadError('Gagal memuat data GTK.'))
      .finally(() => setLoading(false));
  }, [jenis]);

  useEffect(() => {
    listRoles().then(setRoles).catch(() => setRoles([]));
  }, []);

  // Realtime — search di-debounce.
  const firstRun = useRef(true);
  useEffect(() => {
    const t = setTimeout(() => load(kind, dept, search), firstRun.current ? 0 : search ? 350 : 100);
    firstRun.current = false;
    return () => clearTimeout(t);
  }, [kind, dept, search, load]);

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportFile(file);
    setPreview(null);
    setImportResult(null);
    setError(null);
    setBusy(true);
    try {
      const res = await previewEmployeeImport(file);
      setPreview(res.preview ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'File tidak dapat dibaca.');
      setImportFile(null);
    } finally {
      setBusy(false);
    }
  }

  async function commitImport() {
    if (!importFile) return;
    setBusy(true);
    setError(null);
    try {
      const res = await importEmployees(importFile, { accounts: makeAccounts });
      setImportResult(res);
      setPreview(null);
      load(kind, dept, search);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import gagal.');
    } finally {
      setBusy(false);
    }
  }

  const previewReady = preview?.filter((p) => p.action !== 'LEWATI') ?? [];

  async function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const val = (k: string) => String(f.get(k) ?? '').trim() || undefined;
    const wantsAccount = f.get('makeAccount') === 'on';
    const t = (val('type') ?? 'TEACHER') as GtkType;
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
        type: t,
        staffKind: t === 'TENDIK' ? val('staffKind') : undefined,
        additionalDuty: val('additionalDuty'),
        email: val('email'),
        phone: val('phone'),
        ...(wantsAccount
          ? { password: val('password'), roleKey: val('roleKey') }
          : {}),
      });
      e.currentTarget.reset();
      setWithAccount(false);
      setFormJenis(jenis);
      setShowForm(false);
      setNotice('GTK ditambahkan.');
      load(kind, dept, search);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Gagal menambah pegawai.',
      );
    } finally {
      setBusy(false);
    }
  }

  const title = jenis === 'TEACHER' ? 'GTK — Guru' : 'GTK — Tendik';

  return (
    <Shell>
      <PageTitle
        title={title}
        subtitle={
          jenis === 'TEACHER'
            ? 'Guru — wakasek dicatat lewat Tugas Tambahan, bisa sekaligus dibuatkan akun'
            : 'Tenaga kependidikan — TU, Laysus, Satpam, Kepala Sekolah, beserta tugas tambahannya'
        }
        actions={
          <span className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => { setImportOpen(true); setImportFile(null); setPreview(null); setImportResult(null); }}>
              ⭱ Import Excel
            </Button>
            <Button size="sm" variant={showForm ? 'ghost' : 'primary'} onClick={() => setShowForm((v) => !v)}>
              {showForm ? 'Tutup' : '+ Tambah GTK'}
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
          {importResult.accounts.length ? (
            <div className="mt-2">
              <p className="text-xs font-bold uppercase tracking-wider text-primary-700">Akun login dibuat — catat &amp; berikan ke pegawai:</p>
              <ul className="mt-1 space-y-0.5 text-xs">
                {importResult.accounts.map((a, i) => (
                  <li key={i} className="font-mono">
                    {a.name} — login <b>{a.login}</b> · password <b>{a.password}</b>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
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

      <Modal open={importOpen} onClose={() => setImportOpen(false)} title="Import GTK dari Excel" size="xl">
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-bold">Sebelum import, pastikan:</p>
          <ul className="mt-1 list-disc pl-5">
            <li>Unduh template — sheet <b>Petunjuk</b> berisi format &amp; contoh tiap kolom (Jenis, Jabatan, Tugas Tambahan).</li>
            <li>NIP/NUPTK/email/HP yang sudah terdata akan <b>diperbarui</b>, bukan dibuat dobel.</li>
            <li>Akun login dibuat untuk pegawai baru yang punya email/HP — role mengikuti tugas/jabatan; kosongkan <b>password</b> untuk digenerate acak.</li>
          </ul>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => downloadEmployeeTemplate().catch(() => setError('Gagal mengunduh template.'))}>
            ⭳ Unduh Template
          </Button>
        </div>

        <div className="mt-4">
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onPickFile} />
          <Button variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy && !preview ? 'Membaca…' : importFile ? `Ganti file (${importFile.name})` : 'Pilih File Excel'}
          </Button>
        </div>

        <label className="mt-3 flex items-center gap-2 text-sm font-semibold text-sand-800">
          <input type="checkbox" checked={makeAccounts} onChange={(e) => setMakeAccounts(e.target.checked)} className="size-4 accent-primary-700" />
          Buatkan akun login untuk GTK baru (role mengikuti tugas/jabatan)
        </label>

        {preview ? (
          <div className="mt-4 max-h-72 overflow-auto rounded-xl border border-sand-200">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-sand-50 text-left text-sand-500">
                <tr>
                  <th className="px-3 py-2">Baris</th><th className="px-3 py-2">Nama</th><th className="px-3 py-2">Jabatan / Tugas</th>
                  <th className="px-3 py-2">Email / HP</th><th className="px-3 py-2">Bidang</th><th className="px-3 py-2">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((p) => (
                  <tr key={p.row} className={p.action === 'LEWATI' ? 'bg-red-50/60 text-red-800' : ''}>
                    <td className="px-3 py-1.5">{p.row}</td>
                    <td className="px-3 py-1.5 font-semibold">{p.name}</td>
                    <td className="px-3 py-1.5">
                      {p.staffKind
                        ? (STAFF_KIND_LABELS[p.staffKind as StaffKind] ?? p.staffKind)
                        : jenisLabel(p.type ?? '')}
                      {p.additionalDuty ? (
                        <span className="block text-sand-400">{dutyLabel(p.additionalDuty)}</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-1.5">{p.email ?? p.phone ?? '—'}</td>
                    <td className="px-3 py-1.5">{p.department ? (DEPT_LABEL[p.department] ?? p.department) : '—'}</td>
                    <td className="px-3 py-1.5">
                      <Badge tone={p.action === 'BARU' ? 'primary' : p.action === 'UPDATE' ? 'accent' : 'neutral'}>{p.action}</Badge>
                      {p.error ? <span className="ml-1 text-red-600">{p.error}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {preview ? (
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setImportFile(null); setPreview(null); }}>Batal</Button>
            <Button disabled={busy || previewReady.length === 0} onClick={commitImport}>
              {busy ? 'Mengimport…' : `Import ${previewReady.length} data`}
            </Button>
          </div>
        ) : null}
      </Modal>

      {showForm ? (
        <Modal
          open
          onClose={() => setShowForm(false)}
          title="Tambah GTK"
          description="Guru atau tenaga kependidikan — opsional sekaligus buatkan akun login."
          size="xl"
        >
          <form onSubmit={onCreate} className="grid gap-4 sm:grid-cols-2">
            <Field label="Nama Lengkap" className="sm:col-span-2">
              <Input name="name" required />
            </Field>
            <Field label="NIP/NUPTK">
              <Input name="nip" />
            </Field>
            <Field label="Jenis" hint="Guru atau Tendik (tenaga kependidikan)">
              <Select
                name="type"
                required
                value={formJenis}
                onChange={(e) => setFormJenis(e.target.value as GtkType)}
              >
                <option value="TEACHER">Guru</option>
                <option value="TENDIK">Tendik</option>
              </Select>
            </Field>
            {formJenis === 'TENDIK' ? (
              <Field label="Jabatan" hint="Jabatan pokok tendik">
                <Select name="staffKind" required defaultValue="TU">
                  {STAFF_KINDS.map((k) => (
                    <option key={k} value={k}>{STAFF_KIND_LABELS[k]}</option>
                  ))}
                </Select>
              </Field>
            ) : null}
            <Field
              label="Tugas Tambahan"
              hint="Mis. Wakasek Kurikulum untuk guru, Bendahara BOS untuk tendik — kosongkan bila tidak ada"
            >
              <Select name="additionalDuty" defaultValue="">
                <option value="">— Tidak ada —</option>
                {ADDITIONAL_DUTIES.map((d) => (
                  <option key={d} value={d}>{ADDITIONAL_DUTY_LABELS[d]}</option>
                ))}
              </Select>
            </Field>
            <Field label="Email" hint="Diperlukan untuk login akun">
              <Input name="email" type="email" />
            </Field>
            <Field label="Telepon" hint="Bisa dipakai login jika email kosong">
              <Input name="phone" />
            </Field>
            <p className="sm:col-span-2 -my-1 text-xs text-sand-500">
              Bidang mengikuti tugas tambahan/jabatan otomatis — wakasek Kurikulum → bidang Kurikulum, Bendahara → Keuangan, TU → Tata Usaha.
            </p>

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
        {jenis === 'TENDIK' ? (
          <label className="flex min-w-36 flex-col gap-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-sand-500">Jabatan</span>
            <Select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">Semua</option>
              {STAFF_KINDS.map((k) => (
                <option key={k} value={k}>{STAFF_KIND_LABELS[k]}</option>
              ))}
            </Select>
          </label>
        ) : null}
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
          <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nama / NIP/NUPTK…" />
        </label>
      </div>

      <DataTable
        head={['Nama', 'NIP/NUPTK', 'Jabatan', 'Tugas Tambahan', 'Bidang', 'Kontak', '']}
        loading={loading}
        error={loadError}
        empty={rows.length === 0 ? `Belum ada ${jenis === 'TEACHER' ? 'guru' : 'tendik'}.` : undefined}
      >
        {rows.map((e) => (
          <tr key={e.id} className={e.isActive ? '' : 'opacity-55'}>
            <td className="px-5 py-3.5">
              <Link href={`/kepegawaian/${e.id}`} className="font-semibold text-sand-900 hover:text-primary-700 hover:underline">
                {e.name}
              </Link>
              {!e.isActive ? <span className="ml-2 text-xs text-sand-400">(nonaktif)</span> : null}
            </td>
            <td className="px-5 py-3.5 text-sand-600">{e.nip ?? '—'}</td>
            <td className="px-5 py-3.5 text-sand-600">{jabatanLabel(e)}</td>
            <td className="px-5 py-3.5 text-sand-600">{dutyLabel(e.additionalDuty)}</td>
            <td className="px-5 py-3.5 text-sand-600">
              {e.department ? (DEPT_LABEL[e.department] ?? e.department) : '—'}
              {e.isDeptHead ? <Badge tone="accent" className="ml-1">Kepala</Badge> : null}
            </td>
            <td className="px-5 py-3.5 text-sand-600">
              {e.email ?? '—'}
              {e.phone ? <span className="block text-xs text-sand-400">{e.phone}</span> : null}
            </td>
            <td className="px-5 py-3.5 text-right">
              <span className="flex justify-end gap-2">
                <Link href={`/kepegawaian/${e.id}`}>
                  <RowBtn type="button" tone="neutral">Detail</RowBtn>
                </Link>
                <RowBtn
                  type="button"
                  tone="danger"
                  onClick={async () => {
                    if (!(await confirm(`Hapus/nonaktifkan ${e.name}? Pegawai yang punya data terkait hanya dinonaktifkan.`))) return;
                    try {
                      const r = await deleteEmployee(e.id);
                      setNotice(r.deleted ? `${e.name} dihapus.` : `${e.name} dinonaktifkan — ${r.reason ?? ''}`);
                      load(kind, dept, search);
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Gagal menghapus.');
                    }
                  }}
                >
                  Hapus
                </RowBtn>
              </span>
            </td>
          </tr>
        ))}
      </DataTable>
      {dialog}
    </Shell>
  );
}
