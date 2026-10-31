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
import {
  listAcademicYears,
  listEmployees,
  listNotifications,
  listStudents,
  spmbSummary,
  type AcademicYear,
  type SpmbSummary,
} from '@/lib/api';

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

  useEffect(() => {
    const errs: string[] = [];
    listAcademicYears()
      .then((ys) => setYear(ys.find((y) => y.isActive) ?? null))
      .catch(() => errs.push('Tahun ajaran tidak dapat dimuat'));
    spmbSummary()
      .then(setSummary)
      .catch(() => errs.push('Ringkasan SPMB tidak dapat dimuat'));
    listStudents({ status: 'ACTIVE' })
      .then((s) => setStudentCount(s.length))
      .catch(() => setStudentCount(null));
    listEmployees()
      .then((e) => setEmployeeCount(e.filter((x) => x.isActive).length))
      .catch(() => setEmployeeCount(null));
    listNotifications()
      .then((n) => setNotes(n.slice(0, 4)))
      .catch(() => undefined);
    setErrors(errs);
  }, []);

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
        <StatCard
          label="Pendaftar SPMB"
          value={summary ? String(summary.total) : '…'}
          accent="accent"
        />
        <StatCard
          label="Siswa Aktif"
          value={studentCount === null ? '…' : String(studentCount)}
        />
        <StatCard
          label="Pegawai Aktif"
          value={employeeCount === null ? '…' : String(employeeCount)}
          accent="accent"
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Widget title="Status SPMB" className="lg:col-span-2">
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

        <div className="space-y-5">
          <Widget title="Aksi Cepat">
          <ul className="grid gap-2 text-sm font-semibold">
            <li>
              <Link href="/kesiswaan" className="flex items-center justify-between rounded-xl bg-sand-50 px-3.5 py-2.5 text-sand-800 transition-colors hover:bg-primary-50 hover:text-primary-800">
                🎓 Tambah / kelola siswa <span aria-hidden>→</span>
              </Link>
            </li>
            <li>
              <Link href="/kesiswaan/absensi" className="flex items-center justify-between rounded-xl bg-sand-50 px-3.5 py-2.5 text-sand-800 transition-colors hover:bg-primary-50 hover:text-primary-800">
                ✅ Catat absensi hari ini <span aria-hidden>→</span>
              </Link>
            </li>
            <li>
              <Link href="/tata-usaha/surat" className="flex items-center justify-between rounded-xl bg-sand-50 px-3.5 py-2.5 text-sand-800 transition-colors hover:bg-primary-50 hover:text-primary-800">
                📁 Agenda surat TU <span aria-hidden>→</span>
              </Link>
            </li>
            <li>
              <Link href="/keuangan" className="flex items-center justify-between rounded-xl bg-sand-50 px-3.5 py-2.5 text-sand-800 transition-colors hover:bg-primary-50 hover:text-primary-800">
                💰 Catat transaksi <span aria-hidden>→</span>
              </Link>
            </li>
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
