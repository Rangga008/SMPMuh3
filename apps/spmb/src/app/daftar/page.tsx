'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@smpmuh3/ui';
import { AuthShell } from '@/components/auth-shell';
import { ApiError, registerParent, setTokens } from '@/lib/api';

export default function DaftarPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    try {
      const tokens = await registerParent(
        String(fd.get('name')),
        String(fd.get('email')),
        String(fd.get('password')),
      );
      setTokens(tokens);
      router.push('/akun');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal mendaftar');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Buat Akun Orang Tua"
      subtitle="Satu akun untuk semua pendaftaran calon siswa Anda."
    >
      {error ? (
              <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
                {error}
              </p>
            ) : null}
            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5 text-sm font-semibold text-sand-900">
                Nama Lengkap
                <input
                  required
                  name="name"
                  minLength={3}
                  autoComplete="name"
                  className="h-11 rounded-lg border border-sand-300 px-3 font-normal focus-visible:focus-ring"
                />
              </label>
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
                  minLength={8}
                  autoComplete="new-password"
                  className="h-11 rounded-lg border border-sand-300 px-3 font-normal focus-visible:focus-ring"
                />
                <span className="text-xs font-normal text-sand-500">
                  Minimal 8 karakter.
                </span>
              </label>
              <Button type="submit" disabled={loading} className="mt-2 w-full">
                {loading ? 'Memproses…' : 'Buat Akun'}
              </Button>
            </form>
            <p className="mt-5 text-center text-sm text-sand-600">
              Sudah punya akun?{' '}
              <Link href="/masuk" className="font-semibold text-primary-800 hover:underline">
                Masuk di sini
              </Link>
            </p>
    </AuthShell>
  );
}
