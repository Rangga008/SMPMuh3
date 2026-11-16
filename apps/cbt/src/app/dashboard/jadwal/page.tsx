'use client';

import { DashShell, useCbtLogin } from '@/components/dash-shell';

const fmt = (s?: string | null) =>
  s ? new Date(s).toLocaleString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }) : '—';

const STATUS: Record<string, { label: string; cls: string }> = {
  OPEN: { label: 'Dibuka', cls: 'bg-emerald-100 text-emerald-700' },
  DRAFT: { label: 'Belum dibuka', cls: 'bg-sand-100 text-sand-500' },
  CLOSED: { label: 'Selesai', cls: 'bg-sand-200 text-sand-600' },
};

/** Jadwal ujian siswa — semua ujian yang menyertakan rombelnya. */
export default function JadwalPage() {
  const login = useCbtLogin();
  if (!login) return null;
  const list = login.schedule ?? [];

  return (
    <DashShell title="Jadwal Ujian">
      {list.length === 0 ? (
        <p className="rounded-3xl border border-sand-200 bg-white p-6 text-center text-sm text-sand-500 shadow-card">
          Belum ada ujian terjadwal untuk kelasmu.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {list.map((e, i) => {
            const st = STATUS[e.status] ?? STATUS.DRAFT!;
            const past = e.attemptStatus === 'SUBMITTED';
            return (
              <li key={i} className="flex items-center gap-3 rounded-2xl border border-sand-200 bg-white px-4 py-3 shadow-card">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-sand-900">{e.title}</p>
                  <p className="text-xs text-sand-500">{e.subject}</p>
                  <p className="mt-0.5 text-xs text-sand-600">{fmt(e.startAt)} — {fmt(e.endAt)}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${past ? 'bg-emerald-100 text-emerald-700' : st.cls}`}>
                  {past ? 'Dikerjakan' : st.label}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </DashShell>
  );
}
