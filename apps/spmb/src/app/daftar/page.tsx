'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Field, Input } from '@smpmuh3/ui';
import { ApiError, registerParent, setTokens } from '@/lib/api';
import { AuthShell } from '@/components/auth-shell';

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      const email = String(f.get('email') ?? '').trim();
      const tokens = await registerParent({
        name: String(f.get('name')),
        phone: String(f.get('phone')),
        ...(email ? { email } : {}),
        password: String(f.get('password')),
      });
      setTokens(tokens);
      router.push('/akun');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Pendaftaran gagal. Coba lagi.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Daftar Akun SPMB"
      subtitle="Buat akun orang tua/wali untuk mendaftarkan calon murid"
      footer={
        <>
          Sudah punya akun?{' '}
          <Link href="/masuk" className="font-semibold text-primary-700 hover:text-primary-800 focus-visible:focus-ring">
            Masuk di sini
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Nama Lengkap Orang Tua/Wali">
          <Input name="name" required autoComplete="name" placeholder="Nama sesuai identitas" />
        </Field>
        <Field label="Nomor HP" hint="Wajib — untuk login & pengiriman kwitansi pembayaran">
          <Input name="phone" type="tel" required autoComplete="tel" inputMode="tel" placeholder="08xxxxxxxxxx" />
        </Field>
        <Field label="Email (opsional)" hint="Bisa dipakai untuk login & cek status">
          <Input name="email" type="email" autoComplete="email" placeholder="nama@email.com" />
        </Field>
        <Field label="Kata Sandi" hint="Minimal 8 karakter">
          <Input name="password" type="password" required minLength={8} autoComplete="new-password" placeholder="••••••••" />
        </Field>
        {error ? (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? 'Memproses…' : 'Buat Akun'}
        </Button>
      </form>
    </AuthShell>
  );
}
