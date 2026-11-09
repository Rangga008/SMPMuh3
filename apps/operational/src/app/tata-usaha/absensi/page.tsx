'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Badge, Button, Field, Input, Modal, Select } from '@smpmuh3/ui';
import { PERMISSIONS } from '@smpmuh3/types';
import { Shell } from '@/components/shell';
import { useConfirm } from '@/components/confirm-dialog';
import { DataTable } from '@/components/data-table';
import { RowBtn } from '@/components/row-btn';
import { PageTitle, Widget } from '@/components/widgets';
import {
  API,
  assignEmployeeShift,
  createAttendanceDevice,
  createWorkShift,
  deleteAttendanceDevice,
  deleteWorkShift,
  getAttendanceSettings,
  getTokens,
  importAttendanceFile,
  listAttendanceDaily,
  listAttendanceDevices,
  listAttendanceLogs,
  listAttendancePins,
  listEmployeeShifts,
  listWorkShifts,
  manualPunch,
  me,
  pullAttendanceDevice,
  rederiveAttendance,
  removeEmployeeShift,
  setAttendancePin,
  updateAttendanceDevice,
  updateAttendanceSettings,
  updateWorkShift,
  type AttendanceDevice,
  type AttendanceLog,
  type AttendanceSettings,
  type DailyRow,
  type EmployeeShift,
  type PinRow,
  type WorkShift,
} from '@/lib/api';

type Section = 'harian' | 'log' | 'pin' | 'perangkat' | 'jadwal' | 'shift';
const SECTIONS: { key: Section; title: string; desc: string }[] = [
  { key: 'harian', title: 'Absen Harian', desc: 'Jam masuk & pulang tiap pegawai per tanggal — hasil tap mesin.' },
  { key: 'log', title: 'Log Mesin', desc: 'Semua tap mentah dari perangkat (audit & penelusuran).' },
  { key: 'pin', title: 'Pemetaan PIN', desc: 'Hubungkan user-id di mesin ke data pegawai.' },
  { key: 'shift', title: 'Shift Kerja', desc: 'Jam masuk/pulang per kelompok — pagi, siang, dst.' },
  { key: 'perangkat', title: 'Perangkat & Sinkronisasi', desc: 'Daftar mesin, mode koneksi, tarik/impor log.' },
  { key: 'jadwal', title: 'Jadwal Kerja', desc: 'Jam masuk, toleransi telat, dan aturan derivasi otomatis.' },
];
const SECTION_TITLES = Object.fromEntries(SECTIONS.map((s) => [s.key, s.title])) as Record<Section, string>;

const STATUS_TONE: Record<string, 'primary' | 'accent' | 'neutral' | 'danger'> = {
  HADIR: 'primary',
  TELAT: 'accent',
  IZIN: 'neutral',
  SAKIT: 'neutral',
  ALPHA: 'danger',
};
const SOURCE_LABEL: Record<string, string> = { DEVICE: 'Mesin', IMPORT: 'Impor', MANUAL: 'Manual' };

const minToHHMM = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const fmtTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '—';
const fmtDT = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '—';

export default function AbsensiPegawaiPage() {
  return (
    <Suspense fallback={<Shell><p className="text-sm text-sand-500">Memuat absensi…</p></Shell>}>
      <AbsensiInner />
    </Suspense>
  );
}

