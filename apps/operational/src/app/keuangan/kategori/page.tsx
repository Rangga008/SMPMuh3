'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge, Button, Field, Input, Modal, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { DataTable } from '@/components/data-table';
import { PageTitle, Widget } from '@/components/widgets';
import {
  createFinanceCategory,
  listFinanceCategories,
  updateFinanceCategory,
  me,
  type FinanceCategory,
} from '@/lib/api';
import { PERMISSIONS } from '@smpmuh3/types';

import { RowBtn } from '@/components/row-btn';
const STD: Record<string, string> = {
  ISI: 'Standar Isi', PROSES: 'Standar Proses', KELULUSAN: 'Standar Kelulusan',
  TENAGA: 'Standar Tenaga', SARANA: 'Standar Sarana', PENGELOLAAN: 'Standar Pengelolaan',
  PEMBIAYAAN: 'Standar Pembiayaan', PENILAIAN: 'Standar Penilaian',
};

export default function KategoriPage() {
  const [canManage, setCanManage] = useState(false);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [type, setType] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [catModal, setCatModal] = useState(false);

  const load = useCallback(() => {
    listFinanceCategories().then(setCategories).catch(() => setError('Gagal memuat kategori.'));
  }, []);

  useEffect(() => {
    me().then((u) => setCanManage(u.permissions.includes(PERMISSIONS.FINANCE_MANAGE))).catch(() => undefined);
    load();
  }, [load]);

  async function run(fn: () => Promise<unknown>, msg: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setNotice(msg);
      load();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Aksi gagal.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  function onSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void run(
      () =>
        createFinanceCategory({
          name: String(f.get('name')),
          type: f.get('type') as 'INCOME' | 'EXPENSE',
          ...(f.get('standardGroup') ? { standardGroup: String(f.get('standardGroup')) } : {}),
        }),
      'Kategori ditambahkan.',
    ).then((ok) => {
      if (ok) setCatModal(false);
    });
  }

  const rows = categories.filter((c) => !type || c.type === type);

  return (
    <Shell>
      <PageTitle
        title="Kategori Keuangan"
        subtitle="Kelola kategori pemasukan & pengeluaran beserta standar nasionalnya"
        actions={
          <span className="flex gap-2">
            <Link href="/keuangan/anggaran" className="inline-flex items-center rounded-lg border border-sand-300 px-3 py-1.5 text-sm font-semibold text-sand-700 hover:bg-sand-50">
              ← Anggaran
            </Link>
            {canManage ? <Button size="sm" onClick={() => setCatModal(true)}>+ Kategori</Button> : null}
          </span>
        }
      />
      {error ? (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
      ) : null}
      {notice ? (
        <p role="status" className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{notice}</p>
      ) : null}

      <Widget
        title={`Kategori (${rows.length})`}
        action={
          <Select value={type} onChange={(e) => setType(e.target.value)} className="h-9 w-40 text-xs" aria-label="Filter jenis">
            <option value="">Semua</option>
            <option value="INCOME">Pemasukan</option>
            <option value="EXPENSE">Pengeluaran</option>
          </Select>
        }
>
        <DataTable head={['Nama', 'Jenis', 'Standar', 'Status', '']} loading={false} error={null}
          empty={rows.length === 0 ? 'Belum ada kategori.' : undefined}>
          {rows.map((c) => (
            <tr key={c.id}>
              <td className="px-5 py-3 font-medium text-sand-900">{c.name}</td>
              <td className="px-5 py-3">
                <Badge tone={c.type === 'INCOME' ? 'primary' : 'accent'}>
                  {c.type === 'INCOME' ? 'Pemasukan' : 'Pengeluaran'}
                </Badge>
              </td>
              <td className="px-5 py-3 text-xs text-sand-500">
                {c.standardGroup ? STD[c.standardGroup] ?? c.standardGroup : '—'}
              </td>
              <td className="px-5 py-3">
                {c.isActive === false ? <Badge tone="danger">Nonaktif</Badge> : <Badge tone="primary">Aktif</Badge>}
              </td>
              <td className="px-5 py-3 text-right">
                {canManage ? (
                  <RowBtn type="button" onClick={() => void run( () => updateFinanceCategory(c.id, { isActive: c.isActive === false }), c.isActive === false ? 'Kategori diaktifkan.' : 'Kategori dinonaktifkan.', ) }>
                    {c.isActive === false ? 'Aktifkan' : 'Nonaktifkan'}
                  </RowBtn>
                ) : null}
              </td>
            </tr>
          ))}
        </DataTable>
      </Widget>

      <Modal open={catModal} onClose={() => setCatModal(false)} title="Kategori Baru">
        <form onSubmit={onSave} className="grid gap-4">
          <Field label="Nama Kategori">
            <Input name="name" required placeholder="mis. Iuran Kegiatan" />
          </Field>
          <Field label="Jenis">
            <Select name="type" required>
              <option value="EXPENSE">Pengeluaran</option>
              <option value="INCOME">Pemasukan</option>
            </Select>
          </Field>
          <Field label="Standar Nasional" hint="Opsional — untuk kelompok laporan 8 standar">
            <Select name="standardGroup" defaultValue="">
              <option value="">—</option>
              {Object.entries(STD).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Select>
          </Field>
          <Button type="submit" disabled={busy}>Simpan</Button>
        </form>
      </Modal>
    </Shell>
  );
}
