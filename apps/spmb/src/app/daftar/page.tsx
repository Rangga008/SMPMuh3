'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Field, Input } from '@smpmuh3/ui';
import { ApiError, login, redeemPublic, setTokens } from '@/lib/api';
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
    const formCode = String(f.get('formCode') ?? '').trim().toUpperCase();
    const phone = String(f.get('phone') ?? '').trim();
    const password = String(f.get('password') ?? '');
    try {
      // Kode + HP cocok dengan titipan → akun dibuat (bila belum ada) dan
      // pendaftaran langsung terbentuk untuk calon murid titipan tersebut.
      const { registration } = await redeemPublic({ formCode, phone, password });
      const tokens = await login(phone, password);
      setTokens(tokens);
      router.push(`/akun/pendaftaran/${registration.id}`);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Pendaftaran gagal. Coba lagi.',
      );
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Daftar SPMB"
      subtitle="Masukkan kode formulir unik yang Anda terima lewat WhatsApp setelah titipan diverifikasi"
      footer={
        <>
          Sudah punya akun?{' '}
          <Link href="/masuk" className="font-semibold text-primary-700 hover:text-primary-800 focus-visible:focus-ring">
            Masuk di sini
          </Link>
          {' · '}
          Belum punya kode?{' '}
          <Link href="/daftar-titipan" className="font-semibold text-primary-700 hover:text-primary-800 focus-visible:focus-ring">
            Daftar Titipan dulu
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field
          label="Kode Formulir Unik"
          hint="Dari WhatsApp panitia — satu kode untuk satu calon murid. Anak kedua memakai kodenya masing-masing."
        >
          <Input
            name="formCode"
            required
            placeholder="SPMB-XXXXXX"
            autoComplete="off"
            className="font-mono uppercase tracking-widest"
            style={{ textTransform: 'uppercase' }}
          />
        </Field>
        <Field
          label="No. HP Orang Tua/Wali"
          hint="Harus sama dengan nomor yang dipakai saat daftar titipan — jadi verifikasi bahwa kode ini milik Anda."
        >
          <Input
            name="phone"
            type="tel"
            required
            inputMode="tel"
            autoComplete="tel"
            placeholder="08xxxxxxxxxx"
          />
        </Field>
        <Field
          label="Kata Sandi"
          hint="Minimal 8 karakter. Sudah punya akun? Masukkan kata sandi akun Anda — anak ini otomatis ditambahkan ke akun yang sama."
        >
          <Input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="••••••••"
          />
        </Field>
        {error ? (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? 'Memproses…' : 'Daftar & Buka Formulir'}
        </Button>
        <p className="text-center text-xs leading-relaxed text-sand-500">
          Akun dibuat otomatis dari No. HP Anda — selanjutnya cukup masuk
          memakai No. HP + kata sandi ini.
        </p>
      </form>
    </AuthShell>
  );
}
