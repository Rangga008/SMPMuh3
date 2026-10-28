'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Button } from '@smpmuh3/ui';
import { AuthShell } from '@/components/auth-shell';
import { forgotPassword } from '@/lib/api';

export default function LupaPasswordPage() {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    try {
      await forgotPassword(String(fd.get('email')));
    } finally {
      setSent(true);
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Lupa Kata Sandi"
      subtitle="Masukkan email akun Anda — kami kirimkan tautan untuk membuat kata sandi baru."
    >
      {sent ? (
              <div className="rounded-xl bg-primary-50 px-4 py-4 text-sm text-primary-900">
                Jika email terdaftar, tautan reset telah dikirim. Periksa
                kotak masuk Anda.{' '}
                <Link href="/masuk" className="font-semibold underline">
                  Kembali ke masuk
                </Link>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="flex flex-col gap-4">
                <label className="flex flex-col gap-1.5 text-sm font-semibold text-sand-900">
                  Email
                  <input
                    required
                    type="email"
                    name="email"
                    autoComplete="email"
                    className="h-11 rounded-lg border border-sand-300 px-3 font-normal focus-visible:focus-ring"
                  />
                </label>
                <Button type="submit" disabled={busy} className="mt-2 w-full">
                  {busy ? 'Mengirim…' : 'Kirim Tautan Reset'}
                </Button>
              </form>
            )}
            <p className="mt-5 text-center text-sm text-sand-600">
              <Link
                href="/masuk"
                className="font-semibold text-primary-800 hover:underline"
              >
                ← Kembali ke masuk
              </Link>
            </p>
    </AuthShell>
  );
}
