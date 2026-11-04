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

import { RowBtn } from '@/components/row-btn';
import { useConfirm } from '@/components/confirm-dialog';
export default function KurikulumDataPage() {
  const { confirm, dialog } = useConfirm();
  const [rows, setRows] = useState<CurriculumView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<CurriculumView | null>(null);
  const [creating, setCreating] = useState(false);

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
        actions={<Button size="sm" onClick={async () => setCreating(true)}>+ Kurikulum Baru</Button>}
      />
      {error ? (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
      ) : null}
      {notice ? (
        <p role="status" className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{notice}</p>
      ) : null}

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
                <RowBtn tone="neutral" type="button" onClick={async () => setEditing(c)}>
                  Edit
                </RowBtn>
                <RowBtn tone="danger" type="button" onClick={async () => { if (!confirm(`Hapus kurikulum ${c.name}?`)) return; void run(() => deleteCurriculum(c.id), `Kurikulum ${c.name} dihapus.`); }}>
                  Hapus
                </RowBtn>
              </div>
            </td>
          </tr>
        ))}
      </DataTable>

      <Modal open={creating} onClose={() => setCreating(false)} title="Kurikulum Baru">
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
            ).then((ok) => {
              if (ok) setCreating(false);
            });
          }}
          className="grid gap-3"
>
          <Field label="Nama"><Input name="name" required placeholder="Kurikulum Merdeka" /></Field>
          <Field label="Deskripsi"><Input name="description" placeholder="Opsional" /></Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={async () => setCreating(false)}>Batal</Button>
            <Button type="submit" disabled={busy}>Simpan</Button>
          </div>
        </form>
      </Modal>

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
              <Button type="button" variant="ghost" onClick={async () => setEditing(null)}>
                Batal
              </Button>
              <Button type="submit" disabled={busy}>Simpan</Button>
            </div>
          </form>
        ) : null}
      </Modal>
          {dialog}
      </Shell>
  );
}
