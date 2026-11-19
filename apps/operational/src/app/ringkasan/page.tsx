'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Badge } from '@smpmuh3/ui';
import { REGISTRATION_STATUS_LABELS, type NotificationDto, type RegistrationStatus } from '@smpmuh3/types';
import { Shell } from '@/components/shell';
import { PageTitle, StatCard, Widget } from '@/components/widgets';
import {
  getFinanceSummary,
  listAcademicYears,
  listAttendanceDaily,
  listEmployees,
  listNotifications,
  listStudents,
  spmbSummary,
  type DailyRow,
  type FinanceSummary,
  type SpmbSummary,
} from '@/lib/api';
import {
  attendanceDailyOverview,
  listMonitorExams,
  type DailyOverview,
} from '@/lib/api-ops';

const rp = (n: number) => `Rp ${n.toLocaleString('id-ID')}`;

const dateParam = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const STAFF_STATUS: Record<string, { label: string; tone: 'primary' | 'accent' | 'neutral' | 'danger' }> = {
  HADIR: { label: 'Hadir', tone: 'primary' },
  TELAT: { label: 'Telat', tone: 'accent' },
  IZIN: { label: 'Izin', tone: 'neutral' },
  SAKIT: { label: 'Sakit', tone: 'neutral' },
  ALPHA: { label: 'Alpha', tone: 'danger' },
};

const SPMB_STATES: RegistrationStatus[] = [
  'SUBMITTED', 'DOCUMENT_REVIEW', 'NEEDS_REVISION', 'VERIFIED', 'ACCEPTED', 'REJECTED',
];

/** Ringkasan eksekutif untuk Kepala Sekolah — semua read-only, tanpa aksi
 *  perubahan data. Tiap widget punya tautan ke halaman laporan detailnya. */
