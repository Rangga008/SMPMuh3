'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  REGISTRATION_STATUS_LABELS,
  type NotificationDto,
  type RegistrationStatus,
} from '@smpmuh3/types';
import { Badge, buttonClasses } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { PageTitle, StatCard, Widget } from '@/components/widgets';
import { PERMISSIONS } from '@smpmuh3/types';
import {
  getFinanceSummary,
  listAcademicYears,
  listClasses,
  listEmployees,
  listLetters,
  listMutations,
  listNotifications,
  listStudents,
  listSubjects,
  me,
  spmbSummary,
  type AcademicYear,
  type FinanceSummary,
  type SpmbSummary,
} from '@/lib/api';
import { listArchives } from '@/lib/api-ops';

const rp = (n: number) => `Rp ${n.toLocaleString('id-ID')}`;

const SHOWN: RegistrationStatus[] = [
  'SUBMITTED',
  'DOCUMENT_REVIEW',
  'NEEDS_REVISION',
  'VERIFIED',
  'ACCEPTED',
];

export default function DashboardPage() {
  const [year, setYear] = useState<AcademicYear | null>(null);
  const [summary, setSummary] = useState<SpmbSummary | null>(null);
  const [notes, setNotes] = useState<NotificationDto[]>([]);
  const [studentCount, setStudentCount] = useState<number | null>(null);
  const [employeeCount, setEmployeeCount] = useState<number | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [perms, setPerms] = useState<string[] | null>(null);
  const [fin, setFin] = useState<FinanceSummary | null>(null);
  const [tu, setTu] = useState<{ masuk: number; keluar: number; mutasi: number; arsip: number } | null>(null);
  const [akd, setAkd] = useState<{ rombel: number; mapel: number } | null>(null);

  const can = (p: string) => (perms ?? []).includes(p);

  useEffect(() => {
    const errs: string[] = [];
    me()
      .then((u) => setPerms(u.permissions))
      .catch(() => setPerms([]));
    listAcademicYears()
      .then((ys) => setYear(ys.find((y) => y.isActive) ?? null))
      .catch(() => errs.push('Tahun ajaran tidak dapat dimuat'));
    setErrors(errs);
  }, []);

  // Ambil data hanya untuk modul yang memang boleh diakses role ini.
  useEffect(() => {
    if (perms === null) return;
    const errs: string[] = [];
    if (can(PERMISSIONS.SPMB_REGISTRATION_READ)) {
      spmbSummary().then(setSummary).catch(() => errs.push('Ringkasan SPMB tidak dapat dimuat'));
    }
    if (can(PERMISSIONS.STUDENT_READ)) {
      listStudents({ status: 'ACTIVE' }).then((s) => setStudentCount(s.length)).catch(() => setStudentCount(null));
    }
    if (can(PERMISSIONS.EMPLOYEE_READ)) {
      listEmployees().then((e) => setEmployeeCount(e.filter((x) => x.isActive).length)).catch(() => setEmployeeCount(null));
    }
    listNotifications().then((n) => setNotes(n.slice(0, 4))).catch(() => undefined);
    if (can(PERMISSIONS.FINANCE_READ)) {
      getFinanceSummary({}).then(setFin).catch(() => undefined);
    }
    if (can(PERMISSIONS.TATAUSAHA_READ)) {
      Promise.all([
        listLetters('IN'), listLetters('OUT'), listMutations(), listArchives({}),
      ]).then(([mi, mo, mut, ars]) =>
        setTu({
          masuk: mi.length,
          keluar: mo.length,
          mutasi: mut.filter((m) => m.status === 'PROCESS').length,
          arsip: ars.length,
        }),
      ).catch(() => undefined);
    }
    if (can(PERMISSIONS.ACADEMIC_READ)) {
      Promise.all([listClasses(), listSubjects()])
        .then(([c, s]) => setAkd({ rombel: c.length, mapel: s.length }))
        .catch(() => undefined);
    }
    setErrors(errs);
  }, [perms]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Shell>
      <PageTitle title="Dashboard" subtitle="Ringkasan operasional sekolah" />
      {errors.length ? (
        <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {errors.join(' · ')}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Tahun Ajaran" value={year?.name ?? '…'} />
        {can(PERMISSIONS.SPMB_REGISTRATION_READ) ? (
          <StatCard
            label="Pendaftar SPMB"
            value={summary ? String(summary.total) : '…'}
            accent="accent"
          />
        ) : null}
        {can(PERMISSIONS.STUDENT_READ) ? (
          <StatCard
            label="Siswa Aktif"
            value={studentCount === null ? '…' : String(studentCount)}
          />
        ) : null}
        {can(PERMISSIONS.EMPLOYEE_READ) ? (
          <StatCard
            label="Pegawai Aktif"
            value={employeeCount === null ? '…' : String(employeeCount)}
            accent="accent"
          />
        ) : null}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
        {can(PERMISSIONS.FINANCE_READ) ? (
          <Widget title="Ringkasan Keuangan" action={<Link href="/keuangan" className="text-xs font-semibold text-primary-700 hover:underline">Buka Keuangan →</Link>}>
            {fin ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-sand-50 p-3"><p className="text-xs font-semibold text-sand-500">SALDO KAS &amp; BANK</p><p className="mt-1 text-lg font-bold text-sand-900">{rp(fin.balance)}</p></div>
                <div className="rounded-xl bg-emerald-50 p-3"><p className="text-xs font-semibold text-emerald-700">PEMASUKAN</p><p className="mt-1 text-lg font-bold text-emerald-800">{rp(fin.income)}</p></div>
                <div className="rounded-xl bg-red-50 p-3"><p className="text-xs font-semibold text-red-600">PENGELUARAN</p><p className="mt-1 text-lg font-bold text-red-700">{rp(fin.expense)}</p></div>
              </div>
            ) : <p className="text-sm text-sand-500">Memuat…</p>}
          </Widget>
        ) : null}
        {can(PERMISSIONS.TATAUSAHA_READ) ? (
          <Widget title="Ringkasan Tata Usaha" action={<Link href="/tata-usaha/surat" className="text-xs font-semibold text-primary-700 hover:underline">Buka Surat →</Link>}>
            {tu ? (
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="rounded-xl bg-sand-50 p-3"><p className="text-xs font-semibold text-sand-500">SURAT MASUK</p><p className="mt-1 text-lg font-bold text-sand-900">{tu.masuk}</p></div>
                <div className="rounded-xl bg-sand-50 p-3"><p className="text-xs font-semibold text-sand-500">SURAT KELUAR</p><p className="mt-1 text-lg font-bold text-sand-900">{tu.keluar}</p></div>
                <div className="rounded-xl bg-amber-50 p-3"><p className="text-xs font-semibold text-amber-700">MUTASI DIPROSES</p><p className="mt-1 text-lg font-bold text-amber-800">{tu.mutasi}</p></div>
                <div className="rounded-xl bg-sand-50 p-3"><p className="text-xs font-semibold text-sand-500">DOKUMEN ARSIP</p><p className="mt-1 text-lg font-bold text-sand-900">{tu.arsip}</p></div>
              </div>
            ) : <p className="text-sm text-sand-500">Memuat…</p>}
          </Widget>
        ) : null}
        {can(PERMISSIONS.ACADEMIC_READ) ? (
          <Widget title="Ringkasan Kurikulum" action={<Link href="/kurikulum/jadwal-kelas" className="text-xs font-semibold text-primary-700 hover:underline">Jadwal &amp; Cetak →</Link>}>
            {akd ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-sand-50 p-3"><p className="text-xs font-semibold text-sand-500">ROMBEL / KELAS</p><p className="mt-1 text-lg font-bold text-sand-900">{akd.rombel}</p></div>
                <div className="rounded-xl bg-sand-50 p-3"><p className="text-xs font-semibold text-sand-500">MATA PELAJARAN</p><p className="mt-1 text-lg font-bold text-sand-900">{akd.mapel}</p></div>
                <div className="rounded-xl bg-sand-50 p-3"><p className="text-xs font-semibold text-sand-500">PEGAWAI AKTIF</p><p className="mt-1 text-lg font-bold text-sand-900">{employeeCount ?? '—'}</p></div>
              </div>
            ) : <p className="text-sm text-sand-500">Memuat…</p>}
          </Widget>
        ) : null}
        {can(PERMISSIONS.SPMB_REGISTRATION_READ) ? (
        <Widget title="Status SPMB">
          {summary ? (
            <ul className="flex flex-wrap gap-2">
              {SHOWN.map((s) => (
                <li key={s}>
                  <Badge tone={s === 'ACCEPTED' ? 'primary' : 'accent'}>
                    {REGISTRATION_STATUS_LABELS[s]}: {summary.byStatus[s] ?? 0}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-sand-500">Memuat…</p>
          )}
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/spmb" className={buttonClasses({ size: 'sm' })}>
              Tinjau Pendaftar →
            </Link>
            <Link
              href="/spmb?status=SUBMITTED"
              className={buttonClasses({ variant: 'outline', size: 'sm' })}
            >
              Perlu Diverifikasi
            </Link>
          </div>
        </Widget>
        ) : null}
        </div>

        <div className="space-y-5">
          <Widget title="Aksi Cepat">
          <ul className="grid gap-2 text-sm font-semibold">
            {can(PERMISSIONS.STUDENT_READ) ? (
            <li>
              <Link href="/kesiswaan" className="flex items-center justify-between rounded-xl bg-sand-50 px-3.5 py-2.5 text-sand-800 transition-colors hover:bg-primary-50 hover:text-primary-800">
                🎓 Kelola data siswa <span aria-hidden>→</span>
              </Link>
            </li>
            ) : null}
            {can(PERMISSIONS.ATTENDANCE_READ) ? (
            <li>
              <Link href="/kesiswaan/absensi" className="flex items-center justify-between rounded-xl bg-sand-50 px-3.5 py-2.5 text-sand-800 transition-colors hover:bg-primary-50 hover:text-primary-800">
                ✅ Catat absensi hari ini <span aria-hidden>→</span>
              </Link>
            </li>
            ) : null}
            {can(PERMISSIONS.TATAUSAHA_READ) ? (
            <li>
              <Link href="/tata-usaha/surat" className="flex items-center justify-between rounded-xl bg-sand-50 px-3.5 py-2.5 text-sand-800 transition-colors hover:bg-primary-50 hover:text-primary-800">
                📁 Agenda surat TU <span aria-hidden>→</span>
              </Link>
            </li>
            ) : null}
            {can(PERMISSIONS.FINANCE_READ) ? (
            <li>
              <Link href="/keuangan" className="flex items-center justify-between rounded-xl bg-sand-50 px-3.5 py-2.5 text-sand-800 transition-colors hover:bg-primary-50 hover:text-primary-800">
                💰 Catat transaksi <span aria-hidden>→</span>
              </Link>
            </li>
            ) : null}
            {can(PERMISSIONS.ACADEMIC_READ) ? (
            <li>
              <Link href="/kurikulum/jadwal-kelas" className="flex items-center justify-between rounded-xl bg-sand-50 px-3.5 py-2.5 text-sand-800 transition-colors hover:bg-primary-50 hover:text-primary-800">
                📚 Jadwal kelas <span aria-hidden>→</span>
              </Link>
            </li>
            ) : null}
          </ul>
          </Widget>

          <Widget title="Notifikasi Terbaru">
          {notes.length === 0 ? (
            <p className="text-sm text-sand-500">Belum ada notifikasi.</p>
          ) : (
            <ul className="space-y-3 text-sm">
              {notes.map((n) => (
                <li key={n.id} className="border-b border-sand-100 pb-3 last:border-0 last:pb-0">
                  <p className="font-semibold text-sand-900">{n.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-sand-600">{n.body}</p>
                </li>
              ))}
            </ul>
          )}
          </Widget>
        </div>
      </div>
    </Shell>
  );
}
