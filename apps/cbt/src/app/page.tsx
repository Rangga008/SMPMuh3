'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Input, PasswordInput } from '@smpmuh3/ui';
import { ApiError } from '@/lib/api';
import { loginCbt } from '@/lib/cbt';
import { ExamShell } from '@/components/exam-shell';

export default function CbtLoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const f = new FormData(e.currentTarget);
    const nis = String(f.get('nis')).trim();
    const password = String(f.get('password')).trim();
    try {
      const s = await loginCbt(nis, password);
      // Kredensial disimpan untuk langkah berikutnya (kode ujian dari pengawas).
      sessionStorage.setItem('cbt.login', JSON.stringify({ nis, password, ...s }));
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal masuk — periksa NIS & password kartumu.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ExamShell
      title="Ujian CBT"
      subtitle="Masuk dengan NIS & password dari kartu peserta"
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="NIS (Nomor Induk Siswa)">
          <Input name="nis" required autoComplete="off" inputMode="numeric" placeholder="contoh: 2024001" />
        </Field>
        <Field label="Password (di kartu peserta)">
          <PasswordInput name="password" required autoComplete="off" placeholder="KPXXXX" className="font-mono tracking-widest uppercase" />
        </Field>
        {error ? (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? 'Memeriksa…' : 'Masuk'}
        </Button>
        <p className="text-center text-xs text-sand-500">
          Kode ujian akan diberikan pengawas di ruang ujian.
        </p>
      </form>
    </ExamShell>
  );
}
