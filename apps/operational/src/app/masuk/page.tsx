'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Input } from '@smpmuh3/ui';
import { ApiError, login, setTokens } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      const tokens = await login(String(f.get('identifier')), String(f.get('password')));
      setTokens(tokens);
      router.push('/');
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Gagal masuk. Periksa email/nomor HP dan kata sandi.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-b from-primary-950 via-primary-900 to-primary-950 px-4 py-10">
      <div aria-hidden="true" className="pattern-islami-light pointer-events-none absolute inset-0" />
      <div className="relative w-full max-w-md">
        <div className="text-center">
          <span
            aria-hidden="true"
            className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-accent-400 text-lg font-extrabold text-primary-950 shadow-card"
          >
            M3
          </span>
          <h1 className="mt-5 text-2xl font-extrabold tracking-tight text-white">
            Admin Sekolah
          </h1>
          <p className="mt-1.5 text-sm text-primary-200">
            SMP Muhammadiyah 3 Kota Bandung
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="mt-7 space-y-4 rounded-3xl border border-sand-200 bg-white p-6 shadow-lift sm:p-8"
        >
          <Field label="Email atau Nomor HP">
            <Input name="identifier" required autoComplete="username" placeholder="nama@sekolah.id" />
          </Field>
          <Field label="Kata Sandi">
            <Input name="password" type="password" required autoComplete="current-password" placeholder="••••••••" />
          </Field>
          {error ? (
            <p role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'Memproses…' : 'Masuk'}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-primary-300">
          Akses khusus staf dan guru.
        </p>
      </div>
    </main>
  );
}
