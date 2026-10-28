'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  REGISTRATION_STATUS_LABELS,
  type RegistrationStatus,
} from '@smpmuh3/types';
import { Badge, Button, Card } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { PageTitle, Widget } from '@/components/widgets';
import {
  createInvoice,
  getAdminRegistration,
  transitionRegistration,
  verifyDocument,
  type AdminRegistrationDetail,
} from '@/lib/api';

const inputCls =
  'h-10 w-full rounded-lg border border-sand-300 px-3 text-sm focus-visible:focus-ring';

const ACTIONS: Partial<
  Record<RegistrationStatus, { status: RegistrationStatus; label: string; danger?: boolean; needsNote?: boolean }[]>
> = {
  SUBMITTED: [
    { status: 'DOCUMENT_REVIEW', label: 'Mulai Review' },
    { status: 'VERIFIED', label: 'Verifikasi Langsung' },
    { status: 'NEEDS_REVISION', label: 'Minta Revisi', needsNote: true },
    { status: 'REJECTED', label: 'Tolak', danger: true },
  ],
  DOCUMENT_REVIEW: [
    { status: 'VERIFIED', label: 'Verifikasi Berkas' },
    { status: 'NEEDS_REVISION', label: 'Minta Revisi', needsNote: true },
    { status: 'REJECTED', label: 'Tolak', danger: true },
  ],
  NEEDS_REVISION: [
    { status: 'DOCUMENT_REVIEW', label: 'Review Ulang' },
    { status: 'REJECTED', label: 'Tolak', danger: true },
  ],
  VERIFIED: [{ status: 'SELECTION', label: 'Masuk Seleksi' }],
  SELECTION: [
    { status: 'ACCEPTED', label: 'Terima' },
    { status: 'REJECTED', label: 'Tolak', danger: true },
  ],
  ACCEPTED: [{ status: 'RE_REGISTRATION', label: 'Daftar Ulang' }],
  RE_REGISTRATION: [{ status: 'COMPLETED', label: 'Selesaikan' }],
};

