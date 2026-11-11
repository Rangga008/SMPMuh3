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
  createGtkOption,
  deleteEmployee,
  deleteGtkOption,
  downloadEmployeeTemplate,
  importEmployees,
  listEmployees,
  listGtkOptions,
  listOrphanAccounts,
  listRoles,
  previewEmployeeImport,
  updateGtkOption,
  type EmployeeDto,
  type EmployeeImportPreviewRow,
  type EmployeeImportResult,
  type GtkOption,
  type OrphanAccount,
  type RoleOption,
} from '@/lib/api';
import { RowBtn } from '@/components/row-btn';
import { PickSelect } from '@/components/pick-select';
import { useConfirm } from '@/components/confirm-dialog';

const DEPT_LABEL: Record<string, string> = {
  KURIKULUM: 'Kurikulum', KESISWAAN: 'Kesiswaan', TATA_USAHA: 'Tata Usaha',
  KEUANGAN: 'Keuangan', SARPRAS: 'Sarpras', LAYSUS: 'Laysus',
};

const jenisLabel = (t: string) =>
  GTK_TYPE_LABELS[GTK_GROUP[t] ?? 'TENDIK'] ??
  EMPLOYEE_TYPE_LABELS[t as EmployeeType] ??
  t;

export function EmployeesView({ jenis }: { jenis: GtkType }) {
  const { confirm, dialog } = useConfirm();
  const [rows, setRows] = useState<EmployeeDto[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [kind, setKind] = useState('');
  const [duty, setDuty] = useState('');
  const [search, setSearch] = useState('');
  const [otherCount, setOtherCount] = useState<number | null>(null);
  const [orphans, setOrphans] = useState<OrphanAccount[] | null>(null);
  const [opts, setOpts] = useState<GtkOption[]>([]);
  const [optsOpen, setOptsOpen] = useState(false);
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
    listEmployees(jenis, q || undefined, undefined, k || undefined, d || undefined)
      .then((r) => {
        setRows(r);
        setLoadError(null);
        // Petunjuk lintas-tab — pencarian kosong di tab ini bisa jadi
        // ketemu di tab satunya (guru dicari di tendik, dst).
        if (q && r.length === 0) {
          const other = jenis === 'TEACHER' ? 'TENDIK' : 'TEACHER';
          listEmployees(other, q)
            .then((x) => setOtherCount(x.length))
            .catch(() => setOtherCount(null));
        } else {
          setOtherCount(null);
        }
      })
      .catch(() => setLoadError('Gagal memuat data GTK.'))
      .finally(() => setLoading(false));
  }, [jenis]);

  useEffect(() => {
    listRoles().then(setRoles).catch(() => setRoles([]));
    listGtkOptions().then(setOpts).catch(() => setOpts([]));
    listOrphanAccounts().then(setOrphans).catch(() => setOrphans(null));
  }, []);

  // Realtime — search di-debounce.
  const firstRun = useRef(true);
  useEffect(() => {
    const t = setTimeout(() => load(kind, duty, search), firstRun.current ? 0 : search ? 350 : 100);
    firstRun.current = false;
    return () => clearTimeout(t);
  }, [kind, duty, search, load]);

  /** Label dinamis — opsi DB dulu, konstanta bawaan sebagai cadangan. */
  const kindLabel = (code?: string | null) => {
    if (!code) return null;
    return (
      opts.find((o) => o.group === 'STAFF_KIND' && o.code === code)?.label ??
      STAFF_KIND_LABELS[code as StaffKind] ??
      code
    );
  };
  const dutyLabel = (code?: string | null) => {
    if (!code) return '—';
    return (
      opts.find((o) => o.group === 'DUTY' && o.code === code)?.label ??
      ADDITIONAL_DUTY_LABELS[code as AdditionalDuty] ??
      code
    );
  };
  const jabatanLabel = (e: EmployeeDto) =>
    kindLabel(e.staffKind) ?? GTK_TYPE_LABELS[GTK_GROUP[e.type] ?? 'TENDIK'];

  // Opsi untuk select/filter — DB dulu, konstanta bila tabel masih kosong.
  const kindSelect = opts.some((o) => o.group === 'STAFF_KIND' && o.isActive)
    ? opts.filter((o) => o.group === 'STAFF_KIND' && o.isActive)
    : STAFF_KINDS.map((k) => ({ id: k, code: k, label: STAFF_KIND_LABELS[k] }));
  const dutySelect = opts.some((o) => o.group === 'DUTY' && o.isActive)
    ? opts.filter((o) => o.group === 'DUTY' && o.isActive)
    : ADDITIONAL_DUTIES.map((d) => ({ id: d, code: d, label: ADDITIONAL_DUTY_LABELS[d] }));
  // Filter menampilkan semua opsi (aktif+nonaktif) agar nilai historis tetap bisa disaring.
  const kindFilter = opts.filter((o) => o.group === 'STAFF_KIND').length
    ? opts.filter((o) => o.group === 'STAFF_KIND')
    : kindSelect;
  const dutyFilter = opts.filter((o) => o.group === 'DUTY').length
    ? opts.filter((o) => o.group === 'DUTY')
    : dutySelect;

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
      load(kind, duty, search);
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
      load(kind, duty, search);
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
            <Button size="sm" variant="outline" onClick={() => setOptsOpen(true)}>
              ⚙ Jabatan &amp; Tugas
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setImportOpen(true); setImportFile(null); setPreview(null); setImportResult(null); }}>
              ⭱ Import Excel
            </Button>
            <Button size="sm" variant={showForm ? 'ghost' : 'primary'} onClick={() => setShowForm((v) => !v)}>
              {showForm ? 'Tutup' : '+ Tambah GTK'}
            </Button>
          </span>
        }
      />

      {orphans?.length ? (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-bold">
            {orphans.length} akun login belum tertaut ke data GTK — tak akan tampil di tabel ini:
          </p>
          <ul className="mt-1 list-disc pl-5 text-xs">
            {orphans.slice(0, 6).map((o) => (
              <li key={o.id}>
                {o.name} — {o.email ?? o.phone ?? 'tanpa kontak'} ({o.roles.join(', ')})
              </li>
            ))}
            {orphans.length > 6 ? <li>…dan {orphans.length - 6} lainnya</li> : null}
          </ul>
          <p className="mt-1.5 text-xs text-amber-800">
            Buat data GTK-nya lewat tombol <b>+ Tambah GTK</b>, atau kelola akunnya di{' '}
            <Link href="/pengaturan/akun" className="font-semibold underline">Pengaturan › Akun</Link>.
          </p>
        </div>
      ) : null}

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
                      {p.staffKind ? kindLabel(p.staffKind) : jenisLabel(p.type ?? '')}
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
              <Field label="Jabatan" hint="Jabatan pokok tendik — kelola lewat tombol ⚙ di atas">
                <PickSelect
                  name="staffKind"
                  required
                  options={kindSelect.map((k) => ({ value: k.code, label: k.label }))}
                  placeholder="Ketik lalu pilih jabatan…"
                />
              </Field>
            ) : null}
            <Field
              label="Tugas Tambahan"
              hint="Mis. Wakasek Kurikulum untuk guru, Bendahara BOS untuk tendik — kelola lewat tombol ⚙ di atas"
            >
              <PickSelect
                name="additionalDuty"
                options={dutySelect.map((d) => ({ value: d.code, label: d.label }))}
                emptyLabel="— Tidak ada —"
                placeholder="Ketik lalu pilih tugas…"
              />
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
                    <PickSelect
                      name="roleKey"
                      required
                      options={roles
                        .filter((r) => r.key !== 'spmb_parent')
                        .map((r) => ({ value: r.key, label: r.name }))}
                      placeholder="Ketik lalu pilih role…"
                    />
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
          <label className="flex min-w-44 flex-col gap-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-sand-500">Jabatan</span>
            <PickSelect
              value={kind}
              onChange={setKind}
              options={kindFilter.map((k) => ({ value: k.code, label: k.label }))}
              emptyLabel="Semua"
              placeholder="Semua jabatan"
            />
          </label>
        ) : null}
        <label className="flex min-w-44 flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-sand-500">Tugas Tambahan</span>
          <PickSelect
            value={duty}
            onChange={setDuty}
            options={dutyFilter.map((d) => ({ value: d.code, label: d.label }))}
            emptyLabel="Semua"
            placeholder="Semua tugas tambahan"
          />
        </label>
        <label className="flex min-w-40 flex-1 flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-sand-500">Pencarian</span>
          <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nama / NIP/NUPTK…" />
        </label>
      </div>

      <DataTable
        head={['Nama', 'NIP/NUPTK', 'Jabatan', 'Tugas Tambahan', 'Kontak', '']}
        loading={loading}
        error={loadError}
        empty={
          rows.length === 0
            ? search
              ? `Tidak ada ${jenis === 'TEACHER' ? 'guru' : 'tendik'} bernama "${search}"${
                  otherCount
                    ? ` — tapi ada ${otherCount} di tab ${jenis === 'TEACHER' ? 'Tendik' : 'Guru'}.`
                    : '.'
                }`
              : `Belum ada ${jenis === 'TEACHER' ? 'guru' : 'tendik'}.`
            : undefined
        }
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
                      load(kind, duty, search);
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

      <Modal
        open={optsOpen}
        onClose={() => setOptsOpen(false)}
        title="Kelola Jabatan & Tugas Tambahan"
        description="Opsi ini mengisi dropdown Jabatan (tendik) dan Tugas Tambahan — perubahan langsung memengaruhi bidang & role turunan."
        size="xl"
      >
        <GtkOptionManager
          opts={opts}
          roles={roles}
          onChanged={() => listGtkOptions().then(setOpts).catch(() => undefined)}
        />
      </Modal>
      {dialog}
    </Shell>
  );
}

