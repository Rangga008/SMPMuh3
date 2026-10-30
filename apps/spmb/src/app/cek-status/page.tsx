'use client';

import { useState } from 'react';
import { Badge, Button, Field, Input } from '@smpmuh3/ui';
import type { RegistrationStatus, StatusLookupResult } from '@smpmuh3/types';
import { lookupStatus } from '@/lib/api';
import { AuthShell } from '@/components/auth-shell';

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
const idx = (s: RegistrationStatus) => STEP_ORDER.indexOf(s);

type StepState = 'done' | 'current' | 'failed' | 'todo';

function steps(r: StatusLookupResult): { label: string; state: StepState; note?: string | undefined }[] {
  const s = r.status;
  const i = idx(s);
  const failed = s === 'REJECTED';
  return [
    { label: 'Pembayaran pendaftaran', state: i > idx('PAYMENT_REVIEW') ? 'done' : 'current', note: s === 'PAYMENT_REVIEW' ? 'Sedang diverifikasi' : undefined },
    { label: 'Formulir & dokumen', state: i >= idx('SUBMITTED') ? 'done' : s === 'FORM_FILLING' || s === 'NEEDS_REVISION' ? 'current' : 'todo', note: s === 'NEEDS_REVISION' ? (r.note ?? 'Perlu perbaikan') : undefined },
    { label: 'Verifikasi berkas', state: failed && i <= idx('VERIFIED') ? 'failed' : i > idx('VERIFIED') ? 'done' : s === 'SUBMITTED' || s === 'DOCUMENT_REVIEW' ? 'current' : 'todo', note: failed && i <= idx('VERIFIED') ? r.note : undefined },
    { label: 'Pembayaran DP', state: i > idx('FINAL_PAYMENT_REVIEW') ? 'done' : s === 'AWAITING_FINAL_PAYMENT' || s === 'FINAL_PAYMENT_REVIEW' ? 'current' : 'todo' },
    { label: 'Psikotes di sekolah', state: s === 'SELECTION' ? 'current' : i > idx('SELECTION') ? 'done' : 'todo', note: r.psikotesAt ? `Jadwal: ${new Date(r.psikotesAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}${r.psikotesNote ? ` — ${r.psikotesNote}` : ''}` : r.psikotesNote },
    { label: 'Pengumuman', state: s === 'ACCEPTED' ? 'done' : failed ? 'failed' : i >= idx('SELECTION') ? 'current' : 'todo', note: s === 'ACCEPTED' || failed ? r.note : undefined },
    { label: 'Daftar ulang & pelunasan di sekolah', state: s === 'COMPLETED' ? 'done' : s === 'RE_REGISTRATION' ? 'current' : 'todo' },
  ];
}

export default function CheckStatusPage() {
  const [result, setResult] = useState<StatusLookupResult | null>(null);
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    const res = await lookupStatus(String(f.get('number')));
    setResult(res);
    setSearched(true);
    setBusy(false);
  }

  return (
    <AuthShell
      title="Cek Status Pendaftaran"
      subtitle="Masukkan nomor pendaftaran Anda untuk melihat tahapan"
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Nomor Pendaftaran" hint="Contoh: SPMB-2027-081864">
          <Input name="number" required placeholder="SPMB-2027-XXXXXX" />
        </Field>
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? 'Memeriksa…' : 'Cek Status'}
        </Button>
      </form>

      {searched ? (
        result ? (
          <div className="mt-5 space-y-4 rounded-2xl border border-primary-200 bg-primary-50 p-5">
            <div className="text-center">
              <p className="text-xs font-bold uppercase tracking-wider text-primary-700">
                {result.number}
                {result.wave ? ` · ${result.wave}` : ''}
              </p>
              {result.candidateName ? (
                <p className="mt-1 font-bold text-sand-950">{result.candidateName}</p>
              ) : null}
              <p className="mt-2">
                <Badge tone={result.status === 'REJECTED' ? 'danger' : 'primary'}>
                  {result.statusLabel}
                </Badge>
              </p>
              <p className="mt-2 text-xs text-sand-500">
                Diperbarui {new Date(result.updatedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
            <ol className="space-y-1.5 border-t border-primary-200 pt-4">
              {steps(result).map((s, i) => (
                <li key={s.label} className="flex items-start gap-2.5">
                  <span
                    aria-hidden="true"
                    className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-extrabold ${
                      s.state === 'done'
                        ? 'bg-primary-600 text-white'
                        : s.state === 'failed'
                          ? 'bg-red-500 text-white'
                          : s.state === 'current'
                            ? 'bg-accent-400 text-accent-950'
                            : 'bg-sand-200 text-sand-400'
                    }`}
                  >
                    {s.state === 'done' ? '✓' : s.state === 'failed' ? '✗' : i + 1}
                  </span>
                  <div>
                    <p
                      className={`text-sm font-semibold ${
                        s.state === 'done'
                          ? 'text-primary-800'
                          : s.state === 'failed'
                            ? 'text-red-700'
                            : s.state === 'current'
                              ? 'text-sand-950'
                              : 'text-sand-400'
                      }`}
                    >
                      {s.label}
                    </p>
                    {s.note ? (
                      <p className="text-xs leading-relaxed text-sand-500">{s.note}</p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <p role="status" className="mt-5 rounded-xl bg-sand-100 px-4 py-3 text-center text-sm text-sand-700">
            Data tidak ditemukan. Periksa kembali nomor pendaftaran Anda.
          </p>
        )
      ) : null}
    </AuthShell>
  );
}
