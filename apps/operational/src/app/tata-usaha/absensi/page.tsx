'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Field, Input, Modal, Select } from '@smpmuh3/ui';
import { PERMISSIONS } from '@smpmuh3/types';
import { Shell } from '@/components/shell';
import { DataTable } from '@/components/data-table';
import { RowBtn } from '@/components/row-btn';
import { PageTitle, Widget } from '@/components/widgets';
import {
  approveLeaveRequest,
  clearEmployeeDay,
  listAttendanceDaily,
  listEmployees,
  listLeaveRequests,
  manualPunch,
  me,
  rederiveAttendance,
  rejectLeaveRequest,
  type DailyRow,
  type EmployeeDto,
  type LeaveRequestView,
} from '@/lib/api';
import { useConfirm } from '@/components/confirm-dialog';

const STATUS_TONE: Record<string, 'primary' | 'accent' | 'neutral' | 'danger'> = {
  HADIR: 'primary',
  TELAT: 'accent',
  IZIN: 'neutral',
  SAKIT: 'neutral',
  ALPHA: 'danger',
};
const SOURCE_LABEL: Record<string, string> = { SELFIE: 'Selfie', DEVICE: '🖐 Mesin', IMPORT: '⬆ Impor', MANUAL: '✍️ TU' };
/** Label sumber — selfie dipecah per platform (aplikasi HP vs browser web). */
const sourceLabel = (r: DailyRow) => {
  if (r.source === 'SELFIE')
    return r.client === 'APP' ? '📱 HP (aplikasi)' : r.client === 'WEB' ? '🌐 Web' : '📱 Selfie';
  return r.source ? (SOURCE_LABEL[r.source] ?? r.source) : '—';
};
const fmtTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '—';

/**
 * Rekap absensi pegawai per tanggal — sistem absen selfie (foto + lokasi).
 * TU hanya meninjau & bisa mencatat tap koreksi manual bila pegawai lupa absen.
 * Pengaturan shift & lokasi sekolah dikelola bidang Kurikulum.
 */
