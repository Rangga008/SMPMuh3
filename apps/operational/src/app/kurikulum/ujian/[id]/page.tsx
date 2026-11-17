'use client';

import { useParams } from 'next/navigation';
import { ExamPanel } from '@/components/exam-panel';

/** Rute mandiri detail ujian — dipakai proktor/pengawas dari Monitor CBT.
 *  Di UI kurikulum, panel yang sama tampil sebagai tab "Ujian & Monitor"
 *  pada halaman detail asesmen. */
export default function UjianDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <ExamPanel id={id} />;
}
