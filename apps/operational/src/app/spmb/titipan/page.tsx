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
import { useConfirm } from '@/components/confirm-dialog';
import {
  ApiError,
  approveTitipan,
  bulkTitipan,
  cancelTitipan,
  deleteTitipan,
  exportTitipanXlsx,
  listAcademicYears,
  listAdminWaves,
  listTitipan,
  noteTitipan,
  sendTitipanCode,
  setTitipanStatus,
  setTitipanWave,
  titipanSummary,
  updateAcademicYear,
  type AcademicYear,
  type TitipanAdmin,
  type TitipanSummary,
  phoneLocal,
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
  { key: '', label: 'Semua (kecuali batal)' },
  { key: 'PENDING', label: 'Pending' },
  { key: 'WAITING', label: 'Antrean' },
  { key: 'CODE_SENT', label: 'Lanjut Pendaftaran' },
  { key: 'REGISTERED', label: 'Sudah Daftar' },
  { key: 'CANCELLED', label: 'Batal' },
];

/** Status yang bisa dituju manual dari modal Kelola (REGISTERED terkunci). */
const MANUAL_STATUS: Exclude<TitipanStatus, 'REGISTERED'>[] = [
  'PENDING',
  'WAITING',
  'CODE_SENT',
  'CANCELLED',
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
  const [sel, setSel] = useState<string[]>([]);
  const [manageFor, setManageFor] = useState<TitipanAdmin | null>(null);
  const [manageErr, setManageErr] = useState<string | null>(null);
  const [cancelFor, setCancelFor] = useState<
    | { kind: 'one'; entry: TitipanAdmin }
    | { kind: 'bulk'; ids: string[] }
    | null
  >(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const { confirm, dialog } = useConfirm();

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
      setSel((prev) => prev.filter((id) => r.some((e) => e.id === id)));
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

  /** Aksi dari dalam modal Kelola — error tampil di dalam modal. */
  async function runManage(fn: () => Promise<void>) {
    setManageErr(null);
    try {
      await fn();
      setManageFor(null);
      await load();
    } catch (e) {
      setManageErr(e instanceof ApiError ? e.message : 'Aksi gagal.');
    } finally {
      setBusyId(null);
    }
  }

  async function onSendCode(e: TitipanAdmin, insideModal = false) {
    setBusyId(e.id);
    setError(null);
    setNotice(null);
    const notify = (res: { entry: TitipanAdmin; queued: boolean; waUrl: string }) => {
      if (res.queued) {
        setNotice(
          `Kode ${res.entry.formCode} masuk antrean WhatsApp ke ${e.guardianPhone ?? 'ortu'} — dikirim otomatis sesuai jeda anti-spam.`,
        );
        if (res.waUrl) window.open(res.waUrl, '_blank', 'noopener');
      } else if (res.waUrl) {
        window.open(res.waUrl, '_blank', 'noopener');
        setNotice(`Kode ${res.entry.formCode} diterbitkan — WhatsApp dibuka untuk dikirim manual.`);
      } else {
        setNotice(`Kode ${res.entry.formCode} diterbitkan — tidak ada nomor HP ortu, kirim manual.`);
      }
    };
    try {
      notify(await sendTitipanCode(e.id));
      if (insideModal) setManageFor(null);
      await load();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Gagal mengirim kode.';
      if (insideModal) setManageErr(msg);
      else setError(msg);
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

  /** Aksi massal — laporkan berapa berhasil & gagal beserta penyebabnya. */
  async function runBulk(
    action: 'approve' | 'send_code' | 'status' | 'cancel' | 'delete',
    options?: { status?: 'PENDING' | 'WAITING' | 'CANCELLED'; note?: string },
  ) {
    if (sel.length === 0) return;
    setBulkBusy(true);
    setError(null);
    setNotice(null);
    try {
      const results = await bulkTitipan(sel, action, options);
      const ok = results.filter((r) => r.ok).length;
      const fails = results.filter((r) => !r.ok);
      setNotice(
        fails.length === 0
          ? `${ok} entri diproses.`
          : `${ok} berhasil · ${fails.length} gagal — ${fails
              .slice(0, 3)
              .map((f) => `${f.candidateName}: ${f.message}`)
              .join(' · ')}`,
      );
      setSel([]);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Aksi massal gagal.');
    } finally {
      setBulkBusy(false);
    }
  }

  const summaryFor = useMemo(
    () => (yearId ? summary.find((s) => s.academicYearId === yearId) : undefined),
    [summary, yearId],
  );

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });

  const phones = (e: TitipanAdmin) => phoneLocal(e.guardianPhone) || '—';
  const allChecked = rows.length > 0 && sel.length === rows.length;
  const toggleAll = () => setSel(allChecked ? [] : rows.map((e) => e.id));
  const toggle = (id: string) =>
    setSel((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const m = manageFor; // entri di modal Kelola

  return (
    <Shell>
      <PageTitle
        title="Daftar Titipan / Waiting List"
        subtitle="Antrean calon siswa — verifikasi, terbitkan kode formulir, kelola status satu per satu atau massal"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              void exportTitipanXlsx({
                ...(yearId ? { academicYearId: yearId } : {}),
                ...(waveId ? { waveId } : {}),
              }).catch(() => setError('Export Excel gagal.'))
            }
          >
            Export Excel
          </Button>
        }
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
          const penuh = sisa !== null && sisa <= 0;
          const year = years.find((y) => y.id === s.academicYearId);
          return (
            <button
              type="button"
              key={s.academicYearId}
              onClick={() => {
                setYearId(yearId === s.academicYearId ? '' : s.academicYearId);
                setWaveId('');
              }}
              className={`rounded-2xl border bg-white p-4 text-left shadow-card transition-colors ${
                yearId === s.academicYearId
                  ? 'border-primary-400 ring-2 ring-primary-100'
                  : 'border-sand-200 hover:border-sand-300'
              }`}
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
                <div className={`rounded-xl px-1 py-2 ${penuh ? 'bg-red-50' : 'bg-sand-50'}`}>
                  <p className={`text-xs ${penuh ? 'text-red-600' : 'text-sand-500'}`}>Terisi</p>
                  <p className={`font-extrabold ${penuh ? 'text-red-700' : 'text-sand-900'}`}>{s.occupied}</p>
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
              {penuh ? (
                <p className="mt-2 text-xs font-bold text-red-600">
                  KUOTA PENUH — titipan baru terkunci otomatis
                </p>
              ) : sisa !== null ? (
                <p className="mt-2 text-xs font-semibold text-primary-700">
                  Sisa kuota: {sisa}
                </p>
              ) : null}
              {year ? (
                <div
                  className="mt-3 flex items-center gap-2 border-t border-sand-100 pt-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void toggleTitipanOpen(year)}
                  >
                    {year.titipanOpen ? 'Tutup Titipan' : 'Buka Titipan'}
                  </Button>
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
              ) : null}
            </button>
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
        <Field label="Status" className="w-48">
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

      {/* Bilah aksi massal — muncul saat ada yang dicentang */}
      {sel.length > 0 ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-primary-200 bg-primary-50 px-4 py-3">
          <p className="mr-2 text-sm font-extrabold text-primary-800">
            {sel.length} entri dipilih
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={bulkBusy}
            onClick={() => void runBulk('approve')}
          >
            Verifikasi
          </Button>
          <Button
            size="sm"
            disabled={bulkBusy}
            onClick={() =>
              void runBulk('send_code').then(() =>
                setNotice((n) => `${n ?? ''} Kode dikirim sesuai antrean WA — cek Antrean WA untuk status kirim.`),
              )
            }
          >
            Lanjut ke Pendaftaran (Kirim Kode)
          </Button>
          <Select
            aria-label="Ubah status massal"
            className="h-9 w-auto text-sm"
            value=""
            disabled={bulkBusy}
            onChange={(e) => {
              const s = e.target.value as 'PENDING' | 'WAITING' | 'CANCELLED' | '';
              if (!s) return;
              if (s === 'CANCELLED') setCancelFor({ kind: 'bulk', ids: sel });
              else void runBulk('status', { status: s });
            }}
          >
            <option value="" disabled>
              Ubah status…
            </option>
            <option value="PENDING">→ Pending</option>
            <option value="WAITING">→ Antrean</option>
            <option value="CANCELLED">→ Batalkan (dengan alasan)</option>
          </Select>
          <Button
            size="sm"
            variant="danger"
            disabled={bulkBusy}
            onClick={() =>
              void confirm({
                title: `Hapus ${sel.length} entri titipan?`,
                body: 'Entri dihapus permanen dari daftar — yang sudah jadi pendaftaran akan dilewati otomatis.',
                confirmLabel: 'Hapus',
              }).then((ok) => {
                if (ok) void runBulk('delete');
              })
            }
          >
            Hapus
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSel([])}>
            Bersihkan
          </Button>
        </div>
      ) : null}

      <DataTable
        head={[
          <input
            key="sel"
            type="checkbox"
            aria-label="Pilih semua"
            checked={allChecked}
            onChange={toggleAll}
            className="size-4 accent-primary-600"
          />,
          '#',
          'Tanggal',
          'Nama / Sekolah',
          'TA',
          'Kontak & Sumber',
          'Status',
          'Aksi',
        ]}
        loading={loading}
        error={error}
        empty={rows.length === 0 ? 'Belum ada entri titipan.' : undefined}
      >
        {rows.map((e) => (
          <tr key={e.id} className={sel.includes(e.id) ? 'bg-primary-50/60' : undefined}>
            <td className="px-4 py-3">
              <input
                type="checkbox"
                aria-label={`Pilih ${e.candidateName}`}
                checked={sel.includes(e.id)}
                onChange={() => toggle(e.id)}
                className="size-4 accent-primary-600"
              />
            </td>
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
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setManageErr(null);
                  setManageFor(e);
                }}
              >
                Kelola
              </Button>
            </td>
          </tr>
        ))}
      </DataTable>

      {/* Modal Kelola — semua aksi satu entri di satu tempat */}
      <Modal
        open={m !== null}
        onClose={() => setManageFor(null)}
        title={m ? `Kelola — ${m.candidateName}` : ''}
        description="Verifikasi, kirim kode WA, ubah gelombang/status, atau batalkan titipan ini."
        size="lg"
      >
        {m ? (
          <div className="space-y-5">
            {/* Info ringkas */}
            <div className="grid gap-2 rounded-xl bg-sand-50 px-4 py-3 text-sm sm:grid-cols-2">
              <p className="text-sand-600">
                Antrean <b className="font-mono">#{m.queueNo}</b> · TA {m.academicYearName}
              </p>
              <p className="text-sand-600">
                Status:{' '}
                <Badge tone={TONE[m.status] ?? 'neutral'}>
                  {TITIPAN_STATUS_LABELS[m.status]}
                </Badge>
              </p>
              <p className="text-sand-600">HP ortu: {phones(m)}</p>
              <p className="text-sand-600">
                Kode:{' '}
                {m.formCode ? (
                  <b className="font-mono text-primary-700">{m.formCode}</b>
                ) : (
                  '— belum diterbitkan'
                )}
              </p>
              {m.note ? <p className="text-sand-600 sm:col-span-2">Catatan: {m.note}</p> : null}
            </div>

            {manageErr ? (
              <p role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">
                {manageErr}
              </p>
            ) : null}

            {/* Aksi utama */}
            <div className="flex flex-wrap gap-2">
              {m.status === 'PENDING' ? (
                <Button
                  size="sm"
                  disabled={busyId === m.id}
                  onClick={() => {
                    setBusyId(m.id);
                    void runManage(async () => {
                      await approveTitipan(m.id);
                      setNotice(`${m.candidateName} diverifikasi & masuk antrean.`);
                    });
                  }}
                >
                  Verifikasi → Antrean
                </Button>
              ) : null}
              {['PENDING', 'WAITING', 'CODE_SENT'].includes(m.status) ? (
                <Button
                  size="sm"
                  variant={m.status === 'PENDING' ? 'outline' : 'primary'}
                  disabled={busyId === m.id}
                  onClick={() => void onSendCode(m, true)}
                >
                  {busyId === m.id
                    ? 'Mengirim…'
                    : m.status === 'CODE_SENT'
                      ? 'Kirim Ulang Kode WA'
                      : 'Kirim Kode via WhatsApp'}
                </Button>
              ) : null}
            </div>

            {m.status !== 'REGISTERED' ? (
              <div className="grid gap-4 border-t border-sand-100 pt-4 sm:grid-cols-2">
                <Field label="Gelombang" hint="Kelompokkan antrean ke gelombang psikotes/pendaftaran">
                  <Select
                    value={m.waveId ?? ''}
                    disabled={busyId === m.id}
                    onChange={(ev) => {
                      const wid = ev.target.value || null;
                      void runManage(async () => {
                        await setTitipanWave(m.id, wid);
                        setNotice(
                          `${m.candidateName} ${wid ? 'ditugaskan ke gelombang' : 'dilepas dari gelombang'}.`,
                        );
                      });
                    }}
                  >
                    <option value="">— Tanpa gelombang —</option>
                    {waves
                      .filter((w) => w.academicYearId === m.academicYearId)
                      .map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                  </Select>
                </Field>
                <Field label="Ubah Status" hint="Lompati alur secara manual bila perlu">
                  <Select
                    value=""
                    disabled={busyId === m.id}
                    onChange={(ev) => {
                      const next = ev.target.value as Exclude<
                        TitipanStatus,
                        'REGISTERED' | ''
                      >;
                      if (!next) return;
                      if (next === 'CANCELLED') {
                        setManageFor(null);
                        setCancelFor({ kind: 'one', entry: m });
                        return;
                      }
                      void runManage(async () => {
                        await setTitipanStatus(m.id, next);
                        setNotice(`${m.candidateName} → ${TITIPAN_STATUS_LABELS[next]}.`);
                      });
                    }}
                  >
                    <option value="" disabled>
                      Pilih status baru…
                    </option>
                    {MANUAL_STATUS.filter(
                      (s) => s !== m.status && s !== 'CANCELLED',
                    )
                      .filter((s) => s !== 'CODE_SENT' || m.formCode)
                      .map((s) => (
                        <option key={s} value={s}>
                          → {TITIPAN_STATUS_LABELS[s]}
                        </option>
                      ))}
                    <option value="CANCELLED">→ Batalkan titipan…</option>
                  </Select>
                </Field>
              </div>
            ) : null}

            {/* Zona berbahaya */}
            {m.status !== 'REGISTERED' ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50/60 px-4 py-3">
                <p className="text-xs font-semibold text-red-700">
                  Pembatalan mengeluarkan entri dari antrean — posisi di
                  belakangnya naik. Hapus menghilangkan entri permanen.
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      setManageFor(null);
                      setCancelFor({ kind: 'one', entry: m });
                    }}
                  >
                    Batalkan Titipan…
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-700 hover:bg-red-100"
                    onClick={() =>
                      void confirm({
                        title: `Hapus titipan ${m.candidateName}?`,
                        body: 'Entri dihapus permanen dan tidak bisa dikembalikan.',
                        confirmLabel: 'Hapus',
                      }).then((ok) => {
                        if (!ok) return;
                        void runManage(async () => {
                          await deleteTitipan(m.id);
                          setNotice(`Titipan ${m.candidateName} dihapus.`);
                        });
                      })
                    }
                  >
                    Hapus
                  </Button>
                </div>
              </div>
            ) : (
              <p className="rounded-xl bg-primary-50 px-4 py-3 text-sm font-medium text-primary-800">
                Entri ini sudah menjadi pendaftaran resmi — status terkunci.
              </p>
            )}

            {/* Catatan */}
            <form
              className="flex items-end gap-2 border-t border-sand-100 pt-4"
              onSubmit={(ev) => {
                ev.preventDefault();
                const note = String(
                  new FormData(ev.currentTarget).get('note') ?? '',
                ).trim();
                void runManage(async () => {
                  await noteTitipan(m.id, note || undefined);
                  setNotice('Catatan titipan disimpan.');
                });
              }}
            >
              <Field label="Catatan Admin" className="flex-1">
                <Input name="note" defaultValue={m.note ?? ''} placeholder="Catatan internal…" />
              </Field>
              <Button type="submit" size="sm" variant="outline" disabled={busyId === m.id}>
                Simpan
              </Button>
            </form>
          </div>
        ) : null}
      </Modal>

      {/* Modal batalkan — satu entri atau massal */}
      <Modal
        open={cancelFor !== null}
        onClose={() => setCancelFor(null)}
        title={
          cancelFor?.kind === 'one'
            ? `Batalkan titipan ${cancelFor.entry.candidateName}?`
            : `Batalkan ${cancelFor?.ids.length ?? 0} entri titipan?`
        }
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
            const target = cancelFor;
            setCancelFor(null);
            if (target.kind === 'one') {
              await run(
                () => cancelTitipan(target.entry.id, note || undefined),
                `Titipan ${target.entry.candidateName} dibatalkan.`,
              );
            } else {
              await runBulk('cancel', { ...(note ? { note } : {}) });
            }
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

      {dialog}
    </Shell>
  );
}
