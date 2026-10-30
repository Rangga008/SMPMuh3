'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Badge, Button, Field, Input, Select, Textarea } from '@smpmuh3/ui';
import {
  PATHWAY_LABELS,
  PATHWAYS,
  PRESTASI_GROUPS,
  PRESTASI_SUBTYPE_LABELS,
  REGISTRATION_EDITABLE,
  REGISTRATION_STATUS_LABELS,
  prestasiGroupOf,
  type DocumentDto,
  type FormQuestionDto,
  type InvoiceDto,
  type RegistrationDto,
  type RegistrationStatus,
} from '@smpmuh3/types';
import {
  getRegistration,
  getTokens,
  listDiscounts,
  listDocuments,
  listInvoices,
  listQuestions,
  payInvoice,
  submitRegistration,
  updateCandidate,
  updateRegistration,
  uploadDocument,
  viewDocument,
} from '@/lib/api';
import type { DiscountRuleDto } from '@smpmuh3/types';

const rupiah = (n: number) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(n);

const fmtDate = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

/** Info template surat pernyataan — unduh dari API bila admin sudah unggah. */
function SuratPernyataanHelp() {
  return (
    <a
      href={`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'}/surat-pernyataan-template`}
      target="_blank"
      rel="noopener noreferrer"
      className="mb-5 flex items-center gap-3 rounded-2xl border border-accent-200 bg-accent-50 px-4 py-3 text-sm font-semibold text-accent-800 transition-colors hover:bg-accent-100"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-5 shrink-0">
        <path d="M12 3v12m0 0 4-4m-4 4-4-4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" />
      </svg>
      <span>
        Unduh template <strong>Surat Pernyataan</strong> di sini — cetak, isi &
        tandatangani, lalu unggah kembali pada kolom Surat Pernyataan.
      </span>
    </a>
  );
}

// ---------- Status → tahapan checklist ----------
const STEP_ORDER: RegistrationStatus[] = [
  'DRAFT',
  'AWAITING_PAYMENT',
  'PAYMENT_REVIEW',
  'FORM_FILLING',
  'SUBMITTED',
  'DOCUMENT_REVIEW',
  'NEEDS_REVISION',
  'VERIFIED',
  'AWAITING_FINAL_PAYMENT',
  'FINAL_PAYMENT_REVIEW',
  'SELECTION',
  'ACCEPTED',
  'REJECTED',
  'RE_REGISTRATION',
  'COMPLETED',
];
const stepIndex = (s: RegistrationStatus) => STEP_ORDER.indexOf(s);

type StepState = 'done' | 'current' | 'failed' | 'todo';
interface Step {
  label: string;
  state: StepState;
  note?: string | undefined;
}

