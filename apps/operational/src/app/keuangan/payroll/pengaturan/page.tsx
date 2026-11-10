'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Field, Input, Modal, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { DataTable } from '@/components/data-table';
import { PageTitle, Widget } from '@/components/widgets';
import { SearchSelect } from '@/components/search-select';
import { PERMISSIONS } from '@smpmuh3/types';
import {
  createDeductionType,
  createEmployeeDeduction,
  createEmployeeHonor,
  createHonorType,
  createLoan,
  createPayScale,
  deleteBosHonor,
  deleteEmployeeDeduction,
  deleteEmployeeHonor,
  deleteHonorType,
  deletePayScale,
  getPensionLedger,
  getPensionSummary,
  getPayrollSettings,
  listBosHonors,
  listCashAccounts,
  listDeductionTypes,
  listEmployeeDeductions,
  listEmployeeHonors,
  listHonorTypes,
  listLoans,
  listPayrollEmployees,
  listPayScales,
  me,
  updateDeductionType,
  updateEmployeeDeduction,
  updateEmployeeHonor,
  updateHonorType,
  updateEmployeePayrollSettings,
  updateLoan,
  updatePayrollSettings,
  updatePayScale,
  upsertBosHonor,
  type BosHonorView,
  type CashAccountView,
  type DeductionTypeView,
  type EmployeeDeductionView,
  type EmployeeHonorView,
  type EmployeePayroll,
  type HonorTypeView,
  type LoanView,
  type PayScaleView,
  type PensionSummaryRow,
  type PayrollSettings,
} from '@/lib/api';

import { RowBtn } from '@/components/row-btn';
import { useConfirm } from '@/components/confirm-dialog';
const rupiah = (n: number) => `Rp${n.toLocaleString('id-ID')}`;
const PERIOD_LABEL: Record<string, string> = {
  MONTHLY: 'Per bulan',
  PER_SESSION: 'Per sesi',
  ONE_TIME: 'Sekali',
};
const LOAN_LABEL: Record<string, string> = {
  KASBON: 'Kasbon (kas sekolah)',
  KOOPERASI: 'Koperasi',
  EKSTERNAL: 'Koperasi luar',
};

const TABS = ['Pegawai', 'Golongan', 'Honor', 'Potongan', 'Pinjaman', 'Pensiun & BOS'] as const;
type Tab = (typeof TABS)[number];

