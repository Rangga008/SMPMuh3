'use client';

import Link from 'next/link';
import { DashShell, useCbtLogin } from '@/components/dash-shell';

const fmtDt = (s?: string | null) =>
  s ? new Date(s).toLocaleString('id-ID', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }) : '—';

/** Beranda — sapaan + menu utama + ringkasan ujian aktif. */
export default function CbtDashboardPage() {
  const login = useCbtLogin();
  if (!login) return null;

  const active = login.exams.filter((e) => e.attemptStatus !== 'SUBMITTED');
  const upcoming = (login.schedule ?? []).filter((e) => e.status !== 'OPEN' && new Date(e.startAt) > new Date());

  return (
    <DashShell title={`Halo, ${login.student.name.split(' ')[0]}!`}>
      <div className="space-y-5">
        <div className="rounded-3xl border border-primary-100 bg-white p-5 shadow-card">
          <p className="text-xs font-bold uppercase tracking-wider text-primary-600">Siswa</p>
          <p className="mt-1 text-xl font-extrabold text-sand-950">{login.student.name}</p>
          <p className="text-sm text-sand-600">{login.student.className} · NIS {login.student.nis ?? '—'}</p>
        </div>

        {active.length ? (
          <div className="rounded-3xl border border-primary-200 bg-primary-50 p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-primary-700">Ujian sedang dibuka</p>
            {active.map((ex, i) => (
              <div key={i} className="mt-2 flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-bold text-sand-900">{ex.title}</p>
                  <p className="text-xs text-sand-500">{ex.subject} · s.d. {fmtDt(ex.endAt)}</p>
                </div>
                <Link href="/dashboard/masuk" className="shrink-0 rounded-xl bg-primary-700 px-4 py-2 text-xs font-bold text-white">
                  Masuk
                </Link>
              </div>
            ))}
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { href: '/dashboard/masuk', icon: '🔑', label: 'Kode Ujian', sub: 'Masuk ujian' },
            { href: '/dashboard/jadwal', icon: '📅', label: 'Jadwal', sub: `${upcoming.length} akan datang` },
            { href: '/dashboard/riwayat', icon: '📋', label: 'Riwayat', sub: `${(login.history ?? []).length} selesai` },
            { href: '/dashboard/profil', icon: '👤', label: 'Profil', sub: 'Akun saya' },
          ].map((m) => (
            <Link
              key={m.href}
              href={m.href}
              className="flex flex-col items-center gap-1.5 rounded-3xl border border-sand-200 bg-white p-4 text-center shadow-card transition hover:border-primary-300 hover:shadow-lift"
            >
              <span aria-hidden="true" className="text-2xl">{m.icon}</span>
              <span className="text-sm font-bold text-sand-900">{m.label}</span>
              <span className="text-[11px] text-sand-500">{m.sub}</span>
            </Link>
          ))}
        </div>
      </div>
    </DashShell>
  );
}
