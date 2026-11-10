'use client';

import { useCallback, useEffect, useState } from 'react';
import type { StudentDto } from '@smpmuh3/types';
import { Badge, Button, Field, Input, Modal, Select } from '@smpmuh3/ui';
import { DataTable } from '@/components/data-table';
import { SearchSelect } from '@/components/search-select';
import { PageTitle } from '@/components/widgets';
import {
  createLetterCategory,
  createMutation,
  deleteLetterCategory,
  deleteMutation,
  listLetterCategories,
  listMutations,
  listStudents,
  updateMutation,
  type LetterCategory,
  type StudentMutation,
} from '@/lib/api';
import { mutationLetterUrl, uploadMutationLetter } from '@/lib/api-ops';

import { RowBtn } from '@/components/row-btn';
import { FilePick } from '@/components/file-pick';
import { useConfirm } from '@/components/confirm-dialog';
const STATUS: Record<StudentMutation['status'], { label: string; tone: 'primary' | 'accent' | 'neutral' }> = {
  PROCESS: { label: 'Diproses', tone: 'accent' },
  DONE: { label: 'Selesai', tone: 'primary' },
  CANCELLED: { label: 'Batal', tone: 'neutral' },
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

/** Register mutasi siswa — dipakai halaman Mutasi Masuk & Mutasi Keluar. */
export function MutasiView({ direction }: { direction: 'IN' | 'OUT' }) {
  const { confirm, dialog } = useConfirm();
  const isIn = direction === 'IN';
  const title = isIn ? 'Mutasi Masuk' : 'Mutasi Keluar';
  const schoolLabel = isIn ? 'Asal Sekolah' : 'Tujuan Sekolah';

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [categories, setCategories] = useState<LetterCategory[]>([]);
  const [catModal, setCatModal] = useState(false);
  const [rows, setRows] = useState<StudentMutation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<StudentMutation | 'new' | null>(null);
  const [modalFile, setModalFile] = useState<File | null>(null);
  // Mutasi keluar: pilih siswa dari sistem → nama/NISN terisi otomatis.
  const [picked, setPicked] = useState<StudentDto | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listMutations(direction, search || undefined, categoryId || undefined));
      setError(null);
    } catch {
      setError('Gagal memuat data mutasi.');
    } finally {
      setLoading(false);
    }
  }, [direction, search, categoryId]);

  useEffect(() => {
    listLetterCategories('MUTASI').then(setCategories).catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(), 300);
    return () => clearTimeout(t);
  }, [load]);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await fn();
      setModal(null);
      setNotice(ok);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Aksi gagal.');
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const val = (k: string) => String(f.get(k) ?? '').trim() || undefined;
    const dto = {
      studentName: picked?.name ?? val('studentName'),
      nisn: val('nisn') ?? picked?.nisn ?? null,
      date: val('date'),
      school: val('school') ?? null,
      letterNumber: val('letterNumber') ?? null,
      categoryId: val('categoryId') ?? null,
      status: (val('status') ?? 'PROCESS') as StudentMutation['status'],
      notes: val('notes') ?? null,
    };
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (modal === 'new') {
        const created = await createMutation({ ...dto, direction });
        if (modalFile) await uploadMutationLetter(created.id, modalFile);
        setNotice('Mutasi dicatat.');
      } else if (modal) {
        await updateMutation(modal.id, dto);
        if (modalFile) await uploadMutationLetter(modal.id, modalFile);
        setNotice('Mutasi diperbarui.');
      }
      setModal(null);
      setModalFile(null);
      setPicked(null);
      await load();
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : 'Aksi gagal.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageTitle
        title={title}
        subtitle={
          isIn
            ? 'Siswa pindah dari sekolah lain ke sekolah ini'
            : 'Siswa pindah dari sekolah ini ke sekolah lain'
        }
        actions={<Button size="sm" onClick={async () => { setModalFile(null); setModal('new'); }}>+ Catat Mutasi</Button>}
      />
      {error ? (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
      ) : null}
      {notice ? (
        <p role="status" className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{notice}</p>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nama / NISN / sekolah…"
          className="w-72 max-w-full"
        />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-40">
          <option value="">Semua status</option>
          <option value="PROCESS">Diproses</option>
          <option value="DONE">Selesai</option>
          <option value="CANCELLED">Batal</option>
        </Select>
        <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-44">
          <option value="">Semua kategori</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
        <RowBtn type="button" tone="neutral" onClick={() => setCatModal(true)}>⚙ Kategori</RowBtn>
      </div>

      <DataTable
        head={['Nama Siswa', 'NISN', 'Tanggal', schoolLabel, 'No. Surat', 'Kategori', 'Status', '']}
        loading={loading}
        error={error}
        empty={rows.length === 0 ? 'Belum ada mutasi.' : undefined}
>
        {rows.filter((m) => !status || m.status === status).map((m) => (
          <tr key={m.id}>
            <td className="px-5 py-3 font-semibold text-sand-900">{m.studentName}</td>
            <td className="px-5 py-3 text-sand-600">{m.nisn ?? '—'}</td>
            <td className="whitespace-nowrap px-5 py-3 text-sand-600">{fmtDate(m.date)}</td>
            <td className="px-5 py-3 text-sand-600">{m.school ?? '—'}</td>
            <td className="px-5 py-3 font-mono text-xs text-sand-600">
              {m.letterNumber ?? '—'}
              {m.fileName ? <span className="block max-w-36 truncate text-sand-400" title={m.fileName}>{m.fileName}</span> : null}
            </td>
            <td className="px-5 py-3 text-xs text-sand-600">{m.category?.name ?? '—'}</td>
            <td className="px-5 py-3">
              <Badge tone={STATUS[m.status].tone}>{STATUS[m.status].label}</Badge>
            </td>
            <td className="px-5 py-3 text-right">
              <span className="flex justify-end gap-2">
                {m.fileName ? (
                  <RowBtn type="button" onClick={() => window.open(mutationLetterUrl(m.id), '_blank')}>
                    Detail
                  </RowBtn>
                ) : null}
                <RowBtn type="button" onClick={async () => { setModalFile(null); setModal(m); }}>
                  Ubah
                </RowBtn>
                {m.status === 'PROCESS' ? (
                  <RowBtn tone="success" type="button" onClick={async () => void run(() => updateMutation(m.id, { status: 'DONE' }), 'Mutasi ditandai selesai.') }>
                    Tandai Selesai
                  </RowBtn>
                ) : null}
                <RowBtn tone="danger" type="button" onClick={async () => { if (await confirm(`Hapus mutasi ${m.studentName}?`)) { void run(() => deleteMutation(m.id), 'Mutasi dihapus.'); } }}>
                  Hapus
                </RowBtn>
              </span>
            </td>
          </tr>
        ))}
      </DataTable>

      <Modal
        open={modal !== null}
        onClose={() => setModal(null)}
        title={modal === 'new' ? `Catat ${title}` : 'Ubah Mutasi'}
>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={onSubmit}>
          {!isIn && modal === 'new' ? (
            <Field label="Siswa (cari nama/NIS)" className="sm:col-span-2" hint="Opsional — isi manual bila belum terdata">
              <SearchSelect
                placeholder="Ketik nama atau NIS siswa…"
                value={picked}
                onPick={setPicked}
                load={(q) => listStudents({ search: q, status: 'ACTIVE' }).then((r) => r.slice(0, 8))}
                label={(st) => st.name}
                sub={(st) => [st.nis && `NIS ${st.nis}`, st.nisn && `NISN ${st.nisn}`].filter(Boolean).join(' · ') || null}
              />
            </Field>
          ) : null}
          {picked ? null : (
            <Field label="Nama Siswa" className="sm:col-span-2">
              <Input name="studentName" required={!picked} minLength={3} defaultValue={modal !== 'new' ? modal?.studentName : ''} />
            </Field>
          )}
          <Field label="NISN">
            <Input
              key={picked?.id ?? 'manual'}
              name="nisn"
              defaultValue={modal !== 'new' ? modal?.nisn ?? '' : picked?.nisn ?? ''}
            />
          </Field>
          <Field label="Tanggal Mutasi">
            <Input
              name="date"
              type="date"
              required
              defaultValue={
                modal !== 'new' && modal?.date ? modal.date.slice(0, 10) : new Date().toISOString().slice(0, 10)
              }
            />
          </Field>
          <Field label={schoolLabel}>
            <Input name="school" defaultValue={modal !== 'new' ? modal?.school ?? '' : ''} />
          </Field>
          <Field label="No. Surat Mutasi">
            <Input name="letterNumber" defaultValue={modal !== 'new' ? modal?.letterNumber ?? '' : ''} />
          </Field>
          <Field label="Kategori" hint="Kelola lewat tombol ⚙ Kategori">
            <Select name="categoryId" defaultValue={modal !== 'new' ? modal?.categoryId ?? '' : ''}>
              <option value="">— Tanpa kategori —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select name="status" defaultValue={modal !== 'new' ? modal?.status : 'PROCESS'}>
              <option value="PROCESS">Diproses</option>
              <option value="DONE">Selesai</option>
              <option value="CANCELLED">Batal</option>
            </Select>
          </Field>
          <Field label="Catatan">
            <Input name="notes" defaultValue={modal !== 'new' ? modal?.notes ?? '' : ''} />
          </Field>
          <Field
            label={modal !== 'new' && modal?.fileName ? 'Ganti Surat' : 'Unggah Surat (opsional)'}
            hint="Surat pengajuan/keterangan — PDF atau gambar"
            className="sm:col-span-2"
          >
            <FilePick
              accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
              file={modalFile}
              onPick={setModalFile}
              emptyText={modal !== 'new' && modal?.fileName ? modal.fileName : 'Belum ada file'}
            />
          </Field>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="ghost" onClick={async () => setModal(null)}>Batal</Button>
            <Button type="submit" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={catModal} onClose={() => setCatModal(false)} title="Kelola Kategori Mutasi">
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const name = String(new FormData(e.currentTarget).get('name') ?? '').trim();
            if (!name) return;
            e.currentTarget.reset();
            await createLetterCategory('MUTASI', name).catch(() => setError('Gagal menambah kategori.'));
            setCategories(await listLetterCategories('MUTASI').catch(() => []));
          }}
        >
          <Input name="name" required placeholder="Kategori baru — mis. Pindah domisili, Diterima sekolah lain…" className="flex-1" />
          <Button type="submit" size="sm">+ Tambah</Button>
        </form>
        <ul className="mt-4 space-y-1.5">
          {categories.map((c) => (
            <li key={c.id} className="flex items-center justify-between rounded-lg bg-sand-50 px-3 py-2 text-sm">
              <span className="font-semibold">{c.name}</span>
              <span className="flex items-center gap-2">
                <span className="text-xs text-sand-400">{c._count?.mutations ?? 0} mutasi</span>
                <RowBtn
                  type="button"
                  tone="danger"
                  onClick={async () => {
                    if (!(await confirm(`Hapus kategori "${c.name}"? Mutasi terkait tidak ikut terhapus.`))) return;
                    await deleteLetterCategory(c.id).catch(() => setError('Gagal menghapus.'));
                    setCategories(await listLetterCategories('MUTASI').catch(() => []));
                  }}
                >
                  Hapus
                </RowBtn>
              </span>
            </li>
          ))}
          {categories.length === 0 ? <li className="py-4 text-center text-sm text-sand-500">Belum ada kategori.</li> : null}
        </ul>
      </Modal>
          {dialog}
      </>
  );
}
