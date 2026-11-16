'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@smpmuh3/ui';
import { DashShell, cbtLogout, useCbtLogin } from '@/components/dash-shell';

/** Profil siswa — identitas dari kartu ujian. */
export default function ProfilPage() {
  const router = useRouter();
  const login = useCbtLogin();
  if (!login) return null;

  return (
    <DashShell title="Profil">
      <div className="space-y-4">
        <div className="rounded-3xl border border-sand-200 bg-white p-6 shadow-card">
          <div className="flex items-center gap-4">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-primary-700 text-xl font-extrabold text-white">
              {login.student.name.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-lg font-extrabold text-sand-950">{login.student.name}</p>
              <p className="text-sm text-sand-600">{login.student.className}</p>
            </div>
          </div>
          <dl className="mt-5 space-y-3 border-t border-sand-100 pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-sand-500">NIS</dt>
              <dd className="font-semibold text-sand-900">{login.student.nis ?? '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sand-500">Kelas</dt>
              <dd className="font-semibold text-sand-900">{login.student.className}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sand-500">Password</dt>
              <dd className="font-mono font-semibold text-sand-900">{'•'.repeat(Math.max(login.password.length, 6))}</dd>
            </div>
          </dl>
          <p className="mt-3 rounded-xl bg-sand-50 px-3 py-2 text-xs text-sand-500">
            Password dicetak di kartu peserta ujian — simpan baik-baik.
          </p>
        </div>
        <Button variant="secondary" className="w-full" onClick={() => cbtLogout(router)}>
          Keluar / ganti akun
        </Button>
      </div>
    </DashShell>
  );
}
