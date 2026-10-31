'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Field, Input, Modal, Select } from '@smpmuh3/ui';
import { DataTable } from '@/components/data-table';
import { PageTitle } from '@/components/widgets';
import {
  createMutation,
  deleteMutation,
  listMutations,
  updateMutation,
  type StudentMutation,
} from '@/lib/api';

const STATUS: Record<StudentMutation['status'], { label: string; tone: 'primary' | 'accent' | 'neutral' }> = {
  PROCESS: { label: 'Diproses', tone: 'accent' },
  DONE: { label: 'Selesai', tone: 'primary' },
  CANCELLED: { label: 'Batal', tone: 'neutral' },
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

/** Register mutasi siswa — dipakai halaman Mutasi Masuk & Mutasi Keluar. */
export function MutasiView({ direction }: { direction: 'IN' | 'OUT' }) {
  const isIn = direction === 'IN';
  const title = isIn ? 'Mutasi Masuk' : 'Mutasi Keluar';
  const schoolLabel = isIn ? 'Asal Sekolah' : 'Tujuan Sekolah';

  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<StudentMutation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<StudentMutation | 'new' | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listMutations(direction, search || undefined));
      setError(null);
    } catch {
      setError('Gagal memuat data mutasi.');
    } finally {
      setLoading(false);
    }
  }, [direction, search]);

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
      studentName: val('studentName'),
      nisn: val('nisn') ?? null,
      date: val('date'),
      school: val('school') ?? null,
      letterNumber: val('letterNumber') ?? null,
      status: (val('status') ?? 'PROCESS') as StudentMutation['status'],
      notes: val('notes') ?? null,
    };
    if (modal === 'new') {
      await run(() => createMutation({ ...dto, direction }), 'Mutasi dicatat.');
    } else if (modal) {
      await run(() => updateMutation(modal.id, dto), 'Mutasi diperbarui.');
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
        actions={<Button size="sm" onClick={() => setModal('new')}>+ Catat Mutasi</Button>}
      />
      {error ? (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
      ) : null}
      {notice ? (
        <p role="status" className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{notice}</p>
      ) : null}

      <div className="mb-4">
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nama / NISN / sekolah…"
          className="w-72 max-w-full"
        />
      </div>

      <DataTable
        head={['Nama Siswa', 'NISN', 'Tanggal', schoolLabel, 'No. Surat', 'Status', '']}
        loading={loading}
        error={error}
        empty={rows.length === 0 ? 'Belum ada mutasi.' : undefined}
      >
        {rows.map((m) => (
          <tr key={m.id}>
            <td className="px-5 py-3 font-semibold text-sand-900">{m.studentName}</td>
            <td className="px-5 py-3 text-sand-600">{m.nisn ?? '—'}</td>
            <td className="whitespace-nowrap px-5 py-3 text-sand-600">{fmtDate(m.date)}</td>
            <td className="px-5 py-3 text-sand-600">{m.school ?? '—'}</td>
            <td className="px-5 py-3 font-mono text-xs text-sand-600">{m.letterNumber ?? '—'}</td>
            <td className="px-5 py-3">
              <Badge tone={STATUS[m.status].tone}>{STATUS[m.status].label}</Badge>
            </td>
            <td className="px-5 py-3 text-right">
              <span className="flex justify-end gap-2">
                <button
                  type="button"
                  className="text-xs font-semibold text-primary-700 hover:underline"
                  onClick={() => setModal(m)}
                >
                  Ubah
                </button>
                {m.status === 'PROCESS' ? (
                  <button
                    type="button"
                    className="text-xs font-semibold text-emerald-700 hover:underline"
                    onClick={() =>
                      void run(() => updateMutation(m.id, { status: 'DONE' }), 'Mutasi ditandai selesai.')
                    }
                  >
                    Tandai Selesai
                  </button>
                ) : null}
                <button
                  type="button"
                  className="text-xs font-semibold text-red-600 hover:underline"
                  onClick={() => {
                    if (confirm(`Hapus mutasi ${m.studentName}?`)) {
                      void run(() => deleteMutation(m.id), 'Mutasi dihapus.');
                    }
                  }}
                >
                  Hapus
                </button>
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
          <Field label="Nama Siswa" className="sm:col-span-2">
            <Input name="studentName" required minLength={3} defaultValue={modal !== 'new' ? modal?.studentName : ''} />
          </Field>
          <Field label="NISN">
            <Input name="nisn" defaultValue={modal !== 'new' ? modal?.nisn ?? '' : ''} />
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
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="ghost" onClick={() => setModal(null)}>Batal</Button>
            <Button type="submit" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
