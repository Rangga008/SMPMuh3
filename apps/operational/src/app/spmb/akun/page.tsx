'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Field, Input, Modal, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { DataTable } from '@/components/data-table';
import { PageTitle } from '@/components/widgets';
import {
  deleteParent,
  getParent,
  listParents,
  updateParent,
  type ParentAccount,
  type ParentAccountDetail,
} from '@/lib/api';

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Aktif',
  DISABLED: 'Nonaktif',
};

export default function AkunOrtuPage() {
  const [rows, setRows] = useState<ParentAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<ParentAccountDetail | null>(null);
  const [editing, setEditing] = useState<ParentAccount | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', email: '', status: 'ACTIVE' });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listParents());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openEdit = (p: ParentAccount) => {
    setEditing(p);
    setForm({
      name: p.name,
      phone: p.phone ?? '',
      email: p.email ?? '',
      status: p.status,
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      await updateParent(editing.id, {
        name: form.name,
        phone: form.phone,
        email: form.email,
        status: form.status as 'ACTIVE' | 'DISABLED',
      });
      setNotice(`Akun ${form.name} diperbarui.`);
      setEditing(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (p: ParentAccount) => {
    if (
      !confirm(
        `Hapus akun ${p.name} (${p.phone ?? p.email ?? '-'})?\nSeluruh calon murid & pendaftarannya ikut terhapus.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await deleteParent(p.id);
      setNotice(`Akun ${p.name} dihapus.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menghapus.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <PageTitle
        title="Akun Orang Tua"
        subtitle="Kelola akun pendaftar SPMB — lihat data pendaftaran, edit, atau hapus akun."
      />

      {error ? (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          {notice}
        </p>
      ) : null}

      <DataTable
        head={['Nama', 'Kontak', 'Pendaftaran', 'Status', 'Aksi']}
        loading={loading}
        empty="Belum ada akun orang tua."
      >
        {rows.map((p) => (
          <tr key={p.id} className="border-t border-sand-200">
            <td className="px-4 py-3 font-semibold text-sand-800">{p.name}</td>
            <td className="px-4 py-3 text-sand-600">
              <div>{p.phone ?? '—'}</div>
              {p.email ? <div className="text-xs text-sand-400">{p.email}</div> : null}
            </td>
            <td className="px-4 py-3 text-sand-600">
              {p._count.registrations} pendaftaran · {p._count.candidates} calon
            </td>
            <td className="px-4 py-3">
              <Badge tone={p.status === 'ACTIVE' ? 'primary' : 'danger'}>
                {STATUS_LABEL[p.status] ?? p.status}
              </Badge>
            </td>
            <td className="px-4 py-3">
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setDetail(null);
                    void getParent(p.id).then(setDetail).catch(() => {});
                  }}
                >
                  Detail
                </Button>
                <Button variant="outline" onClick={() => openEdit(p)}>
                  Edit
                </Button>
                <Button variant="danger" onClick={() => void remove(p)} disabled={busy}>
                  Hapus
                </Button>
              </div>
            </td>
          </tr>
        ))}
      </DataTable>

      {detail ? (
        <Modal
          open
          onClose={() => setDetail(null)}
          title={`Detail — ${detail.name}`}
          description="Data akun beserta calon murid & pendaftarannya."
          size="xl"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1 text-sm">
              <p className="text-sand-500">Kontak</p>
              <p className="font-medium text-sand-800">{detail.phone ?? '—'}</p>
              <p className="text-sand-600">{detail.email ?? 'Tidak ada email'}</p>
              <p className="text-xs text-sand-400">
                Terdaftar {new Date(detail.createdAt).toLocaleDateString('id-ID')}
                {detail.lastLoginAt
                  ? ` · login terakhir ${new Date(detail.lastLoginAt).toLocaleDateString('id-ID')}`
                  : ''}
              </p>
            </div>
            <div className="space-y-1 text-sm">
              <p className="text-sand-500">Calon murid</p>
              {detail.candidates.length ? (
                detail.candidates.map((c) => (
                  <p key={c.id} className="font-medium text-sand-800">
                    {c.name}
                    <span className="ml-2 text-xs font-normal text-sand-500">
                      {c.gender ?? '—'}
                      {c.birthDate
                        ? ` · ${new Date(c.birthDate).toLocaleDateString('id-ID')}`
                        : ''}
                    </span>
                  </p>
                ))
              ) : (
                <p className="text-sand-400">Belum ada calon murid.</p>
              )}
            </div>
          </div>
          <div className="mt-4">
            <p className="mb-2 text-sm text-sand-500">Pendaftaran</p>
            {detail.registrations.length ? (
              <ul className="divide-y divide-sand-200 rounded-xl border border-sand-200">
                {detail.registrations.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
                    <span className="font-mono font-semibold text-primary-800">
                      {r.number}
                    </span>
                    <span className="text-sand-700">{r.candidate?.name ?? '—'}</span>
                    <span className="text-xs text-sand-400">
                      {r.wave?.name ?? ''} · {r.pathway}
                    </span>
                    <Badge tone="accent">{r.status}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-sand-400">Belum ada pendaftaran.</p>
            )}
          </div>
          <div className="mt-4">
            <Button variant="ghost" onClick={() => setDetail(null)}>
              Tutup
            </Button>
          </div>
        </Modal>
      ) : null}

      {editing ? (
        <Modal
          open
          onClose={() => setEditing(null)}
          title={`Edit Akun — ${editing.name}`}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nama">
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </Field>
            <Field label="Nomor HP">
              <Input
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </Field>
            <Field label="Email (opsional)">
              <Input
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </Field>
            <Field label="Status Akun">
              <Select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              >
                <option value="ACTIVE">Aktif</option>
                <option value="DISABLED">Nonaktif</option>
              </Select>
            </Field>
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={() => void saveEdit()} disabled={busy}>
              {busy ? 'Menyimpan…' : 'Simpan'}
            </Button>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Batal
            </Button>
          </div>
        </Modal>
      ) : null}
    </Shell>
  );
}