function buildSteps(reg: RegistrationDto): Step[] {
  const s = reg.status;
  const i = stepIndex(s);
  const failed = s === 'REJECTED';
  const steps: Step[] = [
    {
      label: 'Data dasar & gelombang',
      state: 'done',
      note: reg.wave?.name,
    },
    {
      label: 'Pembayaran pendaftaran',
      state:
        i > stepIndex('PAYMENT_REVIEW')
          ? 'done'
          : s === 'PAYMENT_REVIEW'
            ? 'current'
            : 'current',
      note:
        s === 'PAYMENT_REVIEW'
          ? 'Bukti sedang diverifikasi panitia'
          : s === 'AWAITING_PAYMENT'
            ? 'Menunggu pembayaran Anda'
            : undefined,
    },
    {
      label: 'Formulir & dokumen',
      state:
        i >= stepIndex('SUBMITTED')
          ? 'done'
          : s === 'FORM_FILLING' || s === 'NEEDS_REVISION'
            ? 'current'
            : 'todo',
      note: s === 'NEEDS_REVISION' ? 'Perlu perbaikan' : undefined,
    },
    {
      label: 'Verifikasi berkas',
      state:
        failed && i <= stepIndex('VERIFIED')
          ? 'failed'
          : i > stepIndex('VERIFIED')
            ? 'done'
            : s === 'SUBMITTED' || s === 'DOCUMENT_REVIEW'
              ? 'current'
              : 'todo',
      note:
        failed && i <= stepIndex('VERIFIED')
          ? (reg.decisionNote ?? 'Berkas tidak lolos verifikasi')
          : undefined,
    },
    {
      label: 'Pembayaran DP',
      state:
        i > stepIndex('FINAL_PAYMENT_REVIEW')
          ? 'done'
          : s === 'AWAITING_FINAL_PAYMENT' || s === 'FINAL_PAYMENT_REVIEW'
            ? 'current'
            : 'todo',
      note:
        s === 'FINAL_PAYMENT_REVIEW'
          ? 'Bukti sedang diverifikasi panitia'
          : undefined,
    },
    {
      label: 'Psikotes di sekolah',
      state:
        s === 'SELECTION'
          ? 'current'
          : i > stepIndex('SELECTION')
            ? 'done'
            : 'todo',
      note: reg.wave?.psikotesAt
        ? `Jadwal: ${fmtDate(reg.wave.psikotesAt)}${reg.wave.psikotesNote ? ` — ${reg.wave.psikotesNote}` : ''}`
        : (reg.wave?.psikotesNote ?? reg.psikotesNote),
    },
    {
      label: 'Pengumuman',
      state:
        s === 'ACCEPTED'
          ? 'done'
          : failed
            ? 'failed'
            : i >= stepIndex('SELECTION')
              ? 'current'
              : 'todo',
      note:
        s === 'ACCEPTED' || failed ? (reg.decisionNote ?? undefined) : undefined,
    },
    {
      label: 'Daftar ulang & pelunasan di sekolah',
      state:
        s === 'COMPLETED'
          ? 'done'
          : s === 'RE_REGISTRATION'
            ? 'current'
            : 'todo',
    },
  ];
  return steps;
}

