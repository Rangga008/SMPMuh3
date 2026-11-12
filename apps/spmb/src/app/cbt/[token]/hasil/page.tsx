'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { getResult, type CbtResult } from '@/lib/cbt';
import { AuthShell } from '@/components/auth-shell';

export default function CbtResultPage() {
  const { token } = useParams<{ token: string }>();
  const params = useSearchParams();
  const auto = params.get('auto') === '1';
  const [r, setR] = useState<CbtResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getResult(token)
      .then(setR)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Sesi tidak ditemukan.'));
  }, [token]);

  return (
    <AuthShell title="Ujian Selesai" {...(r?.examTitle ? { subtitle: r.examTitle } : {})}>
      {error ? (
        <div className="space-y-4">
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">{error}</p>
          <Link href="/cbt" className="block text-center text-sm font-semibold text-primary-700 hover:underline">
            ← Masuk ulang
          </Link>
        </div>
      ) : !r ? (
        <p className="text-center text-sm text-sand-500">Memuat…</p>
      ) : (
        <div className="space-y-5 text-center">
          <div className="text-5xl">{r.status === 'SUBMITTED' ? '✅' : '📝'}</div>
          <div>
            <p className="font-bold text-sand-900">
              {auto ? 'Waktu habis — jawabanmu otomatis dikumpulkan.' : 'Jawabanmu sudah dikumpulkan.'}
            </p>
            <p className="mt-1 text-sm text-sand-500">{r.subject}</p>
          </div>
          {r.score !== null && r.maxScore !== null ? (
            <div className="rounded-2xl bg-sand-50 p-5">
              <p className="text-xs font-bold uppercase tracking-wide text-sand-400">Nilai kamu</p>
              <p className="mt-1 text-4xl font-black text-primary-700">
                {r.score}<span className="text-lg font-medium text-sand-400">/{r.maxScore}</span>
              </p>
            </div>
          ) : (
            <p className="rounded-2xl bg-sand-50 p-4 text-sm text-sand-500">
              Nilai akan diumumkan guru melalui kanal resmi.
            </p>
          )}
          <Link href="/cbt" className="block text-sm font-semibold text-primary-700 hover:underline">
            ← Selesai
          </Link>
        </div>
      )}
    </AuthShell>
  );
}
