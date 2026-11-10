'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getTimetableMatrix, type TimetableMatrix } from '@/lib/api-ops';
import { listAcademicYears } from '@/lib/api';

const DAY_NAMES = ['', 'SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT', 'SABTU'];
const mm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}.${String(m % 60).padStart(2, '0')}`;

/**
 * Halaman cetak matriks jadwal — format seperti contoh (hari × kelas, kode nomor
 * guru, legenda daftar guru). Buka dari /kurikulum/jadwal-kelas → tombol "Cetak PDF".
 */
export default function JadwalCetakPage() {
  return (
    <Suspense fallback={<p className="p-8 text-center text-sand-500">Memuat…</p>}>
      <JadwalCetakInner />
    </Suspense>
  );
}

function JadwalCetakInner() {
  const params = useSearchParams();
  const yearId = params.get('year') ?? '';
  const [data, setData] = useState<TimetableMatrix | null>(null);
  const [yearName, setYearName] = useState('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    listAcademicYears().then((ys) => {
      const y = ys.find((x) => x.id === yearId);
      if (y) setYearName(y.name);
    }).catch(() => {});
    if (yearId) getTimetableMatrix(yearId).then(setData).catch(() => setErr('Gagal memuat jadwal.'));
  }, [yearId]);

  if (err) return <p className="p-8 text-center text-red-600">{err}</p>;
  if (!data) return <p className="p-8 text-center text-sand-500">Memuat…</p>;

  return (
    <div className="mx-auto max-w-[1100px] bg-white p-6 font-sans text-black print:p-0">
      <style>{`
        @media print { .no-print { display: none !important; } @page { size: landscape; margin: 8mm; } }
        .jt { border-collapse: collapse; width: 100%; font-size: 8.5pt; }
        .jt th, .jt td { border: 1px solid #000; padding: 2px 4px; text-align: center; }
        .jt th { background: #e8e8e8; font-weight: 700; }
        .blk td { background: #d0d0d0; font-weight: 700; letter-spacing: .15em; }
      `}</style>
      <div className="no-print mb-4 flex justify-between print:hidden">
        <p className="text-sm text-sand-600">Pratinjau cetak — gunakan dialog cetak browser untuk simpan PDF.</p>
        <button onClick={() => window.print()} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white">🖨 Cetak / Simpan PDF</button>
      </div>

      <div className="mb-2 text-center">
        <h1 className="text-lg font-black uppercase">Jadwal Pelajaran</h1>
        <h2 className="text-base font-bold uppercase">SMP Muhammadiyah 3 Kota Bandung</h2>
        <p className="text-sm">Tahun Ajaran {yearName}</p>
      </div>

      {data.days.map((d) => (
        <div key={d.day} style={{ breakInside: 'avoid' }} className="mb-4">
          <p className="mb-1 text-sm font-black uppercase">{DAY_NAMES[d.day] ?? ''}</p>
          <table className="jt">
            <thead>
              <tr>
                <th style={{ width: 90 }}>Waktu</th>
                {data.classes.map((c) => <th key={c.id}>{c.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {d.rows.map((r, i) => r.block ? (
                <tr key={i} className="blk">
                  <td>{mm(r.start)}-{mm(r.end)}</td>
                  <td colSpan={data.classes.length}>{r.block.label.toUpperCase() as string}</td>
                </tr>
              ) : (
                <tr key={i}>
                  <td>{mm(r.start)}-{mm(r.end)}</td>
                  {r.cells.map((cell, ci) => <td key={ci}>{cell ? cell.teacherNo : ''}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <div style={{ breakInside: 'avoid' }}>
        <p className="mb-1 text-sm font-black uppercase">Daftar Guru</p>
        <table className="jt">
          <thead>
            <tr>
              <th>No.</th><th>Nama Guru</th><th>Mata Pelajaran</th>
              {[1, 2, 3, 4, 5, 6].map((d) => <th key={d}>{(DAY_NAMES[d] ?? '').slice(0, 3)}</th>)}
              <th>JML</th>
            </tr>
          </thead>
          <tbody>
            {data.teachers.map((t) => (
              <tr key={t.id}>
                <td>{t.no}</td>
                <td className="!text-left">{t.name}</td>
                <td>{t.subject}</td>
                {[1, 2, 3, 4, 5, 6].map((d) => <td key={d}>{t.dayCounts[d] ?? ''}</td>)}
                <td>{t.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
