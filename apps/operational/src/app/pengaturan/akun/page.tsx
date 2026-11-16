'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Field, Input, Modal, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { PageTitle } from '@/components/widgets';
import { DataTable } from '@/components/data-table';
import { useConfirm } from '@/components/confirm-dialog';
import {
  createStaffUser,
  deleteStaffUser,
  listRoles,
  listStaffUsers,
  resetStaffPassword,
  updateStaffUser,
  viewStaffPassword,
  type RoleOption,
  type StaffUser,
  phoneLocal,
} from '@/lib/api';

const roleBadge = (key: string) =>
  key === 'superadmin'
    ? 'text-red-700 bg-red-50'
    : key === 'ops_admin'
      ? 'text-primary-700 bg-primary-50'
      : 'text-sand-600 bg-sand-100';

export default function AccountSettingsPage() {
  const { confirm, dialog } = useConfirm();
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<StaffUser | null>(null);
  const [resetTarget, setResetTarget] = useState<StaffUser | null>(null);
  const [newPassword, setNewPassword] = useState<string | null>(null);
  const [viewPw, setViewPw] = useState<{ name: string; password: string | null } | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [orphanOnly, setOrphanOnly] = useState(false);

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

  const q = query.trim().toLowerCase();
  const filtered = users.filter((u) => {
    if (q) {
      const hay = [u.name, u.email ?? '', u.phone ?? '', u.employee?.name ?? '']
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (roleFilter && !u.roles.some((r) => r.role.key === roleFilter)) return false;
    if (statusFilter && u.status !== statusFilter) return false;
    if (orphanOnly && u.employee) return false;
    return true;
  });

  const rolePicker = (
    <div className="flex flex-wrap gap-2">
      {roles.map((r) => (
        <button
          key={r.id}
          type="button"
          onClick={async () => toggleRole(r.id)}
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
    const password = String(fd.get('password'));
    try {
      await resetStaffPassword(resetTarget.id, password);
      setNewPassword(password);
      setNotice('Kata sandi diatur ulang — salin sandi baru sebelum menutup.');
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
    if (!(await confirm(`Hapus akun ${u.name}? Ini tidak bisa dibatalkan.`))) return;
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
          <Button onClick={async () => { setPicked(new Set()); setShowNew(true); }}>
            + Akun Baru
          </Button>
        }
      />

      {error ? <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {notice ? (
        <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p>
      ) : null}

      <div className="mb-5 grid gap-3 rounded-2xl border border-sand-200 bg-white p-4 shadow-card sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Pencarian" className="!mb-0">
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nama / email / HP / pegawai…"
          />
        </Field>
        <Field label="Role" className="!mb-0">
          <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="">Semua role</option>
            {roles.map((r) => (
              <option key={r.id} value={r.key}>{r.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Status" className="!mb-0">
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Semua</option>
            <option value="ACTIVE">Aktif</option>
            <option value="DISABLED">Nonaktif</option>
          </Select>
        </Field>
        <label className="flex items-end gap-2 pb-2.5 text-sm font-semibold text-sand-800">
          <input
            type="checkbox"
            checked={orphanOnly}
            onChange={(e) => setOrphanOnly(e.target.checked)}
            className="size-4 accent-primary-700"
          />
          Belum tertaut pegawai
        </label>
      </div>

      <DataTable
        head={['Akun', 'Kontak', 'Role', 'Pegawai', 'Status', '']}
        empty={
          users.length === 0
            ? 'Belum ada akun staf.'
            : filtered.length === 0
              ? 'Tidak ada akun cocok dengan filter.'
              : undefined
        }
      >
            {filtered.map((u) => (
              <tr key={u.id} className="align-top">
                <td className="px-5 py-3.5">
                  <p className="font-semibold text-sand-800">{u.name}</p>
                  <p className="text-xs text-sand-400">
                    Login terakhir: {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString('id-ID') : '—'}
                  </p>
                </td>
                <td className="px-5 py-3.5 text-xs text-sand-600">
                  <p>{u.email ?? '—'}</p>
                  <p>{phoneLocal(u.phone)}</p>
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
                      onClick={async () => openEdit(u)}
                      className="rounded-lg px-2.5 py-1.5 font-semibold text-primary-700 hover:bg-primary-50"
                    >
                      Ubah
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        setBusy(true);
                        try {
                          const r = await viewStaffPassword(u.id);
                          setViewPw({ name: u.name, password: r.password });
                        } catch (err) {
                          setError(err instanceof Error ? err.message : 'Gagal memuat sandi.');
                        } finally {
                          setBusy(false);
                        }
                      }}
                      className="rounded-lg px-2.5 py-1.5 font-semibold text-sand-600 hover:bg-sand-100"
                    >
                      Lihat
                    </button>
                    <button
                      type="button"
                      onClick={async () => setResetTarget(u)}
                      className="rounded-lg px-2.5 py-1.5 font-semibold text-sand-600 hover:bg-sand-100"
                    >
                      Sandi
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={async () => void toggleStatus(u)}
                      className="rounded-lg px-2.5 py-1.5 font-semibold text-amber-700 hover:bg-amber-50"
                    >
                      {u.status === 'ACTIVE' ? 'Nonaktifkan' : 'Aktifkan'}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={async () => void remove(u)}
                      className="rounded-lg px-2.5 py-1.5 font-semibold text-red-600 hover:bg-red-50"
                    >
                      Hapus
                    </button>
                  </div>
                </td>
              </tr>
            ))}
      </DataTable>

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
            <Button type="button" variant="secondary" onClick={async () => setShowNew(false)}>
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
                <Input name="phone" defaultValue={phoneLocal(editing.phone)} />
              </Field>
            </div>
            <Field label="Role / Akses">
              {rolePicker}
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={async () => setEditing(null)}>
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
        onClose={() => { setResetTarget(null); setNewPassword(null); }}
        title={`Sandi Baru — ${resetTarget?.name ?? ''}`}
        description={
          newPassword
            ? 'Sandi ditampilkan sekali — salin & kirim ke pemilik akun.'
            : 'Sandi lama tidak dapat dilihat (tersimpan ter-hash) — atur sandi baru.'
        }
      >
        {resetTarget ? (
          newPassword ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
                <p className="text-xs font-semibold text-emerald-700">Sandi baru</p>
                <p className="mt-1 select-all font-mono text-xl font-bold tracking-wider text-emerald-900">
                  {newPassword}
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void navigator.clipboard?.writeText(newPassword)}
                >
                  Salin
                </Button>
                <Button onClick={() => { setResetTarget(null); setNewPassword(null); }}>Selesai</Button>
              </div>
            </div>
          ) : (
            <form onSubmit={submitReset} className="space-y-4">
              <Field label="Kata Sandi Baru" hint="Minimal 8 karakter — atau acak otomatis.">
                <Input id="reset-pw" name="password" type="text" required minLength={8} />
              </Field>
              <div className="flex justify-between gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
                    const arr = new Uint32Array(10);
                    crypto.getRandomValues(arr);
                    const pw = [...arr].map((n) => chars[n % chars.length]).join('');
                    const input = document.getElementById('reset-pw') as HTMLInputElement | null;
                    if (input) input.value = pw;
                  }}
                >
                  🎲 Acak Sandi
                </Button>
                <div className="flex gap-2">
                  <Button type="button" variant="secondary" onClick={() => setResetTarget(null)}>
                    Batal
                  </Button>
                  <Button type="submit" disabled={busy}>
                    {busy ? 'Menyimpan…' : 'Atur Ulang'}
                  </Button>
                </div>
              </div>
            </form>
          )
        ) : null}
      </Modal>
      {/* Lihat sandi tersimpan */}
      <Modal
        open={!!viewPw}
        onClose={() => setViewPw(null)}
        title={`Sandi — ${viewPw?.name ?? ''}`}
        description="Sandi yang terakhir di-set (tersimpan terenkripsi)."
      >
        {viewPw ? (
          <div className="space-y-4">
            {viewPw.password ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
                <p className="select-all font-mono text-xl font-bold tracking-wider text-emerald-900">
                  {viewPw.password}
                </p>
              </div>
            ) : (
              <p className="rounded-xl bg-sand-50 px-4 py-3 text-sm text-sand-600">
                Sandi belum terekam — akun ini dibuat sebelum fitur lihat-sandi aktif, atau sandi
                belum pernah diatur ulang. Gunakan <b>Sandi</b> untuk menetapkan yang baru.
              </p>
            )}
            <div className="flex justify-end gap-2">
              {viewPw.password ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void navigator.clipboard?.writeText(viewPw.password ?? '')}
                >
                  Salin
                </Button>
              ) : null}
              <Button onClick={() => setViewPw(null)}>Tutup</Button>
            </div>
          </div>
        ) : null}
      </Modal>
          {dialog}
      </Shell>
  );
}
