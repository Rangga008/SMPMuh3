'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Field, Input, Modal, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { PageTitle, Widget } from '@/components/widgets';
import { DataTable } from '@/components/data-table';
import { RowBtn } from '@/components/row-btn';
import { FilePick } from '@/components/file-pick';
import { useConfirm } from '@/components/confirm-dialog';
import {
  archiveFileUrl, createArchiveCategory, deleteArchive, listArchiveCategories, listArchives, updateArchive, uploadArchive,
  type ArchiveItemView,
} from '@/lib/api-ops';

export default function ArsipPage() {
  const { confirm, dialog } = useConfirm();
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
    listArchiveCategories().then(setCats).catch(() => {});
    listArchives({ categoryId: catId || undefined, q: q || undefined }).then(setRows).catch(() => {});
  }, [catId, q]);
  useEffect(load, [load]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const dto = {
      title: String(fd.get('title')),
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
    } catch { setError('Gagal menyimpan arsip.'); }
    finally { setBusy(false); }
  }

  return (
    <Shell>
      <PageTitle title="Arsip TU" subtitle="Penyimpanan dokumen & arsip per kategori — cari berdasar judul atau nomor."
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setCatModal(true)}>+ Kategori</Button>
            <Button size="sm" onClick={() => { setModalFile(null); setModal('new'); }}>+ Arsip Baru</Button>
          </div>
        } />
      {dialog}
      {error ? <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {notice ? <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p> : null}

      <div className="mb-4 flex flex-wrap gap-2">
        <Select value={catId} onChange={(e) => setCatId(e.target.value)} className="min-w-44" aria-label="Filter kategori">
          <option value="">Semua kategori</option>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.name} ({c._count.items})</option>)}
        </Select>
        <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari judul/nomor arsip…" className="min-w-52 flex-1" />
      </div>

      <Widget title={`Arsip (${rows.length})`}>
        <DataTable head={['Kategori', 'Judul', 'No. Dokumen', 'Tanggal', 'File', '']} empty={!rows.length ? 'Belum ada arsip.' : undefined}>
          {rows.map((a) => (
            <tr key={a.id}>
              <td className="px-5 py-2.5 text-sand-600">{a.category?.name ?? '—'}</td>
              <td className="px-5 py-2.5 font-medium text-sand-900">{a.title}</td>
              <td className="px-5 py-2.5 text-sand-600">{a.refNumber ?? '—'}</td>
              <td className="px-5 py-2.5 text-sand-600">{a.date ? a.date.slice(0, 10) : '—'}</td>
              <td className="max-w-44 truncate px-5 py-2.5 text-xs text-sand-600" title={a.fileName}>{a.fileName}</td>
              <td className="px-5 py-2.5 text-right">
                <span className="flex justify-end gap-2">
                  <RowBtn type="button" onClick={() => window.open(archiveFileUrl(a.id), '_blank')}>Detail</RowBtn>
                  <RowBtn type="button" onClick={() => { setModalFile(null); setModal(a); }}>Ubah</RowBtn>
                  <RowBtn tone="danger" type="button" onClick={async () => {
                    if (!(await confirm(`Hapus arsip "${a.title}"?`))) return;
                    setBusy(true);
                    try { await deleteArchive(a.id); setNotice('Arsip dihapus.'); load(); }
                    catch { setError('Gagal menghapus.'); }
                    finally { setBusy(false); }
                  }}>Hapus</RowBtn>
                </span>
              </td>
            </tr>
          ))}
        </DataTable>
      </Widget>

      <Modal open={catModal} onClose={() => setCatModal(false)} title="Kategori Arsip">
        <form className="grid gap-4" onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          setBusy(true);
          try { await createArchiveCategory(String(fd.get('name'))); setCatModal(false); load(); setNotice('Kategori dibuat.'); }
          catch { setError('Gagal.'); } finally { setBusy(false); }
        }}>
          <Field label="Nama kategori"><Input name="name" required placeholder="Surat Dinas / SK / Keuangan" /></Field>
          <div className="flex justify-end"><Button type="submit" disabled={busy}>Simpan</Button></div>
        </form>
      </Modal>

      <Modal open={modal !== null} onClose={() => setModal(null)} title={modal === 'new' ? 'Arsip Baru' : 'Ubah Arsip'}>
        <form className="grid gap-4" onSubmit={onSubmit}>
          <Field label="Judul"><Input name="title" required defaultValue={modal !== 'new' ? modal?.title : ''} placeholder="SK Pengangkatan Guru 2026" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Kategori">
              <Select name="categoryId" defaultValue={modal !== 'new' ? modal?.categoryId ?? '' : ''}>
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
