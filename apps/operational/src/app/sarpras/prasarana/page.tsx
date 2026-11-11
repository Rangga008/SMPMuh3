'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Field, Input, Modal, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { DataTable } from '@/components/data-table';
import { PageTitle } from '@/components/widgets';
import { rowActionClasses } from '@/components/row-btn';
import { me } from '@/lib/api';
import { PERMISSIONS } from '@smpmuh3/types';
import {
  createPrasarana,
  deletePrasarana,
  listPrasaranas,
  prasaranaXlsxUrl,
  updatePrasarana,
  type Prasarana,
} from '@/lib/api-ops';

const OWNERSHIPS = ['Milik', 'Bukan Milik', 'Sewa', 'Hibah'];

/** Form tambah/edit ruang prasarana — kelas, perpus, wc, lab, dst. */
function PrasaranaForm({
  item,
  onSaved,
  onClose,
}: {
  item: Prasarana | null;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const dto = {
      name: String(fd.get('name')).trim(),
      note: String(fd.get('note') ?? '').trim() || undefined,
      length: fd.get('length') ? Number(fd.get('length')) : undefined,
      width: fd.get('width') ? Number(fd.get('width')) : undefined,
      ownership: String(fd.get('ownership') ?? '').trim() || undefined,
    };
    try {
      if (item) {
        await updatePrasarana(item.id, dto);
      } else {
        await createPrasarana(dto);
      }
      onSaved();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Gagal menyimpan.');
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={item ? `Edit Ruang — ${item.name}` : 'Tambah Ruang Prasarana'}>
      <form onSubmit={submit} className="grid gap-4">
        {err ? <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{err}</p> : null}
        <Field label="Nama ruang">
          <Input name="name" required defaultValue={item?.name ?? ''} placeholder="R. Kelas 7A / Perpustakaan / WC Guru…" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Panjang (m)">
            <Input name="length" type="number" min={0} step="0.1" defaultValue={item?.length ?? ''} />
          </Field>
          <Field label="Lebar (m)">
            <Input name="width" type="number" min={0} step="0.1" defaultValue={item?.width ?? ''} />
          </Field>
          <Field label="Kepemilikan">
            <Select name="ownership" defaultValue={item?.ownership ?? ''}>
              <option value="">—</option>
              {OWNERSHIPS.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Keterangan">
          <Input name="note" defaultValue={item?.note ?? ''} placeholder="Catatan kondisi/penggunaan…" />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Batal</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</Button>
        </div>
      </form>
    </Modal>
  );
}

export default function PrasaranaPage() {
  const [rows, setRows] = useState<Prasarana[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [edit, setEdit] = useState<Prasarana | null>(null);
  const [manage, setManage] = useState(false);
  useEffect(() => { me().then((u) => setManage(u.permissions.includes(PERMISSIONS.SARPRAS_MANAGE))).catch(() => undefined); }, []);

  const load = useCallback(() => {
    setLoading(true);
    listPrasaranas()
      .then(setRows)
      .catch(() => setError('Gagal memuat data prasarana.'))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => load(), [load]);

  const filtered = rows.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return r.name.toLowerCase().includes(q) || (r.note ?? '').toLowerCase().includes(q);
  });

  const remove = async (r: Prasarana) => {
    if (!confirm(`Hapus ruang "${r.name}"?`)) return;
    try {
      await deletePrasarana(r.id);
      setNotice('Ruang dihapus.');
      load();
    } catch {
      setError('Gagal menghapus ruang.');
    }
  };

  return (
    <Shell>
      <PageTitle
        title="Prasarana"
        subtitle="Ruang & bangunan — kelas, perpustakaan, WC, lab, beserta ukuran dan status kepemilikan."
      />

      {error ? <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p> : null}
      {notice ? <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{notice}</p> : null}

      <div className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl border border-sand-200 bg-white p-4 shadow-card">
        <label className="flex min-w-40 flex-[2] flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-sand-500">Pencarian</span>
          <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nama ruang / keterangan…" />
        </label>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { window.location.href = prasaranaXlsxUrl; }}>⬇ Excel</Button>
          {manage ? <Button onClick={() => setShowAdd(true)}>+ Tambah Ruang</Button> : null}
        </div>
      </div>

      <DataTable
        head={['Nama Ruang', 'Ukuran', 'Luas', 'Kepemilikan', 'Keterangan', manage ? '' : ''].filter((h, i) => h !== '' || i < 5)}
        loading={loading}
        error={error}
        empty={filtered.length === 0 ? 'Tidak ada ruang cocok.' : undefined}
      >
        {filtered.map((r) => (
          <tr key={r.id}>
            <td className="px-5 py-3.5 font-semibold text-sand-900">{r.name}</td>
            <td className="px-5 py-3.5 text-sand-600">
              {r.length != null && r.width != null ? `${r.length} × ${r.width} m` : '—'}
            </td>
            <td className="px-5 py-3.5 text-sand-600">
              {r.length != null && r.width != null ? (
                <Badge tone="primary">{+(r.length * r.width).toFixed(1)} m²</Badge>
              ) : '—'}
            </td>
            <td className="px-5 py-3.5 text-sand-600">{r.ownership ?? '—'}</td>
            <td className="px-5 py-3.5 text-sand-600">{r.note ?? '—'}</td>
            {manage ? (
              <td className="px-5 py-3.5 text-right">
                <span className="flex justify-end gap-1">
                  <button type="button" className={rowActionClasses()} onClick={() => setEdit(r)}>Edit</button>
                  <button type="button" className={rowActionClasses('danger')} onClick={() => remove(r)}>Hapus</button>
                </span>
              </td>
            ) : null}
          </tr>
        ))}
      </DataTable>

      {showAdd ? (
        <PrasaranaForm item={null} onSaved={() => { setShowAdd(false); load(); }} onClose={() => setShowAdd(false)} />
      ) : null}
      {edit ? (
        <PrasaranaForm item={edit} onSaved={() => { setEdit(null); load(); }} onClose={() => setEdit(null)} />
      ) : null}
    </Shell>
  );
}
