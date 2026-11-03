'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Field, Input, Modal } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { PageTitle } from '@/components/widgets';
import {
  createRole,
  deleteRole,
  listPermissions,
  listRoles,
  updateRole,
  type RoleOption,
} from '@/lib/api';

/** Kelompok permission per bidang kerja — label ramah untuk admin. */
const GROUPS: { label: string; match: string[] }[] = [
  { label: 'SPMB', match: ['spmb.'] },
  { label: 'Kesiswaan', match: ['student.'] },
  { label: 'Kepegawaian', match: ['employee.'] },
  { label: 'Akademik', match: ['academic.', 'attendance.', 'school.academic-year.'] },
  { label: 'Sekolah', match: ['school.school.'] },
  { label: 'Pengguna & Role', match: ['identity.'] },
  { label: 'Notifikasi & Audit', match: ['notification.', 'audit.'] },
];

export default function RolesPage() {
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [perms, setPerms] = useState<{ key: string; description?: string | null }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<RoleOption | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const [r, p] = await Promise.all([listRoles(), listPermissions()]);
      setRoles(r);
      setPerms(p);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat role.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (key: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  const openEdit = (r: RoleOption) => {
    setEditing(r);
    setShowNew(false);
    setPicked(new Set(r.permissions?.map((p) => p.permission.key) ?? []));
  };

  async function submitNew(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const desc = String(f.get('description') ?? '').trim();
      await createRole({
        key: String(f.get('key') ?? '').trim(),
        name: String(f.get('name') ?? '').trim(),
        ...(desc ? { description: desc } : {}),
        permissionKeys: [...picked],
      });
      setNotice('Role baru dibuat.');
      setShowNew(false);
      setPicked(new Set());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuat role.');
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (!editing) return;
    setBusy(true);
    setError(null);
    try {
      await updateRole(editing.id, { permissionKeys: [...picked] });
      setNotice(`Akses role ${editing.name} diperbarui.`);
      setEditing(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(r: RoleOption) {
    if (!confirm(`Hapus role "${r.name}"?`)) return;
    setBusy(true);
    try {
      await deleteRole(r.id);
      setNotice(`Role ${r.name} dihapus.`);
      if (editing?.id === r.id) setEditing(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menghapus.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <PageTitle
        title="Role & Akses"
        subtitle="Role menentukan bidang pekerjaan yang bisa diakses akun — SPMB, kesiswaan, keuangan, dst."
        actions={
          <Button size="sm" variant={showNew ? 'ghost' : 'primary'} onClick={() => { setShowNew((v) => !v); setEditing(null); setPicked(new Set()); }}>
            {showNew ? 'Tutup' : '+ Role Baru'}
          </Button>
        }
      />

      {error ? (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
      ) : null}
      {notice ? (
        <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{notice}</p>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-3">
          {roles.map((r) => (
            <div key={r.id} className="rounded-2xl border border-sand-200 bg-white p-4 shadow-card">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-bold text-sand-900">{r.name}</p>
                <code className="rounded bg-sand-100 px-1.5 py-0.5 text-xs text-sand-600">{r.key}</code>
                <Badge tone="neutral">{r._count?.users ?? 0} akun</Badge>
              </div>
              {r.description ? (
                <p className="mt-1 text-sm text-sand-500">{r.description}</p>
              ) : null}
              <p className="mt-2 text-xs text-sand-400">
                {r.permissions?.length
                  ? `${r.permissions.length} izin`
                  : 'Tanpa izin khusus'}
              </p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="outline" onClick={() => openEdit(r)}>
                  Atur Akses
                </Button>
                {!['superadmin', 'spmb_parent'].includes(r.key) ? (
                  <Button size="sm" variant="danger" onClick={() => void remove(r)} disabled={busy}>
                    Hapus
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        <div>
          <p className="rounded-2xl border border-dashed border-sand-300 p-8 text-center text-sm text-sand-400">
            Pilih role untuk mengatur aksesnya, atau buat role baru.
          </p>
        </div>
      </div>

      <Modal
        open={showNew}
        onClose={() => setShowNew(false)}
        title="Role Baru"
        description="Role menentukan bidang pekerjaan yang bisa diakses akun."
        size="xl"
      >
        <form onSubmit={submitNew} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Key" hint="huruf kecil, tanpa spasi — mis. guru_mapel">
              <Input name="key" required pattern="[a-z][a-z0-9_]+" />
            </Field>
            <Field label="Nama Role">
              <Input name="name" required />
            </Field>
          </div>
          <Field label="Deskripsi (opsional)">
            <Input name="description" />
          </Field>
          <PermissionPicker perms={perms} picked={picked} toggle={toggle} />
          <Button type="submit" disabled={busy || picked.size === 0}>
            {busy ? 'Menyimpan…' : 'Buat Role'}
          </Button>
        </form>
      </Modal>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? `Akses — ${editing.name}` : ''}
        size="xl"
      >
        <PermissionPicker perms={perms} picked={picked} toggle={toggle} />
        <div className="mt-4 flex gap-2">
          <Button onClick={() => void saveEdit()} disabled={busy}>
            {busy ? 'Menyimpan…' : 'Simpan Akses'}
          </Button>
          <Button variant="ghost" onClick={() => setEditing(null)}>
            Batal
          </Button>
        </div>
      </Modal>
    </Shell>
  );
}

function PermissionPicker({
  perms,
  picked,
  toggle,
}: {
  perms: { key: string; description?: string | null }[];
  picked: Set<string>;
  toggle: (k: string) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-bold uppercase tracking-wider text-sand-500">
        Bidang kerja yang bisa diakses
      </p>
      {GROUPS.map((g) => {
        const items = perms.filter((p) => g.match.some((m) => p.key.startsWith(m)));
        if (!items.length) return null;
        return (
          <div key={g.label} className="rounded-xl border border-sand-200 p-3">
            <p className="mb-2 text-sm font-bold text-sand-800">{g.label}</p>
            <div className="flex flex-wrap gap-2">
              {items.map((p) => (
                <label
                  key={p.key}
                  className={`cursor-pointer rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                    picked.has(p.key)
                      ? 'border-primary-600 bg-primary-50 text-primary-800'
                      : 'border-sand-200 bg-white text-sand-600 hover:border-sand-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={picked.has(p.key)}
                    onChange={() => toggle(p.key)}
                  />
                  {p.key}
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
