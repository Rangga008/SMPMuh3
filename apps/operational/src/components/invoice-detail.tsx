'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getStudentInvoice, type StudentInvoice } from '@/lib/api';

const rupiah = (n: number) => `Rp${n.toLocaleString('id-ID')}`;
const fmtDate = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '—';

export const KINDS = [
  { key: 'spp', label: 'SPP Bulanan' },
  { key: 'daftar_ulang', label: 'Daftar Ulang' },
  { key: 'dsp', label: 'DSP' },
  { key: 'seragam', label: 'Seragam' },
  { key: 'kat', label: 'KAT (Kegiatan Akhir Tahun)' },
  { key: 'other', label: 'Lainnya' },
];
export const kindLabel = (k: string) =>
  KINDS.find((x) => x.key === k)?.label ?? k;

export const STATUS_TONE: Record<
  string,
  'primary' | 'accent' | 'neutral' | 'danger'
> = {
  OPEN: 'primary',
  PARTIAL: 'accent',
  PAID: 'neutral',
  EXPIRED: 'neutral',
  CANCELLED: 'danger',
};
export const STATUS_LABEL: Record<string, string> = {
  OPEN: 'Belum dibayar',
  PARTIAL: 'Sebagian',
  PAID: 'Lunas',
  EXPIRED: 'Kedaluwarsa',
  CANCELLED: 'Dibatalkan',
};

/** Detail satu tagihan — komponen, riwayat alokasi pembayaran, sisa. */
export function InvoiceDetail({ invoice }: { invoice: StudentInvoice }) {
  const [inv, setInv] = useState<Awaited<
    ReturnType<typeof getStudentInvoice>
  > | null>(null);
  useEffect(() => {
    getStudentInvoice(invoice.id)
      .then(setInv)
      .catch(() => setInv(invoice));
  }, [invoice]);
  const cur = inv ?? invoice;
  return (
    <div className="space-y-4 text-sm">
      <div className="grid gap-2 rounded-2xl bg-sand-50 p-4 sm:grid-cols-2">
        <div>
          <p className="text-xs text-sand-500">Siswa</p>
          <p className="font-semibold">
            {cur.student ? (
              <Link
                href={`/kesiswaan/${cur.student.id}`}
                className="text-primary-800 hover:underline"
              >
                {cur.student.name} →
              </Link>
            ) : (
              '—'
            )}
          </p>
        </div>
        <div>
          <p className="text-xs text-sand-500">Kelas</p>
          <p className="font-semibold">{cur.class?.name ?? '—'}</p>
        </div>
        <div>
          <p className="text-xs text-sand-500">Judul</p>
          <p className="font-semibold">{cur.title}</p>
        </div>
        <div>
          <p className="text-xs text-sand-500">Jatuh tempo</p>
          <p className="font-semibold">{fmtDate(cur.dueAt)}</p>
        </div>
        <div>
          <p className="text-xs text-sand-500">No. Tagihan</p>
          <p className="font-semibold">{cur.number}</p>
        </div>
        <div>
          <p className="text-xs text-sand-500">Orang Tua / Wali</p>
          <p className="font-semibold">
            {cur.student?.parent
              ? `${cur.student.parent.name}${cur.student.parent.phone ? ` · ${cur.student.parent.phone}` : ''}`
              : '—'}
          </p>
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-sand-500">
          Komponen
        </p>
        <ul className="divide-y divide-sand-100 rounded-xl border border-sand-200">
          {(cur.items ?? []).map((it) => (
            <li
              key={it.id}
              className="flex items-center justify-between px-4 py-2.5"
            >
              <span>
                {it.label}{' '}
                <span className="text-xs text-sand-400">
                  ({kindLabel(it.kind)})
                </span>
                {it.paidAmount ? (
                  <span className="ml-1 text-xs text-emerald-700">
                    terbayar {rupiah(it.paidAmount)}
                  </span>
                ) : null}
              </span>
              <span className="font-semibold">{rupiah(it.amount)}</span>
            </li>
          ))}
          {(cur.items ?? []).length === 0 ? (
            <li className="px-4 py-2.5 text-sand-500">
              Tanpa rincian — {rupiah(cur.amount)}
            </li>
          ) : null}
        </ul>
      </div>
      {inv?.allocations && inv.allocations.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-sand-500">
            Riwayat Pembayaran
          </p>
          <ul className="divide-y divide-sand-100 rounded-xl border border-sand-200">
            {inv.allocations.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between px-4 py-2.5"
              >
                <span>
                  {a.item?.label ?? 'Alokasi tagihan'}
                  <span className="ml-1 text-xs text-sand-400">
                    {a.payment?.method ?? ''}
                  </span>
                </span>
                <span className="font-semibold text-emerald-700">
                  {rupiah(a.amount)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="flex items-center justify-between rounded-xl bg-sand-50 px-4 py-3">
        <span className="text-sand-600">
          Total {rupiah(cur.amount)} · Terbayar {rupiah(cur.paidAmount)}
        </span>
        <span className="font-extrabold text-red-600">
          Sisa {rupiah(cur.remaining)}
        </span>
      </div>
    </div>
  );
}
