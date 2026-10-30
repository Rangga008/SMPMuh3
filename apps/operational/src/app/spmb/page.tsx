'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import {
  REGISTRATION_STATUS_LABELS,
  REGISTRATION_STATUSES,
  type RegistrationStatus,
  type WaveDto,
} from '@smpmuh3/types';
import { Badge, Button, Input, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { DataTable } from '@/components/data-table';
import { PageTitle } from '@/components/widgets';
import {
  bulkPromote,
  bulkTransition,
  exportDocumentsZip,
  exportRegistrationsXlsx,
  importRegistrations,
  listAcademicYears,
  listAdminRegistrations,
  listAdminWaves,
  type AcademicYear,
  type AdminRegistration,
} from '@/lib/api';

const DOC_FLAGS = ['akta', 'kk', 'ktp_ortu', 'ijazah'] as const;
const DOC_LABEL: Record<string, string> = {
  akta: 'Akta',
  kk: 'KK',
  ktp_ortu: 'KTP',
  ijazah: 'Ijazah/SK',
};

const tone = (s: string) =>
  s === 'ACCEPTED' || s === 'COMPLETED'
    ? 'primary'
    : s === 'REJECTED'
      ? 'neutral'
      : 'accent';

/** Status tujuan yang boleh dipilih untuk transisi massal. */
const BULK_TARGETS: RegistrationStatus[] = [
  'SELECTION',
  'ACCEPTED',
  'REJECTED',
  'RE_REGISTRATION',
];

function SpmbList() {
  const params = useSearchParams();
  const [rows, setRows] = useState<AdminRegistration[]>([]);
  const [waves, setWaves] = useState<WaveDto[]>([]);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [status, setStatus] = useState(params.get('status') ?? '');
  const [yearId, setYearId] = useState('');
  const [waveId, setWaveId] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<RegistrationStatus>('ACCEPTED');
  const [bulkNote, setBulkNote] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(
    (q: {
      status?: string;
      waveId?: string;
      academicYearId?: string;
      search?: string;
    }) => {
      setLoading(true);
      listAdminRegistrations(q)
        .then(setRows)
        .catch(() => setError('Gagal memuat data pendaftar.'))
        .finally(() => setLoading(false));
    },
    [],
  );

  useEffect(() => {
    listAdminWaves().then(setWaves).catch(() => undefined);
    listAcademicYears()
      .then((ys) => {
        setYears(ys);
        const active = ys.find((y) => y.isActive);
        if (active) setYearId(active.id);
      })
      .catch(() => undefined);
  }, []);

  // Filter diterapkan otomatis (realtime) — pencarian di-debounce.
  const firstRun = useRef(true);
  useEffect(() => {
    const t = setTimeout(
      () => {
        setError(null);
        setSelected(new Set());
        load({ status, waveId, academicYearId: yearId, search });
      },
      firstRun.current ? 0 : search ? 350 : 120,
    );
    firstRun.current = false;
    return () => clearTimeout(t);
  }, [status, waveId, yearId, search, load]);

  useEffect(() => {
    const s = params.get('status');
    if (s) setStatus(s);
  }, [params]);

  async function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportMsg(null);
    setError(null);
    try {
      const res = await importRegistrations(file);
      setImportMsg(
        `Import selesai: ${res.created} dibuat, ${res.skipped} dilewati.${res.errors.length ? ` ${res.errors.length} baris bermasalah.` : ''}`,
      );
      load({ status, waveId, academicYearId: yearId, search });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import gagal.');
    }
  }

  function toggleAll() {
    setSelected((s) =>
      s.size === rows.length ? new Set() : new Set(rows.map((r) => r.id)),
    );
  }
  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function runBulk(
    fn: () => Promise<{ id: string; ok: boolean; error?: string }[]>,
    label: string,
  ) {
    if (selected.size === 0) return;
    setBusy(true);
    setError(null);
    setImportMsg(null);
    try {
      const res = await fn();
      const failed = res.filter((r) => !r.ok);
      setImportMsg(
        failed.length
          ? `${label}: ${res.length - failed.length} berhasil, ${failed.length} gagal (${failed[0]?.error}).`
          : `${label}: ${res.length} pendaftar berhasil diproses.`,
      );
      setSelected(new Set());
      load({ status, waveId, academicYearId: yearId, search });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Aksi massal gagal.');
    } finally {
      setBusy(false);
    }
  }

  const wavesInYear = yearId
    ? waves.filter((w) => !w.academicYearId || w.academicYearId === yearId)
    : waves;

  return (
    <Shell>
      <PageTitle
        title="Pendaftar SPMB"
        subtitle="Tinjau dan kelola pendaftaran murid baru"
        actions={
          <>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={onImport}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void exportRegistrationsXlsx({
                  ...(yearId ? { academicYearId: yearId } : {}),
                  ...(waveId ? { waveId } : {}),
                }).catch(() => setError('Export Excel gagal.'))
              }
            >
              Export Excel
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!waveId}
              title={waveId ? 'Unduh ZIP berkas siswa diterima gelombang ini' : 'Pilih gelombang dulu'}
              onClick={() =>
                waveId &&
                void exportDocumentsZip(waveId).catch(() =>
                  setError('Export berkas gagal.'),
                )
              }
            >
              Export Berkas (ZIP)
            </Button>
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              Import Excel
            </Button>
          </>
        }
      />
      {importMsg ? (
        <p role="status" className="mb-4 rounded-xl bg-primary-50 px-4 py-3 text-sm font-medium text-primary-800">
          {importMsg}
        </p>
      ) : null}

      <div className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl border border-sand-200 bg-white p-4 shadow-card">
        <label className="flex min-w-36 flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-sand-500">Periode</span>
          <Select
            value={yearId}
            onChange={(e) => {
              setYearId(e.target.value);
              setWaveId('');
            }}
            aria-label="Filter periode"
          >
            <option value="">Semua tahun ajaran</option>
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
                {y.isActive ? ' (aktif)' : ''}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex min-w-36 flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-sand-500">Gelombang</span>
          <Select
            value={waveId}
            onChange={(e) => setWaveId(e.target.value)}
            aria-label="Filter gelombang"
          >
            <option value="">Semua gelombang</option>
            {wavesInYear.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </Select>
        </label>
        <label className="flex min-w-40 flex-1 flex-col gap-1.5 sm:min-w-52">
          <span className="text-xs font-bold uppercase tracking-wider text-sand-500">Status</span>
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label="Filter status"
          >
            <option value="">Semua status</option>
            {REGISTRATION_STATUSES.map((s) => (
              <option key={s} value={s}>{REGISTRATION_STATUS_LABELS[s]}</option>
            ))}
          </Select>
        </label>
        <label className="flex min-w-40 flex-[2] flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-sand-500">Pencarian</span>
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nomor / nama / email…"
            aria-label="Cari pendaftar"
          />
        </label>
      </div>

      {selected.size > 0 ? (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-primary-200 bg-primary-50 p-4">
          <p className="text-sm font-bold text-primary-900">
            {selected.size} pendaftar dipilih
          </p>
          <Select
            value={bulkStatus}
            onChange={(e) => setBulkStatus(e.target.value as RegistrationStatus)}
            className="w-52"
            aria-label="Status tujuan"
          >
            {BULK_TARGETS.map((s) => (
              <option key={s} value={s}>{REGISTRATION_STATUS_LABELS[s]}</option>
            ))}
          </Select>
          <Input
            value={bulkNote}
            onChange={(e) => setBulkNote(e.target.value)}
            placeholder="Catatan (opsional)"
            className="w-56"
          />
          <Button
            size="sm"
            disabled={busy}
            onClick={() =>
              void runBulk(
                () => bulkTransition([...selected], bulkStatus, bulkNote || undefined),
                `Transisi ke ${REGISTRATION_STATUS_LABELS[bulkStatus]}`,
              )
            }
          >
            Terapkan Status
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() =>
              void runBulk(() => bulkPromote([...selected]), 'Jadikan Murid')
            }
          >
            Jadikan Murid
          </Button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-xs font-semibold text-sand-500 underline hover:text-sand-700"
          >
            Batal pilih
          </button>
        </div>
      ) : null}

      <DataTable
        head={[
          <input
            key="sel"
            type="checkbox"
            aria-label="Pilih semua"
            checked={rows.length > 0 && selected.size === rows.length}
            onChange={toggleAll}
            className="size-4 accent-primary-700"
          />,
          'Nomor',
          'Calon Murid',
          'Orang Tua',
          'Dokumen',
          'Jalur',
          'Status',
          '',
        ]}
        loading={loading}
        error={error}
        empty={rows.length === 0 ? 'Tidak ada pendaftaran yang cocok.' : undefined}
      >
        {rows.map((r) => (
          <tr key={r.id} className={selected.has(r.id) ? 'bg-primary-50/60' : undefined}>
            <td className="px-3 py-3.5">
              <input
                type="checkbox"
                aria-label={`Pilih ${r.number}`}
                checked={selected.has(r.id)}
                onChange={() => toggle(r.id)}
                className="size-4 accent-primary-700"
              />
            </td>
            <td className="px-5 py-3.5 font-mono text-xs font-semibold text-sand-600">
              {r.number}
              {r.wave?.name ? (
                <span className="block text-[10px] font-normal text-sand-400">
                  {r.wave.name}
                </span>
              ) : null}
            </td>
            <td className="px-5 py-3.5 font-semibold text-sand-900">
              {r.candidate.name}
            </td>
            <td className="px-5 py-3.5 text-sand-600">
              {r.parent.name}
              <span className="block text-xs text-sand-400">{r.parent.phone ?? r.parent.email}</span>
            </td>
            <td className="px-5 py-3.5">
              <span className="flex flex-wrap gap-1">
                {DOC_FLAGS.map((t) => {
                  const doc = r.documents?.find((d) => d.type === t || (t === 'ijazah' && d.type === 'sk_sekolah'));
                  return (
                    <span
                      key={t}
                      title={DOC_LABEL[t]}
                      className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                        doc?.verifiedAt
                          ? 'bg-primary-100 text-primary-800'
                          : doc
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-sand-100 text-sand-400'
                      }`}
                    >
                      {DOC_LABEL[t]}
                    </span>
                  );
                })}
              </span>
            </td>
            <td className="px-5 py-3.5 text-sand-600">{r.pathway}</td>
            <td className="px-5 py-3.5">
              <Badge tone={tone(r.status)}>
                {REGISTRATION_STATUS_LABELS[r.status]}
              </Badge>
            </td>
            <td className="px-5 py-3.5 text-right">
              <Link
                href={`/spmb/${r.id}`}
                className="text-sm font-semibold text-primary-700 hover:text-primary-800 focus-visible:focus-ring"
              >
                Detail →
              </Link>
            </td>
          </tr>
        ))}
      </DataTable>
    </Shell>
  );
}

export default function SpmbPage() {
  return (
    <Suspense>
      <SpmbList />
    </Suspense>
  );
}
