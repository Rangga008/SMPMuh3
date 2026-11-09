'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Field, Input, Modal, Select } from '@smpmuh3/ui';
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

const DOW = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

export default function AbsensiPage() {
  const [canManage, setCanManage] = useState(false);
  const [employees, setEmployees] = useState<EmployeePayroll[]>([]);
  // date kosong = belum pilih tanggal (kalender-first sesuai alur TU)
  const [date, setDate] = useState('');
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [monthly, setMonthly] = useState<EmpAttendance[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [daySearch, setDaySearch] = useState('');

  const loadMonth = useCallback(() => {
    listEmpAttendance(month).then(setMonthly).catch(() => setMonthly([]));
  }, [month]);

  const loadDay = useCallback(() => {
    if (employees.length === 0 || !date) return;
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
    const lateMin = recs.reduce((s, r) => s + (r.lateMinutes || 0), 0);
    return { emp: e, hadir: count('HADIR'), telat: count('TELAT'), izin: count('IZIN'), sakit: count('SAKIT'), alpha: count('ALPHA'), minutes, lateMin };
  });

  return (
    <Shell>
      <PageTitle
        title="Absensi Pegawai — Sinkron Gaji"
        subtitle="Data tap dari mesin (dikelola Tata Usaha) + penyesuaian status & menit mengajar untuk payroll"
      />
      {error ? <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p> : null}
      {notice ? <p role="status" className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{notice}</p> : null}

      <Widget
        title="Kalender Entri Absensi"
        action={
          <div className="w-40">
            <Field label="Bulan">
              <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            </Field>
          </div>
        }
      >
        <p className="mb-3 text-xs text-sand-500">
          Klik tanggal untuk membuka entri harian — titik hijau menandai tanggal sudah ada data.
        </p>
        <div className="grid grid-cols-7 gap-1.5 text-xs">
          {DOW.map((d) => (
            <p key={d} className="pb-1 text-center font-bold uppercase tracking-wider text-sand-400">{d}</p>
          ))}
          {(() => {
            const [y, mo] = month.split('-').map(Number);
            const dim = new Date(y!, mo!, 0).getDate();
            const firstDow = new Date(Date.UTC(y!, mo! - 1, 1)).getUTCDay();
            const offset = (firstDow + 6) % 7;
            const hasData = new Set(monthly.map((a) => a.date.slice(0, 10)));
            const cells: (number | null)[] = [
              ...Array<null>(offset).fill(null),
              ...Array.from({ length: dim }, (_, i) => i + 1),
            ];
            while (cells.length % 7 !== 0) cells.push(null);
            return cells.map((d, i) => {
              if (d === null) return <span key={`e${i}`} />;
              const iso = `${month}-${String(d).padStart(2, '0')}`;
              const selected = date === iso;
              const today = new Date().toISOString().slice(0, 10) === iso;
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => { setDate(iso); setDaySearch(''); }}
                  className={`relative flex h-14 flex-col items-center justify-center rounded-xl font-semibold transition ${
                    selected
                      ? 'bg-primary-600 text-white shadow'
                      : today
                        ? 'bg-primary-100 text-primary-800 hover:bg-primary-200'
                        : 'bg-white text-sand-700 ring-1 ring-sand-200 hover:bg-sand-100'
                  }`}
                >
                  {d}
                  {hasData.has(iso) ? (
                    <span className={`absolute bottom-1.5 size-1.5 rounded-full ${selected ? 'bg-white' : 'bg-emerald-500'}`} />
                  ) : null}
                </button>
              );
            });
          })()}
        </div>
        <p className="mt-2 text-[11px] text-sand-400">
          • titik hijau = tanggal sudah ada data absen
        </p>
      </Widget>

      <Modal
        open={Boolean(date)}
        onClose={() => setDate('')}
        title={`Entri Harian — ${date ? new Date(`${date}T12:00:00`).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : ''}`}
      >
        <div className="mb-3 flex items-end gap-3">
          <div className="w-64">
            <Field label="Cari pegawai">
              <Input
                type="search"
                value={daySearch}
                onChange={(e) => setDaySearch(e.target.value)}
                placeholder="Nama / NIP…"
              />
            </Field>
          </div>
          {canManage ? (
            <Button size="sm" className="ml-auto" onClick={() => void save()} disabled={busy || loading}>
              Simpan Semua
            </Button>
          ) : null}
        </div>
        <DataTable
          head={['Pegawai', 'Masuk', 'Pulang', 'Status', 'Menit ngajar', 'Catatan']}
          loading={loading}
          error={null}
          empty={employees.length === 0 ? 'Belum ada pegawai aktif.' : 'Tidak ada pegawai cocok dengan pencarian.'}
        >
          {employees
            .filter((e) => {
              const q = daySearch.trim().toLowerCase();
              return !q || `${e.name} ${e.nip ?? ''}`.toLowerCase().includes(q);
            })
            .map((e) => {
            const r = rows[e.id] ?? { status: 'HADIR' as const, minutes: '', note: '' };
            const rec = monthly.find((a) => a.employeeId === e.id && a.date.slice(0, 10) === date);
            return (
              <tr key={e.id}>
                <td className="px-5 py-2.5">
                  <p className="font-medium text-sand-900">{e.name}</p>
                  <p className="text-[10px] text-sand-400">{e.nip ?? ''}{e.payScale?.name ? ` · ${e.payScale.name}` : ''}</p>
                </td>
                <td className="px-5 py-2.5 font-semibold text-sand-900">
                  {rec?.checkInAt ? new Date(rec.checkInAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '—'}
                </td>
                <td className="px-5 py-2.5 font-semibold text-sand-900">
                  {rec?.checkOutAt ? new Date(rec.checkOutAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '—'}
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
      </Modal>

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
            head={['Pegawai', 'Hadir', 'Telat', 'Izin', 'Sakit', 'Alpha', 'Akumulasi telat', 'Menit efektif']}
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
                <td className="whitespace-nowrap px-5 py-2.5 font-semibold text-amber-700">
                  {s.lateMin ? `${s.lateMin} mnt` : '—'}
                </td>
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