export default function SpmbDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [reg, setReg] = useState<AdminRegistrationDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({ title: '', amount: '' });

  const load = useCallback(() => {
    getAdminRegistration(id)
      .then(setReg)
      .catch((e) => setError(e instanceof Error ? e.message : 'Gagal memuat'));
  }, [id]);

  useEffect(load, [load]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setNote('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal');
    } finally {
      setBusy(false);
    }
  }

  function onInvoice(e: FormEvent) {
    e.preventDefault();
    const amount = Number(invoiceForm.amount);
    if (!invoiceForm.title || !amount) return;
    run(() => createInvoice(id, invoiceForm.title, amount));
  }

  return (
    <Shell>
      <PageTitle
        title={reg ? `Pendaftaran ${reg.number}` : 'Pendaftaran'}
        subtitle={reg ? `${reg.candidate.name} · ${reg.pathway}` : undefined}
        actions={
          <Link
            href="/spmb"
            className="text-sm font-semibold text-primary-800 hover:underline"
          >
            ← Kembali
          </Link>
        }
      />
      {error ? (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {!reg ? (
        <p className="text-sand-500">Memuat…</p>
      ) : (
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="flex flex-col gap-4 xl:col-span-2">
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-sand-950">Status</h2>
                <Badge tone="accent">
                  {REGISTRATION_STATUS_LABELS[reg.status]}
                </Badge>
              </div>
              {reg.revisionNote ? (
                <p className="mt-3 rounded-lg bg-accent-100 px-4 py-2 text-sm text-accent-900">
                  Catatan revisi: {reg.revisionNote}
                </p>
              ) : null}
              {(ACTIONS[reg.status] ?? []).length > 0 ? (
                <div className="mt-4 border-t border-sand-100 pt-4">
                  <label className="mb-2 block text-sm font-semibold text-sand-900">
                    Catatan (untuk revisi)
                    <input
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Opsional — jelaskan apa yang perlu diperbaiki"
                      className={`${inputCls} mt-1`}
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {(ACTIONS[reg.status] ?? []).map((a) => (
                      <Button
                        key={a.status}
                        size="sm"
                        variant={a.danger ? 'ghost' : 'primary'}
                        disabled={busy || (a.needsNote && !note.trim())}
                        onClick={() =>
                          run(() =>
                            transitionRegistration(
                              id,
                              a.status,
                              a.needsNote ? note : note || undefined,
                            ),
                          )
                        }
                      >
                        {a.label}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}
            </Card>

            <Widget title={`Dokumen (${reg.documents.length})`}>
              {reg.documents.length === 0 ? (
                <p className="text-sm text-sand-500">Belum ada dokumen.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-sand-100 text-sm">
                  {reg.documents.map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sand-900">{d.type}</p>
                        <p className="truncate text-xs text-sand-500">
                          {d.fileName} · {Math.round(d.sizeBytes / 1024)} KB
                        </p>
                        {d.verificationNote ? (
                          <p className="text-xs text-accent-800">
                            {d.verificationNote}
                          </p>
                        ) : null}
                      </div>
                      {d.verifiedAt ? (
                        <Badge tone="primary">terverifikasi</Badge>
                      ) : d.verificationNote === 'rejected' ? (
                        <Badge tone="neutral">ditolak</Badge>
                      ) : (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() =>
                              run(() => verifyDocument(d.id, 'verified'))
                            }
                          >
                            Verifikasi
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            onClick={() =>
                              run(() =>
                                verifyDocument(d.id, 'rejected', 'rejected'),
                              )
                            }
                          >
                            Tolak
                          </Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Widget>
          </div>

          <div className="flex flex-col gap-4">
            <Widget title="Data Calon Siswa">
              <dl className="space-y-2 text-sm">
                {[
                  ['Nama', reg.candidate.name],
                  ['NISN', reg.candidate.nisn ?? '—'],
                  ['Tempat lahir', reg.candidate.birthPlace ?? '—'],
                  ['Asal sekolah', reg.candidate.previousSchool ?? '—'],
                  ['Tahun ajaran', reg.academicYear?.name ?? '—'],
                  ['Orang tua', `${reg.parent.name} (${reg.parent.email})`],
                ].map(([k, v]) => (
                  <div key={k} className="flex gap-2">
                    <dt className="w-28 shrink-0 font-semibold text-sand-700">
                      {k}
                    </dt>
                    <dd className="text-sand-900">{v}</dd>
                  </div>
                ))}
              </dl>
            </Widget>

            <Widget title="Invoice">
              {reg.invoices.length === 0 ? (
                <p className="mb-3 text-sm text-sand-500">Belum ada invoice.</p>
              ) : (
                <ul className="mb-3 flex flex-col gap-2 text-sm">
                  {reg.invoices.map((inv) => (
                    <li
                      key={inv.id}
                      className="flex items-center justify-between rounded-lg bg-sand-100 px-3 py-2"
                    >
                      <span>
                        {inv.number} · Rp{inv.amount.toLocaleString('id-ID')}
                      </span>
                      <Badge tone={inv.status === 'PAID' ? 'primary' : 'accent'}>
                        {inv.status}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
              <form onSubmit={onInvoice} className="flex flex-col gap-2">
                <input
                  required
                  placeholder="Judul, mis. Biaya Pendaftaran"
                  value={invoiceForm.title}
                  onChange={(e) =>
                    setInvoiceForm({ ...invoiceForm, title: e.target.value })
                  }
                  className={inputCls}
                />
                <input
                  required
                  type="number"
                  min={1}
                  placeholder="Jumlah (Rp)"
                  value={invoiceForm.amount}
                  onChange={(e) =>
                    setInvoiceForm({ ...invoiceForm, amount: e.target.value })
                  }
                  className={inputCls}
                />
                <Button type="submit" size="sm" disabled={busy}>
                  Buat Invoice
                </Button>
              </form>
            </Widget>
          </div>
        </div>
      )}
    </Shell>
  );
}
