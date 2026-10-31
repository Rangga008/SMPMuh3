'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Field, Input, Modal, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { DataTable } from '@/components/data-table';
import { PageTitle, StatCard } from '@/components/widgets';
import {
  createExamRecord,
  deleteExamRecord,
  listAcademicYears,
  listExamRecords,
  updateExamRecord,
  type AcademicYear,
  type ExamRecord,
} from '@/lib/api';

const RESULT: Record<ExamRecord['result'], { label: string; tone: 'primary' | 'accent' | 'danger' }> = {
  PENDING: { label: 'Belum Dinilai', tone: 'accent' },
  PASSED: { label: 'Lulus', tone: 'primary' },
  FAILED: { label: 'Tidak Lulus', tone: 'danger' },
};

export default function UsPage() {
  const [period, setPeriod] = useState<'US1' | 'US2'>('US1');
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [yearId, setYearId] = useState('');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<ExamRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<ExamRecord | 'new' | null>(null);

  useEffect(() => {
    listAcademicYears()
      .then((ys) => {
        setYears(ys);
        const active = ys.find((y) => y.isActive) ?? ys[0];
        if (active) setYearId(active.id);
      })
      .catch(() => setError('Gagal memuat tahun ajaran.'));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listExamRecords(period, yearId || undefined, search || undefined));
      setError(null);
    } catch {
      setError('Gagal memuat rekap ujian.');
    } finally {
      setLoading(false);
    }
  }, [period, yearId, search]);

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
      score: val('score') ? Number(val('score')) : null,
      result: (val('result') ?? 'PENDING') as ExamRecord['result'],
      notes: val('notes') ?? null,
    };
    if (modal === 'new') {
      await run(
        () => createExamRecord({ ...dto, period, academicYearId: yearId }),
        'Catatan ujian ditambah.',
      );
    } else if (modal) {
      await run(() => updateExamRecord(modal.id, dto), 'Catatan diperbarui.');
    }
  }

  const passed = rows.filter((r) => r.result === 'PASSED').length;
  const failed = rows.filter((r) => r.result === 'FAILED').length;

  return (
    <Shell>
      <PageTitle
        title="Ujian Sekolah (US 1 & 2)"
        subtitle="Rekap hasil Ujian Sekolah per periode dan tahun ajaran"
        actions={
          <Button size="sm" onClick={() => setModal('new')} disabled={!yearId}>
            + Tambah Catatan
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
          {(['US1', 'US2'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors ${
                period === p ? 'bg-primary-700 text-white' : 'text-sand-600 hover:bg-sand-100'
              }`}
            >
              {p === 'US1' ? 'US 1' : 'US 2'}
            </button>
          ))}
        </div>
        <Select value={yearId} onChange={(e) => setYearId(e.target.value)} className="w-44">
          {years.map((y) => (
            <option key={y.id} value={y.id}>
              {y.name}
              {y.isActive ? ' (aktif)' : ''}
            </option>
          ))}
        </Select>
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nama / NISN…"
          className="w-56 max-w-full"
        />
      </div>

      <div className="mb-5 grid grid-cols-3 gap-3">
        <StatCard label="Total Siswa" value={rows.length} />
        <StatCard label="Lulus" value={passed} />
        <StatCard label="Tidak Lulus" value={failed} />
      </div>

      <DataTable
        head={['Nama Siswa', 'NISN', 'Nilai', 'Hasil', 'Catatan', '']}
        loading={loading}
        error={error}
        empty={rows.length === 0 ? 'Belum ada catatan ujian.' : undefined}
      >
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="px-5 py-3 font-semibold text-sand-900">{r.studentName}</td>
            <td className="px-5 py-3 text-sand-600">{r.nisn ?? '—'}</td>
            <td className="px-5 py-3 text-center font-bold text-sand-900">{r.score ?? '—'}</td>
            <td className="px-5 py-3">
              <Badge tone={RESULT[r.result].tone}>{RESULT[r.result].label}</Badge>
            </td>
            <td className="px-5 py-3 text-xs text-sand-500">{r.notes ?? '—'}</td>
            <td className="px-5 py-3 text-right">
              <span className="flex justify-end gap-2">
                <button
                  type="button"
                  className="text-xs font-semibold text-primary-700 hover:underline"
                  onClick={() => setModal(r)}
                >
                  Ubah
                </button>
                <button
                  type="button"
                  className="text-xs font-semibold text-red-600 hover:underline"
                  onClick={() => {
                    if (confirm(`Hapus catatan ${r.studentName}?`)) {
                      void run(() => deleteExamRecord(r.id), 'Catatan dihapus.');
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
        title={modal === 'new' ? `Catatan ${period === 'US1' ? 'US 1' : 'US 2'}` : 'Ubah Catatan'}
      >
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={onSubmit}>
          <Field label="Nama Siswa" className="sm:col-span-2">
            <Input name="studentName" required minLength={3} defaultValue={modal !== 'new' ? modal?.studentName : ''} />
          </Field>
          <Field label="NISN">
            <Input name="nisn" defaultValue={modal !== 'new' ? modal?.nisn ?? '' : ''} />
          </Field>
          <Field label="Nilai (0-100)">
            <Input name="score" type="number" min={0} max={100} defaultValue={modal !== 'new' ? modal?.score ?? '' : ''} />
          </Field>
          <Field label="Hasil">
            <Select name="result" defaultValue={modal !== 'new' ? modal?.result : 'PENDING'}>
              <option value="PENDING">Belum Dinilai</option>
              <option value="PASSED">Lulus</option>
              <option value="FAILED">Tidak Lulus</option>
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
    </Shell>
  );
}
