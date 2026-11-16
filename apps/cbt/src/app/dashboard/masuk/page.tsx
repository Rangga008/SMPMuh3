'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Input } from '@smpmuh3/ui';
import { ApiError } from '@/lib/api';
import { enterExam } from '@/lib/cbt';
import { DashShell, useCbtLogin } from '@/components/dash-shell';

/** Masuk ujian — ketik kode yang diumumkan pengawas di ruang. */
export default function MasukUjianPage() {
  const router = useRouter();
  const login = useCbtLogin();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!login) return;
    setError(null);
    setBusy(true);
    const code = String(new FormData(e.currentTarget).get('code')).trim();
    try {
      const s = await enterExam(login.nis, code, login.password);
      sessionStorage.setItem('cbt.token', s.token);
      router.push(`/${s.token}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal masuk ujian — periksa kode dari pengawas.');
    } finally {
      setBusy(false);
    }
  }

  if (!login) return null;
  const done = login.exams.length === 1 && login.exams[0]?.attemptStatus === 'SUBMITTED';

  return (
    <DashShell title="Masuk Ujian">
      <div className="space-y-4">
        {login.exams.length ? (
          login.exams.map((ex, i) => (
            <div key={i} className="rounded-2xl border border-primary-100 bg-primary-50 px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-primary-700">Ujian kamu</p>
              <p className="mt-0.5 font-extrabold text-sand-900">{ex.title}</p>
              <p className="text-sm text-sand-600">
                {ex.subject}
                {ex.attemptStatus === 'SUBMITTED' ? ' · sudah selesai' : ''}
              </p>
            </div>
          ))
        ) : (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Belum ada ujian aktif untukmu — tunggu pengawas membuka ujian.
          </div>
        )}

        <div className="rounded-3xl border border-sand-200 bg-white p-6 shadow-card">
          {done ? (
            <p className="rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700">
              Kamu sudah menyelesaikan ujian ini. Tidak perlu masuk lagi.
            </p>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <Field label="Kode Ujian" hint="Diberikan pengawas di ruang ujian">
                <Input
                  name="code"
                  required
                  autoComplete="off"
                  placeholder="XXXX-XXXX"
                  className="font-mono text-center text-lg uppercase tracking-[0.3em]"
                />
              </Field>
              {error ? (
                <p role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">
                  {error}
                </p>
              ) : null}
              <Button type="submit" disabled={busy} className="w-full">
                {busy ? 'Memeriksa…' : 'Mulai Ujian'}
              </Button>
            </form>
          )}
        </div>
      </div>
    </DashShell>
  );
}
