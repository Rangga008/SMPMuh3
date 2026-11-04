'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Field, Input } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { PageTitle, Widget } from '@/components/widgets';
import {
  getSchool,
  updateSchool,
  uploadSchoolLogo,
  uploadSchoolSignature,
  type School,
} from '@/lib/api';

/** Profil & kontak sekolah — dipakai situs SPMB publik, kop kwitansi/slip/laporan, dan favicon. */
export default function SchoolProfilePage() {
  const [school, setSchool] = useState<School | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [logoVer, setLogoVer] = useState(0);
  const logoRef = useRef<HTMLInputElement>(null);
  const sigRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const s = await getSchool();
      setSchool(s);
      setLogoVer(new Date(s.updatedAt).getTime());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat profil.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run<T>(fn: () => Promise<T>, msg: string) {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await fn();
      await load();
      setNotice(msg);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <PageTitle
        title="Profil & Kontak Sekolah"
        subtitle="Ditampilkan di situs SPMB publik, sidebar admin, favicon, dan kop dokumen (kwitansi, slip gaji, laporan)."
      />
      {error ? (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
      ) : null}
      {notice ? (
        <p role="status" className="mb-4 rounded-xl bg-primary-50 px-4 py-3 text-sm font-medium text-primary-800">{notice}</p>
      ) : null}

      <Widget title="Identitas Sekolah">
        {school ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto]">
            <form
              className="grid gap-4 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void run(
                  () =>
                    updateSchool({
                      name: String(f.get('name')),
                      tagline: String(f.get('tagline') || ''),
                      address: String(f.get('address') || ''),
                      phone: String(f.get('phone') || ''),
                      whatsapp: String(f.get('whatsapp') || ''),
                      email: String(f.get('email') || ''),
                      headmaster: String(f.get('headmaster') || ''),
                      headmasterNip: String(f.get('headmasterNip') || ''),
                    }),
                  'Profil sekolah diperbarui — situs publik menampilkannya dalam ±5 menit.',
                );
              }}
            >
              <Field label="Nama Sekolah">
                <Input name="name" required defaultValue={school.name} />
              </Field>
              <Field label="Tagline / Slogan">
                <Input name="tagline" defaultValue={school.tagline ?? ''} placeholder="cth: Sekolah Unggul & Islami" />
              </Field>
              <Field label="Telepon">
                <Input name="phone" defaultValue={school.phone ?? ''} placeholder="022-xxxxxxx" />
              </Field>
              <Field label="WhatsApp">
                <Input name="whatsapp" defaultValue={school.whatsapp ?? ''} placeholder="08xxxxxxxxxx" />
              </Field>
              <Field label="Email">
                <Input name="email" type="email" defaultValue={school.email ?? ''} />
              </Field>
              <Field label="Alamat">
                <Input name="address" defaultValue={school.address ?? ''} />
              </Field>
              <Field label="Nama Kepala Sekolah" hint="Tercetak di bagian tanda tangan slip gaji & dokumen resmi">
                <Input name="headmaster" defaultValue={school.headmaster ?? ''} placeholder="mis. Drs. H. Ahmad Syaefulloh" />
              </Field>
              <Field label="NIP Kepala Sekolah" hint="Opsional — tercetak di bawah nama">
                <Input name="headmasterNip" defaultValue={school.headmasterNip ?? ''} placeholder="mis. 196605151990031007" />
              </Field>
              <div className="sm:col-span-2">
                <Button type="submit" disabled={busy}>
                  {busy ? 'Menyimpan…' : 'Simpan Profil'}
                </Button>
              </div>
            </form>
            <div className="flex w-44 flex-col items-center gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-sand-500">
                Logo & Favicon
              </p>
              {school.logoUrl ? (
                <img
                  src={`/logo.png?v=${logoVer}`}
                  alt="Logo sekolah"
                  className="size-28 rounded-2xl border border-sand-200 bg-white object-contain p-2"
                />
              ) : (
                <span className="flex size-28 items-center justify-center rounded-2xl border border-dashed border-sand-300 bg-sand-50 text-center text-xs text-sand-400">
                  Belum ada logo
                </span>
              )}
              <input
                ref={logoRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  await run(
                    () => uploadSchoolLogo(file),
                    'Logo diperbarui — juga dipakai sebagai favicon.',
                  );
                }}
              />
              <Button size="sm" variant="outline" disabled={busy} onClick={() => logoRef.current?.click()}>
                {school.logoUrl ? 'Ganti Logo' : 'Unggah Logo'}
              </Button>
              <p className="text-center text-xs leading-relaxed text-sand-400">
                PNG/JPG/WebP/SVG maks 3 MB. Dipakai di header situs SPMB,
                sidebar admin, dan favicon.
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-sand-400">Memuat profil…</p>
        )}
      </Widget>

      <Widget title="Tanda Tangan Kepala Sekolah" className="mt-5">
        {school ? (
          <div className="flex flex-wrap items-center gap-6">
            {school.headmasterSignatureUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/signature.png?v=${logoVer}`}
                alt="Tanda tangan kepala sekolah"
                className="h-24 w-44 rounded-xl border border-sand-200 bg-white object-contain p-2"
              />
            ) : (
              <span className="flex h-24 w-44 items-center justify-center rounded-xl border border-dashed border-sand-300 bg-sand-50 text-center text-xs text-sand-400">
                Belum ada tanda tangan
              </span>
            )}
            <div className="min-w-56 space-y-2">
              <p className="text-sm text-sand-600">
                Foto/scan tanda tangan ini tercetak otomatis di bagian tanda
                tangan kepala sekolah pada kwitansi, slip gaji, dan dokumen resmi
                — tidak perlu tanda tangan basah satu per satu.
              </p>
              <input
                ref={sigRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  await run(
                    () => uploadSchoolSignature(file),
                    'Tanda tangan diperbarui — langsung dipakai di semua cetakan.',
                  );
                }}
              />
              <Button size="sm" variant="outline" disabled={busy} onClick={() => sigRef.current?.click()}>
                {school.headmasterSignatureUrl ? 'Ganti Tanda Tangan' : 'Unggah Tanda Tangan'}
              </Button>
              <p className="text-xs text-sand-400">
                PNG/JPG/WebP maks 3 MB — hasil scan/foto, latar putih/polos paling rapi.
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-sand-400">Memuat profil…</p>
        )}
      </Widget>
    </Shell>
  );
}
