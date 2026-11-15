'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Field, Input, Modal, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { PageTitle, Widget } from '@/components/widgets';
import { DataTable } from '@/components/data-table';
import { RowBtn } from '@/components/row-btn';
import { FilePick } from '@/components/file-pick';
import { SearchSelect } from '@/components/search-select';
import { useConfirm } from '@/components/confirm-dialog';
import {
  createCollection, deleteStaffDoc, listCollections,
  listStaffDocs, submitCollectionFile, uploadStaffDoc,
} from '@/lib/api-ops';
import { listAcademicYears, listEmployees, type AcademicYear } from '@/lib/api';
import { useFileViewer } from '@/components/file-viewer';

const CATS = ['SK', 'IJAZAH', 'ADMINISTRASI', 'PERANGKAT', 'LAINNYA'];

export default function DokumenPage() {
  const [docs, setDocs] = useState<Awaited<ReturnType<typeof listStaffDocs>>>([]);
  const [cols, setCols] = useState<Awaited<ReturnType<typeof listCollections>>>([]);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [employees, setEmployees] = useState<{ id: string; name: string; type?: string; department?: string | null | undefined }[]>([]);
  const [empSearch, setEmpSearch] = useState('');
  const [fEmp, setFEmp] = useState('');
  const [fCat, setFCat] = useState('');
  const [q, setQ] = useState('');
  const [upModal, setUpModal] = useState(false);
  const [colModal, setColModal] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();
  const fv = useFileViewer();
  const [yearId, setYearId] = useState('');

  const load = useCallback(() => {
    listStaffDocs({ employeeId: fEmp || undefined, category: fCat || undefined, q: q || undefined }).then(setDocs).catch(() => {});
  }, [fEmp, fCat, q]);
  useEffect(load, [load]);

  useEffect(() => {
    listAcademicYears().then((ys) => {
      setYears(ys);
      const a = ys.find((x) => x.isActive) ?? ys[0];
      if (a) setYearId(a.id);
    });
    listEmployees().then((es) => setEmployees(es.map((e) => ({ id: e.id, name: e.name, type: e.type, department: e.department })))).catch(() => {});
  }, []);
  useEffect(() => {
    if (yearId) listCollections(yearId).then(setCols).catch(() => {});
  }, [yearId]);

  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true); setError(null);
    try { await fn(); setNotice(msg); load(); } catch (err) { setError(err instanceof Error ? err.message : 'Aksi gagal.'); } finally { setBusy(false); }
  };

  return (
    <Shell>
      <PageTitle title="Dokumen & Pengumpulan" subtitle="Administrasi guru/SK dan batch pengumpulan berkas (kisi-kisi, soal, dsb)."
        actions={<Button size="sm" onClick={() => setUpModal(true)}>+ Upload Dokumen</Button>} />
      {error ? <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {notice ? <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p> : null}

      {/* Koleksi batch */}
      <Widget title="Pengumpulan Berkas (Kisi-kisi, dsb)" subtitle="Batch pengumpulan dari guru — lihat siapa yang sudah/belum mengumpulkan."
        action={<Button size="sm" onClick={() => setColModal(true)}>+ Batch Baru</Button>}>
        <div className="divide-y divide-sand-100">
          {cols.length === 0 ? <p className="px-5 py-4 text-sm text-sand-400">Belum ada pengumpulan.</p> : cols.map((c) => {
            const done = c.items.filter((i) => i.submittedAt).length;
            return (
              <details key={c.id} className="px-5 py-3">
                <summary className="flex cursor-pointer items-center justify-between">
                  <span>
                    <b className="text-sm text-sand-900">{c.title}</b>
                    <span className="ml-2 text-xs text-sand-500">{c.category} · deadline {c.deadlineAt ? c.deadlineAt.slice(0, 10) : '—'}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge tone={done === c.items.length ? 'primary' : 'accent'}>{done}/{c.items.length} terkumpul</Badge>
                    <span onClick={(e) => e.stopPropagation()}>
                      <FilePick
                        buttonLabel="Kumpulkan berkas saya"
                        accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xlsx,.xls,.zip"
                        onPick={async (f) => {
                          if (!f) return;
                          await run(() => submitCollectionFile(c.id, f), 'Berkas terkumpul — terima kasih.')
                            .then(() => { if (yearId) listCollections(yearId).then(setCols).catch(() => {}); })
                            .catch(() => setError('Anda tidak ditugaskan pada pengumpulan ini.'));
                        }}
                      />
                    </span>
                  </span>
                </summary>
                <ul className="mt-2 space-y-1 pl-2 text-sm">
                  {c.items.map((i) => (
                    <li key={i.id} className="flex items-center justify-between">
                      <span>{i.employee.name}</span>
                      {i.submittedAt ? (
                        <button type="button" onClick={() => fv.open({ path: `/ops/collection-items/${i.id}/file`, name: i.fileName ?? 'berkas' })} className="text-xs font-bold text-emerald-700 hover:underline">✓ {i.fileName}</button>
                      ) : (
                        <span className="text-xs font-semibold text-amber-600">belum mengumpulkan</span>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            );
          })}
        </div>
      </Widget>

      {/* Dokumen staf */}
      <Widget title="Dokumen Administrasi Guru / SK" subtitle="Cari dan filter per guru & kategori." className="mt-5">
        <div className="mb-3 flex flex-wrap gap-2 px-5 pt-4">
          <Select value={fEmp} onChange={(e) => setFEmp(e.target.value)} className="min-w-44" aria-label="Filter guru">
            <option value="">Semua guru</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </Select>
          <Select value={fCat} onChange={(e) => setFCat(e.target.value)} className="min-w-36" aria-label="Filter kategori">
            <option value="">Semua kategori</option>
            {CATS.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari judul/file…" className="min-w-44 flex-1" />
        </div>
        <DataTable head={['Guru', 'Kategori', 'Judul', 'File', '']} empty={!docs.length ? 'Belum ada dokumen.' : undefined}>
          {docs.map((d) => (
            <tr key={d.id}>
              <td className="px-5 py-2.5 font-medium text-sand-900">{d.employee.name}</td>
              <td className="px-5 py-2.5"><Badge tone="neutral">{d.category}</Badge></td>
              <td className="px-5 py-2.5 text-sand-700">{d.title}</td>
              <td className="max-w-44 truncate px-5 py-2.5 text-xs text-sand-600" title={d.fileName}>{d.fileName}</td>
              <td className="px-5 py-2.5 text-right">
                <span className="flex justify-end gap-2">
                  <RowBtn type="button" onClick={() => fv.open({ path: `/ops/staff-docs/${d.id}/file`, name: d.fileName, mime: d.mimeType })}>Lihat</RowBtn>
                  <RowBtn tone="danger" type="button" onClick={async () => { if (await confirm(`Hapus dokumen "${d.title}"? File yang tersimpan ikut terhapus.`)) run(() => deleteStaffDoc(d.id), 'Dokumen dihapus.'); }}>Hapus</RowBtn>
                </span>
              </td>
            </tr>
          ))}
        </DataTable>
      </Widget>

      {/* Modal upload dokumen staf */}
      <Modal open={upModal} onClose={() => setUpModal(false)} title="Upload Dokumen Guru">
        <form className="grid gap-4" onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const f = fd.get('file') as File;
          if (!f?.size) return;
          await run(() => uploadStaffDoc(String(fd.get('employeeId')), String(fd.get('category')), String(fd.get('title') || f.name), f), 'Dokumen terupload.');
          setUpModal(false);
        }}>
          <Field label="Guru">
            <SearchSelect
              name="employeeId"
              required
              placeholder="Ketik nama guru…"
              load={(q) =>
                Promise.resolve(
                  employees.filter((e) => e.name.toLowerCase().includes(q.trim().toLowerCase())),
                )
              }
              label={(e) => e.name}
              sub={(e) => e.department ?? e.type ?? null}
            />
          </Field>
          <Field label="Kategori">
            <Select name="category">{CATS.map((c) => <option key={c} value={c}>{c}</option>)}</Select>
          </Field>
          <Field label="Judul"><Input name="title" placeholder="SK Pengangkatan 2024" /></Field>
          <Field label="File"><FilePick name="file" required accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xlsx,.xls" /></Field>
          <div className="flex justify-end gap-2"><Button type="submit" disabled={busy}>Upload</Button></div>
        </form>
      </Modal>

      {/* Modal batch koleksi */}
      <Modal open={colModal} onClose={() => setColModal(false)} title="Batch Pengumpulan Baru">
        <form className="grid gap-4" onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          await run(() => createCollection({
            title: String(fd.get('title')), category: String(fd.get('category')),
            description: String(fd.get('description') || '') || undefined,
            deadlineAt: String(fd.get('deadlineAt') || '') || undefined,
            academicYearId: yearId, employeeIds: picked,
          }), 'Pengumpulan dibuat — guru dapat mengumpulkan lewat akunnya.');
          if (yearId) listCollections(yearId).then(setCols).catch(() => {});
          setColModal(false); setPicked([]);
        }}>
          <Field label="Judul"><Input name="title" required placeholder="Kisi-kisi Sumatif Semester Ganjil" /></Field>
          <Field label="Kategori">
            <Select name="category"><option value="KISI_KISI">Kisi-kisi</option><option value="SOAL">Soal Ujian</option><option value="ADMINISTRASI">Administrasi</option></Select>
          </Field>
          <Field label="Deskripsi"><Input name="description" placeholder="Instruksi pengumpulan…" /></Field>
          <Field label="Deadline"><Input name="deadlineAt" type="date" /></Field>
          <Field label={`Guru ditugaskan (${picked.length})`} hint="Pilih per guru — bisa hanya sebagian dari satu bidang.">
            <div className="rounded-xl border border-sand-200">
              <div className="flex items-center gap-2 border-b border-sand-100 p-2">
                <Input
                  type="search"
                  value={empSearch}
                  onChange={(e) => setEmpSearch(e.target.value)}
                  placeholder="Cari nama guru/pegawai…"
                  className="flex-1"
                />
                <button
                  type="button"
                  className="shrink-0 text-xs font-bold text-primary-700 hover:underline"
                  onClick={() => {
                    const visible = employees.filter((e) => !empSearch || e.name.toLowerCase().includes(empSearch.toLowerCase()));
                    setPicked((p) => [...new Set([...p, ...visible.map((e) => e.id)])]);
                  }}
                >
                  Pilih hasil filter
                </button>
              </div>
              <div className="max-h-48 space-y-1 overflow-y-auto p-2">
                {employees
                  .filter((e) => !empSearch || e.name.toLowerCase().includes(empSearch.toLowerCase()))
                  .map((e) => (
                    <label key={e.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 text-sm hover:bg-sand-50">
                      <input type="checkbox" checked={picked.includes(e.id)} className="size-4 accent-primary-700"
                        onChange={(ev) => setPicked((p) => (ev.target.checked ? [...p, e.id] : p.filter((x) => x !== e.id)))} />
                      <span className="flex-1">{e.name}</span>
                      <span className="text-[10px] font-semibold text-sand-400">
                        {[e.type === 'TEACHER' ? 'Guru' : 'Tendik', e.department].filter(Boolean).join(' · ')}
                      </span>
                    </label>
                  ))}
              </div>
            </div>
          </Field>
          <div className="flex justify-end gap-2"><Button type="submit" disabled={busy || !picked.length}>Buat & Tugaskan</Button></div>
        </form>
      </Modal>

      {dialog}
      {fv.viewer}
    </Shell>
  );
}
