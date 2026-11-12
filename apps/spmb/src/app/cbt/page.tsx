'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Input } from '@smpmuh3/ui';
import { ApiError } from '@/lib/api';
import { enterExam } from '@/lib/cbt';
import { AuthShell } from '@/components/auth-shell';

export default function CbtEntryPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      const s = await enterExam(String(f.get('nis')).trim(), String(f.get('code')).trim());
      sessionStorage.setItem('cbt.token', s.token);
      router.push(`/cbt/${s.token}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal masuk — periksa NIS & kode.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Ujian CBT"
      subtitle="Masuk dengan NIS dan kode ujian dari pengawas"
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="NIS (Nomor Induk Siswa)">
          <Input name="nis" required autoComplete="off" inputMode="numeric" placeholder="contoh: 2024001" />
        </Field>
        <Field label="Kode Ujian">
          <Input name="code" required autoComplete="off" placeholder="XXXX-XXXX" className="font-mono tracking-widest uppercase" />
        </Field>
        {error ? (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? 'Memeriksa…' : 'Masuk Ujian'}
        </Button>
      </form>
    </AuthShell>
  );
}
