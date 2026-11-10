'use client';

import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';
import { Badge, Button, Field, Input, Modal, Select } from '@smpmuh3/ui';
import { PERMISSIONS } from '@smpmuh3/types';
import { Shell } from '@/components/shell';
import { PageTitle, Widget } from '@/components/widgets';
import {
  getAttendanceMonthly,
  getEmployee,
  me,
  updateEmployee,
  type AttendanceDayRow,
  type EmployeeDetail,
  type EmployeeMonthly,
} from '@/lib/api';

const DOW = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const DOW_FULL = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const STATUS_TONE: Record<string, 'primary' | 'accent' | 'neutral' | 'danger'> = {
  HADIR: 'primary',
  TELAT: 'accent',
  IZIN: 'neutral',
  SAKIT: 'neutral',
  ALPHA: 'danger',
};
const fmtTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '—';
const minToHHMM = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const thisMonth = () => new Date().toISOString().slice(0, 7);
const DEPT_LABEL: Record<string, string> = {
  KURIKULUM: 'Kurikulum', KESISWAAN: 'Kesiswaan', TATA_USAHA: 'Tata Usaha',
  KEUANGAN: 'Keuangan', HUMAS: 'Humas', LAINNYA: 'Lainnya',
};

export default function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [emp, setEmp] = useState<EmployeeDetail | null>(null);
  const [month, setMonth] = useState(thisMonth());
  const [att, setAtt] = useState<EmployeeMonthly | null>(null);
  const [attLoading, setAttLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadEmp = useCallback(() => {
    getEmployee(id)
      .then(setEmp)
      .catch(() => setError('Pegawai tidak ditemukan.'));
  }, [id]);

  const loadAtt = useCallback(() => {
    setAttLoading(true);
    getAttendanceMonthly(id, month)
      .then(setAtt)
      .catch(() => setError('Gagal memuat absensi bulanan.'))
      .finally(() => setAttLoading(false));
  }, [id, month]);

  useEffect(() => {
    loadEmp();
    me()
      .then((u) => setCanManage(u.permissions.includes(PERMISSIONS.EMPLOYEE_MANAGE)))
      .catch(() => undefined);
  }, [loadEmp]);

  useEffect(() => loadAtt(), [loadAtt]);

  async function onSaveEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!emp) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await updateEmployee(emp.id, {
        name: String(f.get('name') ?? emp.name),
        nip: String(f.get('nip') ?? '') || undefined,
        type: String(f.get('type') ?? emp.type),
        email: String(f.get('email') ?? '') || undefined,
        phone: String(f.get('phone') ?? '') || undefined,
        department: String(f.get('department') ?? '') || null,
        isDeptHead: f.get('isDeptHead') === 'on',
        isActive: f.get('isActive') === 'on',
      });
      setEditModal(false);
      loadEmp();
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : 'Gagal menyimpan perubahan.');
    } finally {
      setBusy(false);
    }
  }

  const byDate = new Map<string, AttendanceDayRow>(
    (att?.days ?? []).map((d) => [String(d.date).slice(0, 10), d]),
  );

  // Bangun grid kalender bulan ini — Senin pertama.
  const [y, mo] = month.split('-').map(Number);
  const daysInMonth = new Date(y!, mo!, 0).getDate();
  const firstDow = new Date(Date.UTC(y!, mo! - 1, 1)).getUTCDay(); // 0=Min
  const offset = (firstDow + 6) % 7; // Senin=0
  const cells: (number | null)[] = [
    ...Array<null>(offset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const waPhone = emp?.phone?.replace(/^0/, '62').replace(/\D/g, '') ?? '';
  const lateTotal = (att?.days ?? []).reduce((s, d) => s + (d.lateMinutes || 0), 0);
  const hadirCount = (att?.days ?? []).filter((d) => d.status === 'HADIR' || d.status === 'TELAT').length;

  return (
    <Shell>
      <Link href="/kepegawaian" className="text-sm font-semibold text-primary-700 hover:text-primary-800">
        ← Data Pegawai
      </Link>
      {error ? (
        <p role="alert" className="mt-2 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
      ) : null}
      {!emp ? (
        <p className="mt-4 text-sm text-sand-500">Memuat…</p>
      ) : (
        <>
          <div className="mt-2">
            <PageTitle
              title={emp.name}
              subtitle={`${emp.type === 'TEACHER' ? 'Guru' : 'Staf'}${emp.nip ? ` · NIP/NUPTK ${emp.nip}` : ''}`}
              actions={
                <span className="flex items-center gap-2">
                  <Badge tone={emp.isActive ? 'primary' : 'neutral'}>{emp.isActive ? 'Aktif' : 'Nonaktif'}</Badge>
                  {canManage ? (
                    <Button size="sm" variant="outline" onClick={() => setEditModal(true)}>
                      Edit Data
                    </Button>
                  ) : null}
                  {waPhone ? (
                    <a
                      href={`https://wa.me/${waPhone}?text=${encodeURIComponent(`Assalamu'alaikum ${emp.name}, `)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700"
                    >
                      Chat WhatsApp
                    </a>
                  ) : null}
                </span>
              }
            />
          </div>

          <div className="mb-5 grid gap-4 lg:grid-cols-3">
            <Widget title="Data Pegawai">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <dt className="text-sand-500">NIP/NUPTK</dt>
                <dd className="font-medium text-sand-900">{emp.nip ?? '—'}</dd>
                <dt className="text-sand-500">Jenis</dt>
                <dd className="font-medium text-sand-900">{emp.type === 'TEACHER' ? 'Guru' : 'Staf'}</dd>
                <dt className="text-sand-500">Telepon</dt>
                <dd className="font-medium text-sand-900">{emp.phone ?? '—'}</dd>
                <dt className="text-sand-500">Email</dt>
                <dd className="font-medium text-sand-900">{emp.email ?? '—'}</dd>
                <dt className="text-sand-500">Bidang</dt>
                <dd className="font-medium text-sand-900">
                  {emp.department
                    ? `${DEPT_LABEL[emp.department] ?? emp.department}${emp.isDeptHead ? ' · Kepala' : ''}`
                    : '—'}
                </dd>
                <dt className="text-sand-500">Golongan gaji</dt>
                <dd className="font-medium text-sand-900">
                  {emp.payScale ? `${emp.payScale.name} (Rp${emp.payScale.hourlyRate.toLocaleString('id-ID')}/jam)` : '—'}
                </dd>
                <dt className="text-sand-500">Wali kelas</dt>
                <dd className="font-medium text-sand-900">
                  {emp.homeroomFor?.length
                    ? emp.homeroomFor.map((h) => `${h.name} (${h.academicYear.name})`).join(', ')
                    : '—'}
                </dd>
              </dl>
            </Widget>

            <Widget title="Penugasan Mengajar" className="lg:col-span-2">
              {emp.assignments?.length ? (
                <ul className="space-y-2 text-sm">
                  {emp.assignments.map((a) => (
                    <li key={a.id} className="rounded-xl border border-sand-200 px-3 py-2">
                      <p className="font-semibold text-sand-900">
                        {a.subject.name} → {a.class.name}
                        {a.academicYear.isActive ? (
                          <Badge tone="primary" className="ml-2">{a.academicYear.name}</Badge>
                        ) : (
                          <span className="ml-2 text-xs text-sand-400">{a.academicYear.name}</span>
                        )}
                      </p>
                      {a.schedules.length ? (
                        <p className="mt-0.5 text-xs text-sand-500">
                          {a.schedules
                            .map((s) => `${DOW_FULL[s.day] ?? s.day} ${minToHHMM(s.startMinute)}–${minToHHMM(s.endMinute)}${s.room ? ` @${s.room}` : ''}`)
                            .join(' · ')}
                        </p>
                      ) : (
                        <p className="mt-0.5 text-xs text-sand-400">Belum ada jam — atur di Kurikulum → Jadwal.</p>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-sand-500">Belum ada penugasan mengajar — atur di Kurikulum → Jadwal & Penugasan.</p>
              )}
            </Widget>
          </div>

          <Widget
            title="Kalender Absensi"
            action={
              <div className="w-36">
                <Field label="Bulan">
                  <input
                    type="month"
                    value={month}
                    onChange={(e) => setMonth(e.target.value)}
                    className="h-9 w-full rounded-xl border border-sand-300 bg-white px-3 text-sm font-medium text-sand-800"
                    aria-label="Bulan absensi"
                  />
                </Field>
              </div>
            }
          >
            <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-sand-600">
              <span><b className="text-sand-900">{hadirCount}</b> hari hadir</span>
              <span><b className="text-amber-700">{lateTotal}</b> menit telat (akumulasi ke potongan gaji)</span>
              {attLoading ? <span className="text-sand-400">memuat…</span> : null}
            </div>
            <div className="grid grid-cols-7 gap-1.5 text-center text-xs">
              {DOW.map((d) => (
                <p key={d} className="pb-1 font-bold uppercase tracking-wider text-sand-400">{d}</p>
              ))}
              {cells.map((d, i) => {
                if (d === null) return <span key={`e${i}`} />;
                const iso = `${month}-${String(d).padStart(2, '0')}`;
                const rec = byDate.get(iso);
                const today = new Date().toISOString().slice(0, 10) === iso;
                return (
                  <div
                    key={iso}
                    title={rec?.note ?? undefined}
                    className={`min-h-16 rounded-xl border px-1.5 py-1 text-left ${
                      today ? 'border-primary-400 bg-primary-50' : 'border-sand-200 bg-white'
                    } ${rec?.status === 'ALPHA' ? 'border-red-200 bg-red-50' : ''}`}
                  >
                    <p className={`text-[11px] font-bold ${today ? 'text-primary-700' : 'text-sand-500'}`}>{d}</p>
                    {rec ? (
                      <div className="mt-0.5 space-y-0.5">
                        <Badge tone={STATUS_TONE[rec.status] ?? 'neutral'} className="px-1 py-0 text-[9px]">
                          {rec.status}
                        </Badge>
                        <p className="text-[10px] leading-tight text-sand-700">
                          {fmtTime(rec.checkInAt)}–{fmtTime(rec.checkOutAt)}
                        </p>
                        {rec.lateMinutes ? (
                          <p className="text-[9px] font-semibold text-amber-700">+{rec.lateMinutes} mnt</p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {att?.shifts.length ? (
              <p className="mt-3 text-xs text-sand-500">
                Shift:{' '}
                {att.shifts
                  .map((s) => `${s.shift.name} (${s.dayOfWeek === -1 ? 'tiap hari' : DOW_FULL[s.dayOfWeek]})`)
                  .join(' · ')}
              </p>
            ) : (
              <p className="mt-3 text-xs text-sand-400">Memakai aturan jam kerja global — atur shift di Kurikulum → Jadwal Kerja.</p>
            )}
          </Widget>

          <Modal open={editModal} onClose={() => setEditModal(false)} title="Edit Data Pegawai">
            <form onSubmit={onSaveEdit} className="grid gap-4 sm:grid-cols-2">
              <Field label="Nama Lengkap" className="sm:col-span-2">
                <Input name="name" required defaultValue={emp.name} />
              </Field>
              <Field label="NIP/NUPTK" hint="Kosongkan untuk menghapus NIP/NUPTK">
                <Input name="nip" defaultValue={emp.nip ?? ''} />
              </Field>
              <Field label="Jenis">
                <Select name="type" defaultValue={emp.type}>
                  <option value="TEACHER">Guru</option>
                  <option value="STAFF">Staf</option>
                </Select>
              </Field>
              <Field label="Email" hint={emp.userId ? 'Tersinkron ke akun login — harus unik' : undefined}>
                <Input name="email" type="email" defaultValue={emp.email ?? ''} />
              </Field>
              <Field label="Telepon" hint={emp.userId ? 'Tersinkron ke akun login — harus unik' : undefined}>
                <Input name="phone" defaultValue={emp.phone ?? ''} />
              </Field>
              <Field label="Bidang">
                <Select name="department" defaultValue={emp.department ?? ''}>
                  <option value="">— Belum ditugaskan —</option>
                  {Object.entries(DEPT_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </Select>
              </Field>
              <div className="grid gap-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-sand-700">
                  <input type="checkbox" name="isDeptHead" defaultChecked={emp.isDeptHead} className="size-4 accent-primary-700" />
                  Kepala bidang
                </label>
                <label className="flex items-center gap-2 text-sm font-semibold text-sand-700">
                  <input type="checkbox" name="isActive" defaultChecked={emp.isActive} className="size-4 accent-primary-700" />
                  Aktif
                </label>
              </div>
              <div className="sm:col-span-2 flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setEditModal(false)}>Batal</Button>
                <Button type="submit" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</Button>
              </div>
            </form>
          </Modal>
        </>
      )}
    </Shell>
  );
}
