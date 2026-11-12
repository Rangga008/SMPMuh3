'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Field, Input, Modal, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { PageTitle, Widget } from '@/components/widgets';
import { useConfirm } from '@/components/confirm-dialog';
import { usePermission } from '@/lib/use-permission';
import { PERMISSIONS } from '@smpmuh3/types';
import {
  createClass,
  deleteClass,
  listAcademicYears,
  listClasses,
  updateClass,
  type AcademicYear,
  type ClassView,
} from '@/lib/api';

export default function AcademicPage() {
  const [year, setYear] = useState<AcademicYear | null>(null);
  const [classes, setClasses] = useState<ClassView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState(false);
  const [editClass, setEditClass] = useState<ClassView | null>(null);
  const canManage = usePermission(PERMISSIONS.ACADEMIC_MANAGE);
  const { confirm, dialog } = useConfirm();

  const refresh = useCallback(async (yearId?: string) => {
    setClasses(await listClasses(yearId));
  }, []);

  useEffect(() => {
    listAcademicYears()
      .then((ys) => {
        const active = ys.find((y) => y.isActive) ?? null;
        setYear(active);
        return refresh(active?.id);
      })
      .catch(() => setError('Gagal memuat data kurikulum.'));
  }, [refresh]);

  async function run(fn: () => Promise<unknown>, ok: string, form?: HTMLFormElement) {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await fn();
      await refresh(year?.id);
      form?.reset();
      setNotice(ok);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Aksi gagal — periksa data yang diisi.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <PageTitle
        title="Kurikulum"
        subtitle={`Rombel / kelas${year ? ` — TA ${year.name}` : ''}`}
        actions={<Button size="sm" onClick={() => setModal(true)}>+ Rombel Baru</Button>}
      />

      {error ? (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
      ) : null}
      {notice ? (
        <p role="status" className="mb-4 rounded-xl bg-primary-50 px-4 py-3 text-sm font-medium text-primary-800">{notice}</p>
      ) : null}

      <p className="mb-4 text-sm text-sand-600">
        Tahun ajaran, semester, mapel, dan data kurikulum ada di menu Kurikulum di sidebar.
      </p>

      <Widget title={`Rombel (${classes.length})`}>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((c) => (
            <li key={c.id} className="rounded-xl border border-sand-200 bg-sand-50 px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-sand-900">{c.name}</p>
                  <p className="text-xs text-sand-500">
                    Kelas {c.gradeLevel} · {c._count?.enrollments ?? 0} siswa
                    {c.homeroom ? ` · Wali: ${c.homeroom.name}` : ''}
                  </p>
                </div>
                {canManage ? (
                  <span className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      title="Ubah rombel"
                      className="rounded-lg px-1.5 py-0.5 text-xs text-primary-700 hover:bg-primary-50"
                      onClick={() => setEditClass(c)}
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      title="Hapus rombel"
                      className="rounded-lg px-1.5 py-0.5 text-xs text-red-600 hover:bg-red-50"
                      onClick={() =>
                        void (async () => {
                          const ok = await confirm({
                            title: `Hapus rombel ${c.name}?`,
                            body:
                              (c._count?.enrollments ?? 0) > 0
                                ? `Masih berisi ${c._count?.enrollments} siswa — akan ditolak server.`
                                : 'Rombel kosong akan dihapus permanen.',
                            confirmLabel: 'Ya, hapus',
                          });
                          if (ok) void run(() => deleteClass(c.id), `Rombel ${c.name} dihapus.`);
                        })()
                      }
                    >
                      🗑
                    </button>
                  </span>
                ) : null}
              </div>
            </li>
          ))}
          {classes.length === 0 ? (
            <li className="col-span-full py-6 text-center text-sm text-sand-500">Belum ada rombel.</li>
          ) : null}
        </ul>
      </Widget>

      <Modal open={modal} onClose={() => setModal(false)} title={`Rombel Baru — TA ${year?.name ?? ''}`}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void run(
              () =>
                createClass({
                  name: String(f.get('name')),
                  gradeLevel: Number(f.get('gradeLevel')),
                  academicYearId: year?.id,
                }),
              'Rombel ditambahkan.',
            ).then((ok) => ok && setModal(false));
          }}
          className="grid gap-4"
        >
          <Field label="Nama Rombel"><Input name="name" required placeholder="7A" /></Field>
          <Field label="Tingkat">
            <Select name="gradeLevel" required defaultValue="7">
              <option value="7">7</option>
              <option value="8">8</option>
              <option value="9">9</option>
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setModal(false)}>Batal</Button>
            <Button type="submit" disabled={busy}>Simpan</Button>
          </div>
        </form>
      </Modal>

      {/* ---------- Modal ubah rombel ---------- */}
      <Modal
        open={editClass !== null}
        onClose={() => setEditClass(null)}
        title={`Ubah Rombel — ${editClass?.name ?? ''}`}
      >
        {editClass ? (
          <form
            key={editClass.id}
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(
                () =>
                  updateClass(editClass.id, {
                    name: String(f.get('name')),
                    gradeLevel: Number(f.get('gradeLevel')),
                  }),
                'Rombel diperbarui.',
              ).then((ok) => ok && setEditClass(null));
            }}
            className="grid gap-4"
          >
            <Field label="Nama Rombel">
              <Input name="name" required defaultValue={editClass.name} />
            </Field>
            <Field label="Tingkat">
              <Select name="gradeLevel" required defaultValue={String(editClass.gradeLevel)}>
                <option value="7">7</option>
                <option value="8">8</option>
                <option value="9">9</option>
              </Select>
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setEditClass(null)}>Batal</Button>
              <Button type="submit" disabled={busy}>Simpan</Button>
            </div>
          </form>
        ) : null}
      </Modal>
      {dialog}
    </Shell>
  );
}
