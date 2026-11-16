'use client';

import { DashShell, useCbtLogin } from '@/components/dash-shell';

const fmt = (s?: string | null) =>
  s ? new Date(s).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }) : '—';

/** Riwayat ujian yang sudah dikumpulkan — nilai tampil bila ujian mengizinkan. */
export default function RiwayatPage() {
  const login = useCbtLogin();
  if (!login) return null;
  const list = login.history ?? [];

  return (
    <DashShell title="Riwayat Ujian">
      {list.length === 0 ? (
        <p className="rounded-3xl border border-sand-200 bg-white p-6 text-center text-sm text-sand-500 shadow-card">
          Belum ada ujian yang kamu kerjakan.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {list.map((e, i) => (
            <li key={i} className="flex items-center gap-3 rounded-2xl border border-sand-200 bg-white px-4 py-3 shadow-card">
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-sand-900">{e.title}</p>
                <p className="text-xs text-sand-500">{e.subject}</p>
                <p className="mt-0.5 text-xs text-sand-600">Dikumpulkan {fmt(e.submittedAt)}</p>
              </div>
              <div className="shrink-0 text-right">
                {e.score != null ? (
                  <>
                    <p className="text-lg font-extrabold text-primary-700">{e.score}</p>
                    <p className="text-[10px] text-sand-400">dari {e.maxScore ?? '—'}</p>
                  </>
                ) : (
                  <span className="rounded-full bg-sand-100 px-2.5 py-1 text-[10px] font-bold text-sand-500">Selesai</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </DashShell>
  );
}
