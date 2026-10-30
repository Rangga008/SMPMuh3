'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  DOC_TYPE_LABELS,
  PATHWAY_LABELS,
  PRESTASI_SUBTYPE_LABELS,
  REGISTRATION_STATUS_LABELS,
  REGISTRATION_STATUSES,
  type RegistrationStatus,
} from '@smpmuh3/types';
import { Badge, Button, Field, Input, Select, Textarea } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { PageTitle, Widget } from '@/components/widgets';
import {
  bulkPromote,
  createInstallmentPlan,
  createInvoice,
  exportRegistrationPdf,
  getAdminRegistration,
  getTokens,
  listAdminQuestions,
  recordCash,
  setDiscount,
  transitionRegistration,
  verifyDocument,
  viewDocument,
  verifyPayment,
  type AdminRegistrationDetail,
} from '@/lib/api';
import type { FormQuestionDto } from '@smpmuh3/types';

const rupiah = (n: number) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(n);

const tone = (s: string) =>
  s === 'ACCEPTED' || s === 'COMPLETED'
    ? 'primary'
    : s === 'REJECTED'
      ? 'neutral'
      : 'accent';

export default function AdminRegistrationPage() {
  const { id } = useParams<{ id: string }>();
  const [reg, setReg] = useState<AdminRegistrationDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState<RegistrationStatus>('DOCUMENT_REVIEW');
  const [rejectFor, setRejectFor] = useState<string | null>(null);
  const [questions, setQuestions] = useState<FormQuestionDto[]>([]);

  const refresh = useCallback(async () => {
    setReg(await getAdminRegistration(id));
  }, [id]);

  useEffect(() => {
    refresh().catch(() => setError('Pendaftaran tidak ditemukan.'));
    listAdminQuestions().then(setQuestions).catch(() => undefined);
  }, [refresh]);

  async function onTransition(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const note = String(new FormData(e.currentTarget).get('note') ?? '').trim();
    if ((target === 'NEEDS_REVISION' || target === 'REJECTED') && !note) {
      setError('Catatan wajib diisi untuk revisi/penolakan.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await transitionRegistration(id, target, note || undefined);
      await refresh();
      setNotice(`Status diubah menjadi ${REGISTRATION_STATUS_LABELS[target]}.`);
    } catch {
      setError('Transisi status tidak diizinkan.');
    } finally {
      setBusy(false);
    }
  }

  async function onVerify(docId: string, action: 'verified' | 'rejected', note?: string) {
    setError(null);
    try {
      await verifyDocument(docId, action, note);
      setRejectFor(null);
      await refresh();
    } catch {
      setError('Gagal memperbarui verifikasi dokumen.');
    }
  }

  async function onInvoice(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setError(null);
    setBusy(true);
    try {
      await createInvoice(id, {
        title: String(f.get('title')),
        amount: Number(f.get('amount')),
        kind: String(f.get('kind')),
        applyDiscount: f.get('applyDiscount') === 'on',
      });
      e.currentTarget.reset();
      await refresh();
      setNotice('Tagihan dibuat.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuat tagihan.');
    } finally {
      setBusy(false);
    }
  }

  async function onPlan(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setError(null);
    setBusy(true);
    try {
      await createInstallmentPlan(id, {
        title: String(f.get('ptitle')),
        totalAmount: Number(f.get('ptotal')),
        count: Number(f.get('pcount')),
        applyDiscount: f.get('papplyDiscount') === 'on',
      });
      e.currentTarget.reset();
      await refresh();
      setNotice('Rencana angsuran dibuat.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuat angsuran.');
    } finally {
      setBusy(false);
    }
  }

  async function onVerifyPayment(paymentId: string, action: 'confirm' | 'reject') {
    setError(null);
    let note: string | undefined;
    if (action === 'reject') {
      note = window.prompt('Alasan penolakan pembayaran:') ?? '';
      if (!note) return;
    }
    try {
      await verifyPayment(paymentId, action, note);
      await refresh();
      setNotice(action === 'confirm' ? 'Pembayaran dikonfirmasi — kwitansi dibuat.' : 'Pembayaran ditolak.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memverifikasi pembayaran.');
    }
  }

  async function onRecordCash(invoiceId: string) {
    setError(null);
    setBusy(true);
    try {
      await recordCash(invoiceId, 'Dibayar tunai di sekolah');
      await refresh();
      setNotice('Pembayaran tunai dicatat — tagihan lunas.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mencatat pembayaran.');
    } finally {
      setBusy(false);
    }
  }

  async function onPromote() {
    setError(null);
    setBusy(true);
    try {
      const res = await bulkPromote([id]);
      if (res[0]?.ok) {
        await refresh();
        setNotice('Calon murid kini terdaftar sebagai siswa.');
      } else {
        setError(res[0]?.error ?? 'Gagal menjadikan murid.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function onDiscount(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const pct = Number(new FormData(e.currentTarget).get('percent'));
    setError(null);
    try {
      await setDiscount(id, pct);
      await refresh();
      setNotice(`Diskon DSP diatur ${pct}%.`);
    } catch {
      setError('Gagal mengatur diskon.');
    }
  }

  return (
    <Shell>
      <Link href="/spmb" className="text-sm font-semibold text-primary-700 hover:text-primary-800">
        ← Daftar pendaftar
      </Link>
      <div className="mt-2">
        <PageTitle
          title={reg ? reg.candidate.name : 'Detail Pendaftaran'}
          subtitle={
            reg
              ? `${reg.number} · ${reg.wave?.name ?? '—'} · TA ${reg.academicYear.name} · ${PATHWAY_LABELS[reg.pathway as keyof typeof PATHWAY_LABELS] ?? reg.pathway}${reg.pathwayDetail ? ` (${PRESTASI_SUBTYPE_LABELS[reg.pathwayDetail as keyof typeof PRESTASI_SUBTYPE_LABELS] ?? reg.pathwayDetail})` : ''}`
              : undefined
          }
          actions={
            reg ? (
              <span className="flex flex-wrap items-center gap-2">
                <Badge tone={tone(reg.status)}>{REGISTRATION_STATUS_LABELS[reg.status]}</Badge>
                <a
                  href={exportRegistrationPdf(reg.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => {
                    if (!getTokens()) {
                      e.preventDefault();
                      setError('Sesi berakhir — masuk ulang.');
                    }
                  }}
                  className="inline-flex h-9 items-center rounded-xl border border-sand-300 bg-white px-3 text-xs font-bold text-sand-700 hover:border-primary-400"
                >
                  Export PDF
                </a>
              </span>
            ) : undefined
          }
        />
      </div>

      {error ? (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
      ) : null}
      {notice ? (
        <p role="status" className="mb-4 rounded-xl bg-primary-50 px-4 py-3 text-sm font-medium text-primary-800">{notice}</p>
      ) : null}

      {!reg ? (
        <p className="text-sm text-sand-500">Memuat…</p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            <Widget title="Data Calon Murid">
              <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                {[
                  ['Nama', reg.candidate.name],
                  ['Jenis Kelamin', reg.candidate.gender === 'MALE' ? 'Laki-laki' : reg.candidate.gender === 'FEMALE' ? 'Perempuan' : '—'],
                  ['Tempat, Tgl Lahir', [reg.candidate.birthPlace, reg.candidate.birthDate?.slice(0, 10)].filter(Boolean).join(', ') || '—'],
                  ['NISN', reg.candidate.nisn ?? '—'],
                  ['Asal Sekolah', reg.candidate.previousSchool ?? '—'],
                  ['Alamat', reg.candidate.address ?? '—'],
                  ['Diskon DSP', reg.discountPercent ? `${reg.discountPercent}%` : '—'],
                  ['Orang Tua', `${reg.parent.name} (${reg.parent.phone ?? reg.parent.email ?? '—'})`],
                  [
                    'Psikotes (per gelombang)',
                    reg.wave?.psikotesAt
                      ? `${new Date(reg.wave.psikotesAt).toLocaleString('id-ID')}${reg.wave.psikotesNote ? ` — ${reg.wave.psikotesNote}` : ''}`
                      : reg.psikotesAt
                        ? new Date(reg.psikotesAt).toLocaleString('id-ID')
                        : 'Belum dijadwalkan',
                  ],
                ].map(([k, v]) => (
                  <div key={k as string}>
                    <dt className="text-xs font-bold uppercase tracking-wider text-sand-400">{k}</dt>
                    <dd className="mt-0.5 font-medium text-sand-900">{v}</dd>
                  </div>
                ))}
              </dl>
              {reg.formAnswers && Object.keys(reg.formAnswers).length > 0 ? (
                <div className="mt-4 border-t border-sand-200 pt-4">
                  <p className="mb-2 text-xs font-bold uppercase tracking-wider text-sand-400">Jawaban Formulir</p>
                  <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                    {Object.entries(reg.formAnswers).map(([k, v]) => (
                      <div key={k}>
                        <dt className="text-xs text-sand-400">
                          {questions.find((q) => q.id === k)?.label ?? k}
                        </dt>
                        <dd className="font-medium text-sand-900">{String(v)}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ) : null}
            </Widget>

            <Widget title={`Dokumen (${reg.documents.length})`}>
              {reg.documents.length === 0 ? (
                <p className="text-sm text-sand-500">Belum ada dokumen.</p>
              ) : (
                <div className="space-y-2.5">
                  {Object.entries(
                    reg.documents.reduce<Record<string, typeof reg.documents>>(
                      (acc, d) => {
                        (acc[d.type] ??= []).push(d);
                        return acc;
                      },
                      {},
                    ),
                  ).map(([type, docs]) => {
                    const pendingCount = docs.filter((d) => !d.verifiedAt).length;
                    return (
                      <details
                        key={type}
                        open={pendingCount > 0}
                        className="group rounded-xl border border-sand-200 bg-sand-50"
                      >
                        <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                          <span className="text-xs font-bold uppercase tracking-wide text-primary-700">
                            {DOC_TYPE_LABELS[type as keyof typeof DOC_TYPE_LABELS] ?? type}
                          </span>
                          <span className="text-xs text-sand-500">
                            {docs.length} berkas · {docs.length - pendingCount} terverifikasi
                          </span>
                          <span className="ml-auto text-sand-400 transition-transform group-open:rotate-180">
                            ▾
                          </span>
                        </summary>
                        <ul className="space-y-2.5 px-4 pb-3">
                          {docs.map((d) => (
                            <li key={d.id} className="rounded-xl border border-sand-200 bg-white px-4 py-3">
                              <div className="flex flex-wrap items-center gap-3">
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-semibold text-sand-900">{d.fileName}</span>
                                  <span className="block text-xs text-sand-500">
                                    {(d.sizeBytes / 1024).toFixed(0)} KB
                                    {d.verificationNote ? ` — ${d.verificationNote}` : ''}
                                  </span>
                                </span>
                                <span className="flex shrink-0 items-center gap-2">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => void viewDocument(d.id).catch(() => setError('Dokumen tidak bisa dibuka.'))}
                                  >
                                    Lihat
                                  </Button>
                                  {d.verifiedAt ? (
                                    <Badge tone="primary">Terverifikasi</Badge>
                                  ) : (
                                    <span className="flex gap-2">
                                      <Button size="sm" variant="outline" onClick={() => onVerify(d.id, 'verified')}>
                                        Verifikasi
                                      </Button>
                                      <Button size="sm" variant="danger" onClick={() => setRejectFor(rejectFor === d.id ? null : d.id)}>
                                        Tolak
                                      </Button>
                                    </span>
                                  )}
                                </span>
                              </div>
                              {rejectFor === d.id ? (
                                <form
                                  className="mt-3 flex gap-2"
                                  onSubmit={(e) => {
                                    e.preventDefault();
                                    const note = String(new FormData(e.currentTarget).get('note') ?? '').trim();
                                    if (!note) {
                                      setError('Alasan penolakan wajib diisi.');
                                      return;
                                    }
                                    void onVerify(d.id, 'rejected', note);
                                  }}
                                >
                                  <Input name="note" placeholder="Alasan penolakan (dilihat orang tua)" className="flex-1" required />
                                  <Button size="sm" variant="danger" type="submit">Kirim</Button>
                                </form>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      </details>
                    );
                  })}
                </div>
              )}
            </Widget>

            <Widget title={`Tagihan & Pembayaran (${reg.invoices.length})`}>
              {reg.invoices.length === 0 && reg.installmentPlans.length === 0 ? (
                <p className="mb-4 text-sm text-sand-500">Belum ada tagihan.</p>
              ) : (
                <ul className="mb-4 space-y-2.5">
                  {reg.invoices.map((inv) => (
                    <li key={inv.id} className="rounded-xl border border-sand-200 bg-sand-50 px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-sand-900">
                            {inv.title}
                            {inv.installmentNo ? ` (Angsuran ${inv.installmentNo})` : ''}
                          </p>
                          <p className="text-xs text-sand-500">
                            {inv.number} · {inv.kind}
                            {inv.discountPercent > 0 && inv.baseAmount
                              ? ` · diskon ${inv.discountPercent}% dari ${rupiah(inv.baseAmount)}`
                              : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <p className="text-sm font-extrabold text-primary-800">{rupiah(inv.amount)}</p>
                          <Badge tone={inv.status === 'PAID' ? 'primary' : 'accent'}>
                            {inv.status}
                          </Badge>
                        </div>
                      </div>
                      {inv.status === 'OPEN' ? (
                        <div className="mt-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => void onRecordCash(inv.id)}
                          >
                            Catat Tunai &amp; Lunas
                          </Button>
                          <span className="ml-2 text-xs text-sand-500">
                            untuk pembayaran di sekolah
                          </span>
                        </div>
                      ) : null}
                      {inv.payments?.map((p) => (
                        <div key={p.id} className="mt-3 border-t border-sand-200 pt-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs font-semibold text-sand-700">
                              {p.provider} · {p.status} · {rupiah(p.amount)}
                              {p.paidAt ? ` · ${new Date(p.paidAt).toLocaleDateString('id-ID')}` : ''}
                            </p>
                            {p.status === 'PENDING' ? (
                              <span className="flex gap-2">
                                <Button size="sm" variant="outline" onClick={() => onVerifyPayment(p.id, 'confirm')}>
                                  Konfirmasi
                                </Button>
                                <Button size="sm" variant="danger" onClick={() => onVerifyPayment(p.id, 'reject')}>
                                  Tolak
                                </Button>
                              </span>
                            ) : null}
                          </div>
                          {p.receipts?.map((r) => (
                            <p key={r.id} className="mt-1 text-xs text-primary-700">
                              Kwitansi {r.number} → {r.recipient} ({r.status})
                            </p>
                          ))}
                        </div>
                      ))}
                    </li>
                  ))}
                </ul>
              )}

              <form onSubmit={onInvoice} className="grid gap-3 rounded-2xl border border-sand-200 bg-sand-50 p-4 sm:grid-cols-[1fr_140px_120px_auto] sm:items-end">
                <Field label="Judul Tagihan">
                  <Input name="title" required placeholder="DP DSP / DSP / Seragam" />
                </Field>
                <Field label="Jumlah (Rp)">
                  <Input name="amount" type="number" min={1000} required placeholder="0" />
                </Field>
                <Field label="Jenis">
                  <Select name="kind" defaultValue="dsp_dp">
                    <option value="dsp_dp">DP DSP</option>
                    <option value="dsp">DSP</option>
                    <option value="spp">SPP</option>
                    <option value="seragam">Seragam</option>
                    <option value="other">Lainnya</option>
                  </Select>
                </Field>
                <Button type="submit" disabled={busy} variant="outline">Buat</Button>
                <label className="col-span-full flex items-center gap-2 text-xs font-semibold text-sand-600">
                  <input type="checkbox" name="applyDiscount" className="accent-primary-700" />
                  Terapkan diskon DSP ({reg.discountPercent}%)
                </label>
              </form>

              {reg.installmentPlans.length > 0 ? (
                <ul className="mt-4 space-y-2">
                  {reg.installmentPlans.map((p) => (
                    <li key={p.id} className="rounded-xl bg-primary-50 px-4 py-2.5 text-xs font-semibold text-primary-800">
                      {p.title}: {rupiah(p.totalAmount)} → {p.count} angsuran
                    </li>
                  ))}
                </ul>
              ) : null}

              <form onSubmit={onPlan} className="mt-4 grid gap-3 rounded-2xl border border-dashed border-sand-300 bg-white p-4 sm:grid-cols-[1fr_140px_100px_auto] sm:items-end">
                <Field label="Rencana Angsuran">
                  <Input name="ptitle" required placeholder="Angsuran DSP" />
                </Field>
                <Field label="Total (Rp)">
                  <Input name="ptotal" type="number" min={10000} required placeholder="2800000" />
                </Field>
                <Field label="Jumlah">
                  <Input name="pcount" type="number" min={2} max={12} required defaultValue={3} />
                </Field>
                <Button type="submit" disabled={busy} variant="ghost">Buat Rencana</Button>
                <label className="col-span-full flex items-center gap-2 text-xs font-semibold text-sand-600">
                  <input type="checkbox" name="papplyDiscount" className="accent-primary-700" />
                  Terapkan diskon DSP
                </label>
              </form>
            </Widget>
          </div>

          <div className="space-y-5">
            <Widget title="Transisi Status">
              <form onSubmit={onTransition} className="space-y-4">
                <Field label="Status Saat Ini">
                  <p className="pt-1">
                    <Badge tone={tone(reg.status)}>{REGISTRATION_STATUS_LABELS[reg.status]}</Badge>
                  </p>
                </Field>
                <Field label="Ubah Menjadi">
                  <Select value={target} onChange={(e) => setTarget(e.target.value as RegistrationStatus)}>
                    {REGISTRATION_STATUSES.filter((s) => s !== reg.status).map((s) => (
                      <option key={s} value={s}>{REGISTRATION_STATUS_LABELS[s]}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Catatan" hint={target === 'NEEDS_REVISION' || target === 'REJECTED' ? 'Wajib — diperlihatkan ke pendaftar' : 'Opsional'}>
                  <Textarea name="note" placeholder="Catatan transisi" rows={2} />
                </Field>
                <Button type="submit" disabled={busy} className="w-full">
                  Terapkan Transisi
                </Button>
              </form>
            </Widget>

            <Widget title="Psikotes">
              <p className="text-sm text-sand-700">
                {reg.wave?.psikotesAt
                  ? `${reg.wave.name}: ${new Date(reg.wave.psikotesAt).toLocaleString('id-ID')}`
                  : 'Belum dijadwalkan untuk gelombang ini.'}
              </p>
              {reg.wave?.psikotesNote ? (
                <p className="mt-1 text-xs text-sand-500">{reg.wave.psikotesNote}</p>
              ) : null}
              <p className="mt-2 text-xs leading-relaxed text-sand-500">
                Jadwal psikotes diatur per gelombang di Pengaturan SPMB.
              </p>
            </Widget>

            {reg.status === 'ACCEPTED' || reg.status === 'RE_REGISTRATION' ? (
              <Widget title="Menjadi Murid">
                <p className="mb-3 text-xs leading-relaxed text-sand-500">
                  Ubah calon murid ini menjadi siswa aktif (kelas ditetapkan
                  nanti di kesiswaan). Data pendaftarannya tetap tersimpan.
                </p>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void onPromote()}
                  className="w-full"
                >
                  Jadikan Murid
                </Button>
              </Widget>
            ) : null}

            <Widget title="Diskon DSP">
              <form onSubmit={onDiscount} className="flex items-end gap-2">
                <Field label="Persen Diskon" className="flex-1">
                  <Input name="percent" type="number" min={0} max={100} required defaultValue={reg.discountPercent ?? 0} />
                </Field>
                <Button type="submit" variant="outline">Atur</Button>
              </form>
              <p className="mt-2 text-xs leading-relaxed text-sand-500">
                Diskon diterapkan saat membuat tagihan DSP (centang “Terapkan diskon”).
              </p>
            </Widget>
          </div>
        </div>
      )}
    </Shell>
  );
}
