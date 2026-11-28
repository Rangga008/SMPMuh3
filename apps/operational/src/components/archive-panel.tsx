'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Field, Input, Modal, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { PageTitle, Widget } from '@/components/widgets';
import { DataTable } from '@/components/data-table';
import { RowBtn } from '@/components/row-btn';
import { FilePick } from '@/components/file-pick';
import { useConfirm, usePrompt } from '@/components/confirm-dialog';
import {
  createArchiveCategory, deleteArchive, deleteArchiveCategory, listArchiveCategories, listArchives,
  updateArchive, updateArchiveCategory, uploadArchive,
  type ArchiveItemView, type ArchiveSection,
} from '@/lib/api-ops';
import { useFileViewer } from '@/components/file-viewer';

/** Panel arsip satu bidang — arsip & kategori tersekat per bidang (tiap role
 *  hanya melihat arsip bidangnya). Dipakai halaman arsip tiap bidang. */
export function ArchivePanel({ section, title, subtitle }: { section: ArchiveSection; title: string; subtitle: string }) {
  const { confirm, dialog } = useConfirm();
  const { prompt, dialog: promptDialog } = usePrompt();
  const fv = useFileViewer();
  const [cats, setCats] = useState<Awaited<ReturnType<typeof listArchiveCategories>>>([]);
  const [rows, setRows] = useState<ArchiveItemView[]>([]);
  const [catId, setCatId] = useState('');
  const [q, setQ] = useState('');
  const [modal, setModal] = useState<ArchiveItemView | 'new' | null>(null);
  const [modalFile, setModalFile] = useState<File | null>(null);
  const [catModal, setCatModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    listArchiveCategories(section).then(setCats).catch(() => {});
    listArchives({ section, categoryId: catId || undefined, q: q || undefined }).then(setRows).catch(() => {});
  }, [section, catId, q]);
  useEffect(load, [load]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const dto = {
      title: String(fd.get('title')),
      section,
      categoryId: String(fd.get('categoryId')),
      refNumber: String(fd.get('refNumber')),
      date: String(fd.get('date')),
    };
    setBusy(true); setError(null); setNotice(null);
    try {
      if (modal === 'new') {
        if (!modalFile) { setError('File arsip wajib dipilih.'); return; }
        await uploadArchive(dto, modalFile);
        setNotice('Arsip tersimpan.');
      } else if (modal) {
        await updateArchive(modal.id, dto, modalFile ?? undefined);
        setNotice('Arsip diperbarui.');
      }
      setModal(null); setModalFile(null); load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Gagal menyimpan arsip.'); }
    finally { setBusy(false); }
  }

  return (
    <Shell>
      <PageTitle title={title} subtitle={subtitle}
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setCatModal(true)}>Kelola Kategori</Button>
            <Button size="sm" onClick={() => { setModalFile(null); setModal('new'); }}>+ Arsip Baru</Button>
          </div>
        } />
      {dialog}
      {promptDialog}
      {fv.viewer}
      {error ? <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {notice ? <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p> : null}

      <div className="mb-4 flex flex-wrap gap-2">
        <Select value={catId} onChange={(e) => setCatId(e.target.value)} className="min-w-44" aria-label="Filter kategori" searchable>
          <option value="">Semua kategori</option>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.name} ({c._count.items})</option>)}
        </Select>
        <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari judul/nomor arsip…" className="min-w-52 flex-1" />
      </div>

      <Widget title={`Arsip (${rows.length})`}>
        <DataTable head={['Kategori', 'Judul', 'No. Dokumen', 'Tanggal', 'File', '']} empty={!rows.length ? 'Belum ada arsip di bidang ini.' : undefined}>
          {rows.map((a) => (
            <tr key={a.id}>
              <td className="px-5 py-2.5 text-sand-600">{a.category?.name ?? '—'}</td>
              <td className="px-5 py-2.5 font-medium text-sand-900">{a.title}</td>
              <td className="px-5 py-2.5 text-sand-600">{a.refNumber ?? '—'}</td>
              <td className="px-5 py-2.5 text-sand-600">{a.date ? a.date.slice(0, 10) : '—'}</td>
              <td className="max-w-44 truncate px-5 py-2.5 text-xs text-sand-600" title={a.fileName}>{a.fileName}</td>
              <td className="px-5 py-2.5 text-right">
                <span className="flex justify-end gap-2">
                  <RowBtn type="button" onClick={() => fv.open({ path: `/ops/archives/${a.id}/file`, name: a.fileName, mime: a.mimeType })}>Lihat</RowBtn>
                  <RowBtn type="button" onClick={async () => fv.download({ path: `/ops/archives/${a.id}/file`, name: a.fileName }).catch(() => setError('Gagal mengunduh file.'))}>Unduh</RowBtn>
                  <RowBtn type="button" onClick={() => { setModalFile(null); setModal(a); }}>Ubah</RowBtn>
                  <RowBtn tone="danger" type="button" onClick={async () => {
                    if (!(await confirm(`Hapus arsip "${a.title}"?`))) return;
                    setBusy(true);
                    try { await deleteArchive(a.id); setNotice('Arsip dihapus.'); load(); }
                    catch (err) { setError(err instanceof Error ? err.message : 'Gagal menghapus.'); }
                    finally { setBusy(false); }
                  }}>Hapus</RowBtn>
                </span>
              </td>
            </tr>
          ))}
        </DataTable>
      </Widget>

      <Modal open={catModal} onClose={() => setCatModal(false)} title="Kelola Kategori Arsip">
        <ul className="mb-4 divide-y divide-sand-100 rounded-xl border border-sand-200">
          {cats.map((c) => (
            <li key={c.id} className="flex items-center gap-2 px-3.5 py-2.5">
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-sand-800">{c.name}</span>
              <span className="text-xs text-sand-400">{c._count.items} arsip</span>
              <button type="button" className="text-xs font-bold text-primary-700 hover:underline"
                onClick={async () => {
                  const renamed = await prompt({
                    title: 'Ubah nama kategori',
                    label: 'Nama kategori',
                    defaultValue: c.name,
                    required: true,
                    confirmLabel: 'Simpan',
                  });
                  const name = renamed?.trim();
                  if (!name || name === c.name) return;
                  try { await updateArchiveCategory(c.id, name); setNotice('Kategori diubah.'); load(); }
                  catch (err) { setError(err instanceof Error ? err.message : 'Gagal.'); }
                }}>Ubah</button>
              <button type="button" className="text-xs font-bold text-red-600 hover:underline"
                onClick={async () => {
                  if (!(await confirm(`Hapus kategori "${c.name}"? ${c._count.items ? `${c._count.items} arsip di dalamnya jadi tanpa kategori (tidak terhapus).` : ''}`))) return;
                  try { await deleteArchiveCategory(c.id); setNotice('Kategori dihapus.'); if (catId === c.id) setCatId(''); load(); }
                  catch (err) { setError(err instanceof Error ? err.message : 'Gagal.'); }
                }}>Hapus</button>
            </li>
          ))}
          {!cats.length ? <li className="px-3.5 py-6 text-center text-sm text-sand-400">Belum ada kategori.</li> : null}
        </ul>
        <form className="flex items-end gap-2" onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          setBusy(true);
          try { await createArchiveCategory(String(fd.get('name')), section); (e.target as HTMLFormElement).reset(); load(); setNotice('Kategori dibuat.'); }
          catch (err) { setError(err instanceof Error ? err.message : 'Gagal.'); } finally { setBusy(false); }
        }}>
          <Field label="Kategori baru" className="flex-1"><Input name="name" required placeholder="Surat Dinas / SK / Rapor" /></Field>
          <Button type="submit" disabled={busy}>Tambah</Button>
        </form>
      </Modal>

      <Modal open={modal !== null} onClose={() => setModal(null)} title={modal === 'new' ? 'Arsip Baru' : 'Ubah Arsip'}>
        <form className="grid gap-4" onSubmit={onSubmit}>
          <Field label="Judul"><Input name="title" required defaultValue={modal !== 'new' ? modal?.title : ''} placeholder="SK Pengangkatan Guru 2026" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Kategori">
              <Select name="categoryId" defaultValue={modal !== 'new' ? modal?.categoryId ?? '' : ''} searchable>
                <option value="">— tanpa —</option>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Tanggal"><Input name="date" type="date" defaultValue={modal !== 'new' && modal?.date ? modal.date.slice(0, 10) : ''} /></Field>
          </div>
          <Field label="No. dokumen"><Input name="refNumber" defaultValue={modal !== 'new' ? modal?.refNumber ?? '' : ''} placeholder="421/SK/2026" /></Field>
          <Field label={modal !== 'new' ? 'Ganti File (opsional)' : 'File'}>
            <FilePick
              accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xlsx,.xls"
              file={modalFile}
              onPick={setModalFile}
              emptyText={modal !== 'new' ? modal?.fileName ?? 'Belum ada file' : 'Belum ada file'}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setModal(null)}>Batal</Button>
            <Button type="submit" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</Button>
          </div>
        </form>
      </Modal>
    </Shell>
  );
}
