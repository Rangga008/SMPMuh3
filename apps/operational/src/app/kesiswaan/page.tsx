'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  STUDENT_STATUS_LABELS,
  type StudentDto,
} from '@smpmuh3/types';
import { Badge, Button, Field, Input, Modal, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { DataTable } from '@/components/data-table';
import { PageTitle } from '@/components/widgets';
import { rowActionClasses } from '@/components/row-btn';
import { createStudent, listStudents, listAcademicYears, listClasses } from '@/lib/api';
import { downloadStudentTemplate, importStudentsDapodik } from '@/lib/api-ops';

const tone = (s: string) => (s === 'ACTIVE' ? 'primary' : 'neutral');

export default function StudentsPage() {
  const [rows, setRows] = useState<StudentDto[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importYear, setImportYear] = useState<{ id: string; name: string } | null>(null);
  const [importClasses, setImportClasses] = useState<{ id: string; name: string }[]>([]);
  const [importClassId, setImportClassId] = useState('');
  const [importPreview, setImportPreview] = useState<{ row: number; name: string; ok: boolean; msg: string; nis?: string | null; nisn?: string | null; kelas?: string | null; hp?: string | null }[] | null>(null);
  const [importResult, setImportResult] = useState<{ ok: number; failed: number; results: { row: number; name: string; ok: boolean; msg: string }[] } | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  async function openImport() {
    setImportOpen(true);
    setImportFile(null);
    setImportPreview(null);
    setImportResult(null);
    setImportClassId('');
    try {
      const ys = await listAcademicYears();
      const y = ys.find((x) => x.isActive) ?? ys[0];
      if (!y) { setError('Tahun ajaran aktif tidak ada.'); return; }
      setImportYear(y);
      setImportClasses(await listClasses(y.id));
    } catch { setError('Gagal memuat tahun ajaran/rombel.'); }
  }

  async function runPreview(file: File, classId: string) {
    if (!importYear) return;
    setBusy(true);
    setError(null);
    try {
      const map = Object.fromEntries(importClasses.map((c) => [c.name.toLowerCase(), c.id]));
      const r = await importStudentsDapodik(importYear.id, map, file, true, classId || undefined);
      setImportPreview(r.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'File tidak dapat dibaca.');
      setImportFile(null);
      setImportPreview(null);
    } finally { setBusy(false); }
  }

  async function pickImport(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setImportFile(f);
    setImportPreview(null);
    await runPreview(f, importClassId);
  }

  async function onPickImportClass(v: string) {
    setImportClassId(v);
    if (importFile) await runPreview(importFile, v);
  }

  async function commitStudentImport() {
    if (!importFile || !importYear) return;
    setBusy(true);
    setError(null);
    try {
      const map = Object.fromEntries(importClasses.map((c) => [c.name.toLowerCase(), c.id]));
      const r = await importStudentsDapodik(importYear.id, map, importFile, false, importClassId || undefined);
      setImportResult(r);
      setImportPreview(null);
      load({ search, status });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import gagal — cek format kolom file.');
    } finally { setBusy(false); }
  }
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback((q: { search?: string; status?: string }) => {
    setLoading(true);
    listStudents(q)
      .then(setRows)
      .catch(() => setError('Gagal memuat data siswa.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load({});
  }, [load]);

  function onSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    load({ search, status });
  }

  async function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const val = (k: string) => String(f.get(k) ?? '').trim() || undefined;
    setError(null);
    setBusy(true);
    try {
      await createStudent({
        name: String(f.get('name') ?? '').trim(),
        nis: val('nis'),
        nisn: val('nisn'),
        nik: val('nik'),
        gender: val('gender'),
        birthPlace: val('birthPlace'),
        birthDate: val('birthDate'),
        address: val('address'),
        parentName: val('parentName'),
        parentPhone: val('parentPhone'),
      });
      e.currentTarget.reset();
      setShowForm(false);
      load({ search, status });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menambah siswa.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <PageTitle
        title="Data Siswa"
        subtitle="Kelola data kesiswaan"
        actions={
          <>
            <Button size="sm" variant="outline" onClick={openImport}>
              ⭱ Import Dapodik
            </Button>
            <Link href="/kesiswaan/orang-tua" className={rowActionClasses('neutral')}>
              Orang Tua →
            </Link>
            <Button size="sm" variant={showForm ? 'ghost' : 'primary'} onClick={() => setShowForm((v) => !v)}>
              {showForm ? 'Tutup' : '+ Tambah Siswa'}
            </Button>
          </>
        }
      />

      {error ? (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
      ) : null}
      {notice ? (
        <p role="status" className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{notice}</p>
      ) : null}

      {showForm ? (
        <Modal
          open
          onClose={() => setShowForm(false)}
          title="Tambah Siswa"
          size="xl"
        >
          <form onSubmit={onCreate} className="grid gap-4 sm:grid-cols-2">
            <Field label="Nama Lengkap" className="sm:col-span-2">
              <Input name="name" required />
            </Field>
            <Field label="NIS">
              <Input name="nis" />
            </Field>
            <Field label="NISN">
              <Input name="nisn" />
            </Field>
            <Field label="NIK" hint="16 digit — boleh diisi nanti.">
              <Input name="nik" inputMode="numeric" maxLength={16} />
            </Field>
            <Field label="Jenis Kelamin">
              <Select name="gender" defaultValue="">
                <option value="">Pilih…</option>
                <option value="MALE">Laki-laki</option>
                <option value="FEMALE">Perempuan</option>
              </Select>
            </Field>
            <Field label="Tempat Lahir">
              <Input name="birthPlace" />
            </Field>
            <Field label="Tanggal Lahir">
              <Input name="birthDate" type="date" />
            </Field>
            <Field label="Alamat">
              <Input name="address" />
            </Field>
            <Field label="Nama Orang Tua/Wali" hint="Sama seperti nama ortu di pendaftaran.">
              <Input name="parentName" />
            </Field>
            <Field label="No. HP Orang Tua" hint="Bila cocok dengan akun ortu, siswa otomatis tertaut.">
              <Input name="parentPhone" inputMode="tel" placeholder="08…" />
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={busy}>
                {busy ? 'Menyimpan…' : 'Simpan'}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      <form
        onSubmit={onSearch}
        className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl border border-sand-200 bg-white p-4 shadow-card"
      >
        <label className="flex min-w-40 flex-[2] flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-sand-500">Pencarian</span>
          <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nama / NIS / NISN…" />
        </label>
        <label className="flex min-w-40 flex-1 flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-sand-500">Status</span>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Semua</option>
            {Object.entries(STUDENT_STATUS_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
        </label>
        <Button type="submit">Terapkan</Button>
      </form>

      <DataTable
        head={['Nama', 'NIS', 'NISN', 'L/P', 'Status', '']}
        loading={loading}
        error={error}
        empty={rows.length === 0 ? 'Belum ada siswa.' : undefined}
      >
        {rows.map((s) => (
          <tr key={s.id}>
            <td className="px-5 py-3.5 font-semibold text-sand-900">{s.name}</td>
            <td className="px-5 py-3.5 text-sand-600">{s.nis ?? '—'}</td>
            <td className="px-5 py-3.5 text-sand-600">{s.nisn ?? '—'}</td>
            <td className="px-5 py-3.5 text-sand-600">
              {s.gender === 'MALE' ? 'L' : s.gender === 'FEMALE' ? 'P' : '—'}
            </td>
            <td className="px-5 py-3.5">
              <Badge tone={tone(s.status)}>{STUDENT_STATUS_LABELS[s.status]}</Badge>
            </td>
            <td className="px-5 py-3.5 text-right">
              <Link href={`/kesiswaan/${s.id}`} className={rowActionClasses('neutral')}>
                Detail
              </Link>
            </td>
          </tr>
        ))}
      </DataTable>

      <Modal open={importOpen} onClose={() => setImportOpen(false)} title="Import Siswa dari Dapodik" size="xl">
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-bold">Sebelum import, pastikan:</p>
          <ul className="mt-1 list-disc pl-5">
            <li>Kolom file: <b>nama, nis, nisn, nik, jk/gender, tempat_lahir, tanggal_lahir, alamat, sekolah_asal, nama_ayah (atau nama_ortu), nama_ibu, hp_ortu, kelas</b>.</li>
            <li>NIS/NISN yang sudah terdata <b>dilewati</b> — tidak dibuat dobel.</li>
            <li>Kolom <b>kelas</b> mencocokkan nama rombel tahun ajaran aktif (mis. 7A).</li>
            <li>No. HP ortu yang cocok dengan akun ortu SPMB otomatis <b>menautkan</b> siswa ke akun itu.</li>
          </ul>
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <input ref={importFileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={pickImport} />
          <Button variant="outline" disabled={busy || !importYear} onClick={() => importFileRef.current?.click()}>
            {busy && importFile && !importPreview ? 'Membaca file…' : importFile ? `Ganti file (${importFile.name})` : 'Pilih File Excel'}
          </Button>
          <Button
            variant="outline"
            disabled={busy || !importYear}
            onClick={async () => {
              try { await downloadStudentTemplate(importYear!.id); }
              catch { setError('Gagal mengunduh template.'); }
            }}
          >
            ⭳ Unduh Template
          </Button>
          <label className="flex min-w-52 flex-col gap-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-sand-500">Masukkan ke Rombel</span>
            <Select value={importClassId} onChange={(e) => onPickImportClass(e.target.value)} disabled={!importYear}>
              <option value="">Ikuti kolom "kelas" di file</option>
              {importClasses.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </label>
        </div>
        <p className="mt-2 text-xs text-sand-500">
          {importYear ? `Tahun ajaran aktif: ${importYear.name} · ${importClasses.length} rombel` : 'Memuat tahun ajaran…'}
          {importClassId ? ' — semua baris file diabaikan kolom kelasnya, masuk ke rombel pilihan ini.' : ''}
        </p>
        {importPreview ? (
          <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
            <p className="font-bold">PRATINJAU — belum ada data yang disimpan.</p>
            <p className="mt-0.5 text-xs">
              {importPreview.filter((p) => p.ok).length} baris siap diimport · {importPreview.filter((p) => !p.ok).length} dilewati (duplikat/nama kosong).
              Periksa lalu klik tombol Import di bawah.
            </p>
          </div>
        ) : null}
        {importPreview ? (
          <div className="mt-2 max-h-72 overflow-auto rounded-xl border border-sand-200">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-sand-50 text-left text-sand-500">
                <tr><th className="px-3 py-2">Baris</th><th className="px-3 py-2">Nama</th><th className="px-3 py-2">NIS</th><th className="px-3 py-2">NISN</th><th className="px-3 py-2">HP Ortu</th><th className="px-3 py-2">Rombel</th><th className="px-3 py-2">Hasil Cek</th></tr>
              </thead>
              <tbody>
                {importPreview.map((p) => (
                  <tr key={p.row} className={p.ok ? '' : 'bg-red-50/60 text-red-800'}>
                    <td className="px-3 py-1.5">{p.row}</td>
                    <td className="px-3 py-1.5 font-semibold">{p.name}</td>
                    <td className="px-3 py-1.5">{p.nis ?? '—'}</td>
                    <td className="px-3 py-1.5">{p.nisn ?? '—'}</td>
                    <td className="px-3 py-1.5">{p.hp ?? '—'}</td>
                    <td className="px-3 py-1.5">{p.kelas ?? '—'}</td>
                    <td className="px-3 py-1.5">{p.msg}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {importPreview ? (
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setImportFile(null); setImportPreview(null); }}>Batal</Button>
            <Button disabled={busy || !importPreview.some((p) => p.ok)} onClick={commitStudentImport}>
              {busy ? 'Mengimport…' : `Import ${importPreview.filter((p) => p.ok).length} siswa`}
            </Button>
          </div>
        ) : null}
        {importResult ? (
          <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Selesai — {importResult.ok} masuk, {importResult.failed} gagal.
            {importResult.failed ? ` Baris: ${importResult.results.filter((x) => !x.ok).slice(0, 5).map((x) => `${x.row}(${x.msg})`).join(', ')}` : ''}
          </p>
        ) : null}
      </Modal>
    </Shell>
  );
}
