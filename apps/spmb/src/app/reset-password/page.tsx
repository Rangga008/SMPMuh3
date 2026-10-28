'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { Button } from '@smpmuh3/ui';
import { AuthShell } from '@/components/auth-shell';
import { ApiError, resetPassword } from '@/lib/api';

function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      await resetPassword(String(fd.get('token')), String(fd.get('password')));
      setDone(true);
      setTimeout(() => router.push('/masuk'), 1500);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Token tidak valid atau kedaluwarsa',
      );
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-xl bg-primary-50 px-4 py-4 text-sm text-primary-900">
        Kata sandi berhasil diubah. Mengalihkan ke halaman masuk…
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {error ? (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      <label className="flex flex-col gap-1.5 text-sm font-semibold text-sand-900">
        Token Reset
        <input
          required
          name="token"
          defaultValue={token}
          autoComplete="one-time-code"
          className="h-11 rounded-lg border border-sand-300 px-3 font-mono text-xs font-normal focus-visible:focus-ring"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-semibold text-sand-900">
        Kata Sandi Baru
        <input
          required
          type="password"
          name="password"
          minLength={8}
          autoComplete="new-password"
          className="h-11 rounded-lg border border-sand-300 px-3 font-normal focus-visible:focus-ring"
        />
      </label>
      <Button type="submit" disabled={busy} className="mt-2 w-full">
        {busy ? 'Memproses…' : 'Simpan Kata Sandi Baru'}
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthShell
      title="Reset Kata Sandi"
      subtitle="Tempel token dari email Anda dan buat kata sandi baru."
    >
      <Suspense fallback={<p className="text-sand-500">Memuat…</p>}>
        <ResetForm />
      </Suspense>
    </AuthShell>
  );
}
