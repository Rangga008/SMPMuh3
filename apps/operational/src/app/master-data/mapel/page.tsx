'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Field, Input, Modal, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { DataTable } from '@/components/data-table';
import { PageTitle } from '@/components/widgets';
import {
  createSubject,
  deleteSubject,
  listCurricula,
  listSubjects,
  updateSubject,
  type CurriculumView,
  type SubjectView,
} from '@/lib/api';

import { RowBtn } from '@/components/row-btn';
import { useConfirm } from '@/components/confirm-dialog';
export default function MapelPage() {
  const { confirm, dialog } = useConfirm();
  const [rows, setRows] = useState<SubjectView[]>([]);
  const [curricula, setCurricula] = useState<CurriculumView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<SubjectView | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [subs, curs] = await Promise.all([listSubjects(), listCurricula()]);
      setRows(subs);
      setCurricula(curs);
      setError(null);
    } catch {
      setError('Gagal memuat mata pelajaran.');
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
        title="Mata Pelajaran"
        subtitle="Kode & nama mapel yang dipakai jadwal, penugasan, dan penilaian"
        actions={<Button size="sm" onClick={async () => setCreating(true)}>+ Mapel Baru</Button>}
      />
      {error ? (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
      ) : null}
      {notice ? (
        <p role="status" className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{notice}</p>
      ) : null}

      <DataTable
        head={['Kode', 'Nama Mapel', 'Kurikulum', 'Tingkat', '']}
        loading={loading}
        error={error}
        empty={rows.length === 0 ? 'Belum ada mapel.' : undefined}
>
        {rows.map((s) => (
          <tr key={s.id}>
            <td className="px-5 py-3 font-mono text-xs font-bold text-sand-900">{s.code}</td>
            <td className="px-5 py-3 font-semibold text-sand-900">{s.name}</td>
            <td className="px-5 py-3 text-sand-600">{s.curriculum?.name ?? '—'}</td>
            <td className="px-5 py-3 text-sand-600">{s.gradeLevel ? `Kelas ${s.gradeLevel}` : 'Semua'}</td>
            <td className="px-5 py-3 text-right">
              <div className="flex items-center justify-end gap-3">
                <RowBtn tone="neutral" type="button" onClick={async () => setEditing(s)}>
                  Edit
                </RowBtn>
                <RowBtn tone="danger" type="button" onClick={async () => { if (!confirm(`Hapus mapel ${s.name} (${s.code})?`)) return; void run(() => deleteSubject(s.id), `Mapel ${s.name} dihapus.`); }}>
                  Hapus
                </RowBtn>
              </div>
            </td>
          </tr>
        ))}
      </DataTable>

      <Modal open={creating} onClose={() => setCreating(false)} title="Mapel Baru">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void run(
              () =>
                createSubject({
                  code: String(f.get('code')),
                  name: String(f.get('name')),
                  curriculumId: String(f.get('curriculumId')) || undefined,
                  gradeLevel: Number(f.get('gradeLevel')) || undefined,
                }),
              'Mapel ditambahkan.',
            ).then((ok) => {
              if (ok) setCreating(false);
            });
          }}
          className="grid gap-3"
>
          <div className="grid gap-3 sm:grid-cols-[110px_1fr]">
            <Field label="Kode"><Input name="code" required placeholder="MTK" maxLength={16} /></Field>
            <Field label="Nama"><Input name="name" required placeholder="Matematika" /></Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Kurikulum">
              <Select name="curriculumId" defaultValue="">
                <option value="">— Umum —</option>
                {curricula.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Tingkat" hint="Kosongkan = semua tingkat">
              <Input name="gradeLevel" type="number" min={7} max={9} placeholder="7" />
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={async () => setCreating(false)}>Batal</Button>
            <Button type="submit" disabled={busy}>Simpan</Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={`Edit Mapel ${editing?.name ?? ''}`}
>
        {editing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const s = editing;
              const level = String(f.get('gradeLevel')).trim();
              void run(
                () =>
                  updateSubject(s.id, {
                    code: String(f.get('code')),
                    name: String(f.get('name')),
                    curriculumId: String(f.get('curriculumId')) || null,
                    gradeLevel: level === '' ? null : Number(level),
                  }),
                `Mapel ${s.name} diperbarui.`,
              ).then((ok) => {
                if (ok) setEditing(null);
              });
            }}
            className="grid gap-3"
>
            <div className="grid gap-3 sm:grid-cols-[110px_1fr]">
              <Field label="Kode">
                <Input name="code" required defaultValue={editing.code} maxLength={16} />
              </Field>
              <Field label="Nama">
                <Input name="name" required defaultValue={editing.name} />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Kurikulum">
                <Select name="curriculumId" defaultValue={editing.curriculumId ?? ''}>
                  <option value="">— Umum —</option>
                  {curricula.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Tingkat" hint="Kosongkan = semua tingkat">
                <Input
                  name="gradeLevel"
                  type="number"
                  min={7}
                  max={9}
                  defaultValue={editing.gradeLevel ?? ''}
                />
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
