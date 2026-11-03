'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Field, Input, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { DataTable } from '@/components/data-table';
import { PageTitle, Widget } from '@/components/widgets';
import { PERMISSIONS } from '@smpmuh3/types';
import {
  listEmpAttendance,
  listPayrollEmployees,
  me,
  saveEmpAttendance,
  type EmpAttendance,
  type EmployeePayroll,
} from '@/lib/api';

const STATUSES = ['HADIR', 'TELAT', 'IZIN', 'SAKIT', 'ALPHA'] as const;
const STATUS_TONE: Record<string, 'primary' | 'accent' | 'neutral' | 'danger'> = {
  HADIR: 'primary',
  TELAT: 'accent',
  IZIN: 'neutral',
  SAKIT: 'neutral',
  ALPHA: 'danger',
};

type Row = { status: (typeof STATUSES)[number]; minutes: string; note: string };

export default function AbsensiPage() {
  const [canManage, setCanManage] = useState(false);
  const [employees, setEmployees] = useState<EmployeePayroll[]>([]);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [monthly, setMonthly] = useState<EmpAttendance[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  const loadMonth = useCallback(() => {
    listEmpAttendance(month).then(setMonthly).catch(() => setMonthly([]));
  }, [month]);

  const loadDay = useCallback(() => {
    if (employees.length === 0) return;
    setLoading(true);
    listEmpAttendance(month)
      .then((all) => {
        const dayRows = all.filter((a) => a.date.slice(0, 10) === date);
        const next: Record<string, Row> = {};
        for (const e of employees) {
          const r = dayRows.find((x) => x.employeeId === e.id);
          next[e.id] = r
            ? { status: r.status, minutes: String(r.teachingMinutes || ''), note: r.note ?? '' }
            : { status: 'HADIR', minutes: '', note: '' };
        }
        setRows(next);
      })
      .catch(() => setError('Gagal memuat absensi.'))
      .finally(() => setLoading(false));
  }, [employees, date, month]);

  useEffect(() => {
    listPayrollEmployees().then(setEmployees).catch(() => undefined);
    me().then((u) => setCanManage(u.permissions.includes(PERMISSIONS.PAYROLL_MANAGE))).catch(() => undefined);
  }, []);

  useEffect(() => {
    loadMonth();
  }, [loadMonth]);

  useEffect(() => {
    loadDay();
  }, [loadDay]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const entries = Object.entries(rows).map(([employeeId, r]) => ({
        employeeId,
        status: r.status,
        teachingMinutes: Number(r.minutes) || 0,
        ...(r.note ? { note: r.note } : {}),
      }));
      await saveEmpAttendance({ date, entries });
      setNotice(`Absensi ${date} tersimpan (${entries.length} pegawai).`);
      loadMonth();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan.');
    } finally {
      setBusy(false);
    }
  }

  const summary = employees.map((e) => {
    const recs = monthly.filter((a) => a.employeeId === e.id);
    const count = (s: string) => recs.filter((r) => r.status === s).length;
    const minutes = recs
      .filter((r) => r.status === 'HADIR' || r.status === 'TELAT')
      .reduce((s, r) => s + r.teachingMinutes, 0);
    return { emp: e, hadir: count('HADIR'), telat: count('TELAT'), izin: count('IZIN'), sakit: count('SAKIT'), alpha: count('ALPHA'), minutes };
  });

  return (
    <Shell>
      <PageTitle
        title="Absensi Pegawai"
        subtitle="Catat kehadiran harian + menit mengajar — transport & gaji dihitung dari sini"
      />
      {error ? <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p> : null}
      {notice ? <p role="status" className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{notice}</p> : null}

      <Widget
        title={`Entri Harian — ${date}`}
        action={
          canManage ? (
            <Button size="sm" onClick={() => void save()} disabled={busy || loading}>
              Simpan Semua
            </Button>
          ) : undefined
        }
      >
        <div className="mb-4 max-w-56">
          <Field label="Tanggal">
            <Input type="date" value={date} onChange={(e) => { setDate(e.target.value); setMonth(e.target.value.slice(0, 7)); }} />
          </Field>
        </div>
        <DataTable
          head={['Pegawai', 'Status', 'Menit ngajar', 'Catatan']}
          loading={loading}
          error={null}
          empty={employees.length === 0 ? 'Belum ada pegawai aktif.' : undefined}
        >
          {employees.map((e) => {
            const r = rows[e.id] ?? { status: 'HADIR' as const, minutes: '', note: '' };
            return (
              <tr key={e.id}>
                <td className="px-5 py-2.5">
                  <p className="font-medium text-sand-900">{e.name}</p>
                  <p className="text-[10px] text-sand-400">{e.nip ?? ''}{e.payScale?.name ? ` · ${e.payScale.name}` : ''}</p>
                </td>
                <td className="px-5 py-2.5">
                  <Select
                    aria-label={`Status ${e.name}`}
                    value={r.status}
                    disabled={!canManage}
                    onChange={(ev) =>
                      setRows((prev) => ({
                        ...prev,
                        [e.id]: { ...r, status: ev.target.value as Row['status'] },
                      }))
                    }
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </Select>
                </td>
                <td className="px-5 py-2.5">
                  <Input
                    aria-label={`Menit ${e.name}`}
                    type="number"
                    min={0}
                    placeholder="0"
                    className="w-24"
                    value={r.minutes}
                    disabled={!canManage || r.status === 'IZIN' || r.status === 'SAKIT' || r.status === 'ALPHA'}
                    onChange={(ev) =>
                      setRows((prev) => ({
                        ...prev,
                        [e.id]: { ...r, minutes: ev.target.value },
                      }))
                    }
                  />
                </td>
                <td className="px-5 py-2.5">
                  <Input
                    aria-label={`Catatan ${e.name}`}
                    placeholder="opsional"
                    value={r.note}
                    disabled={!canManage}
                    onChange={(ev) =>
                      setRows((prev) => ({
                        ...prev,
                        [e.id]: { ...r, note: ev.target.value },
                      }))
                    }
                  />
                </td>
              </tr>
            );
          })}
        </DataTable>
      </Widget>

      <div className="mt-5">
        <Widget
          title={`Rekap Bulan ${new Date(`${month}-15`).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}`}
        >
          <div className="mb-4 max-w-56">
            <Field label="Bulan">
              <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            </Field>
          </div>
          <DataTable
            head={['Pegawai', 'Hadir', 'Telat', 'Izin', 'Sakit', 'Alpha', 'Menit efektif']}
            loading={false}
            error={null}
            empty={employees.length === 0 ? '—' : undefined}
          >
            {summary.map((s) => (
              <tr key={s.emp.id}>
                <td className="px-5 py-2.5 font-medium text-sand-900">{s.emp.name}</td>
                <td className="px-5 py-2.5"><Badge tone={STATUS_TONE.HADIR ?? 'neutral'}>{s.hadir}</Badge></td>
                <td className="px-5 py-2.5"><Badge tone={STATUS_TONE.TELAT ?? 'neutral'}>{s.telat}</Badge></td>
                <td className="px-5 py-2.5"><Badge tone={STATUS_TONE.IZIN ?? 'neutral'}>{s.izin}</Badge></td>
                <td className="px-5 py-2.5"><Badge tone={STATUS_TONE.SAKIT ?? 'neutral'}>{s.sakit}</Badge></td>
                <td className="px-5 py-2.5"><Badge tone={STATUS_TONE.ALPHA ?? 'neutral'}>{s.alpha}</Badge></td>
                <td className="whitespace-nowrap px-5 py-2.5 font-semibold text-sand-900">
                  {(s.minutes / 60).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jam
                  <span className="ml-1 text-xs font-normal text-sand-400">({s.minutes} mnt)</span>
                </td>
              </tr>
            ))}
          </DataTable>
        </Widget>
      </div>
    </Shell>
  );
}
