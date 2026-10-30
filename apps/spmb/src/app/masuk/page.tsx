'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Field, Input } from '@smpmuh3/ui';
import { ApiError, login, setTokens } from '@/lib/api';
import { AuthShell } from '@/components/auth-shell';

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
      router.push('/akun');
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Gagal masuk. Periksa kembali email/nomor HP dan kata sandi.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Masuk Akun SPMB"
      subtitle="Masuk untuk mengelola pendaftaran murid baru"
      footer={
        <>
          Belum punya akun?{' '}
          <Link href="/daftar" className="font-semibold text-primary-700 hover:text-primary-800 focus-visible:focus-ring">
            Daftar di sini
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Email atau Nomor HP">
          <Input name="identifier" required autoComplete="username" placeholder="nama@email.com atau 08xxxxxxxxxx" />
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
        <p className="text-center text-sm">
          <Link href="/lupa-password" className="font-medium text-primary-700 hover:text-primary-800 focus-visible:focus-ring">
            Lupa kata sandi?
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
