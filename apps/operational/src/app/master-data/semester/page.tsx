'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Field, Input, Modal, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { DataTable } from '@/components/data-table';
import { PageTitle } from '@/components/widgets';
import {
  createSemester,
  deleteSemester,
  listAcademicYears,
  listSemesters,
  updateSemester,
  type AcademicYear,
  type SemesterView,
} from '@/lib/api';

const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
const toInputDate = (iso?: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : '');

export default function SemesterPage() {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [yearId, setYearId] = useState('');
  const [rows, setRows] = useState<SemesterView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<SemesterView | null>(null);

  const load = useCallback(async (yid: string) => {
    setLoading(true);
    try {
      setRows(await listSemesters(yid || undefined));
      setError(null);
    } catch {
      setError('Gagal memuat semester.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    listAcademicYears()
      .then((ys) => {
        setYears(ys);
        const active = ys.find((y) => y.isActive);
        const yid = active?.id ?? ys[0]?.id ?? '';
        setYearId(yid);
        return load(yid);
      })
      .catch(() => setError('Gagal memuat tahun ajaran.'));
  }, [load]);

  async function run(fn: () => Promise<unknown>, ok: string, form?: HTMLFormElement) {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await fn();
      form?.reset();
      setNotice(ok);
      await load(yearId);
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
        title="Semester"
        subtitle="Periode semester per tahun ajaran — hanya satu yang aktif dalam satu tahun"
      />
      {error ? (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
      ) : null}
      {notice ? (
        <p role="status" className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{notice}</p>
      ) : null}

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <Field label="Tahun Ajaran" className="w-56">
          <Select
            value={yearId}
            onChange={(e) => {
              setYearId(e.target.value);
              void load(e.target.value);
            }}
          >
            {years.map((y) => (
              <option key={y.id} value={y.id}>{y.name}{y.isActive ? ' (aktif)' : ''}</option>
            ))}
          </Select>
        </Field>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!yearId) {
            setError('Pilih tahun ajaran dulu.');
            return;
          }
          const f = new FormData(e.currentTarget);
          void run(
            () =>
              createSemester({
                academicYearId: yearId,
                name: String(f.get('name')),
                startDate: String(f.get('startDate')) || undefined,
                endDate: String(f.get('endDate')) || undefined,
              }),
            'Semester ditambahkan.',
            e.currentTarget,
          );
        }}
        className="mb-5 grid gap-3 rounded-2xl border border-sand-200 bg-white p-4 shadow-card sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
      >
        <Field label="Nama Semester"><Input name="name" required placeholder="Ganjil" /></Field>
        <Field label="Mulai"><Input name="startDate" type="date" /></Field>
        <Field label="Selesai"><Input name="endDate" type="date" /></Field>
        <Button type="submit" disabled={busy || !yearId} variant="outline">Tambah</Button>
      </form>

      <DataTable
        head={['Semester', 'Tahun Ajaran', 'Mulai', 'Selesai', 'Status', '']}
        loading={loading}
        error={error}
        empty={rows.length === 0 ? 'Belum ada semester untuk tahun ini.' : undefined}
      >
        {rows.map((s) => (
          <tr key={s.id}>
            <td className="px-5 py-3 font-bold text-sand-900">{s.name}</td>
            <td className="px-5 py-3 text-sand-600">{s.academicYear?.name ?? '—'}</td>
            <td className="px-5 py-3 text-sand-600">{fmtDate(s.startDate)}</td>
            <td className="px-5 py-3 text-sand-600">{fmtDate(s.endDate)}</td>
            <td className="px-5 py-3">
              {s.isActive ? (
                <Badge tone="primary">Aktif</Badge>
              ) : (
                <Badge tone="neutral">Nonaktif</Badge>
              )}
            </td>
            <td className="px-5 py-3 text-right">
              <div className="flex items-center justify-end gap-3">
                {!s.isActive ? (
                  <button
                    type="button"
                    className="text-sm font-semibold text-primary-700 hover:underline"
                    onClick={() =>
                      void run(
                        () => updateSemester(s.id, { isActive: true }),
                        `Semester ${s.name} diaktifkan.`,
                      )
                    }
                  >
                    Jadikan Aktif
                  </button>
                ) : null}
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
                    if (!confirm(`Hapus semester ${s.name} (${s.academicYear?.name ?? ''})?`)) return;
                    void run(() => deleteSemester(s.id), `Semester ${s.name} dihapus.`);
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
        title={`Edit Semester ${editing?.name ?? ''}`}
      >
        {editing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const s = editing;
              void run(
                () =>
                  updateSemester(s.id, {
                    name: String(f.get('name')),
                    startDate: String(f.get('startDate')) || null,
                    endDate: String(f.get('endDate')) || null,
                  }),
                `Semester ${s.name} diperbarui.`,
              ).then((ok) => {
                if (ok) setEditing(null);
              });
            }}
            className="grid gap-3"
          >
            <Field label="Nama Semester">
              <Input name="name" required defaultValue={editing.name} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Mulai">
                <Input name="startDate" type="date" defaultValue={toInputDate(editing.startDate)} />
              </Field>
              <Field label="Selesai">
                <Input name="endDate" type="date" defaultValue={toInputDate(editing.endDate)} />
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
