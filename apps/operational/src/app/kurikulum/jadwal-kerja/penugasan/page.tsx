'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Button, Field, Input, Modal, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { DataTable } from '@/components/data-table';
import { RowBtn } from '@/components/row-btn';
import { PageTitle, Widget } from '@/components/widgets';
import { PERMISSIONS } from '@smpmuh3/types';
import { usePermission } from '@/lib/use-permission';
import { useConfirm } from '@/components/confirm-dialog';
import {
  assignEmployeeShift,
  listEmployees,
  listEmployeeShifts,
  listWorkShifts,
  removeEmployeeShift,
  type EmployeeDto,
  type EmployeeShift,
  type WorkShift,
} from '@/lib/api';

const minToHHMM = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const DOW_LABELS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

/** Penugasan shift ke pegawai — halaman khusus, terpisah dari daftar shift. */
export default function PenugasanShiftPage() {
  const [shifts, setShifts] = useState<WorkShift[]>([]);
  const [empShifts, setEmpShifts] = useState<EmployeeShift[]>([]);
  const [employees, setEmployees] = useState<EmployeeDto[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [assignModal, setAssignModal] = useState(false);
  const [q, setQ] = useState('');
  const [fDay, setFDay] = useState('');
  const [fShift, setFShift] = useState('');
  const canManage = usePermission(PERMISSIONS.ACADEMIC_MANAGE);

  const load = useCallback(() => {
    listWorkShifts().then(setShifts).catch((e) => setError(e.message));
    listEmployeeShifts().then(setEmpShifts).catch(() => {});
    listEmployees().then(setEmployees).catch(() => {});
  }, []);
  useEffect(load, [load]);

  async function run<T>(fn: () => Promise<T>, ok: string) {
    setBusy(true); setError(''); setNotice('');
    try {
      const r = await fn();
      setNotice(ok);
      return r;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onAssign(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const employeeId = String(f.get('employeeId') ?? '');
    const shiftId = String(f.get('shiftId') ?? '');
    const dayOfWeek = Number(f.get('dayOfWeek'));
    if (!employeeId || !shiftId) { setError('Pilih pegawai & shift dulu.'); return; }
    const r = await run(() => assignEmployeeShift({ employeeId, shiftId, dayOfWeek }), 'Penugasan shift disimpan.');
    if (r !== undefined) { setAssignModal(false); load(); }
  }

  const { confirm, dialog } = useConfirm();

  async function onUnassign(id: string) {
    if (!(await confirm('Lepas penugasan shift pegawai ini?'))) return;
    const r = await run(() => removeEmployeeShift(id), 'Penugasan dilepas.');
    if (r !== undefined) load();
  }

  const filtered = empShifts.filter((es) => {
    if (fDay !== '' && es.dayOfWeek !== Number(fDay)) return false;
    if (fShift && es.shiftId !== fShift) return false;
    const needle = q.trim().toLowerCase();
    return !needle || `${es.employee?.name ?? ''} ${es.employee?.nip ?? ''}`.toLowerCase().includes(needle);
  });

  return (
    <Shell>
      <Link href="/kurikulum/jadwal-kerja" className="text-sm font-semibold text-primary-700 hover:text-primary-800">
        ← Jadwal Kerja
      </Link>
      <div className="mt-2">
        <PageTitle
          title="Penugasan Shift"
          subtitle="Pasang jadwal kerja shift ke pegawai — hari spesifik menimpa aturan 'tiap hari'"
        />
      </div>
      {error && <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>}
      {notice && <p className="mb-4 rounded-xl bg-primary-50 px-4 py-3 text-sm font-medium text-primary-800">{notice}</p>}

      <Widget
        title={`Semua Penugasan (${filtered.length})`}
        action={canManage ? <Button onClick={() => setAssignModal(true)} disabled={shifts.length === 0}>+ Pasang Shift</Button> : undefined}
      >
        <div className="mb-3 grid gap-2 sm:grid-cols-3">
          <Input placeholder="Cari pegawai (nama/NIP/NUPTK)…" value={q} onChange={(e) => setQ(e.target.value)} />
          <Select value={fDay} onChange={(e) => setFDay(e.target.value)}>
            <option value="">Semua hari</option>
            <option value="-1">Khusus: tiap hari</option>
            {DOW_LABELS.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </Select>
          <Select value={fShift} onChange={(e) => setFShift(e.target.value)}>
            <option value="">Semua shift</option>
            {shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </div>
        <DataTable head={['Pegawai', 'Shift', 'Hari', 'Jam', '']}>
          {filtered.map((es) => (
            <tr key={es.id}>
              <td className="px-5 py-2.5 font-semibold">
                {es.employee?.name ?? '—'}
                <span className="ml-1 text-xs text-slate-400">{es.employee?.nip ?? ''}</span>
              </td>
              <td className="px-5 py-2.5">{es.shift.name}</td>
              <td className="px-5 py-2.5">{es.dayOfWeek === -1 ? 'Tiap hari' : DOW_LABELS[es.dayOfWeek]}</td>
              <td className="px-5 py-2.5">{minToHHMM(es.shift.startMinute)}–{minToHHMM(es.shift.endMinute)}</td>
              <td className="px-5 py-2.5 text-right">
                {canManage ? <RowBtn tone="danger" onClick={() => onUnassign(es.id)}>Lepas</RowBtn> : null}
              </td>
            </tr>
          ))}
        </DataTable>
        {filtered.length === 0 && (
          <p className="py-4 text-center text-sm text-slate-500">
            {empShifts.length === 0
              ? 'Belum ada penugasan — pasang shift ke pegawai lewat tombol di atas.'
              : 'Tidak ada penugasan yang cocok dengan filter.'}
          </p>
        )}
      </Widget>

      <Modal open={assignModal} onClose={() => setAssignModal(false)} title="Pasang Shift ke Pegawai">
        <form onSubmit={onAssign} className="grid gap-3">
          <Field label="Pegawai">
            <Select name="employeeId" required defaultValue="">
              <option value="" disabled>Pilih pegawai…</option>
              {employees.filter((e) => e.isActive).map((e) => (
                <option key={e.id} value={e.id}>{e.name}{e.nip ? ` — ${e.nip}` : ''}</option>
              ))}
            </Select>
          </Field>
          <Field label="Shift">
            <Select name="shiftId" required defaultValue="">
              <option value="" disabled>Pilih shift…</option>
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({minToHHMM(s.startMinute)}–{minToHHMM(s.endMinute)})</option>
              ))}
            </Select>
          </Field>
          <Field label="Berlaku hari">
            <Select name="dayOfWeek" defaultValue="-1">
              <option value="-1">Tiap hari</option>
              {DOW_LABELS.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setAssignModal(false)}>Batal</Button>
            <Button type="submit" disabled={busy}>Pasang</Button>
          </div>
        </form>
      </Modal>
      {dialog}
    </Shell>
  );
}
