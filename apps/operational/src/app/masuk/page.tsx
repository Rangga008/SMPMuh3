'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button, Card } from '@smpmuh3/ui';
import { ApiError, login, setTokens } from '@/lib/api';

export default function MasukPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    try {
      const t = await login(String(fd.get('email')), String(fd.get('password')));
      setTokens(t);
      router.push('/');
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Gagal masuk — coba lagi',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="pattern-islami flex min-h-screen items-center justify-center bg-gradient-to-b from-primary-100/60 via-sand-50 to-sand-50 p-4">
      <Card className="w-full max-w-md p-7 sm:p-8">
        <div className="mb-6 flex items-center gap-3.5">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary-700 text-base font-extrabold text-white">
            M3
          </span>
          <div>
            <h1 className="text-xl font-extrabold text-sand-950">Admin Sekolah</h1>
            <p className="text-sm text-sand-600">Masuk dengan akun staf</p>
          </div>
        </div>
        {error ? (
          <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </p>
        ) : null}
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
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-sand-900">
            Kata Sandi
            <input
              required
              type="password"
              name="password"
              autoComplete="current-password"
              className="h-11 rounded-lg border border-sand-300 px-3 font-normal focus-visible:focus-ring"
            />
          </label>
          <Button type="submit" disabled={loading} className="mt-2 w-full">
            {loading ? 'Memproses…' : 'Masuk'}
          </Button>
        </form>
      </Card>
    </main>
  );
}