export default function PayrollPengaturanPage() {
  const { confirm, dialog } = useConfirm();
  const [tab, setTab] = useState<Tab>('Pegawai');
  const [canManage, setCanManage] = useState(false);
  const [employees, setEmployees] = useState<EmployeePayroll[]>([]);
  const [scales, setScales] = useState<PayScaleView[]>([]);
  const [honorTypes, setHonorTypes] = useState<HonorTypeView[]>([]);
  const [honors, setHonors] = useState<EmployeeHonorView[]>([]);
  const [dedTypes, setDedTypes] = useState<DeductionTypeView[]>([]);
  const [deductions, setDeductions] = useState<EmployeeDeductionView[]>([]);
  const [loans, setLoans] = useState<LoanView[]>([]);
  const [accounts, setAccounts] = useState<CashAccountView[]>([]);
  const [pension, setPension] = useState<PensionSummaryRow[]>([]);
  const [bos, setBos] = useState<BosHonorView[]>([]);
  const [payrollSettings, setPayrollSettings] = useState<PayrollSettings | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [empModal, setEmpModal] = useState<EmployeePayroll | null>(null);
  const [scaleModal, setScaleModal] = useState<false | PayScaleView>(false);
  const [honorTypeModal, setHonorTypeModal] = useState<HonorTypeView | 'new' | null>(null);
  const [dedTypeModal, setDedTypeModal] = useState<DeductionTypeView | 'new' | null>(null);
  const [honorModal, setHonorModal] = useState(false);
  const [dedModal, setDedModal] = useState(false);
  const [loanModal, setLoanModal] = useState(false);
  const [bosModal, setBosModal] = useState(false);
  const [ledger, setLedger] = useState<{ name: string; entries: { month: string; amount: number; note?: string | null }[]; total: number } | null>(null);
  const [loanEdit, setLoanEdit] = useState<LoanView | null>(null);

  const loadAll = useCallback(() => {
    listPayrollEmployees().then(setEmployees).catch(() => undefined);
    listPayScales().then(setScales).catch(() => undefined);
    listHonorTypes().then(setHonorTypes).catch(() => undefined);
    listEmployeeHonors().then(setHonors).catch(() => undefined);
    listDeductionTypes().then(setDedTypes).catch(() => undefined);
    listEmployeeDeductions().then(setDeductions).catch(() => undefined);
    listLoans({}).then(setLoans).catch(() => undefined);
    listCashAccounts().then(setAccounts).catch(() => undefined);
    getPensionSummary().then(setPension).catch(() => undefined);
    listBosHonors({}).then(setBos).catch(() => undefined);
    getPayrollSettings().then(setPayrollSettings).catch(() => undefined);
  }, []);

  useEffect(() => {
    loadAll();
    me().then((u) => setCanManage(u.permissions.includes(PERMISSIONS.PAYROLL_MANAGE))).catch(() => undefined);
  }, [loadAll]);

  async function run(fn: () => Promise<unknown>, msg: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fn();
      setNotice(msg);
      loadAll();
      return res;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Aksi gagal.');
      return null;
    } finally {
      setBusy(false);
    }
  }

  const loadEmp = useCallback(
    (q: string) =>
      Promise.resolve(
        employees.filter((e) => e.name.toLowerCase().includes(q.trim().toLowerCase())),
      ),
    [employees],
  );
  const empLabel = (e: EmployeePayroll) => e.name;
  const empSub = (e: EmployeePayroll) => e.nip;

  return (
    <Shell>
      <PageTitle
        title="Pengaturan Gaji & Honor"
        subtitle="Golongan masa kerja, honor, potongan, pinjaman/koperasi, dana pensiun, honor BOS, dan pengaturan per pegawai"
      />
      {error ? <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p> : null}
      {notice ? <p role="status" className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{notice}</p> : null}

      <div className="mb-5 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={async () => setTab(t)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
              tab === t ? 'bg-primary-600 text-white' : 'bg-sand-100 text-sand-600 hover:bg-sand-200'
            }`}
>
            {t}
          </button>
        ))}
      </div>

      {tab === 'Pegawai' ? (
        <Widget title="Pengaturan Payroll per Pegawai">
          <DataTable
            head={['Pegawai', 'Masa kerja', 'Golongan', 'Jam wajib/mgg', 'Tarif/jam', 'Transport/jam', 'Sertifikasi', ...(canManage ? [''] : [])]}
            loading={false}
            error={null}
            empty={employees.length === 0 ? 'Belum ada pegawai.' : undefined}
>
            {employees.map((e) => (
              <tr key={e.id}>
                <td className="px-5 py-3">
                  <p className="font-medium text-sand-900">{e.name}</p>
                  <p className="text-[10px] text-sand-400">{e.nip ?? ''} · {e.staffKind ? e.staffKind : e.type === 'TEACHER' ? 'Guru' : 'Tendik'}</p>
                </td>
                <td className="px-5 py-3 text-sand-600">{e.serviceYears !== null && e.serviceYears !== undefined ? `${e.serviceYears} th` : '—'}</td>
                <td className="px-5 py-3 text-sand-800">{e.payScale?.name ?? '—'}</td>
                <td className="px-5 py-3 text-sand-600">{(e.weeklyRequiredMinutes / 60).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jam</td>
                <td className="whitespace-nowrap px-5 py-3 text-sand-600">
                  {e.hourlyRate != null ? rupiah(e.hourlyRate) : (e.payScale ? `${rupiah(e.payScale.hourlyRate)} (gol.)` : '—')}
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-sand-600">
                  {e.transportRate != null ? rupiah(e.transportRate) : (e.payScale ? `${rupiah(e.payScale.transportRate)} (gol.)` : '—')}
                </td>
                <td className="px-5 py-3">{e.isCertified ? <Badge tone="primary">Sertifikasi</Badge> : <span className="text-sand-400">—</span>}</td>
                {canManage ? (
                  <td className="whitespace-nowrap px-5 py-3 text-right">
                    <RowBtn type="button" onClick={async () => setEmpModal(e)}>Atur</RowBtn>
                  </td>
                ) : null}
              </tr>
            ))}
          </DataTable>
        </Widget>
      ) : null}

      {tab === 'Golongan' ? (
        <Widget
          title="Golongan Masa Kerja"
          action={canManage ? <Button size="sm" onClick={async () => setScaleModal({} as PayScaleView)}>+ Golongan</Button> : undefined}
>
          <DataTable head={['Nama', 'Masa kerja', 'Tarif/jam', 'Transport/jam', 'Pegawai', 'Status', ...(canManage ? [''] : [])]} loading={false} error={null} empty={scales.length === 0 ? 'Belum ada golongan.' : undefined}>
            {scales.map((s) => (
              <tr key={s.id}>
                <td className="px-5 py-3 font-medium text-sand-900">{s.name}</td>
                <td className="px-5 py-3 text-sand-600">{s.minYears}–{s.maxYears ?? '∞'} tahun</td>
                <td className="whitespace-nowrap px-5 py-3">{rupiah(s.hourlyRate)}</td>
                <td className="whitespace-nowrap px-5 py-3">{rupiah(s.transportRate)}</td>
                <td className="px-5 py-3 text-sand-600">{s._count?.employees ?? 0}</td>
                <td className="px-5 py-3">{s.isActive ? <Badge tone="primary">Aktif</Badge> : <Badge tone="neutral">Nonaktif</Badge>}</td>
                {canManage ? (
                  <td className="whitespace-nowrap px-5 py-3 text-right">
                    <span className="flex justify-end gap-2">
                      <RowBtn type="button" onClick={async () => setScaleModal(s)}>Edit</RowBtn>
                      <RowBtn tone="danger" type="button" onClick={async () => { if (await confirm('Hapus golongan?')) void run(() => deletePayScale(s.id), 'Golongan dihapus.'); }}>Hapus</RowBtn>
                    </span>
                  </td>
                ) : null}
              </tr>
            ))}
          </DataTable>
        </Widget>
      ) : null}

      {tab === 'Honor' ? (
        <div className="grid gap-5">
          <Widget
            title="Tipe Honor"
            action={canManage ? <Button size="sm" onClick={async () => setHonorTypeModal('new')}>+ Tipe</Button> : undefined}
>
            <DataTable head={['Nama', 'Periode', 'Default', 'Dipakai', ...(canManage ? [''] : [])]} loading={false} error={null} empty={honorTypes.length === 0 ? '—' : undefined}>
              {honorTypes.map((t) => (
                <tr key={t.id}>
                  <td className="px-5 py-3 font-medium text-sand-900">{t.name}</td>
                  <td className="px-5 py-3 text-sand-600">{PERIOD_LABEL[t.period]}</td>
                  <td className="whitespace-nowrap px-5 py-3">{rupiah(t.defaultAmount)}</td>
                  <td className="px-5 py-3 text-sand-600">{t._count?.honors ?? 0}</td>
                  {canManage ? (
                    <td className="px-5 py-3 text-right">
                      <span className="flex justify-end gap-2">
                        <RowBtn type="button" onClick={async () => setHonorTypeModal(t)}>Edit</RowBtn>
                        <RowBtn tone="danger" type="button" onClick={async () => { if (await confirm('Hapus tipe?')) void run(() => deleteHonorType(t.id), 'Tipe dihapus.'); }}>Hapus</RowBtn>
                      </span>
                    </td>
                  ) : null}
                </tr>
              ))}
            </DataTable>
          </Widget>
          <Widget
            title="Honor Pegawai"
            action={canManage ? <Button size="sm" onClick={async () => setHonorModal(true)}>+ Honor Pegawai</Button> : undefined}
>
            <DataTable head={['Pegawai', 'Tipe', 'Nominal', 'Berlaku', 'Status', ...(canManage ? [''] : [])]} loading={false} error={null} empty={honors.length === 0 ? 'Belum ada honor.' : undefined}>
              {honors.map((h) => (
                <tr key={h.id}>
                  <td className="px-5 py-3 font-medium text-sand-900">{h.employee?.name}</td>
                  <td className="px-5 py-3 text-sand-600">
                    {h.honorType?.name}
                    {h.honorType?.period === 'ONE_TIME' && h.eventName ? <span className="block text-[10px] text-sand-400">{h.eventName} · {h.eventMonth}</span> : null}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3">
                    {h.amount != null ? rupiah(h.amount) : 'default'}
                    {h.honorType?.period === 'PER_SESSION' ? <span className="text-xs text-sand-400"> × {h.sessions} sesi</span> : null}
                  </td>
                  <td className="px-5 py-3 text-xs text-sand-500">{h.validFrom ?? '…'} → {h.validTo ?? 'terus'}</td>
                  <td className="px-5 py-3">{h.isActive ? <Badge tone="primary">Aktif</Badge> : <Badge tone="neutral">Nonaktif</Badge>}</td>
                  {canManage ? (
                    <td className="px-5 py-3 text-right">
                      <span className="flex justify-end gap-2">
                        <RowBtn tone="neutral" type="button" onClick={async () => void run(() => updateEmployeeHonor(h.id, { isActive: !h.isActive }), 'Diperbarui.')}>{h.isActive ? 'Nonaktifkan' : 'Aktifkan'}</RowBtn>
                        <RowBtn tone="danger" type="button" onClick={async () => { if (await confirm('Hapus honor?')) void run(() => deleteEmployeeHonor(h.id), 'Honor dihapus.'); }}>Hapus</RowBtn>
                      </span>
                    </td>
                  ) : null}
                </tr>
              ))}
            </DataTable>
          </Widget>
        </div>
      ) : null}

      {tab === 'Potongan' ? (
        <div className="grid gap-5">
          <Widget
            title="Potongan Keterlambatan Otomatis"
            action={<p className="text-xs text-sand-500">dari data absen mesin/entri harian</p>}
          >
            <form
              className="grid max-w-xl gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void run(
                  () =>
                    updatePayrollSettings({
                      lateDeductionPerDay: Number(f.get('lateDeductionPerDay')) || 0,
                      lateDeductionPerMin: Number(f.get('lateDeductionPerMin')) || 0,
                    }),
                  'Pengaturan potongan keterlambatan disimpan.',
                );
              }}
            >
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Terapkan ke slip gaji per periode — akumulasi hari <b>TELAT</b> + total menit telat dari
                tap mesin (shift-aware). Isi 0 untuk menonaktifkan.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Potongan per hari telat (Rp)" hint="tarif tetap tiap hari berstatus TELAT">
                  <Input
                    type="number"
                    name="lateDeductionPerDay"
                    min={0}
                    step={1000}
                    defaultValue={payrollSettings?.lateDeductionPerDay ?? 0}
                    disabled={!canManage}
                  />
                </Field>
                <Field label="Potongan per menit telat (Rp)" hint="akumulasi menit dari jam masuk shift">
                  <Input
                    type="number"
                    name="lateDeductionPerMin"
                    min={0}
                    step={500}
                    defaultValue={payrollSettings?.lateDeductionPerMin ?? 0}
                    disabled={!canManage}
                  />
                </Field>
              </div>
              {payrollSettings ? (
                <p className="text-xs text-sand-500">
                  Contoh bulan ini: 3 hari telat + 45 menit →{' '}
                  <b>
                    {rupiah(
                      3 * payrollSettings.lateDeductionPerDay +
                        45 * payrollSettings.lateDeductionPerMin,
                    )}
                  </b>
                </p>
              ) : null}
              {canManage ? (
                <div>
                  <Button type="submit" disabled={busy}>Simpan</Button>
                </div>
              ) : null}
            </form>
          </Widget>
          <Widget
            title="Tipe Potongan"
            action={canManage ? <Button size="sm" onClick={async () => setDedTypeModal('new')}>+ Tipe</Button> : undefined}
>
            <DataTable head={['Nama', 'Default', 'Berulang', ...(canManage ? [''] : [])]} loading={false} error={null} empty={dedTypes.length === 0 ? '—' : undefined}>
              {dedTypes.map((t) => (
                <tr key={t.id}>
                  <td className="px-5 py-3 font-medium text-sand-900">{t.name}</td>
                  <td className="whitespace-nowrap px-5 py-3">{rupiah(t.defaultAmount)}</td>
                  <td className="px-5 py-3 text-sand-600">{t.isRecurring ? 'Tiap bulan' : 'Sekali'}</td>
                  {canManage ? (
                    <td className="px-5 py-3 text-right">
                      <RowBtn type="button" onClick={async () => setDedTypeModal(t)}>Edit</RowBtn>
                    </td>
                  ) : null}
                </tr>
              ))}
            </DataTable>
          </Widget>
          <Widget
            title="Potongan Pegawai"
            action={canManage ? <Button size="sm" onClick={async () => setDedModal(true)}>+ Potongan Pegawai</Button> : undefined}
>
            <DataTable head={['Pegawai', 'Tipe', 'Nominal', 'Bulan', 'Status', ...(canManage ? [''] : [])]} loading={false} error={null} empty={deductions.length === 0 ? 'Belum ada potongan.' : undefined}>
              {deductions.map((d) => (
                <tr key={d.id}>
                  <td className="px-5 py-3 font-medium text-sand-900">{d.employee?.name}</td>
                  <td className="px-5 py-3 text-sand-600">{d.deductionType?.name}</td>
                  <td className="whitespace-nowrap px-5 py-3">{d.amount != null ? rupiah(d.amount) : 'default'}</td>
                  <td className="px-5 py-3 text-xs text-sand-500">{d.month ?? 'Tiap bulan'}</td>
                  <td className="px-5 py-3">{d.isActive ? <Badge tone="primary">Aktif</Badge> : <Badge tone="neutral">Nonaktif</Badge>}</td>
                  {canManage ? (
                    <td className="px-5 py-3 text-right">
                      <span className="flex justify-end gap-2">
                        <RowBtn tone="neutral" type="button" onClick={async () => void run(() => updateEmployeeDeduction(d.id, { isActive: !d.isActive }), 'Diperbarui.')}>{d.isActive ? 'Nonaktifkan' : 'Aktifkan'}</RowBtn>
                        <RowBtn tone="danger" type="button" onClick={async () => { if (await confirm('Hapus potongan?')) void run(() => deleteEmployeeDeduction(d.id), 'Potongan dihapus.'); }}>Hapus</RowBtn>
                      </span>
                    </td>
                  ) : null}
                </tr>
              ))}
            </DataTable>
          </Widget>
        </div>
      ) : null}

      {tab === 'Pinjaman' ? (
        <Widget
          title="Pinjaman & Koperasi"
          action={canManage ? <Button size="sm" onClick={async () => setLoanModal(true)}>+ Pinjaman</Button> : undefined}
>
          <DataTable head={['Pegawai', 'Sumber', 'Pokok', 'Jasa', 'Angsuran/bln', 'Sisa', 'Status', ...(canManage ? [''] : [])]} loading={false} error={null} empty={loans.length === 0 ? 'Belum ada pinjaman.' : undefined}>
            {loans.map((l) => (
              <tr key={l.id}>
                <td className="px-5 py-3 font-medium text-sand-900">{l.employee?.name}</td>
                <td className="px-5 py-3 text-sand-600">{LOAN_LABEL[l.source]}{l.cashAccount?.name ? ` · ${l.cashAccount.name}` : ''}</td>
                <td className="whitespace-nowrap px-5 py-3">{rupiah(l.principal)}</td>
                <td className="whitespace-nowrap px-5 py-3">{l.fee > 0 ? rupiah(l.fee) : '—'}</td>
                <td className="whitespace-nowrap px-5 py-3">{rupiah(l.monthlyAmount)}</td>
                <td className="whitespace-nowrap px-5 py-3 font-semibold text-sand-900">{rupiah(l.remaining)}</td>
                <td className="px-5 py-3">
                  <Badge tone={l.status === 'ACTIVE' ? 'accent' : l.status === 'PAID_OFF' ? 'primary' : 'danger'}>
                    {l.status === 'ACTIVE' ? 'Berjalan' : l.status === 'PAID_OFF' ? 'Lunas' : 'Batal'}
                  </Badge>
                </td>
                {canManage ? (
                  <td className="px-5 py-3 text-right">
                    {l.status === 'ACTIVE' ? (
                      <RowBtn type="button" onClick={async () => setLoanEdit(l)}>Ubah</RowBtn>
                    ) : null}
                  </td>
                ) : null}
              </tr>
            ))}
          </DataTable>
        </Widget>
      ) : null}

      {tab === 'Pensiun & BOS' ? (
        <div className="grid gap-5">
          <Widget title="Buku Dana Pensiun">
            <DataTable head={['Pegawai', 'Total terkumpul', '']} loading={false} error={null} empty={pension.length === 0 ? 'Belum ada entri pensiun — terisi saat run dibayar.' : undefined}>
              {pension.map((p) => (
                <tr key={p.employee.id}>
                  <td className="px-5 py-3 font-medium text-sand-900">{p.employee.name}</td>
                  <td className="whitespace-nowrap px-5 py-3 font-semibold text-sand-900">{rupiah(p.total)}</td>
                  <td className="px-5 py-3 text-right">
                    <RowBtn type="button" onClick={async () => getPensionLedger(p.employee.id).then((l) => setLedger({ name: l.employee.name, entries: l.entries.map((e) => ({ month: e.month, amount: e.amount, note: e.note ?? null })), total: l.total })).catch(() => undefined)}>
                      Buku
                    </RowBtn>
                  </td>
                </tr>
              ))}
            </DataTable>
          </Widget>
          <Widget
            title="Honor BOS dari Dinas"
            action={canManage ? <Button size="sm" onClick={async () => setBosModal(true)}>+ Catat Honor BOS</Button> : undefined}
>
            <p className="mb-3 text-xs text-sand-500">
              Sertifikasi = pencatatan saja (uang diterima langsung dari dinas, tidak lewat kas sekolah).
              Non-sertifikasi = dibayar sekolah — otomatis masuk slip gaji bulan itu.
            </p>
            <DataTable head={['Pegawai', 'Bulan', 'Nominal', 'Jenis', ...(canManage ? [''] : [])]} loading={false} error={null} empty={bos.length === 0 ? 'Belum ada catatan.' : undefined}>
              {bos.map((b) => (
                <tr key={b.id}>
                  <td className="px-5 py-3 font-medium text-sand-900">{b.employee?.name}</td>
                  <td className="px-5 py-3 text-sand-600">{b.month}</td>
                  <td className="whitespace-nowrap px-5 py-3">{rupiah(b.amount)}</td>
                  <td className="px-5 py-3">{b.certified ? <Badge tone="neutral">Sertifikasi — catatan</Badge> : <Badge tone="accent">Non-sertifikasi — dibayar</Badge>}</td>
                  {canManage ? (
                    <td className="px-5 py-3 text-right">
                      <RowBtn tone="danger" type="button" onClick={async () => { if (await confirm('Hapus catatan?')) void run(() => deleteBosHonor(b.id), 'Catatan dihapus.'); }}>Hapus</RowBtn>
                    </td>
                  ) : null}
                </tr>
              ))}
            </DataTable>
          </Widget>
        </div>
      ) : null}

      {/* Modal pengaturan pegawai */}
      <Modal open={!!empModal} onClose={() => setEmpModal(null)} title={empModal ? `Payroll — ${empModal.name}` : ''}>
        {empModal ? (
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const hourly = f.get('hourlyRate');
              const transport = f.get('transportRate');
              void run(
                () =>
                  updateEmployeePayrollSettings(empModal.id, {
                    ...(f.get('payScaleId') ? { payScaleId: String(f.get('payScaleId')) } : {}),
                    ...(f.get('workStartDate') ? { workStartDate: String(f.get('workStartDate')) } : {}),
                    weeklyRequiredMinutes: Math.round(Number(f.get('weeklyHours') || 0) * 60),
                    hourlyRate: hourly ? Number(hourly) : null,
                    transportRate: transport ? Number(transport) : null,
                    isCertified: f.get('isCertified') === 'on',
                  }),
                'Pengaturan disimpan.',
              ).then((ok) => { if (ok) setEmpModal(null); });
            }}
>
            <Field label="Golongan Masa Kerja" hint="Kosongkan untuk auto dari tanggal mulai kerja">
              <Select name="payScaleId" defaultValue={empModal.payScaleId ?? ''}>
                <option value="">— Auto dari masa kerja —</option>
                {scales.filter((s) => s.isActive).map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({rupiah(s.hourlyRate)}/jam)</option>
                ))}
              </Select>
            </Field>
            <Field label="Mulai Kerja" hint="Menentukan masa kerja & golongan otomatis">
              <Input name="workStartDate" type="date" defaultValue={empModal.workStartDate?.slice(0, 10) ?? ''} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Jam wajib/minggu">
                <Input name="weeklyHours" type="number" min={0} step={0.5} defaultValue={empModal.weeklyRequiredMinutes / 60} />
              </Field>
              <Field label="Tarif/jam (override)">
                <Input name="hourlyRate" type="number" min={0} placeholder="ikut golongan" defaultValue={empModal.hourlyRate ?? ''} />
              </Field>
              <Field label="Transport/jam (override)">
                <Input name="transportRate" type="number" min={0} placeholder="ikut golongan" defaultValue={empModal.transportRate ?? ''} />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input name="isCertified" type="checkbox" defaultChecked={empModal.isCertified} className="size-4" />
              Guru sertifikasi (honor BOS dicatat saja, tidak dibayar sekolah)
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={async () => setEmpModal(null)}>Batal</Button>
              <Button type="submit" disabled={busy}>Simpan</Button>
            </div>
          </form>
        ) : null}
      </Modal>

      {/* Modal golongan */}
      <Modal open={scaleModal !== false} onClose={() => setScaleModal(false)} title={scaleModal && (scaleModal as PayScaleView).id ? 'Edit Golongan' : 'Golongan Baru'}>
        {scaleModal !== false ? (
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const body = {
                name: String(f.get('name')),
                minYears: Number(f.get('minYears')),
                ...(f.get('maxYears') ? { maxYears: Number(f.get('maxYears')) } : {}),
                hourlyRate: Number(f.get('hourlyRate')),
                transportRate: Number(f.get('transportRate')),
              };
              const editing = (scaleModal as PayScaleView).id ? (scaleModal as PayScaleView) : null;
              void run(
                () => (editing ? updatePayScale(editing.id, body) : createPayScale(body)),
                'Golongan disimpan.',
              ).then((ok) => { if (ok) setScaleModal(false); });
            }}
>
            <Field label="Nama"><Input name="name" required defaultValue={(scaleModal as PayScaleView).name ?? ''} placeholder="0–4 tahun" /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Min. tahun"><Input name="minYears" type="number" min={0} required defaultValue={(scaleModal as PayScaleView).minYears ?? 0} /></Field>
              <Field label="Maks. tahun (kosong = ∞)"><Input name="maxYears" type="number" min={0} defaultValue={(scaleModal as PayScaleView).maxYears ?? ''} /></Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Tarif/jam wajib"><Input name="hourlyRate" type="number" min={0} required defaultValue={(scaleModal as PayScaleView).hourlyRate ?? ''} /></Field>
              <Field label="Tarif transport/jam"><Input name="transportRate" type="number" min={0} required defaultValue={(scaleModal as PayScaleView).transportRate ?? ''} /></Field>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={async () => setScaleModal(false)}>Batal</Button>
              <Button type="submit" disabled={busy}>Simpan</Button>
            </div>
          </form>
        ) : null}
      </Modal>

      {/* Modal tipe honor */}
      <Modal open={honorTypeModal !== null} onClose={() => setHonorTypeModal(null)} title={honorTypeModal === 'new' ? 'Tipe Honor Baru' : 'Edit Tipe Honor'}>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const dto = {
              name: String(f.get('name')),
              period: String(f.get('period')),
              defaultAmount: Number(f.get('defaultAmount')) || 0,
            };
            void run(
              () => (honorTypeModal === 'new' ? createHonorType(dto) : updateHonorType((honorTypeModal as HonorTypeView).id, dto)),
              honorTypeModal === 'new' ? 'Tipe honor ditambahkan.' : 'Tipe honor diperbarui.',
            ).then((ok) => { if (ok) setHonorTypeModal(null); });
          }}
>
          <Field label="Nama"><Input name="name" required placeholder="Tunjangan Wali Kelas" defaultValue={honorTypeModal === 'new' ? '' : (honorTypeModal as HonorTypeView)?.name} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Periode">
              <Select name="period" required defaultValue={honorTypeModal === 'new' ? 'MONTHLY' : (honorTypeModal as HonorTypeView)?.period}>
                <option value="MONTHLY">Per bulan</option>
                <option value="PER_SESSION">Per sesi</option>
                <option value="ONE_TIME">Sekali (per kegiatan)</option>
              </Select>
            </Field>
            <Field label="Nominal default"><Input name="defaultAmount" type="number" min={0} defaultValue={honorTypeModal === 'new' ? 0 : (honorTypeModal as HonorTypeView)?.defaultAmount ?? 0} /></Field>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={async () => setHonorTypeModal(null)}>Batal</Button>
            <Button type="submit" disabled={busy}>Simpan</Button>
          </div>
        </form>
      </Modal>

      {/* Modal honor pegawai */}
      <Modal open={honorModal} onClose={() => setHonorModal(false)} title="Honor Pegawai">
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const amount = f.get('amount');
            void run(
              () =>
                createEmployeeHonor({
                  employeeId: String(f.get('employeeId')),
                  honorTypeId: String(f.get('honorTypeId')),
                  ...(amount ? { amount: Number(amount) } : {}),
                  sessions: Number(f.get('sessions')) || 1,
                  ...(f.get('eventName') ? { eventName: String(f.get('eventName')) } : {}),
                  ...(f.get('eventMonth') ? { eventMonth: String(f.get('eventMonth')) } : {}),
                  ...(f.get('validFrom') ? { validFrom: String(f.get('validFrom')) } : {}),
                  ...(f.get('validTo') ? { validTo: String(f.get('validTo')) } : {}),
                }),
              'Honor ditambahkan.',
            ).then((ok) => { if (ok) setHonorModal(false); });
          }}
>
          <Field label="Pegawai"><SearchSelect name="employeeId" required load={loadEmp} label={empLabel} sub={empSub} placeholder="Ketik nama pegawai…" /></Field>
          <Field label="Tipe Honor">
            <Select name="honorTypeId" required>
              <option value="">—</option>
              {honorTypes.filter((t) => t.isActive).map((t) => (
                <option key={t.id} value={t.id}>{t.name} ({PERIOD_LABEL[t.period]})</option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nominal (kosong = default)"><Input name="amount" type="number" min={0} placeholder="default" /></Field>
            <Field label="Sesi/bulan (utk per-sesi)"><Input name="sessions" type="number" min={1} defaultValue={1} /></Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nama kegiatan (utk sekali)"><Input name="eventName" placeholder="Panitia PAS" /></Field>
            <Field label="Bulan kegiatan"><Input name="eventMonth" type="month" /></Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Berlaku dari (YYYY-MM)"><Input name="validFrom" placeholder="2026-01" /></Field>
            <Field label="Berlaku sampai"><Input name="validTo" placeholder="kosong = terus" /></Field>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={async () => setHonorModal(false)}>Batal</Button>
            <Button type="submit" disabled={busy}>Simpan</Button>
          </div>
        </form>
      </Modal>

      {/* Modal tipe potongan */}
      <Modal open={dedTypeModal !== null} onClose={() => setDedTypeModal(null)} title={dedTypeModal === 'new' ? 'Tipe Potongan Baru' : 'Edit Tipe Potongan'}>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const dto = {
              name: String(f.get('name')),
              defaultAmount: Number(f.get('defaultAmount')) || 0,
              isRecurring: f.get('isRecurring') === 'on',
            };
            void run(
              () => (dedTypeModal === 'new' ? createDeductionType(dto) : updateDeductionType((dedTypeModal as DeductionTypeView).id, dto)),
              dedTypeModal === 'new' ? 'Tipe potongan ditambahkan.' : 'Tipe potongan diperbarui.',
            ).then((ok) => { if (ok) setDedTypeModal(null); });
          }}
>
          <Field label="Nama"><Input name="name" required placeholder="Infak Jumat" defaultValue={dedTypeModal === 'new' ? '' : (dedTypeModal as DeductionTypeView)?.name} /></Field>
          <Field label="Nominal default"><Input name="defaultAmount" type="number" min={0} defaultValue={dedTypeModal === 'new' ? 0 : (dedTypeModal as DeductionTypeView)?.defaultAmount ?? 0} /></Field>
          <label className="flex items-center gap-2 text-sm">
            <input name="isRecurring" type="checkbox" defaultChecked={dedTypeModal === 'new' ? true : (dedTypeModal as DeductionTypeView)?.isRecurring ?? true} className="size-4" />
            Berulang tiap bulan
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={async () => setDedTypeModal(null)}>Batal</Button>
            <Button type="submit" disabled={busy}>Simpan</Button>
          </div>
        </form>
      </Modal>

      {/* Modal potongan pegawai */}
      <Modal open={dedModal} onClose={() => setDedModal(false)} title="Potongan Pegawai">
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const amount = f.get('amount');
            void run(
              () =>
                createEmployeeDeduction({
                  employeeId: String(f.get('employeeId')),
                  deductionTypeId: String(f.get('deductionTypeId')),
                  ...(amount ? { amount: Number(amount) } : {}),
                  ...(f.get('month') ? { month: String(f.get('month')) } : {}),
                }),
              'Potongan ditambahkan.',
            ).then((ok) => { if (ok) setDedModal(false); });
          }}
>
          <Field label="Pegawai"><SearchSelect name="employeeId" required load={loadEmp} label={empLabel} sub={empSub} placeholder="Ketik nama pegawai…" /></Field>
          <Field label="Tipe Potongan">
            <Select name="deductionTypeId" required>
              <option value="">—</option>
              {dedTypes.filter((t) => t.isActive).map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nominal (kosong = default)"><Input name="amount" type="number" min={0} /></Field>
            <Field label="Bulan (kosong = tiap bulan)"><Input name="month" type="month" /></Field>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={async () => setDedModal(false)}>Batal</Button>
            <Button type="submit" disabled={busy}>Simpan</Button>
          </div>
        </form>
      </Modal>

      {/* Modal pinjaman */}
      <Modal open={loanModal} onClose={() => setLoanModal(false)} title="Pinjaman Baru">
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void run(
              () =>
                createLoan({
                  employeeId: String(f.get('employeeId')),
                  source: String(f.get('source')),
                  principal: Number(f.get('principal')),
                  fee: Number(f.get('fee')) || 0,
                  installments: Number(f.get('installments')),
                  startMonth: String(f.get('startMonth')),
                  ...(f.get('cashAccountId') ? { cashAccountId: String(f.get('cashAccountId')) } : {}),
                  ...(f.get('note') ? { note: String(f.get('note')) } : {}),
                }),
              'Pinjaman dicatat.',
            ).then((ok) => { if (ok) setLoanModal(false); });
          }}
>
          <Field label="Pegawai"><SearchSelect name="employeeId" required load={loadEmp} label={empLabel} sub={empSub} placeholder="Ketik nama pegawai…" /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Sumber">
              <Select name="source" required>
                <option value="KASBON">Kasbon — pinjam ke sekolah</option>
                <option value="KOOPERASI">Koperasi sekolah</option>
                <option value="EKSTERNAL">Koperasi luar (potong gaji)</option>
              </Select>
            </Field>
            <Field label="Kas sumber (utk kasbon)">
              <Select name="cashAccountId">
                <option value="">—</option>
                {accounts.filter((a) => a.isActive).map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Pokok"><Input name="principal" type="number" min={1} required /></Field>
            <Field label="Jasa total"><Input name="fee" type="number" min={0} defaultValue={0} /></Field>
            <Field label="Angsuran (×)"><Input name="installments" type="number" min={1} max={120} required defaultValue={10} /></Field>
          </div>
          <Field label="Mulai dipotong"><Input name="startMonth" type="month" required defaultValue={new Date().toISOString().slice(0, 7)} /></Field>
          <Field label="Catatan"><Input name="note" placeholder="opsional" /></Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={async () => setLoanModal(false)}>Batal</Button>
            <Button type="submit" disabled={busy}>Simpan</Button>
          </div>
        </form>
      </Modal>

      {/* Modal edit pinjaman */}
      <Modal open={!!loanEdit} onClose={() => setLoanEdit(null)} title={loanEdit ? `Pinjaman — ${loanEdit.employee?.name}` : ''}>
        {loanEdit ? (
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(
                () =>
                  updateLoan(loanEdit.id, {
                    monthlyAmount: Number(f.get('monthlyAmount')),
                    remaining: Number(f.get('remaining')),
                    ...(f.get('note') ? { note: String(f.get('note')) } : {}),
                    ...(f.get('status') ? { status: String(f.get('status')) } : {}),
                  }),
                'Pinjaman diperbarui.',
              ).then((ok) => { if (ok) setLoanEdit(null); });
            }}
>
            <p className="text-sm text-sand-600">
              {LOAN_LABEL[loanEdit.source]} · pokok {rupiah(loanEdit.principal)}
              {loanEdit.fee > 0 ? ` + jasa ${rupiah(loanEdit.fee)}` : ''}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Angsuran/bulan"><Input name="monthlyAmount" type="number" min={1} defaultValue={loanEdit.monthlyAmount} required /></Field>
              <Field label="Sisa" hint="Bisa diubah bila guru melunasi/menyesuaikan di luar"><Input name="remaining" type="number" min={0} defaultValue={loanEdit.remaining} required /></Field>
            </div>
            <Field label="Status">
              <Select name="status" defaultValue={loanEdit.status}>
                <option value="ACTIVE">Berjalan</option>
                <option value="PAID_OFF">Lunas</option>
                <option value="CANCELLED">Batal</option>
              </Select>
            </Field>
            <Field label="Catatan"><Input name="note" defaultValue={loanEdit.note ?? ''} /></Field>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={async () => setLoanEdit(null)}>Batal</Button>
              <Button type="submit" disabled={busy}>Simpan</Button>
            </div>
          </form>
        ) : null}
      </Modal>

      {/* Modal BOS */}
      <Modal open={bosModal} onClose={() => setBosModal(false)} title="Catat Honor BOS">
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void run(
              () =>
                upsertBosHonor({
                  employeeId: String(f.get('employeeId')),
                  month: String(f.get('month')),
                  amount: Number(f.get('amount')),
                  certified: f.get('certified') === 'on',
                  ...(f.get('note') ? { note: String(f.get('note')) } : {}),
                }),
              'Honor BOS dicatat.',
            ).then((ok) => { if (ok) setBosModal(false); });
          }}
>
          <Field label="Pegawai"><SearchSelect name="employeeId" required load={loadEmp} label={empLabel} sub={empSub} placeholder="Ketik nama pegawai…" /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Bulan"><Input name="month" type="month" required defaultValue={new Date().toISOString().slice(0, 7)} /></Field>
            <Field label="Nominal"><Input name="amount" type="number" min={0} required /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input name="certified" type="checkbox" defaultChecked className="size-4" />
            Guru sertifikasi — pencatatan saja (tidak dibayar sekolah)
          </label>
          <Field label="Catatan"><Input name="note" placeholder="opsional" /></Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={async () => setBosModal(false)}>Batal</Button>
            <Button type="submit" disabled={busy}>Simpan</Button>
          </div>
        </form>
      </Modal>

      {/* Buku pensiun */}
      <Modal open={!!ledger} onClose={() => setLedger(null)} title={ledger ? `Dana Pensiun — ${ledger.name}` : ''}>
        {ledger ? (
          <div>
            <DataTable head={['Bulan', 'Nominal', 'Catatan']} loading={false} error={null} empty={ledger.entries.length === 0 ? '—' : undefined}>
              {ledger.entries.map((e, i) => (
                <tr key={i}>
                  <td className="px-5 py-2.5 text-sand-600">{e.month}</td>
                  <td className="whitespace-nowrap px-5 py-2.5 font-semibold text-sand-900">{rupiah(e.amount)}</td>
                  <td className="px-5 py-2.5 text-xs text-sand-400">{e.note ?? ''}</td>
                </tr>
              ))}
            </DataTable>
            <p className="mt-3 text-right font-bold text-sand-900">Total: {rupiah(ledger.total)}</p>
          </div>
        ) : null}
      </Modal>
          {dialog}
      </Shell>
  );
}