function AbsensiInner() {
  const { confirm, dialog } = useConfirm();
  const router = useRouter();
  const searchParams = useSearchParams();
  const section = (searchParams.get('bagian') ?? '') as Section | '';
  const setSection = (s: Section | '') =>
    router.replace(s ? `/tata-usaha/absensi?bagian=${s}` : '/tata-usaha/absensi', { scroll: false });

  const [canManage, setCanManage] = useState(false);
  const [devices, setDevices] = useState<AttendanceDevice[]>([]);
  const [pins, setPins] = useState<PinRow[]>([]);
  const [settings, setSettings] = useState<AttendanceSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // harian
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [manualFor, setManualFor] = useState<{ emp: DailyRow['employee']; inOut: 0 | 1 } | null>(null);
  const [fEmployee, setFEmployee] = useState('');
  const [fStatus, setFStatus] = useState('');

  // shift
  const [shifts, setShifts] = useState<WorkShift[]>([]);
  const [empShifts, setEmpShifts] = useState<EmployeeShift[]>([]);
  const [shiftModal, setShiftModal] = useState<WorkShift | 'new' | null>(null);
  const [assignModal, setAssignModal] = useState(false);
  const [assignSearch, setAssignSearch] = useState('');
  const [assignDay, setAssignDay] = useState('');
  const [assignShiftFilter, setAssignShiftFilter] = useState('');

  // log mesin
  const [logDate, setLogDate] = useState('');
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // perangkat
  const [devModal, setDevModal] = useState<AttendanceDevice | 'new' | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const [importDevice, setImportDevice] = useState('');

  // jadwal
  const [schedForm, setSchedForm] = useState<AttendanceSettings | null>(null);

  const baseLoad = useCallback(async () => {
    const [d, p, s] = await Promise.all([
      listAttendanceDevices(),
      listAttendancePins(),
      getAttendanceSettings(),
    ]);
    setDevices(d);
    setPins(p);
    setSettings(s);
    setSchedForm(s);
    if (!importDevice && d.length) setImportDevice(d[0]!.serial);
  }, [importDevice]);

  useEffect(() => {
    me().then((u) => setCanManage(u.permissions.includes(PERMISSIONS.TATAUSAHA_MANAGE))).catch(() => undefined);
    baseLoad().catch(() => setError('Gagal memuat data absensi.'));
  }, [baseLoad]);

  const loadDaily = useCallback(() => {
    setDailyLoading(true);
    listAttendanceDaily(date, {
      ...(fEmployee ? { employeeId: fEmployee } : {}),
      ...(fStatus ? { status: fStatus } : {}),
    })
      .then(setDaily)
      .catch(() => setError('Gagal memuat absen harian.'))
      .finally(() => setDailyLoading(false));
  }, [date, fEmployee, fStatus]);

  const loadLogs = useCallback(() => {
    setLogsLoading(true);
    listAttendanceLogs(logDate ? { date: logDate } : {})
      .then(setLogs)
      .catch(() => setError('Gagal memuat log mesin.'))
      .finally(() => setLogsLoading(false));
  }, [logDate]);

  const loadShifts = useCallback(() => {
    Promise.all([listWorkShifts(), listEmployeeShifts()])
      .then(([s, es]) => {
        setShifts(s);
        setEmpShifts(es);
      })
      .catch(() => setError('Gagal memuat data shift.'));
  }, []);

  useEffect(() => {
    if (section === 'harian') loadDaily();
    if (section === 'log') loadLogs();
    if (section === 'shift') loadShifts();
  }, [section, loadDaily, loadLogs, loadShifts]);

  async function run<T>(fn: () => Promise<T>, msg: (r: T) => string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await fn();
      setNotice(msg(r));
      await baseLoad();
      if (section === 'harian') loadDaily();
      if (section === 'log') loadLogs();
      return r;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan.');
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  // ---------- aksi ----------

  async function onSaveDevice(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const dto = {
      name: String(f.get('name') ?? ''),
      serial: String(f.get('serial') ?? ''),
      mode: String(f.get('mode') ?? 'ICLOCK') as AttendanceDevice['mode'],
      host: String(f.get('host') ?? '') || undefined,
      port: Number(f.get('port')) || 4370,
      commKey: String(f.get('commKey') ?? '') || undefined,
      location: String(f.get('location') ?? '') || undefined,
    };
    const isNew = devModal === 'new';
    const r = await run(
      () => (isNew ? createAttendanceDevice(dto) : updateAttendanceDevice((devModal as AttendanceDevice).id, dto)),
      () => (isNew ? 'Perangkat ditambahkan.' : 'Perangkat diperbarui.'),
    );
    if (r !== undefined) setDevModal(null);
  }

  async function onDeleteDevice(d: AttendanceDevice) {
    if (
      await confirm({
        title: `Hapus perangkat "${d.name}"?`,
        body: 'Riwayat log tap tetap tersimpan — hanya koneksi perangkat yang dilepas.',
      })
    )
      await run(() => deleteAttendanceDevice(d.id), () => 'Perangkat dihapus.');
  }

  async function onPull(d: AttendanceDevice) {
    await run(
      () => pullAttendanceDevice(d.id),
      (r) => `Tarik selesai: ${r.pulled} tap dibaca, ${r.inserted} baru, ${r.skipped} duplikat.`,
    );
  }

  async function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!importDevice) {
      setError('Pilih perangkat asal file terlebih dahulu.');
      return;
    }
    await run(
      () => importAttendanceFile(importDevice, file),
      (r) => `Impor selesai: ${r.inserted} tap baru, ${r.skipped} duplikat${r.badLines ? `, ${r.badLines} baris tak dikenali` : ''}.`,
    );
  }

  async function onSavePin(empId: string, pin: string) {
    await run(() => setAttendancePin(empId, pin.trim() || undefined), () => 'PIN diperbarui — log lama ikut terpetakan.');
  }

  async function onSaveShift(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const dto = {
      name: String(f.get('name') ?? ''),
      startTime: String(f.get('startTime')),
      endTime: String(f.get('endTime')),
      checkOutFrom: String(f.get('checkOutFrom')),
      lateAfter: Number(f.get('lateAfter')) || 10,
    };
    const isNew = shiftModal === 'new';
    const r = await run(
      () => (isNew ? createWorkShift(dto) : updateWorkShift((shiftModal as WorkShift).id, dto)),
      () => (isNew ? 'Shift ditambahkan.' : 'Shift diperbarui.'),
    );
    if (r !== undefined) {
      setShiftModal(null);
      loadShifts();
    }
  }

  async function onDeleteShift(s: WorkShift) {
    if (
      await confirm({
        title: `Hapus shift "${s.name}"?`,
        body: `${s._count?.assignments ?? 0} penugasan pegawai ikut dilepas — pegawai kembali ke aturan global.`,
      })
    ) {
      const r = await run(() => deleteWorkShift(s.id), () => 'Shift dihapus.');
      if (r !== undefined) loadShifts();
    }
  }

  const filteredEmpShifts = empShifts.filter((es) => {
    if (assignDay !== '' && es.dayOfWeek !== Number(assignDay)) return false;
    if (assignShiftFilter && es.shiftId !== assignShiftFilter) return false;
    const q = assignSearch.trim().toLowerCase();
    if (q) {
      const hay = `${es.employee?.name ?? ''} ${es.employee?.nip ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  async function onAssignShift(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const employeeId = String(f.get('employeeId') ?? '');
    const shiftId = String(f.get('shiftId') ?? '');
    const dayOfWeek = Number(f.get('dayOfWeek'));
    if (!employeeId || !shiftId) {
      setError('Pilih pegawai & shift dulu.');
      return;
    }
    const r = await run(
      () => assignEmployeeShift({ employeeId, shiftId, dayOfWeek }),
      () => 'Penugasan shift disimpan.',
    );
    if (r !== undefined) {
      setAssignModal(false);
      loadShifts();
    }
  }

  async function onUnassignShift(id: string) {
    const r = await run(() => removeEmployeeShift(id), () => 'Penugasan dilepas.');
    if (r !== undefined) loadShifts();
  }

  async function onManual(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!manualFor) return;
    const f = new FormData(e.currentTarget);
    const when = `${String(f.get('mdate'))} ${String(f.get('mtime'))}`;
    const r = await run(
      () => manualPunch({ employeeId: manualFor.emp.id, punchedAt: when, inOut: manualFor.inOut }),
      () => `Tap ${manualFor.inOut === 1 ? 'pulang' : 'masuk'} ${manualFor.emp.name} tercatat.`,
    );
    if (r !== undefined) setManualFor(null);
  }

  async function onSaveSchedule(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const r = await run(
      () =>
        updateAttendanceSettings({
          workStart: String(f.get('workStart')),
          lateAfter: Number(f.get('lateAfter')) || 0,
          checkOutFrom: String(f.get('checkOutFrom')),
          autoDerive: f.get('autoDerive') === 'on',
        }),
      () => 'Jadwal kerja disimpan.',
    );
    if (r !== undefined && (await confirm({ title: 'Hitung ulang rekap dari log?', body: 'Semua hari yang punya tap akan dihitung ulang statusnya (hadir/telat).', confirmLabel: 'Ya, hitung ulang', danger: false })))
      await run(() => rederiveAttendance(), (r2) => `${r2.derived} hari dihitung ulang.`);
  }

  const iclockUrl = `${API}/iclock/cdata`;

  return (
    <Shell>
      {section ? (
        <Link href="/tata-usaha/absensi" className="text-sm font-semibold text-primary-700 hover:text-primary-800">
          ← Absensi Pegawai
        </Link>
      ) : null}
      <div className={section ? 'mt-2' : ''}>
        <PageTitle
          title={section ? SECTION_TITLES[section] : 'Absensi Pegawai'}
          subtitle={
            section
              ? SECTIONS.find((s) => s.key === section)?.desc
              : 'Absensi fingerprint/face pegawai — disinkronkan ke perhitungan gaji di Keuangan'
          }
        />
      </div>
      {error ? <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p> : null}
      {notice ? <p role="status" className="mb-4 rounded-xl bg-primary-50 px-4 py-3 text-sm font-medium text-primary-800">{notice}</p> : null}

      {!section ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSection(s.key)}
              className="group flex items-center justify-between gap-3 rounded-2xl border border-sand-200 bg-white px-5 py-4 text-left shadow-card transition hover:border-primary-300 hover:shadow-lift"
            >
              <span>
                <span className="block text-sm font-bold text-sand-900 group-hover:text-primary-800">{s.title}</span>
                <span className="mt-0.5 block text-xs text-sand-500">{s.desc}</span>
              </span>
              <span className="text-lg text-sand-300 transition group-hover:translate-x-0.5 group-hover:text-primary-600">→</span>
            </button>
          ))}
        </div>
      ) : null}

      {/* ---------- Harian ---------- */}
      {section === 'harian' ? (
        <Widget
          title={`Absen ${new Date(`${date}T12:00:00`).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`}
          action={
            canManage ? (
              <RowBtn tone="neutral" type="button" disabled={busy} onClick={async () => { if (await confirm({ title: 'Hitung ulang rekap hari ini dari log?', danger: false })) await run(() => rederiveAttendance(), (r) => `${r.derived} hari dihitung ulang.`); }}>
                Hitung Ulang
              </RowBtn>
            ) : undefined
          }
        >
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div className="w-44">
              <Field label="Tanggal">
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
            </div>
            <div className="w-56">
              <Field label="Pegawai">
                <Select value={fEmployee} onChange={(e) => setFEmployee(e.target.value)}>
                  <option value="">Semua pegawai</option>
                  {pins.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
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
          </div>
          <DataTable
            head={['Pegawai', 'PIN', 'Masuk', 'Pulang', 'Status', 'Telat', 'Sumber', canManage ? 'Aksi' : '']}
            loading={dailyLoading}
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
                </td>
                <td className="px-5 py-2.5 font-mono text-xs text-sand-600">{r.employee.fingerPin ?? '—'}</td>
                <td className="px-5 py-2.5 font-semibold text-sand-900">{fmtTime(r.checkInAt)}</td>
                <td className="px-5 py-2.5 font-semibold text-sand-900">{fmtTime(r.checkOutAt)}</td>
                <td className="px-5 py-2.5">
                  {r.status ? <Badge tone={STATUS_TONE[r.status] ?? 'neutral'}>{r.status}</Badge> : <span className="text-xs text-sand-400">belum absen</span>}
                </td>
                <td className="px-5 py-2.5 text-xs text-sand-600">
                  {r.lateMinutes ? `${r.lateMinutes} mnt` : '—'}
                </td>
                <td className="px-5 py-2.5 text-xs text-sand-500">{r.source ? (SOURCE_LABEL[r.source] ?? r.source) : '—'}</td>
                {canManage ? (
                  <td className="whitespace-nowrap px-5 py-2.5">
                    <span className="flex gap-1.5">
                      <RowBtn tone="primary" type="button" onClick={() => setManualFor({ emp: r.employee, inOut: 0 })}>Tap Masuk</RowBtn>
                      <RowBtn tone="neutral" type="button" onClick={() => setManualFor({ emp: r.employee, inOut: 1 })}>Tap Pulang</RowBtn>
                    </span>
                  </td>
                ) : null}
              </tr>
            ))}
          </DataTable>
        </Widget>
      ) : null}

      {/* ---------- Log mesin ---------- */}
      {section === 'log' ? (
        <Widget title="Log Tap Mesin" action={<RowBtn tone="neutral" type="button" onClick={loadLogs}>Muat Ulang</RowBtn>}>
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div className="w-48">
              <Field label="Tanggal (kosong = semua)">
                <Input type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} />
              </Field>
            </div>
            <RowBtn tone="primary" type="button" onClick={loadLogs}>Terapkan</RowBtn>
          </div>
          <DataTable
            head={['Waktu', 'PIN', 'Pegawai', 'Jenis', 'Mesin', 'Sumber']}
            loading={logsLoading}
            error={null}
            empty={logs.length === 0 ? 'Belum ada log — mesin belum mengirim data.' : undefined}
          >
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="whitespace-nowrap px-5 py-2.5 font-semibold text-sand-900">{fmtDT(l.punchedAt)}</td>
                <td className="px-5 py-2.5 font-mono text-xs text-sand-600">{l.pin}</td>
                <td className="px-5 py-2.5 font-medium text-sand-900">
                  {l.employee?.name ?? <span className="text-xs text-sand-400">PIN belum terpetakan</span>}
                </td>
                <td className="px-5 py-2.5"><Badge tone={l.inOut === 1 ? 'neutral' : 'primary'}>{l.inOut === 1 ? 'Pulang' : 'Masuk'}</Badge></td>
                <td className="px-5 py-2.5 text-xs text-sand-500">{l.device?.name ?? l.deviceKey}</td>
                <td className="px-5 py-2.5 text-xs text-sand-500">{SOURCE_LABEL[l.source] ?? l.source}</td>
              </tr>
            ))}
          </DataTable>
        </Widget>
      ) : null}

      {/* ---------- Pemetaan PIN ---------- */}
      {section === 'pin' ? (
        <Widget
          title="PIN Mesin ↔ Pegawai"
          action={<p className="text-xs text-sand-500">PIN = User ID yang tampil di menu pengguna mesin</p>}
        >
          <DataTable head={['Pegawai', 'NIP', 'PIN di mesin', '']} loading={false} error={null} empty={pins.length === 0 ? '—' : undefined}>
            {pins.map((p) => (
              <PinEditor key={p.id} row={p} canManage={canManage} busy={busy} onSave={onSavePin} />
            ))}
          </DataTable>
        </Widget>
      ) : null}

      {/* ---------- Shift kerja ---------- */}
      {section === 'shift' ? (
        <div className="grid gap-5">
          <Widget
            title="Daftar Shift"
            action={canManage ? <Button size="sm" onClick={() => setShiftModal('new')}>+ Shift</Button> : undefined}
          >
            <DataTable
              head={['Nama', 'Masuk', 'Pulang', 'Mulai absen pulang', 'Toleransi', 'Pegawai', '']}
              loading={false}
              error={null}
              empty={shifts.length === 0 ? 'Belum ada shift — buat untuk jam kerja selain aturan global.' : undefined}
            >
              {shifts.map((s) => (
                <tr key={s.id}>
                  <td className="px-5 py-2.5 font-medium text-sand-900">
                    {s.name}
                    {!s.isActive ? <Badge tone="neutral" className="ml-2">nonaktif</Badge> : null}
                  </td>
                  <td className="px-5 py-2.5 font-semibold text-sand-900">{minToHHMM(s.startMinute)}</td>
                  <td className="px-5 py-2.5 font-semibold text-sand-900">{minToHHMM(s.endMinute)}</td>
                  <td className="px-5 py-2.5 text-sand-600">{minToHHMM(s.checkOutFrom)}</td>
                  <td className="px-5 py-2.5 text-xs text-sand-500">{s.lateAfter} mnt</td>
                  <td className="px-5 py-2.5 text-xs text-sand-500">{s._count?.assignments ?? 0}</td>
                  <td className="px-5 py-2.5">
                    {canManage ? (
                      <span className="flex gap-1.5">
                        <RowBtn tone="neutral" type="button" onClick={() => setShiftModal(s)}>Edit</RowBtn>
                        <RowBtn tone="danger" type="button" onClick={() => void onDeleteShift(s)}>Hapus</RowBtn>
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </DataTable>
          </Widget>

          <Widget
            title={`Penugasan Shift ke Pegawai (${filteredEmpShifts.length})`}
            action={canManage ? <Button size="sm" onClick={() => setAssignModal(true)}>+ Pasang Shift</Button> : undefined}
          >
            <div className="mb-4 flex flex-wrap items-end gap-3">
              <div className="w-64">
                <Field label="Cari pegawai">
                  <Input
                    type="search"
                    value={assignSearch}
                    onChange={(e) => setAssignSearch(e.target.value)}
                    placeholder="Nama / NIP…"
                  />
                </Field>
              </div>
              <div className="w-40">
                <Field label="Hari">
                  <Select value={assignDay} onChange={(e) => setAssignDay(e.target.value)}>
                    <option value="">Semua</option>
                    <option value="-1">Tiap hari</option>
                    {['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'].map((d, i) => (
                      <option key={i} value={String(i)}>{d}</option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="w-44">
                <Field label="Shift">
                  <Select value={assignShiftFilter} onChange={(e) => setAssignShiftFilter(e.target.value)}>
                    <option value="">Semua</option>
                    {shifts.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </Select>
                </Field>
              </div>
            </div>
            <DataTable
              head={['Pegawai', 'Shift', 'Hari', 'Jam kerja', '']}
              loading={false}
              error={null}
              empty={
                filteredEmpShifts.length === 0
                  ? empShifts.length === 0
                    ? 'Belum ada penugasan — pegawai memakai aturan jam global.'
                    : 'Tidak ada penugasan yang cocok dengan filter.'
                  : undefined
              }
            >
              {filteredEmpShifts.map((es) => (
                <tr key={es.id}>
                  <td className="px-5 py-2.5 font-medium text-sand-900">
                    {es.employee?.name ?? '—'}
                    <span className="ml-1 text-xs text-sand-400">{es.employee?.nip ?? ''}</span>
                  </td>
                  <td className="px-5 py-2.5 font-medium text-sand-800">{es.shift.name}</td>
                  <td className="px-5 py-2.5 text-xs text-sand-600">
                    {es.dayOfWeek === -1 ? 'Tiap hari' : ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][es.dayOfWeek]}
                  </td>
                  <td className="px-5 py-2.5 text-xs text-sand-500">
                    {minToHHMM(es.shift.startMinute)}–{minToHHMM(es.shift.endMinute)}
                  </td>
                  <td className="px-5 py-2.5">
                    {canManage ? (
                      <RowBtn tone="danger" type="button" onClick={() => void onUnassignShift(es.id)}>Lepas</RowBtn>
                    ) : null}
                  </td>
                </tr>
              ))}
            </DataTable>
          </Widget>
        </div>
      ) : null}

      {/* ---------- Perangkat ---------- */}
      {section === 'perangkat' ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <Widget
            title="Perangkat Terdaftar"
            action={canManage ? <Button size="sm" onClick={() => setDevModal('new')}>+ Perangkat</Button> : undefined}
          >
            <DataTable head={['Nama', 'SN', 'Mode', 'Terakhir terlihat', 'Aksi']} loading={false} error={null} empty={devices.length === 0 ? 'Belum ada perangkat — tambahkan atau biarkan mesin mendaftar otomatis saat push pertama.' : undefined}>
              {devices.map((d) => (
                <tr key={d.id}>
                  <td className="px-5 py-2.5 font-medium text-sand-900">{d.name}<span className="ml-1 text-xs text-sand-400">{d.location ?? ''}</span></td>
                  <td className="px-5 py-2.5 font-mono text-xs text-sand-600">{d.serial}</td>
                  <td className="px-5 py-2.5"><Badge tone={d.isActive ? 'primary' : 'neutral'}>{d.mode}</Badge></td>
                  <td className="px-5 py-2.5 text-xs text-sand-500">{d.lastSeenAt ? fmtDT(d.lastSeenAt) : 'belum pernah terhubung'}</td>
                  <td className="px-5 py-2.5">
                    <span className="flex gap-1.5">
                      {d.mode === 'PULL' && canManage ? <RowBtn tone="primary" type="button" disabled={busy} onClick={() => void onPull(d)}>Tarik</RowBtn> : null}
                      {canManage ? <RowBtn tone="neutral" type="button" onClick={() => setDevModal(d)}>Edit</RowBtn> : null}
                      {canManage ? <RowBtn tone="danger" type="button" onClick={() => void onDeleteDevice(d)}>Hapus</RowBtn> : null}
                    </span>
                  </td>
                </tr>
              ))}
            </DataTable>
          </Widget>

          <div className="space-y-5">
            <Widget title="Cara Menghubungkan (iClock/ADMS)">
              <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-sand-700">
                <li>Di mesin, buka <b>Menu → COMM → Cloud Server / ADMS</b>.</li>
                <li>Aktifkan ADMS, isi <b>Server Address</b> = alamat server aplikasi ini, <b>Port</b> = port API.</li>
                <li>URL efektif yang dipanggil mesin:
                  <code className="mt-1 block break-all rounded-lg bg-sand-100 px-3 py-2 text-xs font-semibold text-sand-800">{iclockUrl}</code>
                </li>
                <li>Simpan — mesin akan mengirim log tap otomatis tiap ada absen (Realtime). Perangkat baru terdaftar otomatis dari nomor serinya.</li>
                <li>Mode <b>PULL</b>: isi IP mesin di data perangkat, lalu tekan <b>Tarik</b> — server mengambil log via TCP 4370 (harus satu jaringan).</li>
                <li>Tanpa koneksi jaringan? Ekspor attlog ke USB lalu impor di sini.</li>
              </ol>
            </Widget>

            {canManage ? (
              <Widget title="Impor File Attlog">
                <div className="space-y-3">
                  <Field label="Perangkat asal file">
                    <Select value={importDevice} onChange={(e) => setImportDevice(e.target.value)}>
                      {devices.map((d) => <option key={d.id} value={d.serial}>{d.name} ({d.serial})</option>)}
                      {devices.length === 0 ? <option value="">— tambah perangkat dulu —</option> : null}
                    </Select>
                  </Field>
                  <input ref={importRef} type="file" accept=".dat,.txt,.csv" className="hidden" onChange={onImport} />
                  <Button size="sm" variant="outline" disabled={busy || devices.length === 0} onClick={() => importRef.current?.click()}>
                    Pilih File &amp; Impor
                  </Button>
                  <p className="text-xs text-sand-500">Format: tiap baris <code>PIN &lt;tab&gt; YYYY-MM-DD HH:mm:ss</code> — ekspor standar mesin ZKTeco/kompatibel.</p>
                </div>
              </Widget>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* ---------- Jadwal kerja ---------- */}
      {section === 'jadwal' && schedForm ? (
        <Widget title="Aturan Derivasi Otomatis">
          <form className="grid max-w-xl gap-4" onSubmit={onSaveSchedule}>
            <Field label="Jam masuk kerja" hint="Tap setelah jam ini + toleransi dihitung TELAT">
              <Input type="time" name="workStart" defaultValue={schedForm.workStart} required disabled={!canManage} />
            </Field>
            <Field label="Toleransi telat (menit)">
              <Input type="number" name="lateAfter" min={0} max={240} defaultValue={schedForm.lateAfter} required disabled={!canManage} />
            </Field>
            <Field label="Jam mulai absen pulang" hint="Tap mulai jam ini dihitung sebagai absen pulang">
              <Input type="time" name="checkOutFrom" defaultValue={schedForm.checkOutFrom} required disabled={!canManage} />
            </Field>
            <label className="flex items-center gap-2 text-sm font-semibold text-sand-700">
              <input type="checkbox" name="autoDerive" defaultChecked={schedForm.autoDerive} className="accent-primary-700" disabled={!canManage} />
              Derivasi otomatis — tap mesin langsung mengisi absen harian
            </label>
            {canManage ? (
              <div>
                <Button type="submit" disabled={busy}>Simpan Jadwal</Button>
              </div>
            ) : null}
          </form>
        </Widget>
      ) : null}

      {/* ---------- Modal shift ---------- */}
      <Modal open={shiftModal !== null} onClose={() => setShiftModal(null)} title={shiftModal === 'new' ? 'Tambah Shift' : 'Edit Shift'}>
        <form className="grid gap-4" onSubmit={onSaveShift}>
          <Field label="Nama shift">
            <Input name="name" required defaultValue={shiftModal === 'new' ? '' : (shiftModal as WorkShift)?.name} placeholder="Pagi / Siang / Malam" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Jam masuk">
              <Input type="time" name="startTime" required defaultValue={shiftModal === 'new' ? '07:00' : minToHHMM((shiftModal as WorkShift)?.startMinute ?? 420)} />
            </Field>
            <Field label="Jam pulang">
              <Input type="time" name="endTime" required defaultValue={shiftModal === 'new' ? '15:00' : minToHHMM((shiftModal as WorkShift)?.endMinute ?? 900)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Mulai absen pulang" hint="Tap ≥ jam ini = pulang">
              <Input type="time" name="checkOutFrom" required defaultValue={shiftModal === 'new' ? '14:00' : minToHHMM((shiftModal as WorkShift)?.checkOutFrom ?? 840)} />
            </Field>
            <Field label="Toleransi telat (menit)">
              <Input type="number" name="lateAfter" min={0} max={240} required defaultValue={(shiftModal as WorkShift)?.lateAfter ?? 10} />
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setShiftModal(null)}>Batal</Button>
            <Button type="submit" disabled={busy}>Simpan</Button>
          </div>
        </form>
      </Modal>

      {/* ---------- Modal pasang shift ---------- */}
      <Modal open={assignModal} onClose={() => setAssignModal(false)} title="Pasang Shift ke Pegawai">
        <form className="grid gap-4" onSubmit={onAssignShift}>
          <Field label="Pegawai">
            <Select name="employeeId" required defaultValue="">
              <option value="" disabled>Pilih pegawai…</option>
              {pins.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.nip ? ` · ${p.nip}` : ''}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Shift" hint="Jam kerja shift ini menggantikan aturan global untuk hari terpilih">
            <Select name="shiftId" required defaultValue="">
              <option value="" disabled>Pilih shift…</option>
              {shifts.filter((s) => s.isActive).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({minToHHMM(s.startMinute)}–{minToHHMM(s.endMinute)})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Hari" hint="'Tiap hari' = berlaku semua hari; hari spesifik menimpa aturan tiap hari">
            <Select name="dayOfWeek" defaultValue="-1">
              <option value="-1">Tiap hari</option>
              {['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'].map((d, i) => (
                <option key={i} value={String(i)}>{d}</option>
              ))}
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setAssignModal(false)}>Batal</Button>
            <Button type="submit" disabled={busy}>Pasang</Button>
          </div>
        </form>
      </Modal>

      {/* ---------- Modal perangkat ---------- */}
      <Modal open={devModal !== null} onClose={() => setDevModal(null)} title={devModal === 'new' ? 'Tambah Perangkat' : 'Edit Perangkat'}>
        <form className="grid gap-4" onSubmit={onSaveDevice}>
          <Field label="Nama perangkat">
            <Input name="name" required defaultValue={devModal === 'new' ? '' : (devModal as AttendanceDevice)?.name} placeholder="Mesin lobby TU" />
          </Field>
          <Field label="Nomor seri (SN)" hint="Lihat di mesin: Menu → System Info → Serial Number">
            <Input name="serial" required defaultValue={devModal === 'new' ? '' : (devModal as AttendanceDevice)?.serial} placeholder="A6CK123456789" />
          </Field>
          <Field label="Mode sinkronisasi">
            <Select name="mode" defaultValue={devModal === 'new' ? 'ICLOCK' : (devModal as AttendanceDevice)?.mode}>
              <option value="ICLOCK">iClock/ADMS — mesin push ke server (disarankan)</option>
              <option value="PULL">PULL — server tarik log via TCP 4370</option>
              <option value="MANUAL">Manual — hanya impor file</option>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="IP mesin (mode PULL)">
              <Input name="host" defaultValue={(devModal as AttendanceDevice)?.host ?? ''} placeholder="192.168.1.50" />
            </Field>
            <Field label="Port">
              <Input name="port" type="number" defaultValue={(devModal as AttendanceDevice)?.port ?? 4370} />
            </Field>
          </div>
          <Field label="Comm key (bila mesin pakai)">
            <Input name="commKey" defaultValue={(devModal as AttendanceDevice)?.commKey ?? ''} />
          </Field>
          <Field label="Lokasi">
            <Input name="location" defaultValue={(devModal as AttendanceDevice)?.location ?? ''} placeholder="Ruang TU" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setDevModal(null)}>Batal</Button>
            <Button type="submit" disabled={busy}>Simpan</Button>
          </div>
        </form>
      </Modal>

      {/* ---------- Modal tap manual ---------- */}
      <Modal
        open={manualFor !== null}
        onClose={() => setManualFor(null)}
        title={`Tap ${manualFor?.inOut === 1 ? 'Pulang' : 'Masuk'} — ${manualFor?.emp.name ?? ''}`}
      >
        <form className="grid gap-4" onSubmit={onManual}>
          <p className={`rounded-xl px-3 py-2 text-sm font-medium ${manualFor?.inOut === 1 ? 'bg-sand-100 text-sand-700' : 'bg-primary-50 text-primary-800'}`}>
            {manualFor?.inOut === 1
              ? 'Tap ini dicatat sebagai absen PULANG — masuk ke kolom Pulang & jadi tap pulang terakhir hari itu.'
              : 'Tap ini dicatat sebagai absen MASUK — masuk ke kolom Masuk & menentukan status HADIR/TELAT.'}
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

      {dialog}
    </Shell>
  );
}

/** Baris edit PIN per pegawai — state lokal agar tak re-render tabel penuh. */
function PinEditor({
  row,
  canManage,
  busy,
  onSave,
}: {
  row: PinRow;
  canManage: boolean;
  busy: boolean;
  onSave: (empId: string, pin: string) => Promise<void>;
}) {
  const [pin, setPin] = useState(row.fingerPin ?? '');
  const [saved, setSaved] = useState(false);
  useEffect(() => setPin(row.fingerPin ?? ''), [row.fingerPin]);
  return (
    <tr>
      <td className="px-5 py-2.5 font-medium text-sand-900">{row.name}</td>
      <td className="px-5 py-2.5 text-xs text-sand-500">{row.nip ?? '—'}</td>
      <td className="px-5 py-2.5">
        <Input
          aria-label={`PIN ${row.name}`}
          value={pin}
          disabled={!canManage}
          placeholder="mis. 101"
          className="w-32 font-mono"
          onChange={(e) => { setPin(e.target.value); setSaved(false); }}
        />
      </td>
      <td className="px-5 py-2.5">
        {canManage ? (
          <span className="flex items-center gap-2">
            <RowBtn tone="primary" type="button" disabled={busy} onClick={async () => { await onSave(row.id, pin); setSaved(true); }}>
              Simpan
            </RowBtn>
            {saved ? <span className="text-xs text-emerald-600">tersimpan</span> : null}
          </span>
        ) : null}
      </td>
    </tr>
  );
}
