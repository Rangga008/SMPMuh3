'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Input } from '@smpmuh3/ui';
import { ApiError } from '@/lib/api';
import { enterExam, type CbtLogin } from '@/lib/cbt';
import { ExamShell } from '@/components/exam-shell';

interface LoginState extends CbtLogin {
  nis: string;
  password: string;
}

const KEY = 'cbt.login';

/** Dashboard siswa — identitas + input kode ujian yang diumumkan pengawas. */
export default function CbtDashboardPage() {
  const router = useRouter();
  const [login, setLogin] = useState<LoginState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) {
      router.replace('/');
      return;
    }
    try {
      setLogin(JSON.parse(raw) as LoginState);
    } catch {
      sessionStorage.removeItem(KEY);
      router.replace('/');
    }
  }, [router]);

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

  function keluar() {
    sessionStorage.removeItem(KEY);
    router.replace('/');
  }

  const done = login?.exams.length === 1 && login.exams[0]?.attemptStatus === 'SUBMITTED';

  return (
    <ExamShell
      title={login ? `Halo, ${login.student.name.split(' ')[0]}!` : 'Memuat…'}
      subtitle={login ? `${login.student.className} · NIS ${login.student.nis ?? '—'}` : ''}
    >
      {login ? (
        <div className="space-y-4">
          <div className="space-y-2">
            {login.exams.length ? (
              login.exams.map((ex) => (
                <div key={`${ex.title}-${ex.startAt}`} className="rounded-2xl border border-primary-100 bg-primary-50 px-4 py-3">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-primary-700">Ujian kamu</p>
                  <p className="mt-0.5 font-extrabold text-sand-900">{ex.title}</p>
                  <p className="text-sm text-sand-600">
                    {ex.subject}
                    {ex.attemptStatus === 'SUBMITTED' ? ' · ✅ sudah selesai' : ''}
                  </p>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Belum ada ujian aktif untukmu — tunggu pengawas membuka ujian.
              </div>
            )}
          </div>

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
                  className="font-mono text-center text-lg tracking-[0.3em] uppercase"
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

          <button
            type="button"
            onClick={keluar}
            className="w-full rounded-xl px-4 py-2 text-sm font-semibold text-sand-500 transition-colors hover:bg-sand-100 hover:text-sand-700"
          >
            ← Keluar / ganti akun
          </button>
        </div>
      ) : null}
    </ExamShell>
  );
}
