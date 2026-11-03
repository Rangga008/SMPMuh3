'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge, Select } from '@smpmuh3/ui';
import {
  TITIPAN_STATUS_LABELS,
  type TitipanEntryDto,
  type TitipanYearSummaryDto,
} from '@smpmuh3/types';
import { listTitipanYears, titipanBoard } from '@/lib/api';
import { buttonClasses } from '@smpmuh3/ui';

const STATUS_TONE: Record<string, 'primary' | 'accent' | 'neutral' | 'danger'> = {
  PENDING: 'neutral',
  WAITING: 'accent',
  CODE_SENT: 'accent',
  REGISTERED: 'primary',
  CANCELLED: 'danger',
};

function statusText(e: TitipanEntryDto): string {
  if (e.status === 'WAITING' || e.status === 'CODE_SENT') {
    return e.position != null
      ? `Antrean #${e.queueNo} · posisi ${e.position}`
      : `Antrean #${e.queueNo}`;
  }
  return TITIPAN_STATUS_LABELS[e.status];
}

export default function TitipanBoardPage() {
  const [years, setYears] = useState<TitipanYearSummaryDto[]>([]);
  const [yearId, setYearId] = useState(''); // '' = semua
  const [entries, setEntries] = useState<TitipanEntryDto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listTitipanYears().then(setYears).catch(() => setYears([]));
  }, []);

  useEffect(() => {
    setLoading(true);
    titipanBoard(yearId || undefined)
      .then(setEntries)
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [yearId]);

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });

  const yearName = useMemo(
    () => new Map(years.map((y) => [y.academicYearId, y.name])),
    [years],
  );

  return (
    <main className="relative min-h-[calc(100dvh-4rem)] overflow-hidden bg-gradient-to-b from-primary-50 via-sand-50 to-sand-100 py-10">
      <div aria-hidden="true" className="pattern-islami pointer-events-none absolute inset-0" />
      <div className="relative mx-auto max-w-5xl space-y-6 px-4 sm:px-6 lg:px-8">
        <header className="text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary-600">
            SPMB
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-sand-950 sm:text-3xl">
            Data Daftar Titipan / Inden
          </h1>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-sand-600">
            Antrean calon siswa per tahun ajaran. Titipan bisa dilakukan jauh
            hari — posisi antrean mengikuti urutan tanggal daftar.
          </p>
          <div className="mt-4">
            <Link
              href="/daftar-titipan"
              className={buttonClasses({ size: 'sm' })}
            >
              + Daftar Titipan
            </Link>
          </div>
        </header>

        <section className="rounded-3xl border border-sand-200 bg-white p-5 shadow-card sm:p-7">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-extrabold text-sand-950">
              Tahun Ajaran
            </h2>
            <div className="w-56">
              <Select
                aria-label="Filter tahun ajaran"
                value={yearId}
                onChange={(e) => setYearId(e.target.value)}
              >
                <option value="">Semua Tahun Ajaran</option>
                {years.map((y) => (
                  <option key={y.academicYearId} value={y.academicYearId}>
                    {y.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {loading ? (
            <p className="py-10 text-center text-sm text-sand-500">
              Memuat data titipan…
            </p>
          ) : entries.length === 0 ? (
            <p className="rounded-2xl bg-sand-50 px-4 py-8 text-center text-sm text-sand-600">
              Belum ada data titipan
              {yearId ? ' untuk tahun ajaran ini' : ''}. Jadilah yang pertama!
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-sand-200 text-left text-xs font-bold uppercase tracking-wider text-sand-500">
                    <th className="px-3 py-3">No</th>
                    <th className="px-3 py-3">Tanggal Daftar</th>
                    <th className="px-3 py-3">Nama</th>
                    <th className="px-3 py-3">Sekolah Asal</th>
                    <th className="px-3 py-3">Tahun Ajaran</th>
                    <th className="px-3 py-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e, i) => (
                    <tr
                      key={e.id}
                      className="border-b border-sand-100 last:border-0 hover:bg-sand-50"
                    >
                      <td className="px-3 py-3 text-sand-500">{i + 1}</td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {fmtDate(e.createdAt)}
                      </td>
                      <td className="px-3 py-3 font-semibold text-sand-900">
                        {e.candidateName}
                      </td>
                      <td className="px-3 py-3 text-sand-600">
                        {e.previousSchool ?? '—'}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-sand-600">
                        {e.academicYearName ?? yearName.get(e.academicYearId) ?? '—'}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Badge tone={STATUS_TONE[e.status] ?? 'neutral'}>
                          {statusText(e)}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className="text-center text-xs leading-relaxed text-sand-500">
          Posisi antrean naik otomatis bila pendaftar di depan mengundurkan
          diri atau sudah melakukan pendaftaran resmi. Kode formulir dikirim
          panitia ke WhatsApp sesuai antrean dan ketersediaan kuota.
        </p>
      </div>
    </main>
  );
}