function StepTracker({ reg }: { reg: RegistrationDto }) {
  const steps = buildSteps(reg);
  return (
    <ol className="space-y-1.5">
      {steps.map((s, idx) => (
        <li key={s.label} className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold ${
              s.state === 'done'
                ? 'bg-primary-600 text-white'
                : s.state === 'failed'
                  ? 'bg-red-500 text-white'
                  : s.state === 'current'
                    ? 'bg-accent-400 text-accent-950'
                    : 'bg-sand-200 text-sand-500'
            }`}
          >
            {s.state === 'done' ? '✓' : s.state === 'failed' ? '✗' : idx + 1}
          </span>
          <div className="min-w-0">
            <p
              className={`text-sm font-semibold ${
                s.state === 'done'
                  ? 'text-primary-800'
                  : s.state === 'failed'
                    ? 'text-red-700'
                    : s.state === 'current'
                      ? 'text-sand-950'
                      : 'text-sand-500'
              }`}
            >
              {s.label}
            </p>
            {s.note ? (
              <p className="mt-0.5 text-xs leading-relaxed text-sand-500">{s.note}</p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-sand-200 bg-white p-5 shadow-card sm:p-7">
      <h2 className="mb-5 text-lg font-extrabold text-sand-950">{title}</h2>
      {children}
    </section>
  );
}

function InfoBox({ tone, children }: { tone: 'info' | 'warn' | 'ok' | 'bad'; children: React.ReactNode }) {
  const cls = {
    info: 'border-primary-200 bg-primary-50 text-primary-900',
    warn: 'border-amber-200 bg-amber-50 text-amber-800',
    ok: 'border-primary-300 bg-primary-50 text-primary-900',
    bad: 'border-red-200 bg-red-50 text-red-700',
  }[tone];
  return <p className={`rounded-xl border px-4 py-3 text-sm font-medium leading-relaxed ${cls}`}>{children}</p>;
}

export default function RegistrationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [reg, setReg] = useState<RegistrationDto | null>(null);
  const [docs, setDocs] = useState<DocumentDto[]>([]);
  const [invoices, setInvoices] = useState<InvoiceDto[]>([]);
  const [questions, setQuestions] = useState<FormQuestionDto[]>([]);
  const [discounts, setDiscounts] = useState<DiscountRuleDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [payMethod, setPayMethod] = useState<Record<string, 'transfer' | 'cash'>>({});
  const [proofFor, setProofFor] = useState<Record<string, string>>({}); // invoiceId → documentId
  const [prestasiGroup, setPrestasiGroup] = useState('');
  const [pathwaySel, setPathwaySel] = useState('reguler');

  const refresh = useCallback(async () => {
    const [r, d, inv, q, disc] = await Promise.all([
      getRegistration(id),
      listDocuments(id),
      listInvoices(id).catch(() => [] as InvoiceDto[]),
      listQuestions().catch(() => [] as FormQuestionDto[]),
      listDiscounts().catch(() => [] as DiscountRuleDto[]),
    ]);
    setReg(r);
    setDocs(d);
    setInvoices(inv);
    setQuestions(q);
    setDiscounts(disc);
    setPrestasiGroup((prev) => prev || prestasiGroupOf(r.pathwayDetail));
    setPathwaySel(r.pathway || 'reguler');
  }, [id]);

  useEffect(() => {
    if (!getTokens()) {
      router.replace('/masuk');
      return;
    }
    refresh()
      .catch(() => setError('Pendaftaran tidak ditemukan.'))
      .finally(() => setLoading(false));
  }, [refresh, router]);

  const editable = reg ? REGISTRATION_EDITABLE.includes(reg.status) : false;
  const pendingPayable = invoices.filter((i) => i.status === 'OPEN');

  async function onUploadTyped(type: string, file: File): Promise<DocumentDto | null> {
    try {
      const doc = await uploadDocument(id, type, file);
      await refresh();
      return doc;
    } catch {
      setError('Unggah gagal — pastikan PDF/JPG/PNG maks 5 MB.');
      return null;
    }
  }

  async function onSaveForm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!reg) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    const f = new FormData(e.currentTarget);
    const val = (k: string) => String(f.get(k) ?? '').trim();
    try {
      await updateCandidate(reg.candidate.id, {
        name: val('name').toUpperCase(),
        gender: val('gender') as RegistrationDto['candidate']['gender'],
        birthPlace: val('birthPlace') || undefined,
        birthDate: val('birthDate'),
        nisn: val('nisn') || undefined,
        previousSchool: val('previousSchool'),
        address: val('address') || undefined,
        tkaScore: val('tkaScore') ? Number(val('tkaScore')) : undefined,
      });
      const answers: Record<string, string> = {};
      for (const q of questions) {
        const v = val(`q_${q.id}`);
        if (v) answers[q.id] = v;
      }
      const pathway = pathwaySel || 'reguler';
      let pathwayDetail: string | undefined;
      if (pathway === 'prestasi') {
        const group = PRESTASI_GROUPS.find((g) => g.key === prestasiGroup);
        if (group) {
          pathwayDetail =
            group.subTypes.length === 1 ? group.subTypes[0] : val('pathwayDetail') || undefined;
        }
      }
      await updateRegistration(reg.id, {
        pathway,
        ...(pathwayDetail ? { pathwayDetail } : {}),
        formAnswers: answers,
      });
      await refresh();
      setNotice('Formulir tersimpan.');
    } catch {
      setError('Gagal menyimpan formulir.');
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit() {
    setError(null);
    setBusy(true);
    try {
      await submitRegistration(id);
      await refresh();
      setNotice('Pendaftaran terkirim. Panitia akan memverifikasi berkas Anda.');
    } catch (e) {
      setError(
        e instanceof Error && e.message.includes('belum')
          ? e.message
          : 'Gagal mengirim — pastikan formulir dan dokumen sudah lengkap.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function onPay(invoice: InvoiceDto) {
    setError(null);
    setNotice(null);
    const method = payMethod[invoice.id] ?? 'transfer';
    if (method === 'transfer' && !proofFor[invoice.id]) {
      setError('Unggah bukti transfer terlebih dahulu.');
      return;
    }
    setBusy(true);
    try {
      await payInvoice(invoice.id, {
        method,
        ...(method === 'transfer' ? { proofDocumentId: proofFor[invoice.id] } : {}),
      });
      await refresh();
      setNotice(
        method === 'transfer'
          ? 'Bukti pembayaran terkirim — menunggu verifikasi panitia.'
          : 'Pembayaran tunai dicatat — silakan bayar ke bagian administrasi sekolah.',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memproses pembayaran.');
    } finally {
      setBusy(false);
    }
  }

  async function onProofUpload(invoiceId: string, file: File) {
    setError(null);
    setBusy(true);
    const doc = await onUploadTyped('bukti_bayar', file);
    if (doc) {
      setProofFor((p) => ({ ...p, [invoiceId]: doc.id }));
      setNotice('Bukti terunggah — tekan "Kirim Pembayaran" untuk mengirim.');
    }
    setBusy(false);
  }

  if (loading) {
    return (
      <main className="flex min-h-[calc(100dvh-4rem)] items-center justify-center bg-sand-50">
        <p className="text-sm font-medium text-sand-500">Memuat pendaftaran…</p>
      </main>
    );
  }
  if (!reg) {
    return (
      <main className="flex min-h-[calc(100dvh-4rem)] items-center justify-center bg-sand-50 px-4">
        <p className="text-sm text-sand-600">{error ?? 'Pendaftaran tidak ditemukan.'}</p>
      </main>
    );
  }

  const s = reg.status;
  const answers = reg.formAnswers ?? {};

  return (
    <main className="relative min-h-[calc(100dvh-4rem)] overflow-hidden bg-gradient-to-b from-primary-50 via-sand-50 to-sand-100 py-10">
      <div aria-hidden="true" className="pattern-islami pointer-events-none absolute inset-0" />
      <div className="relative mx-auto max-w-4xl space-y-6 px-4 sm:px-6">
        <header>
          <Link href="/akun" className="text-sm font-semibold text-primary-700 hover:text-primary-800">
            ← Kembali ke akun
          </Link>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-sand-950 sm:text-2xl">
                {reg.candidate.name}
              </h1>
              <p className="mt-0.5 text-sm font-semibold tracking-wide text-sand-500">
                {reg.number}
                {reg.wave?.name ? ` · ${reg.wave.name}` : ''}
                {' · '}
                {PATHWAY_LABELS[reg.pathway as keyof typeof PATHWAY_LABELS] ?? reg.pathway}
                {reg.pathwayDetail
                  ? ` (${PRESTASI_SUBTYPE_LABELS[reg.pathwayDetail as keyof typeof PRESTASI_SUBTYPE_LABELS] ?? reg.pathwayDetail})`
                  : ''}
              </p>
            </div>
            <Badge tone={s === 'REJECTED' ? 'danger' : s === 'ACCEPTED' || s === 'COMPLETED' ? 'primary' : 'accent'}>
              {REGISTRATION_STATUS_LABELS[s]}
            </Badge>
          </div>
          {s === 'NEEDS_REVISION' && reg.revisionNote ? (
            <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              Catatan revisi dari panitia: {reg.revisionNote}
            </p>
          ) : null}
        </header>

        {error ? (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
        ) : null}
        {notice ? (
          <p role="status" className="rounded-xl bg-primary-50 px-4 py-3 text-sm font-medium text-primary-800">{notice}</p>
        ) : null}

        <Card title="Tahapan Pendaftaran">
          <StepTracker reg={reg} />
        </Card>

        {/* ---------- PEMBAYARAN ---------- */}
        {pendingPayable.length > 0 &&
        ['AWAITING_PAYMENT', 'AWAITING_FINAL_PAYMENT', 'PAYMENT_REVIEW', 'FINAL_PAYMENT_REVIEW', 'FORM_FILLING', 'NEEDS_REVISION', 'SUBMITTED', 'DOCUMENT_REVIEW', 'VERIFIED', 'SELECTION', 'ACCEPTED', 'RE_REGISTRATION'].includes(s) ? (
          <Card title="Tagihan Pembayaran">
            <ul className="space-y-4">
              {invoices.map((inv) => (
                <li key={inv.id} className="rounded-2xl border border-sand-200 bg-sand-50 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-bold text-sand-950">{inv.title}</p>
                      <p className="text-xs text-sand-500">
                        {inv.number}
                        {inv.dueAt ? ` · Jatuh tempo ${fmtDate(inv.dueAt)}` : ''}
                      </p>
                      {inv.discountPercent > 0 && inv.baseAmount ? (
                        <p className="mt-0.5 text-xs font-semibold text-accent-700">
                          Diskon {inv.discountPercent}% dari {rupiah(inv.baseAmount)}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="font-extrabold text-primary-800">{rupiah(inv.amount)}</p>
                      {inv.status === 'PAID' ? (
                        <Badge tone="primary">Lunas</Badge>
                      ) : inv.payments?.some((p) => p.status === 'PENDING') ? (
                        <Badge tone="accent">Menunggu Verifikasi Pembayaran</Badge>
                      ) : null}
                    </div>
                  </div>
                  {inv.status === 'OPEN' &&
                  !inv.payments?.some((p) => p.status === 'PENDING') ? (
                    inv.kind === 'settlement' ? (
                      <InfoBox tone="info">
                        Tagihan pelunasan ini dibayar <strong>langsung di sekolah</strong>{' '}
                        saat daftar ulang — tidak perlu diunggah di sini.
                      </InfoBox>
                    ) : (
                    <div className="mt-4 space-y-3 border-t border-sand-200 pt-4">
                      <div className="grid gap-2 sm:grid-cols-2">
                        {(['transfer', 'cash'] as const).map((m) => (
                          <label
                            key={m}
                            className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-semibold transition-colors ${
                              (payMethod[inv.id] ?? 'transfer') === m
                                ? 'border-primary-400 bg-primary-50 text-primary-900'
                                : 'border-sand-200 bg-white text-sand-600'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`method_${inv.id}`}
                              value={m}
                              checked={(payMethod[inv.id] ?? 'transfer') === m}
                              onChange={() => setPayMethod((p) => ({ ...p, [inv.id]: m }))}
                              className="accent-primary-700"
                            />
                            {m === 'transfer' ? 'Transfer Bank' : 'Tunai di Sekolah'}
                          </label>
                        ))}
                      </div>
                      {(payMethod[inv.id] ?? 'transfer') === 'transfer' ? (
                        <Field label="Unggah Bukti Transfer (PDF/JPG/PNG, maks 5 MB)">
                          <Input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            className="h-11 py-2 file:mr-3 file:rounded-lg file:border-0 file:bg-primary-100 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-primary-800"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) void onProofUpload(inv.id, f);
                            }}
                          />
                          {proofFor[inv.id] ? (
                            <span className="mt-1 block text-xs font-semibold text-primary-700">
                              ✓ Bukti terunggah
                            </span>
                          ) : null}
                        </Field>
                      ) : (
                        <InfoBox tone="info">
                          Pilih tunai lalu tekan Kirim — lalu bayar langsung ke bagian administrasi sekolah.
                          Kwitansi akan terkirim ke nomor HP Anda setelah dikonfirmasi.
                        </InfoBox>
                      )}
                      {(payMethod[inv.id] ?? 'transfer') === 'cash' ? (
                        <Button size="sm" disabled={busy} onClick={() => onPay(inv)}>
                          Daftarkan Pembayaran Tunai
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          disabled={busy || !proofFor[inv.id]}
                          onClick={() => onPay(inv)}
                        >
                          Kirim Pembayaran
                        </Button>
                      )}
                    </div>
                    )
                  ) : null}
                  {inv.kind === 'dsp_dp' ? (
                    <p className="mt-3 text-xs leading-relaxed text-sand-500">
                      * Ini adalah uang muka (DP). Sisa pembayaran dilunasi saat daftar ulang di sekolah.
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {/* ---------- STATUS: menunggu verifikasi bayar ---------- */}
        {s === 'PAYMENT_REVIEW' || s === 'FINAL_PAYMENT_REVIEW' ? (
          <InfoBox tone="warn">
            Bukti pembayaran Anda sedang diverifikasi panitia. Anda akan menerima
            kwitansi di nomor HP setelah pembayaran dikonfirmasi.
          </InfoBox>
        ) : null}

        {/* ---------- STATUS: formulir ---------- */}
        {editable && s !== 'DRAFT' ? (
          <>
            <div className="grid items-start gap-6 lg:grid-cols-2">
            <Card title="Formulir Pendaftaran">
              <form onSubmit={onSaveForm} className="grid gap-4 sm:grid-cols-2">
                <Field label="Nama Lengkap" className="sm:col-span-2">
                  <Input name="name" required defaultValue={reg.candidate.name} style={{ textTransform: 'uppercase' }} />
                </Field>
                <Field label="Jenis Kelamin">
                  <Select name="gender" required defaultValue={reg.candidate.gender ?? ''}>
                    <option value="MALE">Laki-laki</option>
                    <option value="FEMALE">Perempuan</option>
                  </Select>
                </Field>
                <Field label="Tanggal Lahir">
                  <Input name="birthDate" type="date" required defaultValue={reg.candidate.birthDate?.slice(0, 10) ?? ''} />
                </Field>
                <Field label="Tempat Lahir">
                  <Input name="birthPlace" required defaultValue={reg.candidate.birthPlace ?? ''} />
                </Field>
                <Field label="Asal Sekolah">
                  <Input name="previousSchool" required defaultValue={reg.candidate.previousSchool ?? ''} />
                </Field>
                <Field label="NISN (opsional)">
                  <Input name="nisn" defaultValue={reg.candidate.nisn ?? ''} />
                </Field>
                <Field label="Alamat" className="sm:col-span-2">
                  <Input name="address" required defaultValue={reg.candidate.address ?? ''} />
                </Field>
                <Field label="Nilai TKA (opsional)" hint="Isi nilai saja — unggah dokumen pendukung opsional" className="sm:col-span-2">
                  <Input name="tkaScore" type="number" min={0} max={1000} defaultValue={reg.candidate.tkaScore?.toString() ?? ''} placeholder="cth: 78" />
                </Field>

                <Field label="Jalur Pendaftaran" className="sm:col-span-2">
                  <Select name="pathway" value={pathwaySel} onChange={(e) => setPathwaySel(e.target.value)}>
                    {PATHWAYS.map((p) => (
                      <option key={p} value={p}>{PATHWAY_LABELS[p]}</option>
                    ))}
                  </Select>
                </Field>
                {pathwaySel === 'prestasi' ? (
                  <Field label="Jenis Prestasi" hint="Wajib unggah sertifikat/bukti prestasi" className="sm:col-span-2">
                    <Select
                      name="prestasiGroup"
                      required
                      value={prestasiGroup}
                      onChange={(e) => setPrestasiGroup(e.target.value)}
                    >
                      <option value="">Pilih jenis prestasi…</option>
                      {PRESTASI_GROUPS.map((g) => (
                        <option key={g.key} value={g.key}>{g.label}</option>
                      ))}
                    </Select>
                  </Field>
                ) : null}
                {pathwaySel === 'prestasi' && prestasiGroup === 'non_akademik' ? (
                  <Field label="Jenis Prestasi Non-Akademik" className="sm:col-span-2">
                    <Select name="pathwayDetail" required defaultValue={reg.pathwayDetail ?? ''}>
                      <option value="">Pilih jenis…</option>
                      {PRESTASI_GROUPS.find((g) => g.key === 'non_akademik')!.subTypes.map((st) => {
                        const rule = discounts.find((d) => d.subType === st);
                        return (
                          <option key={st} value={st}>
                            {PRESTASI_SUBTYPE_LABELS[st]}
                            {rule ? ` — diskon DSP ${rule.percent}%` : ''}
                          </option>
                        );
                      })}
                    </Select>
                  </Field>
                ) : null}

                {questions.length > 0 ? (
                  <div className="sm:col-span-2 space-y-4 border-t border-sand-200 pt-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-sand-500">
                      Pertanyaan Tambahan
                    </p>
                    {questions.map((q) =>
                      q.fieldType === 'textarea' ? (
                        <Field key={q.id} label={`${q.label}${q.required ? ' *' : ''}`} hint={q.helpText}>
                          <Textarea name={`q_${q.id}`} required={q.required} defaultValue={answers[q.id] ?? ''} rows={3} />
                        </Field>
                      ) : q.fieldType === 'select' ? (
                        <Field key={q.id} label={`${q.label}${q.required ? ' *' : ''}`} hint={q.helpText}>
                          <Select name={`q_${q.id}`} required={q.required} defaultValue={answers[q.id] ?? ''}>
                            <option value="">Pilih…</option>
                            {(q.options ?? []).map((o) => (
                              <option key={o} value={o}>{o}</option>
                            ))}
                          </Select>
                        </Field>
                      ) : (
                        <Field key={q.id} label={`${q.label}${q.required ? ' *' : ''}`} hint={q.helpText}>
                          <Input
                            name={`q_${q.id}`}
                            type={q.fieldType === 'date' ? 'date' : q.fieldType === 'number' ? 'number' : 'text'}
                            required={q.required}
                            defaultValue={answers[q.id] ?? ''}
                          />
                        </Field>
                      ),
                    )}
                  </div>
                ) : null}

                <div className="sm:col-span-2">
                  <Button type="submit" variant="outline" disabled={busy}>
                    {busy ? 'Menyimpan…' : 'Simpan Formulir'}
                  </Button>
                </div>
              </form>
            </Card>

            <Card title="Dokumen Persyaratan">
              <p className="mb-4 -mt-2 text-xs leading-relaxed text-sand-500">
                Unggah satu berkas (PDF/JPG/PNG, maks 5 MB) untuk tiap jenis
                dokumen di bawah ini — bisa diganti dengan mengunggah ulang.
              </p>
              <SuratPernyataanHelp />
              <ul className="space-y-3">
                {([
                  ['kk', 'Kartu Keluarga', true],
                  ['akta', 'Akta Kelahiran', true],
                  ['ktp_ortu', 'Fotokopi KTP Orang Tua', true],
                  ['ijazah', 'Ijazah / SK Lulus / SK Pernah Sekolah', true],
                  ['surat_pernyataan', 'Surat Pernyataan (unduh template, isi & unggah)', true],
                  ['nilai_tka', 'Dokumen Nilai TKA (opsional)', false],
                  ['foto', 'Pas Foto (opsional)', false],
                  ['form', 'Formulir / berkas lain (opsional)', false],
                  ...(pathwaySel === 'prestasi'
                    ? ([['sertifikat', 'Sertifikat Prestasi', true]] as [string, string, boolean][])
                    : []),
                ] as [string, string, boolean][]).map(([type, label, required]) => {
                  const uploaded = docs.filter((d) =>
                    d.type === type || (type === 'ijazah' && d.type === 'sk_sekolah'),
                  );
                  const has = uploaded.length > 0;
                  const rejected = uploaded.find(
                    (d) => (d as { verificationNote?: string }).verificationNote && !(d as { verifiedAt?: string }).verifiedAt,
                  );
                  return (
                    <li
                      key={type}
                      className={`rounded-2xl border px-4 py-3.5 ${
                        has
                          ? 'border-primary-200 bg-primary-50/60'
                          : 'border-sand-200 bg-sand-50'
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-3">
                        <span
                          aria-hidden="true"
                          className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${
                            has ? 'bg-primary-600 text-white' : 'bg-sand-200 text-sand-400'
                          }`}
                        >
                          {has ? '✓' : '·'}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-bold ${has ? 'text-primary-900' : 'text-sand-800'}`}>
                            {label}
                            <span className={`ml-2 text-[10px] font-extrabold uppercase tracking-wide ${required ? 'text-accent-600' : 'text-sand-400'}`}>
                              {required ? 'Wajib' : 'Opsional'}
                            </span>
                          </p>
                          {uploaded.map((d) => (
                            <p key={d.id} className="mt-0.5 truncate text-xs text-sand-500">
                              {d.fileName} · {(d.sizeBytes / 1024).toFixed(0)} KB
                              {(d as { verificationNote?: string }).verificationNote
                                ? ` — ${(d as { verificationNote?: string }).verificationNote}`
                                : ''}
                            </p>
                          ))}
                          {rejected ? (
                            <p className="mt-0.5 text-xs font-semibold text-red-600">
                              Ditolak — unggah ulang.
                            </p>
                          ) : null}
                        </div>
                        {has ? (
                          <button
                            type="button"
                            onClick={() =>
                              void viewDocument(uploaded[0]!.id).catch(() =>
                                setError('Dokumen tidak bisa dibuka.'),
                              )
                            }
                            className="inline-flex h-9 items-center rounded-xl border border-sand-300 bg-white px-3 text-xs font-bold text-sand-700 transition-colors hover:bg-sand-100"
                          >
                            Lihat
                          </button>
                        ) : null}
                        <label className={`inline-flex h-9 cursor-pointer items-center rounded-xl border px-3 text-xs font-bold transition-colors ${
                          has
                            ? 'border-primary-300 bg-white text-primary-800 hover:bg-primary-50'
                            : 'border-primary-300 bg-primary-50 text-primary-800 hover:bg-primary-100'
                        } ${busy ? 'pointer-events-none opacity-50' : ''}`}>
                          {has ? 'Ganti Berkas' : 'Unggah'}
                          <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            className="hidden"
                            disabled={busy}
                            onChange={async (e) => {
                              const f = e.target.files?.[0];
                              e.target.value = '';
                              if (!f) return;
                              setError(null);
                              setBusy(true);
                              const d = await onUploadTyped(type, f);
                              if (d) setNotice('Dokumen terunggah.');
                              setBusy(false);
                            }}
                          />
                        </label>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
            </div>

            <div className="rounded-3xl border border-primary-200 bg-primary-50 p-6 text-center">
              <p className="text-sm text-sand-700">
                Pastikan formulir dan dokumen wajib sudah lengkap sebelum mengirim.
              </p>
              <Button size="lg" disabled={busy} onClick={onSubmit} className="mt-4">
                Kirim Pendaftaran
              </Button>
            </div>
          </>
        ) : null}

        {/* ---------- STATUS: info per tahap ---------- */}
        {s === 'AWAITING_PAYMENT' ? (
          <InfoBox tone="info">
            Langkah selanjutnya: bayar uang pendaftaran pada kartu Tagihan di atas —
            via transfer (unggah bukti) atau tunai di sekolah. Formulir terbuka
            setelah pembayaran diverifikasi.
          </InfoBox>
        ) : null}
        {s === 'SUBMITTED' || s === 'DOCUMENT_REVIEW' ? (
          <InfoBox tone="info">
            Berkas Anda sedang diperiksa panitia. Hasil verifikasi dapat dipantau
            melalui halaman ini atau menu Cek Status.
          </InfoBox>
        ) : null}
        {s === 'VERIFIED' ? (
          <InfoBox tone="ok">
            Berkas Anda terverifikasi. Menunggu tagihan pembayaran DP dari panitia —
            pantau terus halaman ini.
          </InfoBox>
        ) : null}
        {s === 'SELECTION' ? (
          <InfoBox tone="info">
            Anda dijadwalkan mengikuti <strong>psikotes di sekolah</strong>.
            {reg.wave?.psikotesAt ? ` Jadwal: ${fmtDate(reg.wave.psikotesAt)}.` : ' Jadwal akan diumumkan.'}
            {(reg.wave?.psikotesNote ?? reg.psikotesNote) ? ` ${reg.wave?.psikotesNote ?? reg.psikotesNote}` : ''}
          </InfoBox>
        ) : null}
        {s === 'ACCEPTED' ? (
          <InfoBox tone="ok">
            Selamat — Anda <strong>diterima</strong>!{reg.decisionNote ? ` ${reg.decisionNote}` : ''}{' '}
            Silakan melakukan daftar ulang sekaligus pelunasan di sekolah.
          </InfoBox>
        ) : null}
        {s === 'RE_REGISTRATION' ? (
          <InfoBox tone="info">
            Tahap daftar ulang — datang ke sekolah untuk pelunasan dan penyelesaian administrasi.
          </InfoBox>
        ) : null}
        {s === 'REJECTED' ? (
          <InfoBox tone="bad">
            Pendaftaran tidak dapat dilanjutkan.{reg.decisionNote ? ` Alasan: ${reg.decisionNote}` : ''}{' '}
            Hubungi panitia untuk informasi lebih lanjut.
          </InfoBox>
        ) : null}
        {s === 'COMPLETED' ? (
          <InfoBox tone="ok">
            Proses pendaftaran selesai — selamat menjadi bagian dari keluarga besar
            SMP Muhammadiyah 3 Kota Bandung.
          </InfoBox>
        ) : null}
      </div>
    </main>
  );
}
