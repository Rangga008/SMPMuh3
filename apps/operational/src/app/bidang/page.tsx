'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Badge } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { DataTable } from '@/components/data-table';
import { PageTitle, Widget } from '@/components/widgets';
import { getMyDepartment, type EmployeeDto } from '@/lib/api';

const DEPT_LABELS: Record<string, string> = {
  KURIKULUM: 'Kurikulum',
  KESISWAAN: 'Kesiswaan',
  TATA_USAHA: 'Tata Usaha',
  KEUANGAN: 'Keuangan',
  HUMAS: 'Humas',
  LAINNYA: 'Lainnya',
};

/** Bidang Saya — daftar pegawai se-bidang; kepala bidang melihat semua anggotanya. */
export default function BidangPage() {
  const [data, setData] = useState<{ department: string | null; isHead: boolean; members: EmployeeDto[] } | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    getMyDepartment().then(setData).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <Shell>
      <PageTitle title="Bidang Saya" subtitle="Pegawai dalam bidang yang sama — kepala bidang dapat memantau seluruh anggotanya" />
      {err && <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{err}</p>}
      {data && !data.department && (
        <Widget title="Belum ada bidang">
          <p className="text-sm text-slate-500">Akun Anda belum ditugaskan ke bidang manapun — minta Tata Usaha mengisi kolom bidang di data kepegawaian.</p>
        </Widget>
      )}
      {data?.department && (
        <Widget
          title={`Bidang ${DEPT_LABELS[data.department] ?? data.department}`}
          action={data.isHead ? <Badge tone="primary">Anda kepala bidang</Badge> : undefined}
        >
          <DataTable head={['Nama', 'NIP', 'Jenis', 'Kontak', 'Jabatan']}>
            {data.members.map((m) => (
              <tr key={m.id}>
                <td className="px-5 py-2.5">
                  <Link href={`/kepegawaian/${m.id}`} className="font-semibold text-primary-700 hover:underline">
                    {m.name}
                  </Link>
                </td>
                <td className="px-5 py-2.5">{m.nip ?? '—'}</td>
                <td className="px-5 py-2.5">{m.type === 'TEACHER' ? 'Guru' : 'Staf'}</td>
                <td className="px-5 py-2.5">{m.phone ?? m.email ?? '—'}</td>
                <td className="px-5 py-2.5">{m.isDeptHead ? <Badge tone="primary">Kepala Bidang</Badge> : '—'}</td>
              </tr>
            ))}
          </DataTable>
        </Widget>
      )}
    </Shell>
  );
}
