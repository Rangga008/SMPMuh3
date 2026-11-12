'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@smpmuh3/ui';
import { ApiError } from '@/lib/api';
import { getSession, type CbtSession } from '@/lib/cbt';
import { AuthShell } from '@/components/auth-shell';

const fmt = (sec: number) =>
  `${Math.floor(sec / 3600) > 0 ? `${Math.floor(sec / 3600)}:` : ''}${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;

export default function CbtPrepPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [s, setS] = useState<CbtSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    getSession(token)
      .then((d) => {
        setS(d);
        if (d.attempt.status === 'SUBMITTED') router.replace(`/cbt/${token}/hasil`);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Sesi tidak valid.'));
  }, [token, router]);
  useEffect(load, [load]);

  // Tick countdown sisa waktu.
  useEffect(() => {
    const t = setInterval(() => {
      setS((cur) =>
        cur
          ? {
              ...cur,
              attempt: { ...cur.attempt, remainingSec: Math.max(0, cur.attempt.remainingSec - 1) },
            }
          : cur,
      );
    }, 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <AuthShell title="Persiapan Ujian" subtitle={s ? s.exam.title : 'Memeriksa sesi…'}>
      {error ? (
        <div className="space-y-4">
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">{error}</p>
          <Link href="/cbt" className="block text-center text-sm font-semibold text-primary-700 hover:underline">
            ← Masuk ulang
          </Link>
        </div>
      ) : !s ? (
        <p className="text-center text-sm text-sand-500">Memuat…</p>
      ) : (
        <div className="space-y-5">
          <dl className="space-y-2 rounded-2xl bg-sand-50 p-4 text-sm">
            <div className="flex justify-between"><dt className="text-sand-500">Nama</dt><dd className="font-bold">{s.student.name}</dd></div>
            <div className="flex justify-between"><dt className="text-sand-500">NIS · Rombel</dt><dd className="font-medium">{s.student.nis ?? '—'} · {s.student.className}</dd></div>
            <div className="flex justify-between"><dt className="text-sand-500">Mata Pelajaran</dt><dd className="font-medium">{s.exam.subject}</dd></div>
            <div className="flex justify-between"><dt className="text-sand-500">Jumlah Soal</dt><dd className="font-medium">{s.exam.totalQuestions} butir</dd></div>
            <div className="flex justify-between"><dt className="text-sand-500">Durasi</dt><dd className="font-medium">{s.exam.durationMin} menit</dd></div>
          </dl>
          {s.exam.instructions ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="mb-1 font-bold">Instruksi:</p>
              <p>{s.exam.instructions}</p>
            </div>
          ) : null}
          <div className="rounded-2xl border border-sand-200 p-4 text-center">
            <p className="text-xs font-bold uppercase tracking-wide text-sand-400">Sisa waktu pengerjaan</p>
            <p className={`mt-1 font-mono text-3xl font-black ${s.attempt.remainingSec < 300 ? 'text-red-600' : 'text-sand-900'}`}>
              {fmt(s.attempt.remainingSec)}
            </p>
            <p className="mt-1 text-[11px] text-sand-400">Waktu berjalan sejak kamu masuk — jangan tutup halaman.</p>
          </div>
          <Button className="w-full" onClick={() => router.push(`/cbt/${token}/mulai`)}>
            Mulai Kerjakan →
          </Button>
        </div>
      )}
    </AuthShell>
  );
}
