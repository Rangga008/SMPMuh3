'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Field, Input, Modal } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { DataTable } from '@/components/data-table';
import { PageTitle } from '@/components/widgets';
import {
  createCurriculum,
  deleteCurriculum,
  listCurricula,
  updateCurriculum,
  type CurriculumView,
} from '@/lib/api';

export default function KurikulumDataPage() {
  const [rows, setRows] = useState<CurriculumView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<CurriculumView | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listCurricula());
      setError(null);
    } catch {
      setError('Gagal memuat kurikulum.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(fn: () => Promise<unknown>, ok: string, form?: HTMLFormElement) {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await fn();
      form?.reset();
      setNotice(ok);
      await load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Aksi gagal.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <PageTitle
        title="Data Kurikulum"
        subtitle="Kerangka kurikulum yang dipakai sekolah (mis. Kurikulum Merdeka)"
      />
      {error ? (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
      ) : null}
      {notice ? (
        <p role="status" className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{notice}</p>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void run(
            () =>
              createCurriculum({
                name: String(f.get('name')),
                description: String(f.get('description')) || undefined,
              }),
            'Kurikulum ditambahkan.',
            e.currentTarget,
          );
        }}
        className="mb-5 grid gap-3 rounded-2xl border border-sand-200 bg-white p-4 shadow-card sm:grid-cols-[1fr_2fr_auto] sm:items-end"
      >
        <Field label="Nama"><Input name="name" required placeholder="Kurikulum Merdeka" /></Field>
        <Field label="Deskripsi"><Input name="description" placeholder="Opsional" /></Field>
        <Button type="submit" disabled={busy} variant="outline">Tambah</Button>
      </form>

      <DataTable
        head={['Nama', 'Deskripsi', 'Mapel', 'Status', '']}
        loading={loading}
        error={error}
        empty={rows.length === 0 ? 'Belum ada kurikulum.' : undefined}
      >
        {rows.map((c) => (
          <tr key={c.id}>
            <td className="px-5 py-3 font-bold text-sand-900">{c.name}</td>
            <td className="px-5 py-3 text-sand-600">{c.description ?? '—'}</td>
            <td className="px-5 py-3 text-sand-600">{c._count?.subjects ?? 0} mapel</td>
            <td className="px-5 py-3">
              {c.isActive ? (
                <Badge tone="primary">Aktif</Badge>
              ) : (
                <Badge tone="neutral">Nonaktif</Badge>
              )}
            </td>
            <td className="px-5 py-3 text-right">
              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  className="text-sm font-semibold text-sand-700 hover:underline"
                  onClick={() => setEditing(c)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="text-sm font-semibold text-red-600 hover:underline"
                  onClick={() => {
                    if (!confirm(`Hapus kurikulum ${c.name}?`)) return;
                    void run(() => deleteCurriculum(c.id), `Kurikulum ${c.name} dihapus.`);
                  }}
                >
                  Hapus
                </button>
              </div>
            </td>
          </tr>
        ))}
      </DataTable>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={`Edit Kurikulum ${editing?.name ?? ''}`}
      >
        {editing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const c = editing;
              void run(
                () =>
                  updateCurriculum(c.id, {
                    name: String(f.get('name')),
                    description: String(f.get('description')) || null,
                    isActive: f.get('isActive') === 'on',
                  }),
                `Kurikulum ${c.name} diperbarui.`,
              ).then((ok) => {
                if (ok) setEditing(null);
              });
            }}
            className="grid gap-3"
          >
            <Field label="Nama">
              <Input name="name" required defaultValue={editing.name} />
            </Field>
            <Field label="Deskripsi">
              <Input name="description" defaultValue={editing.description ?? ''} />
            </Field>
            <label className="flex items-center gap-2 text-sm font-medium text-sand-700">
              <input
                name="isActive"
                type="checkbox"
                defaultChecked={editing.isActive}
                className="size-4 accent-primary-700"
              />
              Aktif
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                Batal
              </Button>
              <Button type="submit" disabled={busy}>Simpan</Button>
            </div>
          </form>
        ) : null}
      </Modal>
    </Shell>
  );
}
