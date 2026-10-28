'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  REGISTRATION_EDITABLE,
  REGISTRATION_STATUS_LABELS,
  type DocumentDto,
  type RegistrationDto,
} from '@smpmuh3/types';
import { Badge, Button, Card, Container } from '@smpmuh3/ui';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import {
  checkoutInvoice,
  getRegistration,
  getTokens,
  listDocuments,
  listInvoices,
  submitRegistration,
  updateCandidate,
  updateRegistration,
  uploadDocument,
  type InvoiceView,
} from '@/lib/api';

const inputCls =
  'h-10 w-full rounded-lg border border-sand-300 px-3 text-sm font-normal focus-visible:focus-ring';
const DOC_TYPES = [
  ['form', 'Formulir'],
  ['kk', 'Kartu Keluarga'],
  ['akta', 'Akta Kelahiran'],
  ['ijazah', 'Ijazah / SKL'],
  ['foto', 'Pas Foto'],
  ['lainnya', 'Lainnya'],
] as const;

export default function PendaftaranDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [reg, setReg] = useState<RegistrationDto | null>(null);
  const [docs, setDocs] = useState<DocumentDto[]>([]);
  const [invoices, setInvoices] = useState<InvoiceView[]>([]);
  const [docType, setDocType] = useState<string>('form');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [r, d] = await Promise.all([getRegistration(id), listDocuments(id)]);
    setReg(r);
    setDocs(d);
    listInvoices(id).then(setInvoices).catch(() => setInvoices([]));
  }, [id]);

  useEffect(() => {
    if (!getTokens()) {
      router.replace('/masuk');
      return;
    }
    refresh().catch(() => setError('Gagal memuat pendaftaran'));
  }, [refresh, router]);

  if (!reg) {
    return (
      <>
        <SiteHeader />
        <main id="konten">
          <Container className="py-24 text-center text-sand-600">
            {error ?? 'Memuat…'}
          </Container>
        </main>
        <SiteFooter />
      </>
    );
  }

  const editable = REGISTRATION_EDITABLE.includes(reg.status);
  const c = reg.candidate;

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SiteHeader />
      <main
        id="konten"
        className="min-h-[60vh] bg-gradient-to-b from-primary-100/40 via-sand-50 to-sand-50"
      >
        <Container className="flex flex-col gap-8 py-12">
          <div>
            <Link
              href="/akun"
              className="text-sm font-semibold text-primary-800 hover:underline"
            >
              ← Kembali ke akun
            </Link>
            <div className="mt-3 flex flex-wrap items-center gap-4">
              <h1 className="text-2xl font-extrabold text-sand-950">
                {reg.number}
              </h1>
              <Badge tone={reg.status === 'SUBMITTED' ? 'primary' : 'accent'}>
                {REGISTRATION_STATUS_LABELS[reg.status]}
              </Badge>
            </div>
            {reg.revisionNote ? (
              <p className="mt-3 rounded-lg bg-accent-100 px-4 py-3 text-sm text-accent-900">
                Catatan revisi: {reg.revisionNote}
              </p>
            ) : null}
          </div>

          {error ? (
            <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </p>
          ) : null}

          <div className="grid gap-8 lg:grid-cols-2">
            <Card>
              <h2 className="mb-4 text-lg font-bold text-sand-950">
                Data Calon Siswa
              </h2>
              <form
                className="flex flex-col gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  run(() =>
                    Promise.all([
                      updateCandidate(c.id, {
                        name: String(fd.get('name')),
                        previousSchool:
                          String(fd.get('previousSchool')) || undefined,
                        nisn: String(fd.get('nisn')) || undefined,
                        birthPlace:
                          String(fd.get('birthPlace')) || undefined,
                        birthDate:
                          String(fd.get('birthDate')) || undefined,
                      }),
                      updateRegistration(id, String(fd.get('pathway'))),
                    ]),
                  );
                }}
              >
                <label className="text-sm font-semibold text-sand-900">
                  Nama lengkap
                  <input
                    required
                    name="name"
                    defaultValue={c.name}
                    minLength={3}
                    disabled={!editable}
                    className={inputCls}
                  />
                </label>
                <label className="text-sm font-semibold text-sand-900">
                  NISN (opsional, 10 digit)
                  <input
                    name="nisn"
                    defaultValue={c.nisn ?? ''}
                    pattern="\d{10}"
                    disabled={!editable}
                    className={inputCls}
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-sm font-semibold text-sand-900">
                    Tempat lahir
                    <input
                      name="birthPlace"
                      defaultValue={c.birthPlace ?? ''}
                      disabled={!editable}
                      className={inputCls}
                    />
                  </label>
                  <label className="text-sm font-semibold text-sand-900">
                    Tanggal lahir
                    <input
                      type="date"
                      name="birthDate"
                      defaultValue={c.birthDate?.slice(0, 10) ?? ''}
                      disabled={!editable}
                      className={inputCls}
                    />
                  </label>
                </div>
                <label className="text-sm font-semibold text-sand-900">
                  Asal sekolah
                  <input
                    name="previousSchool"
                    defaultValue={c.previousSchool ?? ''}
                    disabled={!editable}
                    className={inputCls}
                  />
                </label>
                <label className="text-sm font-semibold text-sand-900">
                  Jalur pendaftaran
                  <select
                    name="pathway"
                    defaultValue={reg.pathway}
                    disabled={!editable}
                    className={inputCls}
                  >
                    <option value="reguler">Jalur Reguler</option>
                    <option value="prestasi">Jalur Prestasi</option>
                    <option value="afirmasi">Jalur Afirmasi</option>
                  </select>
                </label>
                {editable ? (
                  <Button type="submit" disabled={busy} className="mt-2">
                    {busy ? 'Menyimpan…' : 'Simpan Draf'}
                  </Button>
                ) : null}
              </form>
            </Card>

            <Card>
              <h2 className="mb-4 text-lg font-bold text-sand-950">
                Dokumen ({docs.length})
              </h2>
              {editable ? (
                <div className="mb-5 flex flex-col gap-3 rounded-xl bg-sand-100 p-4">
                  <div className="flex gap-2">
                    <select
                      value={docType}
                      onChange={(e) => setDocType(e.target.value)}
                      className={inputCls}
                      aria-label="Jenis dokumen"
                    >
                      {DOC_TYPES.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".jpg,.jpeg,.png,.pdf"
                      className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary-700 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
                    />
                  </div>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      const f = fileRef.current?.files?.[0];
                      if (!f) {
                        setError('Pilih file terlebih dahulu');
                        return;
                      }
                      run(() => uploadDocument(id, docType, f));
                    }}
                  >
                    Unggah Dokumen
                  </Button>
                  <p className="text-xs text-sand-500">
                    JPG, PNG, atau PDF — maks 5 MB.
                  </p>
                </div>
              ) : null}
              {docs.length === 0 ? (
                <p className="text-sm text-sand-600">Belum ada dokumen.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-sand-100 text-sm">
                  {docs.map((d) => (
                    <li
                      key={d.id}
                      className="flex items-center justify-between py-2.5"
                    >
                      <span>
                        <span className="font-medium text-sand-900">
                          {d.type}
                        </span>
                        <span className="ml-2 text-sand-500">{d.fileName}</span>
                      </span>
                      <span className="text-xs text-sand-500">
                        {Math.round(d.sizeBytes / 1024)} KB
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {invoices.length > 0 ? (
            <Card>
              <h2 className="mb-4 text-lg font-bold text-sand-950">
                Tagihan Pembayaran
              </h2>
              <ul className="flex flex-col divide-y divide-sand-100">
                {invoices.map((inv) => {
                  const pending = inv.payments?.find(
                    (p) => p.status === 'PENDING',
                  );
                  return (
                    <li
                      key={inv.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3"
                    >
                      <div>
                        <p className="font-semibold text-sand-900">
                          {inv.title}
                        </p>
                        <p className="text-sm text-sand-600">
                          {inv.number} · Rp
                          {inv.amount.toLocaleString('id-ID')}
                        </p>
                        {pending ? (
                          <p className="mt-1 text-xs text-accent-800">
                            Menunggu pembayaran via {pending.method} —
                            {pending.provider === 'mock'
                              ? ' (mode demo)'
                              : ''}
                          </p>
                        ) : null}
                      </div>
                      {inv.status === 'PAID' ? (
                        <Badge tone="primary">Lunas</Badge>
                      ) : pending ? (
                        <Badge tone="accent">Menunggu pembayaran</Badge>
                      ) : (
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            run(() => checkoutInvoice(inv.id))
                          }
                        >
                          Bayar
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          ) : null}

          {editable ? (
            <Card className="flex flex-col items-start gap-3 border-primary-200 bg-primary-50 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-sand-800">
                Periksa kembali data dan dokumen Anda — minimal satu dokumen
                wajib diunggah sebelum mengirim.
              </p>
              <Button
                size="lg"
                disabled={busy || docs.length === 0}
                onClick={() => run(() => submitRegistration(id))}
              >
                {busy ? 'Mengirim…' : 'Kirim Pendaftaran'}
              </Button>
            </Card>
          ) : null}
        </Container>
      </main>
      <SiteFooter />
    </>
  );
}