const LEAVE_CAT: Record<string, string> = { SAKIT: 'Sakit', DINAS: 'Dinas', WORKSHOP: 'Workshop', LAINNYA: 'Lainnya' };
const fmtLeaveDate = (iso: string) =>
  new Date(`${String(iso).slice(0, 10)}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });

export default function AbsensiPegawaiPage() {
  const { confirm, dialog } = useConfirm();
  const [canManage, setCanManage] = useState(false);
  const [canApprove, setCanApprove] = useState(false);
  const [leaves, setLeaves] = useState<LeaveRequestView[]>([]);
  const [leaveTab, setLeaveTab] = useState<'PENDING' | 'SELESAI'>('PENDING');
  const [employees, setEmployees] = useState<EmployeeDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [manualFor, setManualFor] = useState<{ emp: DailyRow['employee']; inOut: 0 | 1 } | null>(null);
  const [fEmployee, setFEmployee] = useState('');
  const [fStatus, setFStatus] = useState('');

  useEffect(() => {
    me().then((u) => {
      setCanManage(u.permissions.includes(PERMISSIONS.TATAUSAHA_MANAGE));
      setCanApprove(
        u.permissions.includes(PERMISSIONS.ACADEMIC_MANAGE)
        || u.permissions.includes(PERMISSIONS.TATAUSAHA_MANAGE),
      );
    }).catch(() => undefined);
    listEmployees().then(setEmployees).catch(() => undefined);
  }, []);

  const loadLeaves = useCallback(() => {
    if (!canApprove) return;
    listLeaveRequests(leaveTab === 'PENDING' ? 'PENDING' : undefined)
      .then((rows) => setLeaves(leaveTab === 'PENDING' ? rows : rows.filter((r) => r.status !== 'PENDING').slice(0, 50)))
      .catch(() => {});
  }, [canApprove, leaveTab]);
  useEffect(() => loadLeaves(), [loadLeaves]);

  const actLeave = async (l: LeaveRequestView, ok: boolean) => {
    const span = l.partialFromMin != null
      ? `pulang awal ${new Date(`${String(l.dateFrom).slice(0, 10)}T00:00:00`).toLocaleDateString('id-ID')}`
      : l.dateFrom === l.dateTo ? fmtLeaveDate(l.dateFrom) : `${fmtLeaveDate(l.dateFrom)}–${fmtLeaveDate(l.dateTo)}`;
    if (ok) {
      if (!(await confirm({ title: `Setujui izin ${l.employee?.name}?`, body: `${LEAVE_CAT[l.category]} — ${span}. Status absen akan tertulis ke rekap.`, confirmLabel: 'Setujui', danger: false }))) return;
      try {
        const r = await approveLeaveRequest(l.id);
        setNotice(`Izin ${l.employee?.name} disetujui — ${r.appliedDays} hari tertulis${r.skippedDays ? `, ${r.skippedDays} hari dilewati (sudah hadir)` : ''}.`);
        loadLeaves(); loadDaily();
      } catch (e) { setError(e instanceof Error ? e.message : 'Gagal menyetujui.'); }
    } else {
      const note = window.prompt(`Alasan penolakan izin ${l.employee?.name}? (opsional — kosongkan lalu OK untuk langsung menolak)`);
      if (note === null) return;
      if (!(await confirm({ title: `Tolak izin ${l.employee?.name}?`, body: `${LEAVE_CAT[l.category]} — ${span}.`, confirmLabel: 'Tolak' }))) return;
      try {
        await rejectLeaveRequest(l.id, note.trim() || undefined);
        setNotice(`Pengajuan izin ${l.employee?.name} ditolak.`);
        loadLeaves();
      } catch (e) { setError(e instanceof Error ? e.message : 'Gagal menolak.'); }
    }
  };

  const loadDaily = useCallback(() => {
    setLoading(true);
    listAttendanceDaily(date, {
      ...(fEmployee ? { employeeId: fEmployee } : {}),
      ...(fStatus ? { status: fStatus } : {}),
    })
      .then(setDaily)
      .catch(() => setError('Gagal memuat absen harian.'))
      .finally(() => setLoading(false));
  }, [date, fEmployee, fStatus]);

  useEffect(() => loadDaily(), [loadDaily]);

  async function onManual(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!manualFor) return;
    setBusy(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    const when = `${String(f.get('mdate'))} ${String(f.get('mtime'))}`;
    try {
      await manualPunch({ employeeId: manualFor.emp.id, punchedAt: when, inOut: manualFor.inOut });
      setNotice(`Tap ${manualFor.inOut === 1 ? 'pulang' : 'masuk'} ${manualFor.emp.name} tercatat.`);
      setManualFor(null);
      loadDaily();
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : 'Gagal mencatat tap.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <PageTitle
        title="Absensi Pegawai"
        subtitle="Rekap absen selfie harian semua pegawai — jam kerja & lokasi diatur bidang Kurikulum"
      />
      {dialog}
      {error ? <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p> : null}
      {notice ? <p role="status" className="mb-4 rounded-xl bg-primary-50 px-4 py-3 text-sm font-medium text-primary-800">{notice}</p> : null}

      {canApprove && (
        <Widget
          title="Pengajuan Izin Pegawai"
          action={
            <div className="flex gap-1 rounded-xl bg-sand-100 p-1 text-xs font-bold">
              {(['PENDING', 'SELESAI'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setLeaveTab(t)}
                  className={`rounded-lg px-3 py-1 ${leaveTab === t ? 'bg-white text-sand-900 shadow-sm' : 'text-sand-500'}`}
                >
                  {t === 'PENDING' ? `Menunggu (${leaves.filter((x) => x.status === 'PENDING').length})` : 'Riwayat'}
                </button>
              ))}
            </div>
          }
        >
          {leaves.length === 0 ? (
            <p className="py-4 text-center text-sm text-sand-400">
              {leaveTab === 'PENDING' ? 'Tidak ada pengajuan menunggu.' : 'Belum ada riwayat pengajuan.'}
            </p>
          ) : (
            <ul className="divide-y divide-sand-100">
              {leaves.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-sand-800">
                      {l.employee?.name}
                      <span className="ml-2 font-normal text-sand-500">
                        {LEAVE_CAT[l.category]} ·{' '}
                        {l.partialFromMin != null
                          ? `pulang awal ${new Date(`${String(l.dateFrom).slice(0, 10)}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} pukul ${String(Math.floor((l.partialFromMin ?? 0) / 60)).padStart(2, '0')}:${String((l.partialFromMin ?? 0) % 60).padStart(2, '0')}`
                          : l.dateFrom === l.dateTo
                            ? fmtLeaveDate(l.dateFrom)
                            : `${fmtLeaveDate(l.dateFrom)} – ${fmtLeaveDate(l.dateTo)}`}
                      </span>
                    </p>
                    <p className="truncate text-xs text-sand-500">
                      {l.note ?? '—'}
                      {l.employee?.department ? ` · ${l.employee.department}` : ''}
                      {l.status !== 'PENDING' && l.reviewedBy ? ` · ${l.status === 'APPROVED' ? 'disetujui' : 'ditolak'} oleh ${l.reviewedBy.name}` : ''}
                      {l.status === 'REJECTED' && l.reviewNote ? ` (${l.reviewNote})` : ''}
                    </p>
                  </div>
                  {l.status === 'PENDING' ? (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => void actLeave(l, true)}>✓ Setujui</Button>
                      <Button size="sm" variant="secondary" onClick={() => void actLeave(l, false)}>✗ Tolak</Button>
                    </div>
                  ) : (
                    <Badge tone={l.status === 'APPROVED' ? 'primary' : l.status === 'REJECTED' ? 'danger' : 'neutral'}>
                      {l.status === 'APPROVED' ? 'Disetujui' : l.status === 'REJECTED' ? 'Ditolak' : 'Dibatalkan'}
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Widget>
      )}

      <Widget
        title={`Absen ${new Date(`${date}T12:00:00`).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`}
      >
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="w-44">
            <Field label="Tanggal">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>
          <div className="w-56">
            <Field label="Pegawai">
              <Select value={fEmployee} onChange={(e) => setFEmployee(e.target.value)} searchable>
                <option value="">Semua pegawai</option>
                {employees.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="w-40">
            <Field label="Status">
              <Select value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
                <option value="">Semua</option>
                <option value="HADIR">Hadir</option>
                <option value="TELAT">Telat</option>
                <option value="IZIN">Izin</option>
                <option value="SAKIT">Sakit</option>
                <option value="ALPHA">Alpha</option>
              </Select>
            </Field>
          </div>
          {canManage ? (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              title="Hitung ulang rekap semua hari dari log mentah — dipakai setelah jadwal/shift diubah"
              onClick={async () => {
                if (!window.confirm('Hitung ulang rekap SEMUA tanggal dari log mentah? Status izin/sakit manual tetap dipertahankan.')) return;
                setBusy(true);
                try {
                  const r = await rederiveAttendance();
                  setNotice(`${r.derived} hari-pegawai dihitung ulang.`);
                  loadDaily();
                } catch { setError('Gagal menghitung ulang.'); } finally { setBusy(false); }
              }}
            >↻ Hitung Ulang</Button>
          ) : null}
        </div>
        <DataTable
          head={['Pegawai', 'Masuk', 'Pulang', 'Status', 'Telat', 'Sumber', canManage ? 'Aksi' : '']}
          loading={loading}
          error={null}
          empty={daily.length === 0 ? 'Tidak ada pegawai aktif.' : undefined}
        >
          {daily.map((r) => (
            <tr key={r.employee.id}>
              <td className="px-5 py-2.5">
                <Link href={`/kepegawaian/${r.employee.id}`} className="font-medium text-sand-900 hover:text-primary-700 hover:underline">
                  {r.employee.name}
                </Link>
                <p className="text-[10px] text-sand-400">{r.employee.nip ?? ''}</p>
                {r.work ? (
                  <p className="mt-0.5 text-[10px] text-sand-400" title={`Dasar jam kerja: ${r.work.basis}`}>
                    {r.work.start}–{r.work.end} · {r.work.basis}
                  </p>
                ) : null}
              </td>
              <td className="px-5 py-2.5 font-semibold text-sand-900">{fmtTime(r.checkInAt)}</td>
              <td className="px-5 py-2.5 font-semibold text-sand-900">{fmtTime(r.checkOutAt)}</td>
              <td className="px-5 py-2.5">
                {r.status ? <Badge tone={STATUS_TONE[r.status] ?? 'neutral'}>{r.status}</Badge> : <span className="text-xs text-sand-400">belum absen</span>}
                {r.partialLeaveFromMin != null ? (
                  <span className="mt-0.5 block text-[10px] font-medium text-amber-700">
                    izin sejak {`${String(Math.floor(r.partialLeaveFromMin / 60)).padStart(2, '0')}:${String(r.partialLeaveFromMin % 60).padStart(2, '0')}`}
                    {r.leaveCategory ? ` · ${r.leaveCategory.toLowerCase()}` : ''}
                  </span>
                ) : null}
              </td>
              <td className="px-5 py-2.5 text-xs text-sand-600">
                {r.lateMinutes ? `${r.lateMinutes} mnt` : '—'}
              </td>
              <td className="px-5 py-2.5 text-xs text-sand-500">{sourceLabel(r)}</td>
              {canManage ? (
                <td className="whitespace-nowrap px-5 py-2.5">
                  <span className="flex gap-1.5">
                    <RowBtn tone="primary" type="button" onClick={() => setManualFor({ emp: r.employee, inOut: 0 })}>Tap Masuk</RowBtn>
                    <RowBtn tone="neutral" type="button" onClick={() => setManualFor({ emp: r.employee, inOut: 1 })}>Tap Pulang</RowBtn>
                    {r.status || r.checkInAt || r.checkOutAt ? (
                      <RowBtn
                        tone="danger"
                        type="button"
                        onClick={() => {
                          if (!window.confirm(`Clear absen ${r.employee.name} tanggal ${date}? Rekap & log ikut terhapus.`)) return;
                          clearEmployeeDay(r.employee.id, date)
                            .then(() => { setNotice(`Absen ${r.employee.name} di tanggal itu dihapus.`); loadDaily(); })
                            .catch((er) => setError(er instanceof Error ? er.message : 'Gagal menghapus.'));
                        }}
                      >Clear</RowBtn>
                    ) : null}
                  </span>
                </td>
              ) : null}
            </tr>
          ))}
        </DataTable>
        <p className="mt-3 text-xs text-sand-500">
          Absen memakai selfie + lokasi (pegawai → menu Absen Saya). Jam kerja, shift, dan titik lokasi sekolah diatur di{' '}
          <Link href="/kurikulum/jadwal-kerja" className="font-semibold text-primary-700 hover:underline">Kurikulum → Jadwal Kerja</Link>.
        </p>
      </Widget>

      {/* Modal tap koreksi manual */}
      <Modal
        open={manualFor !== null}
        onClose={() => setManualFor(null)}
        title={`Tap ${manualFor?.inOut === 1 ? 'Pulang' : 'Masuk'} — ${manualFor?.emp.name ?? ''}`}
      >
        <form className="grid gap-4" onSubmit={onManual}>
          <p className={`rounded-xl px-3 py-2 text-sm font-medium ${manualFor?.inOut === 1 ? 'bg-sand-100 text-sand-700' : 'bg-primary-50 text-primary-800'}`}>
            {manualFor?.inOut === 1
              ? 'Tap ini dicatat sebagai absen PULANG — dipakai bila pegawai lupa absen pulang.'
              : 'Tap ini dicatat sebagai absen MASUK — menentukan status HADIR/TELAT hari itu.'}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tanggal">
              <Input type="date" name="mdate" required defaultValue={date} />
            </Field>
            <Field label="Jam">
              <Input type="time" name="mtime" required defaultValue={manualFor?.inOut === 1 ? '15:00' : '07:00'} />
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setManualFor(null)}>Batal</Button>
            <Button type="submit" disabled={busy}>
              Catat {manualFor?.inOut === 1 ? 'Pulang' : 'Masuk'}
            </Button>
          </div>
        </form>
      </Modal>
    </Shell>
  );
}
