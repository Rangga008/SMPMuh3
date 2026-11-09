'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Field, Input, Modal, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { PageTitle, Widget } from '@/components/widgets';
import { DataTable } from '@/components/data-table';
import {
  archiveFileUrl, createArchiveCategory, listArchiveCategories, listArchives, uploadArchive,
  type ArchiveItemView,
} from '@/lib/api-ops';

export default function ArsipPage() {
  const [cats, setCats] = useState<Awaited<ReturnType<typeof listArchiveCategories>>>([]);
  const [rows, setRows] = useState<ArchiveItemView[]>([]);
  const [catId, setCatId] = useState('');
  const [q, setQ] = useState('');
  const [modal, setModal] = useState(false);
  const [catModal, setCatModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    listArchiveCategories().then(setCats).catch(() => {});
    listArchives({ categoryId: catId || undefined, q: q || undefined }).then(setRows).catch(() => {});
  }, [catId, q]);
  useEffect(load, [load]);

  return (
    <Shell>
      <PageTitle title="Arsip TU" subtitle="Penyimpanan dokumen & arsip per kategori — cari berdasar judul atau nomor."
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setCatModal(true)}>+ Kategori</Button>
            <Button size="sm" onClick={() => setModal(true)}>+ Arsip Baru</Button>
          </div>
        } />
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
        <DataTable head={['Kategori', 'Judul', 'No. Dokumen', 'Tanggal', 'File']} empty={!rows.length ? 'Belum ada arsip.' : undefined}>
          {rows.map((a) => (
            <tr key={a.id}>
              <td className="px-5 py-2.5 text-sand-600">{a.category?.name ?? '—'}</td>
              <td className="px-5 py-2.5 font-medium text-sand-900">{a.title}</td>
              <td className="px-5 py-2.5 text-sand-600">{a.refNumber ?? '—'}</td>
              <td className="px-5 py-2.5 text-sand-600">{a.date ? a.date.slice(0, 10) : '—'}</td>
              <td className="px-5 py-2.5"><a href={archiveFileUrl(a.id)} className="text-xs font-bold text-primary-700 hover:underline">{a.fileName}</a></td>
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

      <Modal open={modal} onClose={() => setModal(false)} title="Arsip Baru">
        <form className="grid gap-4" onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const f = fd.get('file') as File;
          if (!f?.size) return;
          setBusy(true);
          try {
            await uploadArchive({
              title: String(fd.get('title')), categoryId: String(fd.get('categoryId')) || undefined,
              refNumber: String(fd.get('refNumber')) || undefined, date: String(fd.get('date')) || undefined,
            }, f);
            setModal(false); load(); setNotice('Arsip tersimpan.');
          } catch { setError('Gagal.'); } finally { setBusy(false); }
        }}>
          <Field label="Judul"><Input name="title" required placeholder="SK Pengangkatan Guru 2026" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Kategori">
              <Select name="categoryId"><option value="">— tanpa —</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
            </Field>
            <Field label="Tanggal"><Input name="date" type="date" /></Field>
          </div>
          <Field label="No. dokumen"><Input name="refNumber" placeholder="421/SK/2026" /></Field>
          <Field label="File"><Input name="file" type="file" required /></Field>
          <div className="flex justify-end"><Button type="submit" disabled={busy}>Simpan</Button></div>
        </form>
      </Modal>
    </Shell>
  );
}
