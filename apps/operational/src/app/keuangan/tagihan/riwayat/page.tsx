'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Badge, Input, Modal, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { DataTable } from '@/components/data-table';
import { PageTitle, Widget } from '@/components/widgets';
import { RowBtn } from '@/components/row-btn';
import {
  InvoiceDetail,
  KINDS,
  STATUS_LABEL,
  STATUS_TONE,
  kindLabel,
} from '@/components/invoice-detail';
import {
  listAcademicYears,
  listClasses,
  listStudentInvoices,
  type AcademicYear,
  type ClassView,
  type StudentInvoice,
} from '@/lib/api';

const rupiah = (n: number) => `Rp${n.toLocaleString('id-ID')}`;
const fmtDate = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '—';

/** Riwayat tagihan — yang sudah lunas, dibatalkan, atau kedaluwarsa. */
export default function RiwayatTagihanPage() {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [classes, setClasses] = useState<ClassView[]>([]);

  const [yearId, setYearId] = useState('');
  const [classId, setClassId] = useState('');
  const [status, setStatus] = useState('');
  const [kind, setKind] = useState('');
  const [search, setSearch] = useState('');

  const [rows, setRows] = useState<StudentInvoice[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<StudentInvoice | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    listStudentInvoices({
      ...(yearId ? { academicYearId: yearId } : {}),
      ...(classId ? { classId } : {}),
      status: status || 'history',
      ...(kind ? { kind } : {}),
      ...(search ? { search } : {}),
      take: '200',
    })
      .then((r) => {
        setRows(r.items);
        setTotal(r.total);
      })
      .catch(() => setError('Gagal memuat riwayat tagihan.'))
      .finally(() => setLoading(false));
  }, [yearId, classId, status, kind, search]);

  useEffect(() => {
    listAcademicYears()
      .then((ys) => {
        setYears(ys);
        const active = ys.find((y) => y.isActive) ?? ys[0];
        if (active) setYearId(active.id);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!yearId) return;
    listClasses(yearId)
      .then(setClasses)
      .catch(() => setClasses([]));
  }, [yearId]);

  const firstRun = useRef(true);
  useEffect(() => {
    const t = setTimeout(load, firstRun.current ? 0 : search ? 350 : 100);
    firstRun.current = false;
    return () => clearTimeout(t);
  }, [load, search]);

  const paidTotal = rows
    .filter((r) => r.status === 'PAID')
    .reduce((s, r) => s + r.paidAmount, 0);

  return (
    <Shell>
      <Link
        href="/keuangan/tagihan"
        className="text-sm font-semibold text-primary-700 hover:text-primary-800"
      >
        ← Tagihan aktif
      </Link>
      <div className="mt-2">
        <PageTitle
          title="Riwayat Tagihan"
          subtitle="Tagihan yang sudah lunas, dibatalkan, atau kedaluwarsa — beserta total terbayarnya"
        />
      </div>
      {error ? (
        <p
          role="alert"
          className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
        >
          {error}
        </p>
      ) : null}

      <div className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl border border-sand-200 bg-white p-4 shadow-card">
        <label className="flex min-w-36 flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-sand-500">
            Tahun Ajaran
          </span>
          <Select
            value={yearId}
            onChange={(e) => setYearId(e.target.value)}
            aria-label="Filter tahun ajaran"
          >
            <option value="">Semua</option>
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
                {y.isActive ? ' (aktif)' : ''}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex min-w-32 flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-sand-500">
            Kelas
          </span>
          <Select
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            aria-label="Filter kelas"
          >
            <option value="">Semua</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex min-w-32 flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-sand-500">
            Jenis
          </span>
          <Select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            aria-label="Filter jenis tagihan"
          >
            <option value="">Semua</option>
            {KINDS.map((k) => (
              <option key={k.key} value={k.key}>
                {k.label}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex min-w-32 flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-sand-500">
            Status
          </span>
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label="Filter status"
          >
            <option value="">Semua riwayat</option>
            <option value="PAID">Lunas</option>
            <option value="CANCELLED">Dibatalkan</option>
            <option value="EXPIRED">Kedaluwarsa</option>
          </Select>
        </label>
        <label className="flex min-w-40 flex-1 flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-sand-500">
            Pencarian
          </span>
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nama siswa / no. tagihan…"
            aria-label="Cari riwayat"
          />
        </label>
      </div>

      <Widget
        title={`Riwayat (${total})`}
        action={
          paidTotal > 0 ? (
            <span className="text-sm font-semibold text-emerald-700">
              Total diterima: {rupiah(paidTotal)}
            </span>
          ) : undefined
        }
      >
        <DataTable
          head={['Siswa', 'Kelas', 'Tagihan', 'Jatuh Tempo', 'Total', 'Terbayar', 'Status', '']}
          loading={loading}
          error={null}
          empty={
            rows.length === 0 ? 'Belum ada riwayat tagihan pada filter ini.' : undefined
          }
        >
          {rows.map((inv) => (
            <tr key={inv.id} className="cursor-pointer" onClick={() => setDetail(inv)}>
              <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                {inv.student?.id ? (
                  <Link
                    href={`/kesiswaan/${inv.student.id}`}
                    className="font-medium text-sand-900 hover:text-primary-700 hover:underline"
                  >
                    {inv.student.name ?? '—'}
                  </Link>
                ) : (
                  <p className="font-medium text-sand-900">—</p>
                )}
                {inv.student?.nis ? (
                  <p className="text-[10px] text-sand-400">NIS {inv.student.nis}</p>
                ) : null}
              </td>
              <td className="px-5 py-3 text-sand-600">{inv.class?.name ?? '—'}</td>
              <td className="px-5 py-3">
                <p className="font-medium text-sand-900">{inv.title}</p>
                <p className="text-[10px] text-sand-400">
                  {inv.number} · {kindLabel(inv.kind)}
                </p>
              </td>
              <td className="whitespace-nowrap px-5 py-3 text-sand-600">
                {fmtDate(inv.dueAt)}
              </td>
              <td className="whitespace-nowrap px-5 py-3 text-right font-semibold text-sand-900">
                {rupiah(inv.amount)}
              </td>
              <td className="whitespace-nowrap px-5 py-3 text-right text-emerald-700">
                {inv.paidAmount > 0 ? rupiah(inv.paidAmount) : '—'}
              </td>
              <td className="px-5 py-3">
                <Badge tone={STATUS_TONE[inv.status] ?? 'neutral'}>
                  {STATUS_LABEL[inv.status] ?? inv.status}
                </Badge>
              </td>
              <td className="whitespace-nowrap px-5 py-3 text-right">
                <RowBtn
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDetail(inv);
                  }}
                >
                  Detail
                </RowBtn>
              </td>
            </tr>
          ))}
        </DataTable>
      </Widget>

      <Modal
        open={detail !== null}
        onClose={() => setDetail(null)}
        title={detail ? `Tagihan ${detail.number}` : ''}
      >
        {detail ? <InvoiceDetail invoice={detail} /> : null}
      </Modal>
    </Shell>
  );
}
