'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Field, Input, Modal } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { PageTitle } from '@/components/widgets';
import {
  createStaffUser,
  deleteStaffUser,
  listRoles,
  listStaffUsers,
  resetStaffPassword,
  updateStaffUser,
  type RoleOption,
  type StaffUser,
} from '@/lib/api';

const roleBadge = (key: string) =>
  key === 'superadmin'
    ? 'text-red-700 bg-red-50'
    : key === 'ops_admin'
      ? 'text-primary-700 bg-primary-50'
      : 'text-sand-600 bg-sand-100';

export default function AccountSettingsPage() {
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<StaffUser | null>(null);
  const [resetTarget, setResetTarget] = useState<StaffUser | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const [u, r] = await Promise.all([listStaffUsers(), listRoles()]);
      setUsers(u);
      setRoles(r.filter((x) => x.key !== 'spmb_parent'));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat akun.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleRole = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const openEdit = (u: StaffUser) => {
    setEditing(u);
    setPicked(new Set(u.roles.map((r) => r.role.id)));
  };

  const rolePicker = (
    <div className="flex flex-wrap gap-2">
      {roles.map((r) => (
        <button
          key={r.id}
          type="button"
          onClick={() => toggleRole(r.id)}
          className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
            picked.has(r.id)
              ? 'border-primary-600 bg-primary-600 text-white'
              : 'border-sand-300 bg-white text-sand-600 hover:border-primary-400'
          }`}
        >
          {r.name}
        </button>
      ))}
    </div>
  );

  const submitNew = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (picked.size === 0) {
      setError('Pilih minimal satu role.');
      return;
    }
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await createStaffUser({
        name: String(fd.get('name')),
        email: String(fd.get('email') || '') || undefined,
        phone: String(fd.get('phone') || '') || undefined,
        password: String(fd.get('password')),
        roleIds: [...picked],
      });
      setShowNew(false);
      setPicked(new Set());
      setNotice('Akun dibuat.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuat akun.');
    } finally {
      setBusy(false);
    }
  };

  const submitEdit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editing) return;
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await updateStaffUser(editing.id, {
        name: String(fd.get('name')),
        email: String(fd.get('email') || ''),
        phone: String(fd.get('phone') || ''),
        roleIds: [...picked],
      });
      setEditing(null);
      setNotice('Akun diperbarui.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memperbarui.');
    } finally {
      setBusy(false);
    }
  };

  const submitReset = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!resetTarget) return;
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await resetStaffPassword(resetTarget.id, String(fd.get('password')));
      setResetTarget(null);
      setNotice('Kata sandi diatur ulang.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengatur ulang.');
    } finally {
      setBusy(false);
    }
  };

  const toggleStatus = async (u: StaffUser) => {
    setBusy(true);
    try {
      await updateStaffUser(u.id, {
        status: u.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE',
      });
      setNotice(u.status === 'ACTIVE' ? 'Akun dinonaktifkan.' : 'Akun diaktifkan.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengubah status.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (u: StaffUser) => {
    if (!window.confirm(`Hapus akun ${u.name}? Ini tidak bisa dibatalkan.`)) return;
    setBusy(true);
    try {
      await deleteStaffUser(u.id);
      setNotice('Akun dihapus.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <PageTitle
        title="Manajemen Akun"
        subtitle="Akun staf & pegawai operasional — terpisah dari akun orang tua SPMB."
        actions={
          <Button onClick={() => { setPicked(new Set()); setShowNew(true); }}>
            + Akun Baru
          </Button>
        }
      />

      {error ? <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {notice ? (
        <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p>
      ) : null}

      <div className="overflow-hidden rounded-3xl border border-sand-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-sand-200 bg-sand-50 text-left text-xs uppercase tracking-wide text-sand-500">
              <th className="px-5 py-3">Akun</th>
              <th className="px-5 py-3">Kontak</th>
              <th className="px-5 py-3">Role</th>
              <th className="px-5 py-3">Pegawai</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-sand-100">
            {users.map((u) => (
              <tr key={u.id} className="align-top">
                <td className="px-5 py-3.5">
                  <p className="font-semibold text-sand-800">{u.name}</p>
                  <p className="text-xs text-sand-400">
                    Login terakhir: {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString('id-ID') : '—'}
                  </p>
                </td>
                <td className="px-5 py-3.5 text-xs text-sand-600">
                  <p>{u.email ?? '—'}</p>
                  <p>{u.phone ?? ''}</p>
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex flex-wrap gap-1">
                    {u.roles.map((r) => (
                      <span
                        key={r.role.id}
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${roleBadge(r.role.key)}`}
                      >
                        {r.role.name}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-5 py-3.5 text-xs text-sand-600">
                  {u.employee ? u.employee.name : '—'}
                </td>
                <td className="px-5 py-3.5">
                  <Badge
                    className={
                      u.status === 'ACTIVE'
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-sand-100 text-sand-500'
                    }
                  >
                    {u.status === 'ACTIVE' ? 'Aktif' : 'Nonaktif'}
                  </Badge>
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex justify-end gap-1.5 text-xs">
                    <button
                      type="button"
                      onClick={() => openEdit(u)}
                      className="rounded-lg px-2.5 py-1.5 font-semibold text-primary-700 hover:bg-primary-50"
                    >
                      Ubah
                    </button>
                    <button
                      type="button"
                      onClick={() => setResetTarget(u)}
                      className="rounded-lg px-2.5 py-1.5 font-semibold text-sand-600 hover:bg-sand-100"
                    >
                      Sandi
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void toggleStatus(u)}
                      className="rounded-lg px-2.5 py-1.5 font-semibold text-amber-700 hover:bg-amber-50"
                    >
                      {u.status === 'ACTIVE' ? 'Nonaktifkan' : 'Aktifkan'}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void remove(u)}
                      className="rounded-lg px-2.5 py-1.5 font-semibold text-red-600 hover:bg-red-50"
                    >
                      Hapus
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-sand-400">
                  Belum ada akun staf.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* Tambah akun */}
      <Modal open={showNew} onClose={() => setShowNew(false)} title="Akun Staf Baru">
        <form onSubmit={submitNew} className="space-y-4">
          <Field label="Nama Lengkap">
            <Input name="name" required minLength={2} placeholder="Nama staf/pegawai" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email">
              <Input name="email" type="email" placeholder="email@sekolah.sch.id" />
            </Field>
            <Field label="Nomor HP">
              <Input name="phone" placeholder="08xxxxxxxxxx" />
            </Field>
          </div>
          <Field label="Kata Sandi" hint="Minimal 8 karakter">
            <Input name="password" type="password" required minLength={8} />
          </Field>
          <Field label="Role / Akses">
            {rolePicker}
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setShowNew(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Menyimpan…' : 'Buat Akun'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Ubah akun */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={`Ubah ${editing?.name ?? ''}`}>
        {editing ? (
          <form onSubmit={submitEdit} className="space-y-4">
            <Field label="Nama Lengkap">
              <Input name="name" required minLength={2} defaultValue={editing.name} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Email">
                <Input name="email" type="email" defaultValue={editing.email ?? ''} />
              </Field>
              <Field label="Nomor HP">
                <Input name="phone" defaultValue={editing.phone ?? ''} />
              </Field>
            </div>
            <Field label="Role / Akses">
              {rolePicker}
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                Batal
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? 'Menyimpan…' : 'Simpan'}
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>

      {/* Atur ulang sandi */}
      <Modal
        open={!!resetTarget}
        onClose={() => setResetTarget(null)}
        title={`Sandi Baru — ${resetTarget?.name ?? ''}`}
      >
        {resetTarget ? (
          <form onSubmit={submitReset} className="space-y-4">
            <Field label="Kata Sandi Baru" hint="Minimal 8 karakter">
              <Input name="password" type="password" required minLength={8} />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setResetTarget(null)}>
                Batal
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? 'Menyimpan…' : 'Atur Ulang'}
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>
    </Shell>
  );
}
