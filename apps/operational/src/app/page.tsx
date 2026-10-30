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
import { PageTitle, PendingWidget, StatCard, Widget } from '@/components/widgets';
import {
  listAcademicYears,
  listNotifications,
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
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    const errs: string[] = [];
    listAcademicYears()
      .then((ys) => setYear(ys.find((y) => y.isActive) ?? null))
      .catch(() => errs.push('Tahun ajaran tidak dapat dimuat'));
    spmbSummary()
      .then(setSummary)
      .catch(() => errs.push('Ringkasan SPMB tidak dapat dimuat'));
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
        <Widget title="Siswa">
          <PendingWidget module="kesiswaan" />
        </Widget>
        <Widget title="Pegawai">
          <PendingWidget module="kepegawaian" />
        </Widget>
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
    </Shell>
  );
}
