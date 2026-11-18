'use client';

import { useEffect, useState } from 'react';

function isChunkError(error: Error): boolean {
  const msg = `${error?.name ?? ''} ${error?.message ?? ''}`;
  return /chunk|dynamically imported|Loading CSS|import failed/i.test(msg);
}

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [showDetail, setShowDetail] = useState(false);
  const chunkError = isChunkError(error);

  useEffect(() => {
    console.error('[app-error]', error);
    // Chunk lama sudah tidak ada setelah deploy — muat ulang sekali secara otomatis.
    if (chunkError && !sessionStorage.getItem('chunk-reload')) {
      sessionStorage.setItem('chunk-reload', '1');
      window.location.reload();
    }
    if (!chunkError) sessionStorage.removeItem('chunk-reload');
  }, [error, chunkError]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-sand-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-2xl">⚠️</div>
        <h2 className="text-lg font-bold text-sand-900">
          {chunkError ? 'Versi aplikasi baru tersedia' : 'Terjadi kesalahan'}
        </h2>
        <p className="mt-2 text-sm text-sand-500">
          {chunkError
            ? 'Aplikasi baru saja diperbarui. Muat ulang halaman untuk melanjutkan.'
            : 'Halaman ini gagal dimuat. Coba lagi — jika berulang, hubungi admin.'}
        </p>

        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => (chunkError ? window.location.reload() : reset())}
            className="w-full rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800"
          >
            {chunkError ? 'Muat Ulang Sekarang' : 'Coba Lagi'}
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="w-full rounded-xl border border-sand-200 px-4 py-2.5 text-sm font-medium text-sand-700 hover:bg-sand-50"
          >
            Muat Ulang Halaman
          </button>
          <a
            href="/"
            className="w-full rounded-xl px-4 py-2.5 text-sm font-medium text-sand-500 hover:bg-sand-50"
          >
            ← Kembali ke Dasbor
          </a>
        </div>

        {error?.digest || error?.message ? (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setShowDetail((v) => !v)}
              className="text-xs text-sand-400 underline underline-offset-2 hover:text-sand-600"
            >
              {showDetail ? 'Sembunyikan detail' : 'Detail teknis'}
            </button>
            {showDetail ? (
              <pre className="mt-2 max-h-32 overflow-auto rounded-lg bg-sand-50 p-3 text-left text-[10px] leading-relaxed text-sand-500">
                {error.message}
                {error.digest ? `\nDigest: ${error.digest}` : ''}
              </pre>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
