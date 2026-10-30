'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Field, Input } from '@smpmuh3/ui';
import { ApiError, resetPassword } from '@/lib/api';
import { AuthShell } from '@/components/auth-shell';

function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      await resetPassword(token, String(f.get('password')));
      router.push('/masuk');
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Tautan tidak valid atau sudah kedaluwarsa.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
        Tautan atur ulang tidak valid.{' '}
        <Link href="/lupa-password" className="underline">
          Minta tautan baru
        </Link>
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Kata Sandi Baru" hint="Minimal 8 karakter">
        <Input name="password" type="password" required minLength={8} autoComplete="new-password" placeholder="••••••••" />
      </Field>
      {error ? (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? 'Menyimpan…' : 'Simpan Kata Sandi Baru'}
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthShell
      title="Atur Ulang Kata Sandi"
      subtitle="Buat kata sandi baru untuk akun SPMB Anda"
    >
      <Suspense>
        <ResetForm />
      </Suspense>
    </AuthShell>
  );
}
