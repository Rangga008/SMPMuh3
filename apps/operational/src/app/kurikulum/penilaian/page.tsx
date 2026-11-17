'use client';

import Link from 'next/link';
import { Shell } from '@/components/shell';
import { PageTitle, Widget } from '@/components/widgets';

/** Penilaian sedang dirancang ulang mengikuti model baru — nilai ujian CBT
 *  mengalir otomatis dari hasil pengerjaan pada tiap asesmen. */
export default function PenilaianPage() {
  return (
    <Shell>
      <PageTitle title="Penilaian" subtitle="Modul ini sedang disesuaikan dengan alur asesmen baru." />
      <Widget title="Dalam Penyesuaian">
        <div className="py-14 text-center">
          <p className="text-4xl">🚧</p>
          <p className="mt-3 text-sm font-bold text-sand-800">Halaman penilaian sedang dirancang ulang</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-sand-500">
            Nilai ujian kini dihasilkan otomatis dari hasil pengerjaan CBT tiap asesmen —
            lihat tab <b>Hasil &amp; Analisis</b> pada halaman asesmen.
          </p>
          <Link
            href="/kurikulum/asesmen"
            className="mt-4 inline-block rounded-xl bg-primary-700 px-4 py-2 text-xs font-bold text-white hover:bg-primary-800"
          >
            Buka Asesmen &amp; Ujian →
          </Link>
        </div>
      </Widget>
    </Shell>
  );
}
