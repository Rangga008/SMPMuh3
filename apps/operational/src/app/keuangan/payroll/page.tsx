'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge, Button, Field, Input, Modal } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { DataTable } from '@/components/data-table';
import { PageTitle, Widget } from '@/components/widgets';
import { PERMISSIONS } from '@smpmuh3/types';
import {
  createPayrollRun,
  getPayrollSettings,
  listPayrollRuns,
  me,
  type PayrollRunView,
} from '@/lib/api';
import { monthLabel, periodLabel, RUN_LABEL, RUN_TONE, rupiah } from '@/components/payroll-slip';
import { rowActionClasses } from '@/components/row-btn';

export default function PayrollPage() {
  const [canManage, setCanManage] = useState(false);
  const [runs, setRuns] = useState<PayrollRunView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [createModal, setCreateModal] = useState(false);
  const [cycle, setCycle] = useState({ start: 21, end: 19 });

  const loadRuns = useCallback(() => {
    listPayrollRuns()
      .then(setRuns)
      .catch(() => setError('Gagal memuat run.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    me().then((u) => setCanManage(u.permissions.includes(PERMISSIONS.PAYROLL_MANAGE))).catch(() => undefined);
    getPayrollSettings()
      .then((s) => setCycle({ start: s.periodStartDay ?? 21, end: s.periodEndDay ?? 19 }))
      .catch(() => undefined);
    loadRuns();
  }, [loadRuns]);

  return (
    <Shell>
      <PageTitle
        title="Gaji & Honor"
        subtitle="Run penggajian bulanan — buka detail untuk rincian per pegawai & slip"
        actions={
          canManage ? (
            <Button size="sm" onClick={() => setCreateModal(true)}>+ Run Baru</Button>
          ) : undefined
        }
      />
      {error ? <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p> : null}
      {notice ? <p role="status" className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{notice}</p> : null}

      <Widget title={`Run Penggajian (${runs.length})`}>
        <DataTable
          head={['Periode', 'Pegawai', 'Minggu', 'Total Netto', 'Status', '']}
          loading={loading}
          error={null}
          empty={runs.length === 0 ? 'Belum ada run penggajian.' : undefined}
        >
          {runs.map((r) => (
            <tr key={r.id}>
              <td className="px-5 py-3">
                <Link href={`/keuangan/payroll/${r.id}`} className="font-semibold text-primary-700 hover:underline">
                  {monthLabel(r.month)}
                </Link>
                <p className="text-[10px] text-sand-400">Absen {periodLabel(r)}</p>
                {r.note ? <p className="text-[10px] text-sand-400">{r.note}</p> : null}
              </td>
              <td className="px-5 py-3 text-sand-600">{r._count?.items ?? 0} orang</td>
              <td className="px-5 py-3 text-sand-600">{r.weeks}</td>
              <td className="whitespace-nowrap px-5 py-3 text-right font-bold text-sand-900">
                {r.totalNet != null ? rupiah(r.totalNet) : '—'}
              </td>
              <td className="px-5 py-3">
                <Badge tone={RUN_TONE[r.status] ?? 'neutral'}>{RUN_LABEL[r.status] ?? r.status}</Badge>
              </td>
              <td className="whitespace-nowrap px-5 py-3 text-right">
                <Link href={`/keuangan/payroll/${r.id}`} className={rowActionClasses()}>
                  Detail
                </Link>
              </td>
            </tr>
          ))}
        </DataTable>
      </Widget>

      {/* Modal run baru */}
      <Modal open={createModal} onClose={() => setCreateModal(false)} title="Run Penggajian Baru">
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setBusy(true);
            setError(null);
            createPayrollRun({
              month: String(f.get('month')),
              weeks: Number(f.get('weeks')) || 4,
              ...(f.get('periodStart') ? { periodStart: String(f.get('periodStart')) } : {}),
              ...(f.get('periodEnd') ? { periodEnd: String(f.get('periodEnd')) } : {}),
              ...(f.get('note') ? { note: String(f.get('note')) } : {}),
            })
              .then((r) => {
                setCreateModal(false);
                setNotice('Run dibuat & dihitung.');
                loadRuns();
                window.location.href = `/keuangan/payroll/${r.id}`;
                return r;
              })
              .catch((err) => setError(err instanceof Error ? err.message : 'Gagal membuat run.'))
              .finally(() => setBusy(false));
          }}
        >
          <Field label="Bulan" hint="Bulan tagihan gaji — satu run per bulan">
            <Input name="month" type="month" required defaultValue={new Date().toISOString().slice(0, 7)}
              onChange={(e) => {
                // Auto-isi periode absen dari siklus saat bulan diganti.
                const [y, m] = e.target.value.split('-').map(Number);
                if (!y || !m) return;
                const startMonth = cycle.start > cycle.end ? m - 1 : m;
                const clamp = (yy: number, mm: number, d: number) => {
                  const dim = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
                  return new Date(Date.UTC(yy, mm - 1, Math.min(d, dim))).toISOString().slice(0, 10);
                };
                const form = e.target.form;
                const si = form?.elements.namedItem('periodStart') as HTMLInputElement | null;
                const ei = form?.elements.namedItem('periodEnd') as HTMLInputElement | null;
                if (si) si.value = clamp(startMonth < 1 ? y - 1 : y, ((startMonth - 1 + 12) % 12) + 1, cycle.start);
                if (ei) ei.value = clamp(y, m, cycle.end);
              }} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Absen mulai" hint={`Siklus: tgl ${cycle.start}`}>
              <Input name="periodStart" type="date" />
            </Field>
            <Field label="Absen sampai" hint={`Siklus: tgl ${cycle.end}`}>
              <Input name="periodEnd" type="date" />
            </Field>
          </div>
          <p className="-mt-1 text-[11px] text-sand-400">
            Periode absen boleh melintasi bulan (mis. 21 {cycle.start > cycle.end ? 'bulan lalu' : ''} → {cycle.end} bulan tagihan). Kosongkan = otomatis dari siklus. Ubah siklus di Pengaturan → Gaji.
          </p>
          <Field label="Jumlah Minggu Aktif" hint="Jam wajib pegawai dikalikan angka ini">
            <Input name="weeks" type="number" min={1} max={6} defaultValue={4} required />
          </Field>
          <Field label="Catatan">
            <Input name="note" placeholder="opsional" />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setCreateModal(false)}>Batal</Button>
            <Button type="submit" disabled={busy}>Buat & Hitung</Button>
          </div>
        </form>
      </Modal>
    </Shell>
  );
}
