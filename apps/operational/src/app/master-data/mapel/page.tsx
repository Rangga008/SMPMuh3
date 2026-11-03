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

export default function MapelPage() {
  const [rows, setRows] = useState<SubjectView[]>([]);
  const [curricula, setCurricula] = useState<CurriculumView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<SubjectView | null>(null);

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
              createSubject({
                code: String(f.get('code')),
                name: String(f.get('name')),
                curriculumId: String(f.get('curriculumId')) || undefined,
                gradeLevel: Number(f.get('gradeLevel')) || undefined,
              }),
            'Mapel ditambahkan.',
            e.currentTarget,
          );
        }}
        className="mb-5 grid gap-3 rounded-2xl border border-sand-200 bg-white p-4 shadow-card sm:grid-cols-[110px_1fr_1fr_100px_auto] sm:items-end"
      >
        <Field label="Kode"><Input name="code" required placeholder="MTK" maxLength={16} /></Field>
        <Field label="Nama"><Input name="name" required placeholder="Matematika" /></Field>
        <Field label="Kurikulum">
          <Select name="curriculumId" defaultValue="">
            <option value="">— Umum —</option>
            {curricula.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Tingkat"><Input name="gradeLevel" type="number" min={7} max={9} placeholder="7" /></Field>
        <Button type="submit" disabled={busy} variant="outline">Tambah</Button>
      </form>

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
                <button
                  type="button"
                  className="text-sm font-semibold text-sand-700 hover:underline"
                  onClick={() => setEditing(s)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="text-sm font-semibold text-red-600 hover:underline"
                  onClick={() => {
                    if (!confirm(`Hapus mapel ${s.name} (${s.code})?`)) return;
                    void run(() => deleteSubject(s.id), `Mapel ${s.name} dihapus.`);
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
