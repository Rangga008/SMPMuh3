'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AuthUser } from '@smpmuh3/types';
import { Badge, Button, Field, Input, Modal } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { PageTitle, Widget } from '@/components/widgets';
import {
  changeMyPassword,
  logout,
  me,
  myEmployee,
  updateMe,
  type MyEmployee,
} from '@/lib/api';

const EMPLOYEE_TYPE: Record<string, string> = {
  TEACHER: 'Guru',
  STAFF: 'Staf / TU',
  PRINCIPAL: 'Kepala Sekolah',
  OTHER: 'Lainnya',
};

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-sand-100 py-2.5 last:border-0">
      <dt className="text-xs font-semibold uppercase tracking-wide text-sand-400">
        {label}
      </dt>
      <dd className="text-right text-sm font-medium text-sand-900">
        {value || '—'}
      </dd>
    </div>
  );
}

/** Profil pegawai — data akun + data kepegawaian + ganti sandi mandiri. */
export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [employee, setEmployee] = useState<MyEmployee | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [u, e] = await Promise.all([me(), myEmployee().catch(() => null)]);
      setUser(u);
      setEmployee(e);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat profil.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Shell>
      <PageTitle
        title="Profil Saya"
        subtitle="Data akun dan kepegawaian Anda. Perubahan nama/kontak langsung memperbarui sesi."
      />
      {error ? (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          {notice}
        </p>
      ) : null}

      {user ? (
        <div className="grid gap-5 lg:grid-cols-2">
          {/* ---------- Akun ---------- */}
          <Widget
            title="Akun Saya"
            action={
              <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                Ubah Profil
              </Button>
            }
          >
            <div className="mb-4 flex items-center gap-4">
              <span
                aria-hidden="true"
                className="flex size-14 items-center justify-center rounded-2xl bg-primary-700 text-xl font-extrabold text-white"
              >
                {(user.name || '?').slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-base font-extrabold text-sand-900">
                  {user.name}
                </p>
                <span className="mt-1 flex flex-wrap gap-1.5">
                  {user.roles.map((r) => (
                    <Badge key={r} tone="primary">
                      {r}
                    </Badge>
                  ))}
                </span>
              </div>
            </div>
            <dl>
              <Row label="Email" value={user.email} />
              <Row label="No. HP" value={user.phone} />
            </dl>
          </Widget>

          {/* ---------- Data Pegawai ---------- */}
          <Widget title="Data Pegawai">
            {employee ? (
              <>
                <dl>
                  <Row label="Nama" value={employee.name} />
                  <Row label="NIP" value={employee.nip} />
                  <Row
                    label="Jenis"
                    value={EMPLOYEE_TYPE[employee.type] ?? employee.type}
                  />
                  <Row label="Email Pegawai" value={employee.email} />
                  <Row label="No. HP Pegawai" value={employee.phone} />
                  <Row
                    label="Status"
                    value={employee.isActive ? 'Aktif' : 'Nonaktif'}
                  />
                </dl>
                <p className="mt-3 text-xs leading-relaxed text-sand-400">
                  Data kepegawaian dikelola oleh admin Kepegawaian — hubungi
                  admin bila ada yang perlu dikoreksi.
                </p>
              </>
            ) : (
              <p className="text-sm text-sand-500">
                Akun ini belum terhubung ke data pegawai. Minta admin
                Kepegawaian untuk menautkannya.
              </p>
            )}
          </Widget>

          {/* ---------- Keamanan ---------- */}
          <Widget title="Keamanan" className="lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-sand-900">Kata Sandi</p>
                <p className="text-xs text-sand-500">
                  Terakhir diubah tidak dicatat — ganti berkala demi keamanan.
                  Semua sesi lain akan dikeluarkan setelah ganti sandi.
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setPwOpen(true)}>
                Ganti Sandi
              </Button>
            </div>
          </Widget>
        </div>
      ) : (
        <p className="text-sm text-sand-400">Memuat profil…</p>
      )}

      {/* ---------- Modal ubah profil ---------- */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Ubah Profil">
        {user ? (
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              setBusy(true);
              setError(null);
              try {
                const u = await updateMe({
                  name: String(f.get('name')),
                  phone: String(f.get('phone') || ''),
                  email: String(f.get('email') || ''),
                });
                setUser(u);
                setEditOpen(false);
                setNotice('Profil diperbarui.');
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Gagal menyimpan.');
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Nama Lengkap">
              <Input name="name" required minLength={3} defaultValue={user.name} />
            </Field>
            <Field label="No. HP">
              <Input name="phone" defaultValue={user.phone ?? ''} placeholder="08xxxxxxxxxx" />
            </Field>
            <Field label="Email">
              <Input name="email" type="email" defaultValue={user.email ?? ''} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setEditOpen(false)}>
                Batal
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? 'Menyimpan…' : 'Simpan'}
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>

      {/* ---------- Modal ganti sandi ---------- */}
      <Modal open={pwOpen} onClose={() => setPwOpen(false)} title="Ganti Kata Sandi">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const next = String(f.get('newPassword'));
            if (next !== String(f.get('confirm'))) {
              setError('Konfirmasi sandi baru tidak sama.');
              return;
            }
            setBusy(true);
            setError(null);
            try {
              await changeMyPassword(String(f.get('currentPassword')), next);
              setPwOpen(false);
              setNotice('Sandi diperbarui — sesi lain dikeluarkan. Anda akan masuk ulang…');
              // Semua refresh token dicabut server-side → keluar agar login ulang.
              setTimeout(() => {
                void logout().finally(() => router.replace('/masuk'));
              }, 1800);
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Gagal mengganti sandi.');
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Sandi Saat Ini">
            <Input name="currentPassword" type="password" required autoComplete="current-password" />
          </Field>
          <Field label="Sandi Baru" hint="Minimal 8 karakter.">
            <Input name="newPassword" type="password" required minLength={8} autoComplete="new-password" />
          </Field>
          <Field label="Ulangi Sandi Baru">
            <Input name="confirm" type="password" required minLength={8} autoComplete="new-password" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setPwOpen(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Menyimpan…' : 'Ganti Sandi'}
            </Button>
          </div>
        </form>
      </Modal>
    </Shell>
  );
}
