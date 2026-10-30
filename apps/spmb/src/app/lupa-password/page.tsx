'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button, Field, Input } from '@smpmuh3/ui';
import { forgotPassword } from '@/lib/api';
import { AuthShell } from '@/components/auth-shell';

export default function ForgotPasswordPage() {
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    await forgotPassword(String(f.get('identifier'))).catch(() => undefined);
    setDone(true);
    setBusy(false);
  }

  return (
    <AuthShell
      title="Lupa Kata Sandi"
      subtitle="Masukkan email atau nomor HP akun Anda"
      footer={
        <Link href="/masuk" className="font-semibold text-primary-700 hover:text-primary-800 focus-visible:focus-ring">
          Kembali ke halaman masuk
        </Link>
      }
    >
      {done ? (
        <div className="rounded-2xl bg-primary-50 p-5 text-center">
          <p className="text-sm font-medium leading-relaxed text-primary-900">
            Jika akun terdaftar, tautan atur ulang kata sandi telah dikirim.
            Periksa pesan Anda.
          </p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Email atau Nomor HP">
            <Input name="identifier" required autoComplete="username" placeholder="nama@email.com atau 08xxxxxxxxxx" />
          </Field>
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'Mengirim…' : 'Kirim Tautan Atur Ulang'}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
