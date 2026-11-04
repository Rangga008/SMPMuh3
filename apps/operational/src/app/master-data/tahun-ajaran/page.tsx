'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Field, Input, Modal } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { DataTable } from '@/components/data-table';
import { PageTitle } from '@/components/widgets';
import {
  activateAcademicYear,
  createAcademicYear,
  deleteAcademicYear,
  listAcademicYears,
  updateAcademicYear,
  type AcademicYear,
} from '@/lib/api';

import { RowBtn } from '@/components/row-btn';
import { useConfirm } from '@/components/confirm-dialog';
const fmtDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
const toInputDate = (iso?: string) => (iso ? new Date(iso).toISOString().slice(0, 10) : '');

export default function TahunAjaranPage() {
  const { confirm, dialog } = useConfirm();
  const [rows, setRows] = useState<AcademicYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<AcademicYear | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listAcademicYears());
      setError(null);
    } catch {
      setError('Gagal memuat tahun ajaran.');
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
        title="Tahun Ajaran"
        subtitle="Kelola periode akademik — hanya satu yang aktif; gelombang SPMB, rombel, dan nilai mengikutinya"
        actions={<Button size="sm" onClick={async () => setCreating(true)}>+ Tahun Ajaran Baru</Button>}
      />
      {error ? (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
      ) : null}
      {notice ? (
        <p role="status" className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{notice}</p>
      ) : null}

      <DataTable
        head={['Tahun Ajaran', 'Mulai', 'Selesai', 'Status', 'Titipan', 'Kuota', '']}
        loading={loading}
        error={error}
        empty={rows.length === 0 ? 'Belum ada tahun ajaran.' : undefined}
>
        {rows.map((y) => (
          <tr key={y.id}>
            <td className="px-5 py-3 font-bold text-sand-900">{y.name}</td>
            <td className="px-5 py-3 text-sand-600">{fmtDate(y.startDate)}</td>
            <td className="px-5 py-3 text-sand-600">{fmtDate(y.endDate)}</td>
            <td className="px-5 py-3">
              {y.isActive ? (
                <Badge tone="primary">Aktif</Badge>
              ) : (
                <Badge tone="neutral">Nonaktif</Badge>
              )}
            </td>
            <td className="px-5 py-3">
              <button
                type="button"
                title="Buka/tutup daftar titipan untuk tahun ini"
                onClick={async () =>
                  void run(
                    () => updateAcademicYear(y.id, { titipanOpen: !y.titipanOpen }),
                    `Titipan ${y.name} ${y.titipanOpen ? 'ditutup' : 'dibuka'}.`,
                  )
                }
>
                <Badge tone={y.titipanOpen ? 'primary' : 'neutral'}>
                  {y.titipanOpen ? 'Dibuka' : 'Tutup'}
                </Badge>
              </button>
            </td>
            <td className="px-5 py-3">
              <Input
                key={`${y.id}-${y.quota ?? ''}`}
                type="number"
                min={0}
                defaultValue={y.quota ?? ''}
                placeholder="∞"
                aria-label={`Kuota ${y.name}`}
                className="h-9 w-24"
                onBlur={(e) => {
                  const raw = e.target.value.trim();
                  const n = raw === '' ? null : Number(raw);
                  if (n === null || (Number.isInteger(n) && n >= 0)) {
                    void run(
                      () => updateAcademicYear(y.id, { quota: n }),
                      n === null
                        ? `Kuota ${y.name} dihapus — tanpa batas.`
                        : `Kuota ${y.name} diset ${n}.`,
                    );
                  }
                }}
              />
            </td>
            <td className="px-5 py-3 text-right">
              <div className="flex items-center justify-end gap-3">
                {!y.isActive ? (
                  <RowBtn type="button" onClick={async () => void run( () => activateAcademicYear(y.id), `Tahun ajaran ${y.name} diaktifkan — yang lain otomatis nonaktif.`, ) }>
                    Jadikan Aktif
                  </RowBtn>
                ) : null}
                <RowBtn tone="neutral" type="button" onClick={async () => setEditing(y)}>
                  Edit
                </RowBtn>
                {!y.isActive ? (
                  <RowBtn tone="danger" type="button" onClick={async () => { if (!confirm(`Hapus tahun ajaran ${y.name}?`)) return; void run( () => deleteAcademicYear(y.id), `Tahun ajaran ${y.name} dihapus.`, ); }}>
                    Hapus
                  </RowBtn>
                ) : null}
              </div>
            </td>
          </tr>
        ))}
      </DataTable>

      <Modal open={creating} onClose={() => setCreating(false)} title="Tahun Ajaran Baru">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void run(
              () =>
                createAcademicYear({
                  name: String(f.get('name')),
                  startDate: String(f.get('startDate')),
                  endDate: String(f.get('endDate')),
                  isActive: f.get('isActive') === 'on',
                }),
              'Tahun ajaran ditambahkan.',
            ).then((ok) => {
              if (ok) setCreating(false);
            });
          }}
          className="grid gap-3"
>
          <Field label="Nama">
            <Input name="name" required placeholder="2027/2028" pattern="\d{4}/\d{4}" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Mulai">
              <Input name="startDate" type="date" required />
            </Field>
            <Field label="Selesai">
              <Input name="endDate" type="date" required />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium text-sand-700">
            <input name="isActive" type="checkbox" className="size-4 accent-primary-700" />
            Langsung aktif
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={async () => setCreating(false)}>Batal</Button>
            <Button type="submit" disabled={busy}>Simpan</Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={`Edit Tahun Ajaran ${editing?.name ?? ''}`}
>
        {editing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const y = editing;
              void run(
                () =>
                  updateAcademicYear(y.id, {
                    name: String(f.get('name')),
                    startDate: String(f.get('startDate')),
                    endDate: String(f.get('endDate')),
                  }),
                `Tahun ajaran ${y.name} diperbarui.`,
              ).then((ok) => {
                if (ok) setEditing(null);
              });
            }}
            className="grid gap-3"
>
            <Field label="Nama">
              <Input name="name" required defaultValue={editing.name} pattern="\d{4}/\d{4}" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Mulai">
                <Input name="startDate" type="date" required defaultValue={toInputDate(editing.startDate)} />
              </Field>
              <Field label="Selesai">
                <Input name="endDate" type="date" required defaultValue={toInputDate(editing.endDate)} />
              </Field>
            </div>
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
