'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Field, Input, Modal, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { DataTable } from '@/components/data-table';
import { PageTitle } from '@/components/widgets';
import { rowActionClasses } from '@/components/row-btn';
import { me } from '@/lib/api';
import { PERMISSIONS } from '@smpmuh3/types';
import { listClasses, type ClassView } from '@/lib/api';
import {
  createSarana,
  createSaranaType,
  deleteSarana,
  deleteSaranaType,
  listSaranas,
  listSaranaTypes,
  saranaXlsxUrl,
  updateSarana,
  updateSaranaType,
  type SaranaItem,
  type SaranaType,
} from '@/lib/api-ops';

const OWNERSHIPS = ['Milik', 'Bukan Milik', 'Sewa', 'Hibah'];

/** Kelola jenis sarana — dibuka lewat tombol, isinya daftar + form tambah. */
function JenisModal({
  open,
  onClose,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [rows, setRows] = useState<SaranaType[]>([]);
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [manage, setManage] = useState(false);
  useEffect(() => { me().then((u) => setManage(u.permissions.includes(PERMISSIONS.SARPRAS_MANAGE))).catch(() => undefined); }, []);

  const load = useCallback(() => {
    listSaranaTypes().then(setRows).catch(() => setErr('Gagal memuat jenis sarana.'));
  }, []);
  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    setErr('');
    setNotice('');
    try {
      await fn();
      setNotice(msg);
      load();
      onChanged();
      return true;
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Gagal menyimpan.');
      return false;
    }
  };

  const add = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const ok = await act(
      () =>
        createSaranaType({
          label: String(fd.get('label')),
          ...(fd.get('sortOrder') ? { sortOrder: Number(fd.get('sortOrder')) } : {}),
        }),
      'Jenis sarana ditambahkan.',
    );
    if (ok) {
      e.currentTarget.reset();
      setShowForm(false);
    }
  };

  const saveEdit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editId) return;
    const fd = new FormData(e.currentTarget);
    const ok = await act(
      () =>
        updateSaranaType(editId, {
          label: String(fd.get('label')),
          ...(fd.get('sortOrder') ? { sortOrder: Number(fd.get('sortOrder')) } : {}),
        }),
      'Jenis sarana diperbarui.',
    );
    if (ok) setEditId(null);
  };

  return (
    <Modal open={open} onClose={onClose} title="Kelola Jenis Sarana">
      {err ? <p role="alert" className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{err}</p> : null}
      {notice ? <p className="mb-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">{notice}</p> : null}

      {manage ? (
        showForm ? (
          <form onSubmit={add} className="mb-4 rounded-2xl border border-sand-200 bg-sand-50 p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Nama jenis">
                <Input name="label" required placeholder="Meja Siswa" />
              </Field>
              <Field label="Urutan">
                <Input name="sortOrder" type="number" min={0} placeholder="0" />
              </Field>
              <div className="flex items-end gap-2">
                <Button type="submit">Simpan</Button>
                <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                  Tutup
                </Button>
              </div>
            </div>
          </form>
        ) : (
          <Button variant="outline" className="mb-4" onClick={() => setShowForm(true)}>
            + Tambah Jenis
          </Button>
        )
      ) : null}

      <div className="max-h-96 overflow-y-auto rounded-xl border border-sand-200">
        <table className="w-full text-sm">
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} className="border-b border-sand-100 last:border-0">
                {editId === t.id ? (
                  <td colSpan={3} className="p-3">
                    <form onSubmit={saveEdit} className="flex flex-wrap items-end gap-2">
                      <Input name="label" defaultValue={t.label} required className="min-w-40 flex-1" />
                      <Input name="sortOrder" type="number" min={0} defaultValue={t.sortOrder} className="w-24" />
                      <Button type="submit" variant="primary">Simpan</Button>
                      <Button type="button" variant="ghost" onClick={() => setEditId(null)}>Batal</Button>
                    </form>
                  </td>
                ) : (
                  <>
                    <td className="px-3 py-2.5">
                      <span className="font-semibold text-sand-900">{t.label}</span>
                      <span className="ml-2 text-xs text-sand-500">{t.code}</span>
                      {!t.isActive ? <Badge tone="neutral" className="ml-2">nonaktif</Badge> : null}
                    </td>
                    <td className="px-3 py-2.5 text-sand-600">{t._count?.items ?? 0} sarana</td>
                    <td className="px-3 py-2.5 text-right">
                      {manage ? (
                        <span className="flex justify-end gap-1">
                          <button type="button" className={rowActionClasses()} onClick={() => setEditId(t.id)}>Edit</button>
                          {t.isActive ? (
                            <button
                              type="button"
                              className={rowActionClasses()}
                              onClick={() => act(() => updateSaranaType(t.id, { isActive: false }), 'Jenis dinonaktifkan.')}
                            >
                              Nonaktif
                            </button>
                          ) : (
                            <button
                              type="button"
                              className={rowActionClasses()}
                              onClick={() => act(() => updateSaranaType(t.id, { isActive: true }), 'Jenis diaktifkan.')}
                            >
                              Aktifkan
                            </button>
                          )}
                          <button
                            type="button"
                            className={rowActionClasses('danger')}
                            onClick={() => {
                              if (confirm(`Hapus jenis "${t.label}"?`)) {
                                act(() => deleteSaranaType(t.id), 'Jenis dihapus.');
                              }
                            }}
                          >
                            Hapus
                          </button>
                        </span>
                      ) : null}
                    </td>
                  </>
                )}
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr><td className="px-3 py-6 text-center text-sand-500">Belum ada jenis sarana.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

