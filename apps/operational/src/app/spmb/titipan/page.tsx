'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, Field, Input, Modal, Select } from '@smpmuh3/ui';
import {
  INFO_SOURCE_LABELS,
  TITIPAN_STATUS_LABELS,
  type InfoSource,
  type TitipanStatus,
} from '@smpmuh3/types';
import { Shell } from '@/components/shell';
import { DataTable } from '@/components/data-table';
import { PageTitle } from '@/components/widgets';
import {
  ApiError,
  approveTitipan,
  cancelTitipan,
  listAcademicYears,
  listAdminWaves,
  listTitipan,
  sendTitipanCode,
  setTitipanStatus,
  setTitipanWave,
  titipanSummary,
  updateAcademicYear,
  type AcademicYear,
  type TitipanAdmin,
  type TitipanSummary,
} from '@/lib/api';
import type { WaveDto } from '@smpmuh3/types';

const TONE: Record<string, 'primary' | 'accent' | 'neutral' | 'danger'> = {
  PENDING: 'neutral',
  WAITING: 'accent',
  CODE_SENT: 'accent',
  REGISTERED: 'primary',
  CANCELLED: 'danger',
};

const FILTERS: { key: TitipanStatus | ''; label: string }[] = [
  { key: '', label: 'Aktif (antrean)' },
  { key: 'PENDING', label: 'Pending' },
  { key: 'WAITING', label: 'Antrean' },
  { key: 'CODE_SENT', label: 'Kode Terkirim' },
  { key: 'REGISTERED', label: 'Sudah Daftar' },
  { key: 'CANCELLED', label: 'Batal' },
];

