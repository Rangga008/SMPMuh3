'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, Button, Field, Input, Modal, Select } from '@smpmuh3/ui';
import { PERMISSIONS } from '@smpmuh3/types';
import type { StudentDto } from '@smpmuh3/types';
import { Shell } from '@/components/shell';
import { DataTable } from '@/components/data-table';
import { PageTitle } from '@/components/widgets';
import { RowBtn } from '@/components/row-btn';
import { useConfirm } from '@/components/confirm-dialog';
import { StudentPicker } from '@/components/student-picker';
import {
  addAchievement,
  deleteAchievement,
  listAchievements,
  me,
  openStudentDocument,
  updateAchievement,
  type AchievementRow,
} from '@/lib/api';

const LEVELS = ['Sekolah', 'Kecamatan', 'Kota/Kabupaten', 'Provinsi', 'Nasional', 'Internasional'];

export default function PrestasiPage() {
  const { confirm, dialog } = useConfirm();
  const [rows, setRows] = useState<AchievementRow[]>([]);
  const [search, setSearch] = useState('');
  const [year, setYear] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<'tambah' | 'edit' | null>(null);
  const [editing, setEditing] = useState<AchievementRow | null>(null);
  const [student, setStudent] = useState<StudentDto | null>(null);
  const firstRun = useRef(true);

  const load = useCallback((q: string, y: string) => {
    setLoading(true);
    listAchievements({ search: q || undefined, year: y ? Number(y) : undefined })
      .then((r) => {
        setRows(r);
        setLoadError(null);
      })
      .catch(() => setLoadError('Gagal memuat data prestasi.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    me()
      .then((u) => setCanManage(u.permissions.includes(PERMISSIONS.STUDENT_MANAGE)))
      .catch(() => setCanManage(false));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(search, year), firstRun.current ? 0 : 300);
    firstRun.current = false;
    return () => clearTimeout(t);
  }, [search, year, load]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const val = (k: string) => String(f.get(k) ?? '').trim() || undefined;
    setBusy(true);
    setError(null);
    try {
      if (modal === 'tambah') {
        if (!student) {
          setError('Pilih siswa dulu.');
          setBusy(false);
          return;
        }
        await addAchievement(student.id, {
          title: val('title'),
          level: val('level'),
          year: val('year') ? Number(val('year')) : undefined,
          description: val('description'),
        });
        setNotice(`Prestasi ${student.name} ditambahkan.`);
      } else if (editing) {
        await updateAchievement(editing.id, {
          title: val('title'),
          level: val('level'),
          year: val('year') ? Number(val('year')) : undefined,
          description: val('description'),
        });
        setNotice('Prestasi diperbarui.');
      }
      setModal(null);
      setEditing(null);
      setStudent(null);
      load(search, year);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <PageTitle
        title="Data Prestasi"
        subtitle="Prestasi siswa lintas jenjang — lomba, kejuaraan, dan penghargaan"
        actions={
          canManage ? (
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setStudent(null);
                setModal('tambah');
              }}
            >
              + Tambah Prestasi
            </Button>
          ) : undefined
        }
      />
      {error ? (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
      ) : null}
      {notice ? (
        <p role="status" className="mb-4 rounded-xl bg-primary-50 px-4 py-3 text-sm font-medium text-primary-800">{notice}</p>
      ) : null}

      <div className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl border border-sand-200 bg-white p-4 shadow-card">
        <label className="flex min-w-32 flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-sand-500">Tahun</span>
          <Input
            type="number"
            min={1990}
            max={2100}
            value={year}
            onChange={(e) => setYear(e.target.value)}
            placeholder="Semua"
          />
        </label>
        <label className="flex min-w-40 flex-1 flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-sand-500">Pencarian</span>
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Judul prestasi / nama siswa…"
          />
        </label>
      </div>

      <DataTable
        head={['Siswa', 'Rombel', 'Prestasi', 'Tingkat', 'Tahun', 'Bukti', ...(canManage ? [''] : [])]}
        loading={loading}
        error={loadError}
        empty={rows.length === 0 ? 'Belum ada prestasi tercatat.' : undefined}
      >
        {rows.map((a) => (
          <tr key={a.id}>
            <td className="px-5 py-3">
              <span className="font-semibold text-sand-900">{a.student.name}</span>
              {a.student.nis ? <span className="block text-xs text-sand-400">NIS {a.student.nis}</span> : null}
            </td>
            <td className="px-5 py-3 text-sand-600">{a.student.enrollments[0]?.class.name ?? '—'}</td>
            <td className="px-5 py-3">
              <span className="font-medium text-sand-900">{a.title}</span>
              {a.description ? <span className="block max-w-xs truncate text-xs text-sand-400">{a.description}</span> : null}
            </td>
            <td className="px-5 py-3 text-sand-600">{a.level ?? '—'}</td>
            <td className="px-5 py-3 text-sand-600">{a.year ?? '—'}</td>
            <td className="px-5 py-3">
              {a.evidenceDocument ? (
                <button
                  type="button"
                  className="text-xs font-semibold text-primary-700 hover:underline"
                  title={a.evidenceDocument.fileName}
                  onClick={() => openStudentDocument(a.evidenceDocument!.id).then((u) => window.open(u, '_blank')).catch(() => setError('Gagal membuka bukti.'))}
                >
                  📎 Buka
                </button>
              ) : (
                <span className="text-sand-300">—</span>
              )}
            </td>
            {canManage ? (
              <td className="px-5 py-3 text-right">
                <span className="flex justify-end gap-2">
                  <RowBtn
                    type="button"
                    tone="neutral"
                    onClick={() => {
                      setEditing(a);
                      setModal('edit');
                    }}
                  >
                    Ubah
                  </RowBtn>
                  <RowBtn
                    type="button"
                    tone="danger"
                    onClick={async () => {
                      if (!(await confirm(`Hapus prestasi "${a.title}" milik ${a.student.name}?`))) return;
                      try {
                        await deleteAchievement(a.id);
                        setNotice('Prestasi dihapus.');
                        load(search, year);
                      } catch (err) {
                        setError(err instanceof Error ? err.message : 'Gagal menghapus.');
                      }
                    }}
                  >
                    Hapus
                  </RowBtn>
                </span>
              </td>
            ) : null}
          </tr>
        ))}
      </DataTable>

      <Modal
        open={modal !== null}
        onClose={() => {
          setModal(null);
          setEditing(null);
          setStudent(null);
        }}
        title={modal === 'edit' ? 'Ubah Prestasi' : 'Tambah Prestasi'}
        size="xl"
      >
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
          {modal === 'tambah' ? (
            <Field label="Siswa" className="sm:col-span-2" hint="Ketik nama untuk mencari">
              <StudentPicker value={student} onChange={setStudent} />
            </Field>
          ) : (
            <p className="sm:col-span-2 text-sm font-semibold text-sand-800">{editing?.student.name}</p>
          )}
          <Field label="Judul Prestasi" className="sm:col-span-2" hint="Mis. Juara 1 O2SN Matematika">
            <Input name="title" required minLength={3} defaultValue={editing?.title ?? ''} />
          </Field>
          <Field label="Tingkat">
            <Select name="level" defaultValue={editing?.level ?? ''}>
              <option value="">— Pilih —</option>
              {LEVELS.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </Select>
          </Field>
          <Field label="Tahun">
            <Input name="year" type="number" min={1990} max={2100} defaultValue={editing?.year ?? ''} />
          </Field>
          <Field label="Keterangan" className="sm:col-span-2" hint="Penyelenggara, tanggal, dsb">
            <Input name="description" defaultValue={editing?.description ?? ''} />
          </Field>
          <div className="sm:col-span-2 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setModal(null)}>Batal</Button>
            <Button type="submit" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</Button>
          </div>
        </form>
      </Modal>
      {dialog}
    </Shell>
  );
}
