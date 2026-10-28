'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import {
  REGISTRATION_STATUS_LABELS,
  type RegistrationStatus,
} from '@smpmuh3/types';
import { Badge, Button } from '@smpmuh3/ui';
import { AuthShell } from '@/components/auth-shell';
import { lookupStatus, type StatusLookupResult } from '@/lib/api';

export default function CekStatusPage() {
  const [result, setResult] = useState<StatusLookupResult | null>(null);
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const res = await lookupStatus(
      String(fd.get('number')).trim(),
      String(fd.get('email')).trim(),
    );
    setResult(res);
    setSearched(true);
    setBusy(false);
  }

  return (
    <AuthShell
      title="Cek Status Pendaftaran"
      subtitle="Masukkan nomor pendaftaran dan email akun Anda."
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5 text-sm font-semibold text-sand-900">
                Nomor Pendaftaran
                <input
                  required
                  name="number"
                  placeholder="SPMB-2026-000000"
                  className="h-11 rounded-lg border border-sand-300 px-3 font-normal focus-visible:focus-ring"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-semibold text-sand-900">
                Email Akun
                <input
                  required
                  type="email"
                  name="email"
                  className="h-11 rounded-lg border border-sand-300 px-3 font-normal focus-visible:focus-ring"
                />
              </label>
              <Button type="submit" disabled={busy} className="mt-2 w-full">
                {busy ? 'Memeriksa…' : 'Cek Status'}
              </Button>
            </form>
            {searched ? (
              result ? (
                <div className="mt-6 flex items-center justify-between rounded-xl bg-sand-100 px-4 py-3">
                  <span className="text-sm font-semibold text-sand-900">
                    {result.number}
                  </span>
                  <Badge tone="primary">
                    {REGISTRATION_STATUS_LABELS[
                      result.status as RegistrationStatus
                    ] ?? result.status}
                  </Badge>
                </div>
              ) : (
                <p className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
                  Tidak ditemukan. Periksa kembali nomor pendaftaran dan email
                  Anda.
                </p>
              )
            ) : null}
            <p className="mt-5 text-center text-sm text-sand-600">
              <Link
                href="/"
                className="font-semibold text-primary-800 hover:underline"
              >
                ← Kembali ke halaman utama
              </Link>
            </p>
    </AuthShell>
  );
}