/** Role → bidang — bidang turunan di form opsi mengikuti role yang dipilih. */
const ROLE_TO_DEPT: Record<string, string> = {
  staff_kurikulum: 'KURIKULUM',
  staff_kesiswaan: 'KESISWAAN',
  staff_tu: 'TATA_USAHA',
  kepala_tu: 'TATA_USAHA',
  bendahara: 'KEUANGAN',
  staff_laysus: 'LAYSUS',
  spmb_admin: 'TATA_USAHA',
};

/** Panel kelola opsi GTK — tambah/rename/nonaktif/hapus jabatan & tugas tambahan. */
function GtkOptionManager({
  opts,
  roles,
  onChanged,
}: {
  opts: GtkOption[];
  roles: RoleOption[];
  onChanged: () => void;
}) {
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [group, setGroup] = useState<'STAFF_KIND' | 'DUTY'>('DUTY');
  const [addDept, setAddDept] = useState('');
  const [addRole, setAddRole] = useState('');
  const [optQuery, setOptQuery] = useState('');
  /** Baris yang sedang diedit — panel form terbuka di bawah barisnya. */
  const [editing, setEditing] = useState<{
    id: string; code: string; label: string; department: string; roleKey: string;
    isHead: boolean; sortOrder: number; isActive: boolean;
  } | null>(null);
  const { confirm, dialog } = useConfirm();

  async function act(id: string, fn: () => Promise<unknown>, okMsg: string) {
    setErr(null);
    setNote(null);
    setBusyId(id);
    try {
      await fn();
      setNote(okMsg);
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Gagal menyimpan opsi.');
    } finally {
      setBusyId(null);
    }
  }

  async function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const str = (k: string) => String(f.get(k) ?? '').trim();
    await act('new', async () => {
      await createGtkOption({
        group: str('group'),
        code: str('code'),
        label: str('label'),
        ...(addDept ? { department: addDept } : {}),
        isHead: f.get('isHead') === 'on',
        ...(str('roleKey') ? { roleKey: str('roleKey') } : {}),
      });
    }, `Opsi "${str('label')}" ditambahkan.`);
    if (!err) {
      form.reset();
      setAddDept('');
      setAddRole('');
    }
  }

  const q = optQuery.trim().toLowerCase();
  const matches = (o: GtkOption) =>
    !q || o.code.toLowerCase().includes(q) || o.label.toLowerCase().includes(q);

  const section = (g: 'STAFF_KIND' | 'DUTY', title: string, hint: string) => {
    const items = opts.filter((o) => o.group === g && matches(o));
    return (
      <div className="rounded-xl border border-sand-200">
        <p className="border-b border-sand-200 bg-sand-50 px-4 py-2.5 text-sm font-bold text-sand-800">
          {title} <span className="font-normal text-sand-400">— {hint}</span>
        </p>
        <ul className="divide-y divide-sand-100">
          {items.map((o) => (
            <li key={o.id} className={`flex flex-wrap items-center gap-2 px-4 py-2 text-sm ${o.isActive ? '' : 'opacity-50'}`}>
              <code className="rounded bg-sand-100 px-1.5 py-0.5 text-[11px] font-semibold text-sand-700">{o.code}</code>
              <span className="font-semibold text-sand-800">{o.label}</span>
              <span className="text-xs text-sand-400">
                {o.department ? `→ ${DEPT_LABEL[o.department] ?? o.department}` : 'tanpa bidang'}
                {o.isHead ? ' · kepala' : ''}
                {o.roleKey ? ` · ${o.roleKey}` : ''}
              </span>
              <span className="ml-auto flex items-center gap-1.5">
                <RowBtn
                  type="button"
                  tone="neutral"
                  disabled={busyId === o.id}
                  onClick={() =>
                    setEditing((e) =>
                      e?.id === o.id
                        ? null
                        : {
                            id: o.id,
                            code: o.code,
                            label: o.label,
                            department: o.department ?? '',
                            roleKey: o.roleKey ?? '',
                            isHead: o.isHead,
                            sortOrder: o.sortOrder,
                            isActive: o.isActive,
                          },
                    )
                  }
                >
                  {editing?.id === o.id ? 'Tutup' : 'Edit'}
                </RowBtn>
                <RowBtn
                  type="button"
                  tone="neutral"
                  disabled={busyId === o.id}
                  onClick={() =>
                    void act(
                      o.id,
                      () => updateGtkOption(o.id, { isActive: !o.isActive }),
                      o.isActive ? `"${o.label}" dinonaktifkan.` : `"${o.label}" diaktifkan kembali.`,
                    )
                  }
                >
                  {o.isActive ? 'Nonaktif' : 'Aktifkan'}
                </RowBtn>
                <RowBtn
                  type="button"
                  tone="danger"
                  disabled={busyId === o.id}
                  onClick={async () => {
                    if (!(await confirm(`Hapus opsi "${o.label}"? Pegawai yang sudah memakai nilai ini tetap menyimpan kodenya.`))) return;
                    await act(o.id, () => deleteGtkOption(o.id), `Opsi "${o.label}" dihapus.`);
                  }}
                >
                  Hapus
                </RowBtn>
              </span>
              {editing?.id === o.id ? (
                <form
                  className="mt-2 grid w-full gap-3 rounded-xl border border-primary-200 bg-primary-50/40 p-3 sm:grid-cols-2"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    const str = (k: string) => String(f.get(k) ?? '').trim();
                    const sortOrder = Number(str('sortOrder'));
                    const dto = {
                      label: str('label'),
                      department: str('department') || null,
                      roleKey: editing.roleKey || null,
                      isHead: f.get('isHead') === 'on',
                      ...(Number.isFinite(sortOrder) ? { sortOrder } : {}),
                      isActive: f.get('isActive') === 'on',
                    };
                    await act(o.id, () => updateGtkOption(o.id, dto), `Opsi ${o.code} disimpan.`);
                    setEditing(null);
                  }}
                >
                  <p className="text-xs font-bold uppercase tracking-wide text-sand-500 sm:col-span-2">
                    Edit opsi — kode <code className="rounded bg-sand-100 px-1">{editing.code}</code> (tidak berubah)
                  </p>
                  <Field label="Label">
                    <Input name="label" required defaultValue={editing.label} minLength={2} />
                  </Field>
                  <Field label="Role akun" hint="Bidang turunan mengikuti role yang dipilih">
                    <PickSelect
                      value={editing.roleKey}
                      options={roles.filter((r) => r.key !== 'spmb_parent').map((r) => ({ value: r.key, label: r.name }))}
                      emptyLabel="— Tanpa role —"
                      placeholder="Ketik lalu pilih role…"
                      onChange={(rk) =>
                        setEditing((e) =>
                          e ? { ...e, roleKey: rk, department: ROLE_TO_DEPT[rk] ?? e.department } : e,
                        )
                      }
                    />
                  </Field>
                  <Field label="Bidang turunan">
                    <Select
                      name="department"
                      value={editing.department}
                      onChange={(e) => setEditing((x) => (x ? { ...x, department: e.target.value } : x))}
                    >
                      <option value="">— Tidak ada —</option>
                      {Object.entries(DEPT_LABEL).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                      {editing.department && !DEPT_LABEL[editing.department] ? (
                        <option value={editing.department}>{editing.department}</option>
                      ) : null}
                    </Select>
                  </Field>
                  <Field label="Urutan tampil" hint="Angka kecil tampil duluan di dropdown">
                    <Input name="sortOrder" type="number" defaultValue={editing.sortOrder} />
                  </Field>
                  <div className="flex flex-wrap items-center gap-5 sm:col-span-2">
                    <label className="flex items-center gap-2 text-sm font-semibold text-sand-800">
                      <input type="checkbox" name="isHead" defaultChecked={editing.isHead} className="size-4 accent-primary-700" />
                      Menjadikan kepala bidang
                    </label>
                    <label className="flex items-center gap-2 text-sm font-semibold text-sand-800">
                      <input type="checkbox" name="isActive" defaultChecked={editing.isActive} className="size-4 accent-primary-700" />
                      Aktif (tampil di dropdown)
                    </label>
                    <span className="ml-auto flex gap-2">
                      <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(null)}>Batal</Button>
                      <Button type="submit" size="sm" disabled={busyId === o.id}>
                        {busyId === o.id ? 'Menyimpan…' : 'Simpan'}
                      </Button>
                    </span>
                  </div>
                </form>
              ) : null}
            </li>
          ))}
          {!items.length ? (
            <li className="px-4 py-3 text-sm text-sand-400">
              {q ? `Tidak ada opsi cocok "${optQuery}".` : 'Belum ada opsi — pakai daftar bawaan.'}
            </li>
          ) : null}
        </ul>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {err ? <p role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">{err}</p> : null}
      {note ? <p role="status" className="rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-800">{note}</p> : null}

      <form onSubmit={onAdd} className="grid gap-3 rounded-xl border border-primary-200 bg-primary-50/50 p-4 sm:grid-cols-2">
        <p className="text-sm font-bold text-sand-800 sm:col-span-2">Tambah opsi baru</p>
        <Field label="Grup">
          <Select name="group" value={group} onChange={(e) => setGroup(e.target.value as 'STAFF_KIND' | 'DUTY')}>
            <option value="DUTY">Tugas Tambahan</option>
            <option value="STAFF_KIND">Jabatan Tendik</option>
          </Select>
        </Field>
        <Field label="Kode" hint="Huruf besar + garis bawah — mis. WAKASEK_KESISWAAN">
          <Input name="code" required placeholder="KODE_OPSI" />
        </Field>
        <Field label="Label">
          <Input name="label" required placeholder="Nama tampilan" />
        </Field>
        <Field label="Role akun" hint="Role login pegawai — bidang turunan menyesuaikan otomatis">
          <PickSelect
            name="roleKey"
            value={addRole}
            options={roles.filter((r) => r.key !== 'spmb_parent').map((r) => ({ value: r.key, label: r.name }))}
            emptyLabel="— Bawaan —"
            placeholder="Ketik lalu pilih role…"
            onChange={(rk) => {
              setAddRole(rk);
              setAddDept(ROLE_TO_DEPT[rk] ?? '');
            }}
          />
        </Field>
        <Field label="Bidang turunan" hint="Mengikuti role yang dipilih — bisa diubah manual">
          <Select name="department" value={addDept} onChange={(e) => setAddDept(e.target.value)}>
            <option value="">— Tidak ada —</option>
            {Object.entries(DEPT_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </Select>
        </Field>
        <label className="flex items-end gap-2 pb-1 text-sm font-semibold text-sand-800">
          <input type="checkbox" name="isHead" className="size-4 accent-primary-700" />
          Menjadikan kepala bidang
        </label>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={busyId === 'new'}>
            {busyId === 'new' ? 'Menyimpan…' : '+ Tambah Opsi'}
          </Button>
        </div>
      </form>

      <Field label="Cari opsi" className="!mb-0">
        <Input
          type="search"
          value={optQuery}
          onChange={(e) => setOptQuery(e.target.value)}
          placeholder="Ketik kode atau nama opsi…"
        />
      </Field>

      {section('STAFF_KIND', 'Jabatan Tendik', 'isi kolom Jabatan untuk pegawai Tendik')}
      {section('DUTY', 'Tugas Tambahan', 'isi kolom Tugas Tambahan — guru & tendik')}
      {dialog}
    </div>
  );
}