export default function TitipanPage() {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [summary, setSummary] = useState<TitipanSummary[]>([]);
  const [rows, setRows] = useState<TitipanAdmin[]>([]);
  const [yearId, setYearId] = useState('');
  const [waveId, setWaveId] = useState('');
  const [waves, setWaves] = useState<WaveDto[]>([]);
  const [status, setStatus] = useState<TitipanStatus | ''>('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cancelFor, setCancelFor] = useState<TitipanAdmin | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [y, s, r] = await Promise.all([
        listAcademicYears(),
        titipanSummary().catch(() => [] as TitipanSummary[]),
        listTitipan({
          academicYearId: yearId || undefined,
          waveId: waveId || undefined,
          status: status || undefined,
          q: q || undefined,
        }),
      ]);
      setYears(y);
      setSummary(s);
      setRows(r);
      setError(null);
    } catch {
      setError('Gagal memuat data titipan.');
    } finally {
      setLoading(false);
    }
  }, [yearId, waveId, status, q]);

  useEffect(() => {
    const t = setTimeout(() => void load(), q ? 350 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  useEffect(() => {
    void listAdminWaves().then(setWaves).catch(() => {});
  }, []);

  const wavesOfYear = waves.filter((w) => !yearId || w.academicYearId === yearId);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setError(null);
    setNotice(null);
    try {
      await fn();
      setNotice(ok);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Aksi gagal.');
    }
  }

  async function onSendCode(e: TitipanAdmin) {
    setBusyId(e.id);
    setError(null);
    setNotice(null);
    try {
      const res = await sendTitipanCode(e.id);
      if (res.queued) {
        setNotice(
          `Kode ${res.entry.formCode} masuk antrean WhatsApp ke ${e.guardianPhone ?? 'ortu'} — dikirim otomatis sesuai jeda anti-spam.`,
        );
        if (res.waUrl) window.open(res.waUrl, '_blank', 'noopener');
      } else if (res.waUrl) {
        window.open(res.waUrl, '_blank', 'noopener');
        setNotice(
          `Kode ${res.entry.formCode} diterbitkan — WhatsApp dibuka untuk dikirim manual.`,
        );
      } else {
        setNotice(`Kode ${res.entry.formCode} diterbitkan — tidak ada nomor HP ortu, kirim manual.`);
      }
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal mengirim kode.');
    } finally {
      setBusyId(null);
    }
  }

  async function toggleTitipanOpen(y: AcademicYear) {
    await run(
      () => updateAcademicYear(y.id, { titipanOpen: !y.titipanOpen }),
      `Titipan ${y.name} ${y.titipanOpen ? 'ditutup' : 'dibuka'}.`,
    );
  }

  async function saveQuota(y: AcademicYear, raw: string) {
    const n = raw.trim() === '' ? null : Number(raw);
    if (n !== null && (!Number.isInteger(n) || n < 0)) return;
    await run(
      () => updateAcademicYear(y.id, { quota: n }),
      `Kuota ${y.name} ${n === null ? 'dihapus (tanpa batas)' : `diset ${n}`}.`,
    );
  }

  const summaryFor = useMemo(
    () => (yearId ? summary.find((s) => s.academicYearId === yearId) : undefined),
    [summary, yearId],
  );

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });

  const phones = (e: TitipanAdmin) => e.guardianPhone ?? '—';

  return (
    <Shell>
      <PageTitle
        title="Daftar Titipan / Waiting List"
        subtitle="Antrean calon siswa — verifikasi entri, terbitkan kode formulir sesuai antrean & kuota"
      />
      {error ? (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
      ) : null}
      {notice ? (
        <p role="status" className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{notice}</p>
      ) : null}

      {/* Ringkasan per tahun ajaran + kontrol titipan & kuota */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {summary.map((s) => {
          const sisa = s.quota == null ? null : s.quota - s.occupied;
          const year = years.find((y) => y.id === s.academicYearId);
          return (
            <div
              key={s.academicYearId}
              className="rounded-2xl border border-sand-200 bg-white p-4 shadow-card"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-extrabold text-sand-950">{s.name}</p>
                <div className="flex items-center gap-2">
                  {s.isActive ? <Badge tone="primary">Aktif</Badge> : null}
                  <Badge tone={s.titipanOpen ? 'primary' : 'neutral'}>
                    Titipan {s.titipanOpen ? 'dibuka' : 'tutup'}
                  </Badge>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                <div className="rounded-xl bg-sand-50 px-1 py-2">
                  <p className="text-xs text-sand-500">Kuota</p>
                  <p className="font-extrabold text-sand-900">{s.quota ?? '∞'}</p>
                </div>
                <div className="rounded-xl bg-sand-50 px-1 py-2">
                  <p className="text-xs text-sand-500">Terisi</p>
                  <p className="font-extrabold text-sand-900">{s.occupied}</p>
                </div>
                <div className="rounded-xl bg-accent-50 px-1 py-2">
                  <p className="text-xs text-accent-700">Antrean</p>
                  <p className="font-extrabold text-accent-800">
                    {s.waitingCount + s.codeSentCount}
                  </p>
                </div>
                <div className="rounded-xl bg-primary-50 px-1 py-2">
                  <p className="text-xs text-primary-700">Daftar</p>
                  <p className="font-extrabold text-primary-800">{s.registeredCount}</p>
                </div>
              </div>
              {sisa !== null ? (
                <p
                  className={`mt-2 text-xs font-semibold ${
                    sisa > 0 ? 'text-primary-700' : 'text-red-600'
                  }`}
                >
                  Sisa kuota: {sisa}
                </p>
              ) : null}
              {year ? (
                <div className="mt-3 flex items-center gap-2 border-t border-sand-100 pt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void toggleTitipanOpen(year)}
                  >
                    {year.titipanOpen ? 'Tutup Titipan' : 'Buka Titipan'}
                  </Button>
                  <div className="flex items-center gap-1.5">
                    <Input
                      key={`${year.id}-${year.quota ?? ''}`}
                      type="number"
                      min={0}
                      defaultValue={year.quota ?? ''}
                      placeholder="Kuota ∞"
                      className="h-9 w-24"
                      onBlur={(e) => void saveQuota(year, e.target.value)}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Filter */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Tahun Ajaran" className="w-48">
          <Select
            value={yearId}
            onChange={(e) => {
              setYearId(e.target.value);
              setWaveId('');
            }}
          >
            <option value="">Semua</option>
            {summary.map((s) => (
              <option key={s.academicYearId} value={s.academicYearId}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Gelombang" className="w-44">
          <Select value={waveId} onChange={(e) => setWaveId(e.target.value)}>
            <option value="">Semua</option>
            {wavesOfYear.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status" className="w-44">
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as TitipanStatus | '')}
          >
            {FILTERS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Cari" className="w-64">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nama / sekolah / HP / kode…"
          />
        </Field>
        {summaryFor?.quota != null ? (
          <p className="pb-2 text-xs font-semibold text-sand-600">
            Kuota {summaryFor.name}: {summaryFor.occupied}/{summaryFor.quota} terisi
          </p>
        ) : null}
      </div>

      <DataTable
        head={['#', 'Tanggal', 'Nama / Sekolah', 'TA', 'Kontak & Sumber', 'Status', 'Aksi']}
        loading={loading}
        error={error}
        empty={rows.length === 0 ? 'Belum ada entri titipan.' : undefined}
      >
        {rows.map((e) => (
          <tr key={e.id}>
            <td className="px-4 py-3 font-mono font-bold text-sand-700">
              {e.queueNo}
            </td>
            <td className="px-4 py-3 whitespace-nowrap text-sand-600">
              {fmtDate(e.createdAt)}
            </td>
            <td className="px-4 py-3">
              <p className="font-semibold text-sand-900">{e.candidateName}</p>
              <p className="text-xs text-sand-500">
                {e.previousSchool ?? '—'}
                {e.birthDate ? ` · lahir ${e.birthDate}` : ''}
              </p>
            </td>
            <td className="px-4 py-3 whitespace-nowrap text-sand-600">
              {e.academicYearName}
              <p className="mt-0.5 text-xs text-sand-500">
                {e.waveName ?? '— tanpa gelombang —'}
              </p>
            </td>
            <td className="px-4 py-3 text-xs text-sand-600">
              <p>{phones(e)}</p>
              <p className="mt-0.5 text-sand-400">
                {e.infoSource
                  ? (INFO_SOURCE_LABELS[e.infoSource as InfoSource] ?? e.infoSource)
                  : ''}
                {e.parentName ? ` · akun: ${e.parentName}` : ' · tanpa akun'}
              </p>
            </td>
            <td className="px-4 py-3">
              <Badge tone={TONE[e.status] ?? 'neutral'}>
                {TITIPAN_STATUS_LABELS[e.status]}
              </Badge>
              {e.position != null ? (
                <p className="mt-0.5 text-xs font-semibold text-accent-700">
                  posisi ke-{e.position}
                </p>
              ) : null}
              {e.formCode ? (
                <p className="mt-0.5 font-mono text-xs font-bold text-primary-700">
                  {e.formCode}
                </p>
              ) : null}
            </td>
            <td className="px-4 py-3">
              <div className="flex flex-wrap gap-1.5">
                {e.status === 'PENDING' ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === e.id}
                    onClick={() =>
                      void run(
                        () => approveTitipan(e.id),
                        `${e.candidateName} diverifikasi & masuk antrean.`,
                      )
                    }
                  >
                    Verifikasi
                  </Button>
                ) : null}
                {['PENDING', 'WAITING', 'CODE_SENT'].includes(e.status) ? (
                  <Button
                    size="sm"
                    disabled={busyId === e.id}
                    onClick={() => void onSendCode(e)}
                  >
                    {busyId === e.id
                      ? '…'
                      : e.status === 'CODE_SENT'
                        ? 'Kirim Ulang Kode'
                        : 'Kirim Kode WA'}
                  </Button>
                ) : null}
                {!['REGISTERED', 'CANCELLED'].includes(e.status) ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setCancelFor(e)}
                  >
                    Batal
                  </Button>
                ) : null}
                {e.status !== 'REGISTERED' ? (
                  <Select
                    aria-label="Pilih gelombang"
                    className="h-8 w-auto text-xs"
                    value={e.waveId ?? ''}
                    disabled={busyId === e.id}
                    onChange={(ev) => {
                      const wid = ev.target.value;
                      void run(
                        () => setTitipanWave(e.id, wid || null),
                        `${e.candidateName} ${wid ? 'ditugaskan ke gelombang' : 'dilepas dari gelombang'}.`,
                      );
                    }}
                  >
                    <option value="">— Gelombang…</option>
                    {waves
                      .filter((w) => w.academicYearId === e.academicYearId)
                      .map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                  </Select>
                ) : null}
                {e.status !== 'REGISTERED' ? (
                  <Select
                    aria-label="Ubah status"
                    className="h-8 w-auto text-xs"
                    value=""
                    disabled={busyId === e.id}
                    onChange={(ev) => {
                      const next = ev.target.value as Exclude<
                        TitipanStatus,
                        'REGISTERED' | ''
                      >;
                      if (!next) return;
                      void run(
                        () => setTitipanStatus(e.id, next),
                        `${e.candidateName} → ${TITIPAN_STATUS_LABELS[next]}.`,
                      );
                    }}
                  >
                    <option value="" disabled>
                      Ubah status…
                    </option>
                    {(['PENDING', 'WAITING', 'CODE_SENT', 'CANCELLED'] as const)
                      .filter((s) => s !== e.status)
                      .filter((s) => s !== 'CODE_SENT' || e.formCode)
                      .map((s) => (
                        <option key={s} value={s}>
                          → {TITIPAN_STATUS_LABELS[s]}
                        </option>
                      ))}
                  </Select>
                ) : null}
              </div>
            </td>
          </tr>
        ))}
      </DataTable>

      <Modal
        open={cancelFor !== null}
        onClose={() => setCancelFor(null)}
        title={`Batalkan titipan ${cancelFor?.candidateName ?? ''}?`}
        description="Entri dikeluarkan dari antrean — posisi pendaftar di belakangnya otomatis naik."
      >
        <form
          className="space-y-4"
          onSubmit={async (ev) => {
            ev.preventDefault();
            if (!cancelFor) return;
            const note = String(
              new FormData(ev.currentTarget).get('note') ?? '',
            ).trim();
            setCancelFor(null);
            await run(
              () => cancelTitipan(cancelFor.id, note || undefined),
              'Titipan dibatalkan.',
            );
          }}
        >
          <Field label="Alasan (opsional)">
            <Input name="note" placeholder="Mis. mengundurkan diri" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setCancelFor(null)}>
              Kembali
            </Button>
            <Button type="submit" variant="danger">
              Batalkan Titipan
            </Button>
          </div>
        </form>
      </Modal>
    </Shell>
  );
}
