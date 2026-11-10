'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Field, Input, Modal, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { DataTable } from '@/components/data-table';
import { PageTitle } from '@/components/widgets';
import {
  createLetter,
  createLetterCategory,
  deleteLetter,
  deleteLetterCategory,
  downloadLetterFile,
  listLetterCategories,
  listLetters,
  updateLetter,
  uploadLetterFile,
  type Letter,
  type LetterCategory,
} from '@/lib/api';

import { RowBtn } from '@/components/row-btn';
import { FilePick } from '@/components/file-pick';
import { useConfirm } from '@/components/confirm-dialog';
const DIRS = [
  { key: 'IN', label: 'Surat Masuk' },
  { key: 'OUT', label: 'Surat Keluar' },
] as const;

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

export default function SuratPage() {
  const { confirm, dialog } = useConfirm();
  const [dir, setDir] = useState<'IN' | 'OUT'>('IN');
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [categories, setCategories] = useState<LetterCategory[]>([]);
  const [catModal, setCatModal] = useState(false);
  const [rows, setRows] = useState<Letter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<Letter | 'new' | null>(null);
  const [modalFile, setModalFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listLetters(dir, search || undefined, categoryId || undefined));
      setError(null);
    } catch {
      setError('Gagal memuat agenda surat.');
    } finally {
      setLoading(false);
    }
  }, [dir, search, categoryId]);

  useEffect(() => {
    listLetterCategories('SURAT').then(setCategories).catch(() => setCategories([]));
  }, []);

  // Filter realtime — debounce 300ms untuk semua perubahan.
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
      number: val('number'),
      date: val('date'),
      subject: val('subject'),
      party: val('party') ?? null,
      categoryId: val('categoryId') ?? null,
      description: val('description') ?? null,
    };
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (modal === 'new') {
        const created = await createLetter({ ...dto, direction: dir });
        if (modalFile) await uploadLetterFile(created.id, modalFile);
        setNotice('Surat dicatat.');
      } else if (modal) {
        await updateLetter(modal.id, dto);
        if (modalFile) await uploadLetterFile(modal.id, modalFile);
        setNotice('Surat diperbarui.');
      }
      setModal(null);
      setModalFile(null);
      await load();
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : 'Aksi gagal.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <PageTitle
        title="Surat Menyurat"
        subtitle="Agenda surat masuk dan keluar Tata Usaha"
        actions={
          <Button size="sm" onClick={async () => { setModalFile(null); setModal('new'); }}>
            + Catat Surat
          </Button>
        }
      />
      {error ? (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
      ) : null}
      {notice ? (
        <p role="status" className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{notice}</p>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-xl border border-sand-200 bg-white p-1 shadow-sm">
          {DIRS.map((d) => (
            <button
              key={d.key}
              type="button"
              onClick={async () => setDir(d.key)}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors ${
                dir === d.key ? 'bg-primary-700 text-white' : 'text-sand-600 hover:bg-sand-100'
              }`}
>
              {d.label}
            </button>
          ))}
        </div>
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nomor / perihal / pihak…"
          className="w-64 max-w-full"
        />
        <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-48">
          <option value="">Semua kategori</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
        <RowBtn type="button" tone="neutral" onClick={() => setCatModal(true)}>⚙ Kategori</RowBtn>
      </div>

      <DataTable
        head={['No. Surat', 'Tanggal', 'Perihal', dir === 'IN' ? 'Pengirim' : 'Tujuan', 'Kategori', 'Lampiran', '']}
        loading={loading}
        error={error}
        empty={rows.length === 0 ? 'Belum ada surat.' : undefined}
>
        {rows.map((l) => (
          <tr key={l.id}>
            <td className="px-5 py-3 font-mono text-xs font-bold text-primary-800">{l.number}</td>
            <td className="whitespace-nowrap px-5 py-3 text-sand-600">{fmtDate(l.date)}</td>
            <td className="px-5 py-3 font-semibold text-sand-900">{l.subject}</td>
            <td className="px-5 py-3 text-sand-600">{l.party ?? '—'}</td>
            <td className="px-5 py-3 text-xs text-sand-600">{l.category?.name ?? '—'}</td>
            <td className="max-w-40 truncate px-5 py-3 text-xs text-sand-600" title={l.fileName ?? ''}>
              {l.fileName ?? '—'}
            </td>
            <td className="px-5 py-3 text-right">
              <span className="flex justify-end gap-2">
                {l.fileName ? (
                  <RowBtn type="button" onClick={async () => { try { const blob = await downloadLetterFile(l.id); const url = URL.createObjectURL(blob); window.open(url, '_blank'); } catch { setError('Gagal membuka lampiran.'); } }}>
                    Detail
                  </RowBtn>
                ) : null}
                <RowBtn type="button" onClick={async () => { setModalFile(null); setModal(l); }}>
                  Ubah
                </RowBtn>
                <RowBtn tone="danger" type="button" onClick={async () => { if (await confirm(`Hapus surat "${l.number}"?`)) { void run(() => deleteLetter(l.id), 'Surat dihapus.'); } }}>
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
        title={modal === 'new' ? `Catat ${dir === 'IN' ? 'Surat Masuk' : 'Surat Keluar'}` : 'Ubah Surat'}
>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={onSubmit}>
          <Field label="Nomor Surat">
            <Input name="number" required defaultValue={modal !== 'new' ? modal?.number : ''} placeholder="001/TU/X/2026" />
          </Field>
          <Field label="Tanggal">
            <Input
              name="date"
              type="date"
              required
              defaultValue={
                modal !== 'new' && modal?.date ? modal.date.slice(0, 10) : new Date().toISOString().slice(0, 10)
              }
            />
          </Field>
          <Field label="Perihal" className="sm:col-span-2">
            <Input name="subject" required minLength={3} defaultValue={modal !== 'new' ? modal?.subject : ''} />
          </Field>
          <Field label={dir === 'IN' ? 'Pengirim' : 'Tujuan'}>
            <Input name="party" defaultValue={modal !== 'new' ? modal?.party ?? '' : ''} placeholder={dir === 'IN' ? 'Dinas Pendidikan…' : 'Kepada Yth…'} />
          </Field>
          <Field label="Kategori" hint="Kelola lewat tombol ⚙ Kategori">
            <Select name="categoryId" defaultValue={modal !== 'new' ? modal?.categoryId ?? '' : ''}>
              <option value="">— Tanpa kategori —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Keterangan" className="sm:col-span-2">
            <Input name="description" defaultValue={modal !== 'new' ? modal?.description ?? '' : ''} />
          </Field>
          <Field
            label={modal !== 'new' && modal?.fileName ? 'Ganti Lampiran' : 'Lampiran (opsional)'}
            hint="PDF / gambar / dokumen — diunggah setelah surat disimpan"
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

      <Modal open={catModal} onClose={() => setCatModal(false)} title="Kelola Kategori Surat">
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const name = String(new FormData(e.currentTarget).get('name') ?? '').trim();
            if (!name) return;
            e.currentTarget.reset();
            await createLetterCategory('SURAT', name).catch(() => setError('Gagal menambah kategori.'));
            setCategories(await listLetterCategories('SURAT').catch(() => []));
          }}
        >
          <Input name="name" required placeholder="Kategori baru — mis. Kedinasan, Undangan…" className="flex-1" />
          <Button type="submit" size="sm">+ Tambah</Button>
        </form>
        <ul className="mt-4 space-y-1.5">
          {categories.map((c) => (
            <li key={c.id} className="flex items-center justify-between rounded-lg bg-sand-50 px-3 py-2 text-sm">
              <span className="font-semibold">{c.name}</span>
              <span className="flex items-center gap-2">
                <span className="text-xs text-sand-400">{c._count?.letters ?? 0} surat</span>
                <RowBtn
                  type="button"
                  tone="danger"
                  onClick={async () => {
                    if (!(await confirm(`Hapus kategori "${c.name}"? Surat terkait tidak ikut terhapus.`))) return;
                    await deleteLetterCategory(c.id).catch(() => setError('Gagal menghapus.'));
                    setCategories(await listLetterCategories('SURAT').catch(() => []));
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
      </Shell>
  );
}