/** Form tambah/edit sarana — letak dipilih dari rombel/kelas aktif. */
function SaranaForm({
  item,
  types,
  classes,
  onSaved,
  onClose,
}: {
  item: SaranaItem | null;
  types: SaranaType[];
  classes: ClassView[];
  onSaved: () => void;
  onClose: () => void;
}) {
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const activeTypes = types.filter((t) => t.isActive || t.id === item?.typeId);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const dto = {
      typeId: String(fd.get('typeId')),
      location: String(fd.get('location') ?? '').trim() || undefined,
      ownership: String(fd.get('ownership') ?? '').trim() || undefined,
      spec: String(fd.get('spec') ?? '').trim() || undefined,
      qty: Number(fd.get('qty') ?? 0),
      good: Number(fd.get('good') ?? 0),
      bad: Number(fd.get('bad') ?? 0),
    };
    try {
      if (item) {
        await updateSarana(item.id, dto);
      } else {
        await createSarana(dto);
      }
      onSaved();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Gagal menyimpan.');
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={item ? `Edit Sarana — ${item.type.label}` : 'Tambah Sarana'}>
      <form onSubmit={submit} className="grid gap-4">
        {err ? <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{err}</p> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Jenis sarana">
            <Select name="typeId" defaultValue={item?.typeId ?? ''}>
              <option value="" disabled>Pilih jenis…</option>
              {activeTypes.map((t) => (
                <option key={t.id} value={t.id}>{t.label}{!t.isActive ? ' (nonaktif)' : ''}</option>
              ))}
            </Select>
          </Field>
          <Field label="Letak / ruang" hint="Pilih rombel dari data kelas atau lokasi lain.">
            <Select name="location" defaultValue={item?.location ?? ''}>
              <option value="">— Tidak spesifik —</option>
              {classes.map((c) => (
                <option key={c.id} value={c.name}>Rombel {c.name}</option>
              ))}
              <optgroup label="Lokasi lain">
                {['Perpustakaan', 'Lab IPA', 'Lab Komputer', 'Ruang Guru', 'Ruang TU', 'UKS', 'Musala', 'Gudang', 'Lapangan'].map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </optgroup>
            </Select>
          </Field>
          <Field label="Kepemilikan">
            <Select name="ownership" defaultValue={item?.ownership ?? ''}>
              <option value="">—</option>
              {OWNERSHIPS.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </Select>
          </Field>
          <Field label="Spesifikasi">
            <Input name="spec" defaultValue={item?.spec ?? ''} placeholder="Ukuran/bahan/merk…" />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Jumlah">
            <Input name="qty" type="number" min={0} required defaultValue={item?.qty ?? 0} />
          </Field>
          <Field label="Laik (baik)">
            <Input name="good" type="number" min={0} defaultValue={item?.good ?? 0} />
          </Field>
          <Field label="Tidak laik (rusak)">
            <Input name="bad" type="number" min={0} defaultValue={item?.bad ?? 0} />
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Batal</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</Button>
        </div>
      </form>
    </Modal>
  );
}

export default function SaranaPage() {
  const [rows, setRows] = useState<SaranaItem[]>([]);
  const [types, setTypes] = useState<SaranaType[]>([]);
  const [classes, setClasses] = useState<ClassView[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [showJenis, setShowJenis] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [edit, setEdit] = useState<SaranaItem | null>(null);
  const [manage, setManage] = useState(false);
  useEffect(() => { me().then((u) => setManage(u.permissions.includes(PERMISSIONS.SARPRAS_MANAGE))).catch(() => undefined); }, []);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([listSaranas(), listSaranaTypes(), listClasses()])
      .then(([items, t, cls]) => {
        setRows(items);
        setTypes(t);
        setClasses(cls);
      })
      .catch(() => setError('Gagal memuat data sarana.'))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => load(), [load]);

  const filtered = rows.filter((r) => {
    if (typeFilter && r.typeId !== typeFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.type.label.toLowerCase().includes(q) ||
      (r.location ?? '').toLowerCase().includes(q) ||
      (r.spec ?? '').toLowerCase().includes(q)
    );
  });

  const remove = async (r: SaranaItem) => {
    if (!confirm(`Hapus sarana "${r.type.label}" di ${r.location ?? '—'}?`)) return;
    try {
      await deleteSarana(r.id);
      setNotice('Sarana dihapus.');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menghapus sarana.');
    }
  };

  return (
    <Shell>
      <PageTitle
        title="Sarana"
        subtitle="Inventaris sarana sekolah — jenis, letak per rombel, jumlah, dan kondisi laik/tidak laik."
      />

      {error ? <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p> : null}
      {notice ? <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{notice}</p> : null}

      <div className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl border border-sand-200 bg-white p-4 shadow-card">
        <label className="flex min-w-40 flex-[2] flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-sand-500">Pencarian</span>
          <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Jenis / letak / spesifikasi…" />
        </label>
        <label className="flex min-w-40 flex-1 flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-sand-500">Jenis</span>
          <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">Semua jenis</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </Select>
        </label>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowJenis(true)}>⚙ Jenis Sarana</Button>
          <Button variant="outline" onClick={() => { window.location.href = saranaXlsxUrl; }}>⬇ Excel</Button>
          {manage ? <Button onClick={() => setShowAdd(true)}>+ Tambah Sarana</Button> : null}
        </div>
      </div>

      <DataTable
        head={['Jenis', 'Letak', 'Kepemilikan', 'Spesifikasi', 'Jumlah', 'Laik', 'Tidak Laik', manage ? '' : ''].filter((h, i) => h !== '' || i < 7)}
        loading={loading}
        error={error}
        empty={filtered.length === 0 ? 'Tidak ada sarana cocok.' : undefined}
      >
        {filtered.map((r) => (
          <tr key={r.id}>
            <td className="px-5 py-3.5 font-semibold text-sand-900">{r.type.label}</td>
            <td className="px-5 py-3.5 text-sand-600">{r.location ?? '—'}</td>
            <td className="px-5 py-3.5 text-sand-600">{r.ownership ?? '—'}</td>
            <td className="px-5 py-3.5 text-sand-600">{r.spec ?? '—'}</td>
            <td className="px-5 py-3.5 text-sand-900">{r.qty}</td>
            <td className="px-5 py-3.5"><Badge tone="primary">{r.good}</Badge></td>
            <td className="px-5 py-3.5"><Badge tone={r.bad > 0 ? 'danger' : 'neutral'}>{r.bad}</Badge></td>
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

      {showJenis ? <JenisModal open onClose={() => setShowJenis(false)} onChanged={load} /> : null}
      {showAdd ? (
        <SaranaForm item={null} types={types} classes={classes} onSaved={() => { setShowAdd(false); load(); }} onClose={() => setShowAdd(false)} />
      ) : null}
      {edit ? (
        <SaranaForm item={edit} types={types} classes={classes} onSaved={() => { setEdit(null); load(); }} onClose={() => setEdit(null)} />
      ) : null}
    </Shell>
  );
}
