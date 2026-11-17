'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Shell } from '@/components/shell';

/** "Ujian CBT" melebur ke dalam Asesmen — satu asesmen = satu ujian
 *  (mapel + jenjang). Halaman ini dialihkan ke daftar asesmen. */
export default function UjianRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/kurikulum/asesmen');
  }, [router]);
  return (
    <Shell>
      <p className="py-16 text-center text-sm text-sand-500">Mengalihkan ke Asesmen…</p>
    </Shell>
  );
}