export default function RingkasanPage() {
  const [students, setStudents] = useState<number | null>(null);
  const [employees, setEmployees] = useState<number | null>(null);
  const [spmb, setSpmb] = useState<SpmbSummary | null>(null);
  const [fin, setFin] = useState<FinanceSummary | null>(null);
  const [studentAtt, setStudentAtt] = useState<DailyOverview | null>(null);
  const [staffAtt, setStaffAtt] = useState<DailyRow[] | null>(null);
  const [exams, setExams] = useState<Awaited<ReturnType<typeof listMonitorExams>> | null>(null);
  const [notes, setNotes] = useState<NotificationDto[]>([]);

  useEffect(() => {
    const date = dateParam();
    listStudents({ status: 'ACTIVE' }).then((s) => setStudents(s.length)).catch(() => setStudents(null));
    listEmployees().then((e) => setEmployees(e.filter((x) => x.isActive).length)).catch(() => setEmployees(null));
    spmbSummary().then(setSpmb).catch(() => undefined);
    getFinanceSummary({}).then(setFin).catch(() => undefined);
    listAcademicYears()
      .then((ys) => ys.find((y) => y.isActive)?.id)
      .then((yid) => attendanceDailyOverview(date, yid).then(setStudentAtt))
      .catch(() => undefined);
    listAttendanceDaily(date).then(setStaffAtt).catch(() => setStaffAtt(null));
    listMonitorExams().then(setExams).catch(() => setExams([]));
    listNotifications().then((n) => setNotes(n.slice(0, 5))).catch(() => undefined);
  }, []);

  const staffCount = (s: string) => staffAtt?.filter((r) => r.status === s).length ?? 0;
  const staffRecorded = staffAtt?.filter((r) => r.status !== null).length ?? 0;

  return (
    <Shell>
      <PageTitle
        title="Ringkasan Sekolah"
        subtitle="Pantauan kinerja & data sekolah — tampilan khusus pimpinan (baca saja)"
      />

      {/* ---------- KPI utama ---------- */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Siswa Aktif" value={students === null ? '…' : String(students)} />
        <StatCard label="Pegawai Aktif" value={employees === null ? '…' : String(employees)} accent="accent" />
        <StatCard label="Pendaftar SPMB" value={spmb ? String(spmb.total) : '…'} />
        <StatCard label="Saldo Kas & Bank" value={fin ? rp(fin.balance) : '…'} accent="accent" />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {/* ---------- Absensi siswa hari ini ---------- */}
        <Widget
          title="Absensi Siswa Hari Ini"
          {...(studentAtt ? { subtitle: `${studentAtt.summary.takenClasses}/${studentAtt.summary.classes} rombel terabsen · ${studentAtt.academicYear.name}` } : {})}
          action={<Link href="/kesiswaan/absensi" className="text-xs font-semibold text-primary-700 hover:underline">Detail →</Link>}
        >
          {!studentAtt ? (
            <p className="p-5 text-sm text-sand-400">Memuat…</p>
          ) : (
            <>
              <div className="grid grid-cols-4 gap-2 p-4 text-center">
                {([
                  ['Hadir', studentAtt.summary.present, 'text-emerald-700 bg-emerald-50'],
                  ['Sakit', studentAtt.summary.sick, 'text-orange-700 bg-orange-50'],
                  ['Izin', studentAtt.summary.permit, 'text-blue-700 bg-blue-50'],
                  ['Alpha', studentAtt.summary.absent, 'text-red-700 bg-red-50'],
                ] as const).map(([l, v, c]) => (
                  <div key={l} className={`rounded-xl px-2 py-3 ${c}`}>
                    <p className="text-xl font-black">{v}</p>
                    <p className="text-[11px] font-bold uppercase tracking-wide">{l}</p>
                  </div>
                ))}
              </div>
              <div className="max-h-64 divide-y divide-sand-50 overflow-y-auto border-t border-sand-100">
                {studentAtt.classes.map((c) => (
                  <div key={c.classId} className="flex items-center gap-3 px-5 py-2 text-sm">
                    <span className="w-20 font-bold text-sand-800">{c.name}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-sand-100">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${c.students ? (c.present / c.students) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="w-20 text-right text-xs text-sand-500">
                      {c.present}/{c.students}{!c.taken ? ' · belum' : ''}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Widget>

        {/* ---------- Absensi pegawai hari ini ---------- */}
        <Widget
          title="Absensi Pegawai Hari Ini"
          {...(staffAtt ? { subtitle: `${staffRecorded}/${staffAtt.length} pegawai tercatat` } : {})}
          action={<Link href="/tata-usaha/absensi" className="text-xs font-semibold text-primary-700 hover:underline">Detail →</Link>}
        >
          {!staffAtt ? (
            <p className="p-5 text-sm text-sand-400">Memuat…</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2 p-4">
                {Object.entries(STAFF_STATUS).map(([k, v]) => (
                  <span key={k} className="inline-flex items-center gap-1.5 rounded-xl bg-sand-50 px-3 py-2">
                    <Badge tone={v.tone}>{staffCount(k)}</Badge>
                    <span className="text-xs font-semibold text-sand-600">{v.label}</span>
                  </span>
                ))}
              </div>
              <div className="max-h-64 divide-y divide-sand-50 overflow-y-auto border-t border-sand-100">
                {staffAtt.filter((r) => r.status === 'TELAT' || r.status === 'ALPHA').map((r) => (
                  <div key={r.employee.id} className="flex items-center gap-3 px-5 py-2 text-sm">
                    <span className="flex-1 truncate font-medium text-sand-800">{r.employee.name}</span>
                    <span className="text-xs text-sand-400">
                      {r.checkInAt ? new Date(r.checkInAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                    <Badge tone={STAFF_STATUS[r.status!]?.tone ?? 'neutral'}>
                      {STAFF_STATUS[r.status!]?.label ?? r.status}
                    </Badge>
                  </div>
                ))}
                {!staffAtt.some((r) => r.status === 'TELAT' || r.status === 'ALPHA') ? (
                  <p className="px-5 py-3 text-xs text-sand-400">Tidak ada keterlambatan/alpha hari ini.</p>
                ) : null}
              </div>
            </>
          )}
        </Widget>

        {/* ---------- Ujian CBT ---------- */}
        <Widget
          title="Ujian CBT"
          subtitle="Ujian yang terjadwal / sedang berjalan"
          action={<Link href="/monitor-cbt" className="text-xs font-semibold text-primary-700 hover:underline">Monitor →</Link>}
        >
          {!exams ? (
            <p className="p-5 text-sm text-sand-400">Memuat…</p>
          ) : exams.length === 0 ? (
            <p className="p-5 text-sm text-sand-400">Tidak ada ujian terjadwal saat ini.</p>
          ) : (
            <ul className="divide-y divide-sand-50">
              {exams.slice(0, 6).map((x) => (
                <li key={x.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-sand-900">{x.title}</span>
                    <span className="text-xs text-sand-500">
                      {x.classes.map((c) => c.name).join(', ') || '—'} · {new Date(x.startAt).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </span>
                  <Badge tone={x.status === 'OPEN' ? 'primary' : x.status === 'CLOSED' ? 'danger' : 'neutral'}>
                    {x.status === 'OPEN' ? 'Berjalan' : x.status === 'CLOSED' ? 'Tutup' : 'Draf'}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Widget>

        {/* ---------- Keuangan ---------- */}
        <Widget
          title="Keuangan Tahun Ini"
          subtitle="Pemasukan vs pengeluaran"
          action={<Link href="/keuangan/laporan" className="text-xs font-semibold text-primary-700 hover:underline">Laporan →</Link>}
        >
          {!fin ? (
            <p className="p-5 text-sm text-sand-400">Memuat…</p>
          ) : (
            <div className="space-y-3 p-4">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-emerald-50 px-2 py-3">
                  <p className="text-sm font-black text-emerald-700">{rp(fin.income)}</p>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-600">Masuk</p>
                </div>
                <div className="rounded-xl bg-red-50 px-2 py-3">
                  <p className="text-sm font-black text-red-700">{rp(fin.expense)}</p>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-red-600">Keluar</p>
                </div>
                <div className="rounded-xl bg-primary-50 px-2 py-3">
                  <p className="text-sm font-black text-primary-700">{rp(fin.balance)}</p>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-primary-600">Saldo</p>
                </div>
              </div>
              {fin.byCategory.length ? (
                <div className="border-t border-sand-100 pt-3">
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-sand-400">Kategori terbesar</p>
                  {fin.byCategory.slice(0, 4).map((c) => (
                    <div key={c.categoryId} className="flex justify-between py-1 text-sm">
                      <span className="text-sand-700">{c.name}</span>
                      <span className={`font-semibold ${c.type === 'INCOME' ? 'text-emerald-700' : 'text-red-700'}`}>
                        {c.type === 'INCOME' ? '+' : '−'} {rp(c.total)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </Widget>

        {/* ---------- SPMB ---------- */}
        <Widget
          title="Penerimaan Siswa Baru"
          {...(spmb ? { subtitle: `${spmb.total} pendaftar masuk` } : {})}
          action={<Link href="/spmb" className="text-xs font-semibold text-primary-700 hover:underline">Detail →</Link>}
        >
          {!spmb ? (
            <p className="p-5 text-sm text-sand-400">Memuat…</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3">
              {SPMB_STATES.map((s) => (
                <div key={s} className="rounded-xl bg-sand-50 px-3 py-2.5">
                  <p className="text-lg font-black text-sand-900">{spmb.byStatus[s] ?? 0}</p>
                  <p className="text-[11px] font-semibold text-sand-500">{REGISTRATION_STATUS_LABELS[s] ?? s}</p>
                </div>
              ))}
            </div>
          )}
        </Widget>

        {/* ---------- Pengumuman ---------- */}
        <Widget title="Informasi Terbaru" subtitle="Notifikasi & pengumuman sistem">
          {notes.length === 0 ? (
            <p className="p-5 text-sm text-sand-400">Belum ada informasi.</p>
          ) : (
            <ul className="divide-y divide-sand-50">
              {notes.map((n) => (
                <li key={n.id} className="px-5 py-3 text-sm">
                  <p className="font-semibold text-sand-900">{n.title}</p>
                  {n.body ? <p className="mt-0.5 line-clamp-2 text-xs text-sand-500">{n.body}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </Widget>
      </div>
    </Shell>
  );
}
