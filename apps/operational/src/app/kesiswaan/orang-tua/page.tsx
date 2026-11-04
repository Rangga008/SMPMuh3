'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Input } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { DataTable } from '@/components/data-table';
import { PageTitle, Widget } from '@/components/widgets';
import { RowBtn } from '@/components/row-btn';
import { listStudentParents, type ParentListItem } from '@/lib/api';

const rupiah = (n: number) => `Rp${n.toLocaleString('id-ID')}`;

/** Daftar orang tua/wali yang anaknya terdaftar sebagai siswa. */
export default function OrangTuaPage() {
  const [rows, setRows] = useState<ParentListItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const firstRun = useRef(true);

  useEffect(() => {
    const t = setTimeout(
      () => {
        setLoading(true);
        listStudentParents(search || undefined)
          .then(setRows)
          .catch(() => setError('Gagal memuat data orang tua.'))
          .finally(() => setLoading(false));
      },
      firstRun.current ? 0 : 350,
    );
    firstRun.current = false;
    return () => clearTimeout(t);
  }, [search]);

  return (
    <Shell>
      <Link href="/kesiswaan" className="text-sm font-semibold text-primary-700 hover:text-primary-800">
        ← Data siswa
      </Link>
      <div className="mt-2">
        <PageTitle
          title="Orang Tua / Wali"
          subtitle="Akun orang tua yang anaknya terdaftar — kontak, anak, tagihan, dan kode formulir titipan"
        />
      </div>
      {error ? (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
      ) : null}

      <div className="mb-5 rounded-2xl border border-sand-200 bg-white p-4 shadow-card">
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nama ortu, nomor HP, email, atau nama anak…"
          aria-label="Cari orang tua"
        />
      </div>

      <Widget title={`Orang Tua (${rows.length})`}>
        <DataTable
          head={['Orang Tua', 'Kontak', 'Anak', 'Tagihan Terbuka', '']}
          loading={loading}
          empty={rows.length === 0 ? 'Belum ada orang tua terdaftar pada filter ini.' : undefined}
        >
          {rows.map((p) => (
            <tr key={p.id}>
              <td className="px-5 py-3">
                <Link href={`/kesiswaan/orang-tua/${p.id}`} className="font-medium text-sand-900 hover:text-primary-700 hover:underline">
                  {p.name}
                </Link>
              </td>
              <td className="px-5 py-3 text-sand-600">
                <p>{p.phone ?? '—'}</p>
                {p.email ? <p className="text-xs text-sand-400">{p.email}</p> : null}
              </td>
              <td className="px-5 py-3">
                <p className="text-sand-800">{p.students.map((s) => s.name).join(', ')}</p>
                <p className="text-xs text-sand-400">{p.studentCount} anak</p>
              </td>
              <td className="whitespace-nowrap px-5 py-3 text-right">
                {p.openInvoiceTotal > 0 ? (
                  <span className="font-semibold text-red-600">{rupiah(p.openInvoiceTotal)}</span>
                ) : (
                  <span className="text-sand-400">Lunas</span>
                )}
              </td>
              <td className="whitespace-nowrap px-5 py-3 text-right">
                <Link href={`/kesiswaan/orang-tua/${p.id}`}>
                  <RowBtn type="button">Detail</RowBtn>
                </Link>
              </td>
            </tr>
          ))}
        </DataTable>
      </Widget>
    </Shell>
  );
}
