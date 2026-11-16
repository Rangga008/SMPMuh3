'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Input, Modal } from '@smpmuh3/ui';
import {
  API,
  ApiError,
  login,
  requestPasswordOtp,
  resetPasswordWithOtp,
  setTokens,
} from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [school, setSchool] = useState<{
    name: string;
    hasLogo?: boolean;
    logoVersion?: number;
  } | null>(null);
  // Lupa sandi — step 'ask' (identifier) → 'otp' (kode + sandi baru).
  const [reset, setReset] = useState<
    | { step: 'ask' }
    | { step: 'otp'; identifier: string }
    | { step: 'done' }
    | null
  >(null);
  const [resetErr, setResetErr] = useState<string | null>(null);
  const [resetBusy, setResetBusy] = useState(false);

  useEffect(() => {
    fetch(`${API}/school/public`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setSchool(j?.data ?? j ?? null))
      .catch(() => undefined);
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      const tokens = await login(String(f.get('identifier')), String(f.get('password')));
      setTokens(tokens);
      router.push('/');
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Gagal masuk. Periksa email/nomor HP dan kata sandi.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function onAskOtp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setResetErr(null);
    setResetBusy(true);
    const identifier = String(new FormData(e.currentTarget).get('identifier')).trim();
    try {
      await requestPasswordOtp(identifier);
      setReset({ step: 'otp', identifier });
    } catch (err) {
      setResetErr(err instanceof ApiError ? err.message : 'Gagal mengirim OTP. Coba lagi.');
    } finally {
      setResetBusy(false);
    }
  }

  async function onResetOtp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!reset || reset.step !== 'otp') return;
    setResetErr(null);
    setResetBusy(true);
    const f = new FormData(e.currentTarget);
    const password = String(f.get('password'));
    const confirm = String(f.get('confirm'));
    if (password !== confirm) {
      setResetErr('Konfirmasi kata sandi tidak sama.');
      setResetBusy(false);
      return;
    }
    try {
      await resetPasswordWithOtp(reset.identifier, String(f.get('code')).trim(), password);
      setReset({ step: 'done' });
    } catch (err) {
      setResetErr(err instanceof ApiError ? err.message : 'Kode OTP salah atau kedaluwarsa.');
    } finally {
      setResetBusy(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-b from-primary-950 via-primary-900 to-primary-950 px-4 py-10">
      <div aria-hidden="true" className="pattern-islami-light pointer-events-none absolute inset-0" />
      <div className="relative w-full max-w-md">
        <div className="text-center">
          {school?.hasLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/logo.png?v=${school.logoVersion ?? 1}`}
              alt=""
              className="mx-auto size-14 rounded-2xl bg-white object-contain p-1.5 shadow-card"
            />
          ) : (
            <span
              aria-hidden="true"
              className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-accent-400 text-lg font-extrabold text-primary-950 shadow-card"
            >
              M3
            </span>
          )}
          <h1 className="mt-5 text-2xl font-extrabold tracking-tight text-white">
            Admin Sekolah
          </h1>
          <p className="mt-1.5 text-sm text-primary-200">
            {school?.name ?? 'Sekolah'}
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="mt-7 space-y-4 rounded-3xl border border-sand-200 bg-white p-6 shadow-lift sm:p-8"
        >
          <Field label="Email atau Nomor HP">
            <Input name="identifier" required autoComplete="username" placeholder="nama@sekolah.id" />
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
          <button
            type="button"
            onClick={() => {
              setReset({ step: 'ask' });
              setResetErr(null);
            }}
            className="w-full text-center text-sm font-semibold text-primary-700 hover:text-primary-800 hover:underline"
          >
            Lupa kata sandi?
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-primary-300">
          Akses khusus staf dan guru.
        </p>

        <Modal
          open={!!reset}
          onClose={() => setReset(null)}
          size="md"
          title={
            reset?.step === 'ask'
              ? 'Lupa Kata Sandi'
              : reset?.step === 'otp'
                ? 'Masukkan Kode OTP'
                : 'Sandi Berhasil Direset'
          }
          description={
            reset?.step === 'ask'
              ? 'Kode OTP akan dikirim ke WhatsApp nomor yang terdaftar di akun Anda.'
              : reset?.step === 'otp'
                ? 'Bila nomor terdaftar, kode 6 digit telah dikirim via WhatsApp — berlaku 10 menit.'
                : undefined
          }
        >
          {reset?.step === 'ask' ? (
                <form onSubmit={onAskOtp} className="space-y-4">
                  <Field label="Email atau Nomor HP">
                    <Input name="identifier" required autoComplete="username" placeholder="nama@sekolah.id / 08xx" />
                  </Field>
                  {resetErr ? (
                    <p role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">{resetErr}</p>
                  ) : null}
                  <div className="flex gap-2">
                    <Button type="button" variant="secondary" className="flex-1" onClick={() => setReset(null)}>
                      Batal
                    </Button>
                    <Button type="submit" disabled={resetBusy} className="flex-1">
                      {resetBusy ? 'Mengirim…' : 'Kirim OTP'}
                    </Button>
                  </div>
                </form>
              ) : reset?.step === 'otp' ? (
                <form onSubmit={onResetOtp} className="space-y-4">
                  <Field label="Kode OTP">
                    <Input
                      name="code"
                      required
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      placeholder="6 digit"
                      className="text-center font-mono text-lg tracking-[0.4em]"
                    />
                  </Field>
                  <Field label="Kata Sandi Baru">
                    <Input name="password" type="password" required minLength={8} autoComplete="new-password" placeholder="Min. 8 karakter" />
                  </Field>
                  <Field label="Ulangi Kata Sandi Baru">
                    <Input name="confirm" type="password" required minLength={8} autoComplete="new-password" />
                  </Field>
                  {resetErr ? (
                    <p role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">{resetErr}</p>
                  ) : null}
                  <div className="flex gap-2">
                    <Button type="button" variant="secondary" className="flex-1" onClick={() => setReset(null)}>
                      Batal
                    </Button>
                    <Button type="submit" disabled={resetBusy} className="flex-1">
                      {resetBusy ? 'Memproses…' : 'Reset Sandi'}
                    </Button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReset({ step: 'ask' })}
                    className="w-full text-center text-xs font-semibold text-sand-500 hover:text-primary-700"
                  >
                    Kirim ulang kode OTP
                  </button>
                </form>
              ) : (
                <div className="space-y-4 text-center">
                  <span aria-hidden="true" className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-emerald-100 text-2xl">✓</span>
                  <p className="text-sm text-sand-600">Silakan masuk kembali dengan kata sandi baru Anda.</p>
                  <Button className="w-full" onClick={() => setReset(null)}>
                    Kembali Masuk
                  </Button>
                </div>
              )}
        </Modal>
      </div>
    </main>
  );
}
