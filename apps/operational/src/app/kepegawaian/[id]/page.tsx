'use client';

import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';
import { Badge, Button, Field, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { PageTitle, Widget } from '@/components/widgets';
import {
  getAttendanceMonthly,
  getEmployee,
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

  const loadAtt = useCallback(() => {
    setAttLoading(true);
    getAttendanceMonthly(id, month)
      .then(setAtt)
      .catch(() => setError('Gagal memuat absensi bulanan.'))
      .finally(() => setAttLoading(false));
  }, [id, month]);

  useEffect(() => {
    getEmployee(id)
      .then(setEmp)
      .catch(() => setError('Pegawai tidak ditemukan.'));
  }, [id]);

  useEffect(() => loadAtt(), [loadAtt]);

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
              subtitle={`${emp.type === 'TEACHER' ? 'Guru' : 'Staf'}${emp.nip ? ` · NIP ${emp.nip}` : ''}`}
              actions={
                <span className="flex items-center gap-2">
                  <Badge tone={emp.isActive ? 'primary' : 'neutral'}>{emp.isActive ? 'Aktif' : 'Nonaktif'}</Badge>
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
                <dt className="text-sand-500">NIP</dt>
                <dd className="font-medium text-sand-900">{emp.nip ?? '—'}</dd>
                <dt className="text-sand-500">Jenis</dt>
                <dd className="font-medium text-sand-900">{emp.type === 'TEACHER' ? 'Guru' : 'Staf'}</dd>
                <dt className="text-sand-500">Telepon</dt>
                <dd className="font-medium text-sand-900">{emp.phone ?? '—'}</dd>
                <dt className="text-sand-500">Email</dt>
                <dd className="font-medium text-sand-900">{emp.email ?? '—'}</dd>
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
              <p className="mt-3 text-xs text-sand-400">Memakai aturan jam kerja global — atur shift di Absensi → Shift Kerja.</p>
            )}
          </Widget>
        </>
      )}
    </Shell>
  );
}
