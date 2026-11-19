'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
  getSchool,
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
  updateSchool,
  uploadSchoolKop,
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
  type School,
} from '@/lib/api';

import { RowBtn } from '@/components/row-btn';
import { RpInput } from '@/components/rp-input';
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
  const [school, setSchool] = useState<School | null>(null);
  const kopRef = useRef<HTMLInputElement>(null);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [empModal, setEmpModal] = useState<EmployeePayroll | null>(null);
  const [scaleModal, setScaleModal] = useState<false | PayScaleView>(false);
  const [honorTypeModal, setHonorTypeModal] = useState<HonorTypeView | 'new' | null>(null);
  const [dedTypeModal, setDedTypeModal] = useState<DeductionTypeView | 'new' | null>(null);
  const [dedMethod, setDedMethod] = useState('FIXED');
  const [honorModal, setHonorModal] = useState<EmployeeHonorView | 'new' | null>(null);
  const [honorTypeSel, setHonorTypeSel] = useState('');
  const [dedModal, setDedModal] = useState<EmployeeDeductionView | 'new' | null>(null);
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
    getSchool().then(setSchool).catch(() => undefined);
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

      {canManage && school ? (
        <Widget title="Slip Gaji & Kop Surat" className="mb-5">
          <div className="grid gap-5 lg:grid-cols-2">
            <form
              className="grid gap-3 content-start"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void run(
                  () =>
                    updateSchool({
                      headmaster: String(f.get('headmaster') || ''),
                      headmasterNip: String(f.get('headmasterNip') || ''),
                      treasurer: String(f.get('treasurer') || ''),
                      treasurerNip: String(f.get('treasurerNip') || ''),
                    }).then(setSchool),
                  'Penandatangan slip diperbarui.',
                );
              }}
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-sand-500">Penandatangan Slip</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Kepala Sekolah">
                  <Input name="headmaster" defaultValue={school.headmaster ?? ''} key={`hm-${school.id}`} placeholder="Nama + gelar" />
                </Field>
                <Field label="NIP/NUPTK">
                  <Input name="headmasterNip" defaultValue={school.headmasterNip ?? ''} key={`hn-${school.id}`} />
                </Field>
                <Field label="Bendahara / Keuangan">
                  <Input name="treasurer" defaultValue={school.treasurer ?? ''} key={`tr-${school.id}`} placeholder="Nama bendahara" />
                </Field>
                <Field label="NIP/NUPTK Bendahara" hint="Opsional">
                  <Input name="treasurerNip" defaultValue={school.treasurerNip ?? ''} key={`tn-${school.id}`} />
                </Field>
              </div>
              <div>
                <Button type="submit" size="sm" disabled={busy}>Simpan Penandatangan</Button>
              </div>
            </form>
            <div className="grid gap-3 content-start">
              <p className="text-xs font-semibold uppercase tracking-wide text-sand-500">Kop Surat (gambar)</p>
              <div className="rounded-xl border border-sand-200 bg-white p-2">
                {school.kopUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/kop.png?v=${Date.parse(school.updatedAt)}`} alt="Kop surat" className="w-full" />
                ) : (
                  <p className="px-2 py-6 text-center text-xs text-sand-400">
                    Belum ada gambar kop — slip memakai kop teks otomatis (isi di Pengaturan → Profil).
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  ref={kopRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    void run(
                      () => uploadSchoolKop(file).then(setSchool),
                      'Kop surat diperbarui — tercetak di semua slip gaji.',
                    ).finally(() => { if (kopRef.current) kopRef.current.value = ''; });
                  }}
                />
                <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => kopRef.current?.click()}>
                  {school.kopUrl ? 'Ganti Gambar Kop' : 'Unggah Gambar Kop'}
                </Button>
                {school.kopUrl ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={async () => {
                      if (await confirm('Hapus gambar kop? Slip kembali ke kop teks otomatis.'))
                        void run(() => updateSchool({ kopUrl: null }).then(setSchool), 'Kop gambar dihapus — kembali ke kop teks.');
                    }}
                  >
                    Hapus
                  </Button>
                ) : null}
              </div>
              <p className="text-[11px] text-sand-400">
                Unggah gambar kop surat utuh (header resmi sekolah) — lebar menyesuaikan kertas. PNG/JPG/WebP, maks 5 MB.
              </p>
            </div>
          </div>
        </Widget>
      ) : null}

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
          <form
            className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-sand-200 bg-sand-50 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(
                () =>
                  updatePayrollSettings({
                    lessonMinutes: Number(f.get('lessonMinutes')) || 40,
                  }),
                'Satuan jam pelajaran disimpan.',
              );
            }}
          >
            <div className="w-52">
              <Field label="1 Jam Pelajaran = … menit" hint="Untuk konversi absen → JP transport">
                <Input
                  key={`lm${payrollSettings?.lessonMinutes ?? 40}`}
                  name="lessonMinutes"
                  type="number"
                  min={5}
                  max={240}
                  step={1}
                  defaultValue={payrollSettings?.lessonMinutes ?? 40}
                  disabled={!canManage}
                />
              </Field>
            </div>
            {canManage ? <Button type="submit" size="sm" disabled={busy}>Simpan</Button> : null}
            <p className="pb-1 text-[11px] text-sand-400">
              Contoh: {payrollSettings?.lessonMinutes ?? 40} menit → hadir 12.00–17.00 (300 mnt) = {Math.round(300 / (payrollSettings?.lessonMinutes || 40))} JP transport.
            </p>
          </form>
          <form
            className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-sand-200 bg-sand-50 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(
                () =>
                  updatePayrollSettings({
                    periodStartDay: Number(f.get('periodStartDay')) || 21,
                    periodEndDay: Number(f.get('periodEndDay')) || 19,
                  }),
                'Siklus periode absen disimpan.',
              );
            }}
          >
            <div className="w-44">
              <Field label="Periode mulai tgl" hint="bulan sebelumnya bila > tgl akhir">
                <Input
                  key={`ps${payrollSettings?.periodStartDay ?? 21}`}
                  name="periodStartDay"
                  type="number"
                  min={1}
                  max={31}
                  step={1}
                  defaultValue={payrollSettings?.periodStartDay ?? 21}
                  disabled={!canManage}
                />
              </Field>
            </div>
            <div className="w-44">
              <Field label="Periode sampai tgl" hint="di bulan tagihan">
                <Input
                  key={`pe${payrollSettings?.periodEndDay ?? 19}`}
                  name="periodEndDay"
                  type="number"
                  min={1}
                  max={31}
                  step={1}
                  defaultValue={payrollSettings?.periodEndDay ?? 19}
                  disabled={!canManage}
                />
              </Field>
            </div>
            {canManage ? <Button type="submit" size="sm" disabled={busy}>Simpan</Button> : null}
            <p className="pb-1 text-[11px] text-sand-400">
              Run gaji mengambil absen dari tanggal ini — mis. tgl {payrollSettings?.periodStartDay ?? 21} bulan lalu → tgl {payrollSettings?.periodEndDay ?? 19} bulan tagihan (lintas bulan). Masih bisa dioverride per run.
            </p>
          </form>
          <DataTable
            head={['Pegawai', 'Masa kerja', 'Golongan', 'JP wajib/bln', 'Tarif/JP', 'Transport/JP', 'Sertifikasi', ...(canManage ? [''] : [])]}
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
                <td className="px-5 py-3 text-sand-600">{(+e.requiredJp.toFixed(1)).toLocaleString('id-ID')} JP</td>
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
          <DataTable head={['Nama', 'Masa kerja', 'Tarif/JP', 'Transport/JP', 'Pegawai', 'Status', ...(canManage ? [''] : [])]} loading={false} error={null} empty={scales.length === 0 ? 'Belum ada golongan.' : undefined}>
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
            action={canManage ? <Button size="sm" onClick={async () => { setHonorTypeSel(''); setHonorModal('new'); }}>+ Honor Pegawai</Button> : undefined}
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
                        <RowBtn type="button" onClick={async () => { setHonorTypeSel(h.honorTypeId); setHonorModal(h); }}>Edit</RowBtn>
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
                  <RpInput
                    key={`d${payrollSettings?.lateDeductionPerDay ?? 0}`}
                    name="lateDeductionPerDay"
                    defaultValue={payrollSettings?.lateDeductionPerDay ?? 0}
                    disabled={!canManage}
                  />
                </Field>
                <Field label="Potongan per menit telat (Rp)" hint="akumulasi menit dari jam masuk shift">
                  <RpInput
                    key={`m${payrollSettings?.lateDeductionPerMin ?? 0}`}
                    name="lateDeductionPerMin"
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
            action={canManage ? <Button size="sm" onClick={async () => { setDedMethod('FIXED'); setDedTypeModal('new'); }}>+ Tipe</Button> : undefined}
>
            <DataTable head={['Nama', 'Cara hitung', 'Nilai', 'Urutan', 'Berulang', ...(canManage ? [''] : [])]} loading={false} error={null} empty={dedTypes.length === 0 ? '—' : undefined}>
              {dedTypes.map((t) => (
                <tr key={t.id}>
                  <td className="px-5 py-3 font-medium text-sand-900">{t.name}</td>
                  <td className="px-5 py-3 text-sand-600">{t.method === 'PERCENT' ? `Persen ${t.base === 'REST' ? 'dari bersih' : 'dari kotor'}` : 'Nominal tetap'}</td>
                  <td className="whitespace-nowrap px-5 py-3">{t.method === 'PERCENT' ? `${t.percent ?? 0}%` : rupiah(t.defaultAmount)}</td>
                  <td className="px-5 py-3 text-sand-600">{t.sortOrder ?? 0}</td>
                  <td className="px-5 py-3 text-sand-600">{t.isRecurring ? 'Tiap bulan' : 'Sekali'}</td>
                  {canManage ? (
                    <td className="px-5 py-3 text-right">
                      <RowBtn type="button" onClick={async () => { setDedMethod(t.method ?? 'FIXED'); setDedTypeModal(t); }}>Edit</RowBtn>
                    </td>
                  ) : null}
                </tr>
              ))}
            </DataTable>
          </Widget>
          <Widget
            title="Potongan Pegawai"
            action={canManage ? <Button size="sm" onClick={async () => setDedModal('new')}>+ Potongan Pegawai</Button> : undefined}
>
            <DataTable head={['Pegawai', 'Tipe', 'Nominal', 'Bulan', 'Status', ...(canManage ? [''] : [])]} loading={false} error={null} empty={deductions.length === 0 ? 'Belum ada potongan.' : undefined}>
              {deductions.map((d) => (
                <tr key={d.id}>
                  <td className="px-5 py-3 font-medium text-sand-900">{d.employee?.name}</td>
                  <td className="px-5 py-3 text-sand-600">
                    {d.deductionType?.name}
                    {d.deductionType?.method === 'PERCENT' ? <span className="ml-1 text-[10px] text-sand-400">({d.deductionType.base === 'REST' ? 'dari bersih' : 'dari kotor'})</span> : null}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3">
                    {d.deductionType?.method === 'PERCENT'
                      ? `${d.percent ?? d.deductionType.percent ?? 0}%`
                      : d.amount != null ? rupiah(d.amount) : 'default'}
                  </td>
                  <td className="px-5 py-3 text-xs text-sand-500">{d.month ?? 'Tiap bulan'}</td>
                  <td className="px-5 py-3">{d.isActive ? <Badge tone="primary">Aktif</Badge> : <Badge tone="neutral">Nonaktif</Badge>}</td>
                  {canManage ? (
                    <td className="px-5 py-3 text-right">
                      <span className="flex justify-end gap-2">
                        <RowBtn type="button" onClick={async () => setDedModal(d)}>Edit</RowBtn>
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
                    requiredJp: Number(f.get('requiredJp')) || 0,
                    hourlyRate: hourly ? Number(hourly) : null,
                    transportRate: transport ? Number(transport) : null,
                    isCertified: f.get('isCertified') === 'on',
                  }),
                'Pengaturan disimpan.',
              ).then((ok) => { if (ok) setEmpModal(null); });
            }}
>
            <Field label="Golongan Masa Kerja" hint="Kosongkan untuk auto dari tanggal mulai kerja">
              <Select name="payScaleId" defaultValue={empModal.payScaleId ?? ''} searchable>
                <option value="">— Auto dari masa kerja —</option>
                {scales.filter((s) => s.isActive).map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({rupiah(s.hourlyRate)}/JP)</option>
                ))}
              </Select>
            </Field>
            <Field label="Mulai Kerja" hint="Menentukan masa kerja & golongan otomatis">
              <Input name="workStartDate" type="date" defaultValue={empModal.workStartDate?.slice(0, 10) ?? ''} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="JP wajib/bulan" hint="Jam pelajaran — gaji pokok TETAP, tak dipotong absen. Mis. 44">
                <Input name="requiredJp" type="number" min={0} step={0.5} defaultValue={empModal.requiredJp} />
              </Field>
              <Field label="Tarif/JP (override)" hint="gaji pokok per jam pelajaran">
                <RpInput name="hourlyRate" placeholder="ikut golongan" defaultValue={empModal.hourlyRate ?? ''} />
              </Field>
              <Field label="Transport/JP (override)">
                <RpInput name="transportRate" placeholder="ikut golongan" defaultValue={empModal.transportRate ?? ''} />
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
              <Field label="Tarif gaji pokok/JP (Rp)"><RpInput name="hourlyRate" defaultValue={(scaleModal as PayScaleView).hourlyRate ?? ''} /></Field>
              <Field label="Tarif transport/JP (Rp)"><RpInput name="transportRate" defaultValue={(scaleModal as PayScaleView).transportRate ?? ''} /></Field>
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
              </Select>
            </Field>
            <Field label="Nominal default"><RpInput name="defaultAmount" defaultValue={honorTypeModal === 'new' ? 0 : (honorTypeModal as HonorTypeView)?.defaultAmount ?? 0} /></Field>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={async () => setHonorTypeModal(null)}>Batal</Button>
            <Button type="submit" disabled={busy}>Simpan</Button>
          </div>
        </form>
      </Modal>

      {/* Modal honor pegawai */}
      <Modal open={honorModal !== null} onClose={() => setHonorModal(null)} title={honorModal === 'new' ? 'Honor Pegawai' : `Edit Honor — ${(honorModal as EmployeeHonorView)?.employee?.name ?? ''}`}>
        {honorModal !== null ? (() => {
          const editing = honorModal === 'new' ? null : honorModal;
          const editingType = editing ? honorTypes.find((t) => t.id === editing.honorTypeId) : null;
          const period = editingType?.period ?? honorTypes.find((t) => t.id === honorTypeSel)?.period;
          return (
            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const amount = f.get('amount');
                const body = {
                  ...(amount ? { amount: Number(amount) } : { amount: null }),
                  sessions: Number(f.get('sessions')) || 1,
                  validFrom: f.get('validFrom') ? String(f.get('validFrom')) : null,
                  validTo: f.get('validTo') ? String(f.get('validTo')) : null,
                };
                void run(
                  () =>
                    editing
                      ? updateEmployeeHonor(editing.id, body)
                      : createEmployeeHonor({
                          employeeId: String(f.get('employeeId')),
                          honorTypeId: String(f.get('honorTypeId')),
                          ...(amount ? { amount: Number(amount) } : {}),
                          sessions: Number(f.get('sessions')) || 1,
                          ...(f.get('validFrom') ? { validFrom: String(f.get('validFrom')) } : {}),
                          ...(f.get('validTo') ? { validTo: String(f.get('validTo')) } : {}),
                        }),
                  editing ? 'Honor diperbarui.' : 'Honor ditambahkan.',
                ).then((ok) => { if (ok) setHonorModal(null); });
              }}
>
              {editing ? (
                <>
                  <Field label="Pegawai"><p className="rounded-xl bg-sand-50 px-3 py-2 text-sm font-semibold text-sand-800">{editing.employee?.name ?? '—'}</p></Field>
                  <Field label="Tipe Honor"><p className="rounded-xl bg-sand-50 px-3 py-2 text-sm text-sand-800">{editingType?.name ?? editing.honorType?.name ?? '—'} ({PERIOD_LABEL[period ?? ''] ?? period ?? '—'})</p></Field>
                </>
              ) : (
                <>
                  <Field label="Pegawai"><SearchSelect name="employeeId" required load={loadEmp} label={empLabel} sub={empSub} placeholder="Ketik nama pegawai…" /></Field>
                  <Field label="Tipe Honor">
                    <Select name="honorTypeId" required value={honorTypeSel} onChange={(e) => setHonorTypeSel(e.target.value)} searchable>
                      <option value="">—</option>
                      {honorTypes.filter((t) => t.isActive && t.period !== 'ONE_TIME').map((t) => (
                        <option key={t.id} value={t.id}>{t.name} ({PERIOD_LABEL[t.period]})</option>
                      ))}
                    </Select>
                  </Field>
                </>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Nominal (kosong = default)"><RpInput name="amount" defaultValue={editing?.amount} /></Field>
                {period === 'PER_SESSION' ? (
                  <Field label="Sesi/bulan"><Input name="sessions" type="number" min={1} defaultValue={editing?.sessions ?? 1} /></Field>
                ) : <span />}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Berlaku dari (YYYY-MM)"><Input name="validFrom" placeholder="2026-01" defaultValue={editing?.validFrom ?? ''} /></Field>
                <Field label="Berlaku sampai"><Input name="validTo" placeholder="kosong = terus" defaultValue={editing?.validTo ?? ''} /></Field>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={async () => setHonorModal(null)}>Batal</Button>
                <Button type="submit" disabled={busy}>Simpan</Button>
              </div>
            </form>
          );
        })() : null}
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
              method: String(f.get('method') ?? 'FIXED'),
              defaultAmount: Number(f.get('defaultAmount')) || 0,
              percent: Number(f.get('percent')) || 0,
              base: String(f.get('base') ?? 'GROSS'),
              sortOrder: Number(f.get('sortOrder')) || 0,
              isRecurring: f.get('isRecurring') === 'on',
            };
            void run(
              () => (dedTypeModal === 'new' ? createDeductionType(dto) : updateDeductionType((dedTypeModal as DeductionTypeView).id, dto)),
              dedTypeModal === 'new' ? 'Tipe potongan ditambahkan.' : 'Tipe potongan diperbarui.',
            ).then((ok) => { if (ok) setDedTypeModal(null); });
          }}
>
          {(() => {
            const editing = dedTypeModal === 'new' ? null : (dedTypeModal as DeductionTypeView);
            return (
              <>
                <Field label="Nama"><Input name="name" required placeholder="Infak Jumat" defaultValue={editing?.name ?? ''} /></Field>
                <Field label="Cara hitung">
                  <Select name="method" required defaultValue={editing?.method ?? 'FIXED'} onChange={(e) => setDedMethod(e.target.value)}>
                    <option value="FIXED">Nominal tetap (Rp)</option>
                    <option value="PERCENT">Persen dari gaji (%)</option>
                  </Select>
                </Field>
                {dedMethod === 'PERCENT' ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Persen (%)" hint="mis. 2,5 untuk infaq"><Input name="percent" type="number" min={0} step={0.1} defaultValue={editing?.percent ?? 0} /></Field>
                    <Field label="Dasar persen">
                      <Select name="base" defaultValue={editing?.base ?? 'GROSS'}>
                        <option value="GROSS">Gaji kotor</option>
                        <option value="REST">Gaji bersih (setelah potongan sebelumnya)</option>
                      </Select>
                    </Field>
                  </div>
                ) : (
                  <Field label="Nominal default (Rp)"><RpInput name="defaultAmount" defaultValue={editing?.defaultAmount ?? 0} /></Field>
                )}
                <Field label="Urutan potong" hint="kecil = dipotong duluan — infaq dulu baru pensiun">
                  <Input name="sortOrder" type="number" min={0} defaultValue={editing?.sortOrder ?? 0} />
                </Field>
                <label className="flex items-center gap-2 text-sm">
                  <input name="isRecurring" type="checkbox" defaultChecked={editing?.isRecurring ?? true} className="size-4" />
                  Berulang tiap bulan
                </label>
              </>
            );
          })()}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={async () => setDedTypeModal(null)}>Batal</Button>
            <Button type="submit" disabled={busy}>Simpan</Button>
          </div>
        </form>
      </Modal>

      {/* Modal potongan pegawai */}
      <Modal open={dedModal !== null} onClose={() => setDedModal(null)} title={dedModal === 'new' ? 'Potongan Pegawai' : `Edit Potongan — ${(dedModal as EmployeeDeductionView)?.employee?.name ?? ''}`}>
        {dedModal !== null ? (() => {
          const editing = dedModal === 'new' ? null : dedModal;
          const editingType = editing ? dedTypes.find((t) => t.id === editing.deductionTypeId) : null;
          const isPercent = editingType?.method === 'PERCENT';
          return (
            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const amount = f.get('amount');
                const body = {
                  amount: amount ? Number(amount) : null,
                  percent: f.get('percent') ? Number(f.get('percent')) : null,
                  month: f.get('month') ? String(f.get('month')) : null,
                };
                void run(
                  () =>
                    editing
                      ? updateEmployeeDeduction(editing.id, body)
                      : createEmployeeDeduction({
                          employeeId: String(f.get('employeeId')),
                          deductionTypeId: String(f.get('deductionTypeId')),
                          ...(amount ? { amount: Number(amount) } : {}),
                          ...(f.get('percent') ? { percent: Number(f.get('percent')) } : {}),
                          ...(f.get('month') ? { month: String(f.get('month')) } : {}),
                        }),
                  editing ? 'Potongan diperbarui.' : 'Potongan ditambahkan.',
                ).then((ok) => { if (ok) setDedModal(null); });
              }}
>
              {editing ? (
                <>
                  <Field label="Pegawai"><p className="rounded-xl bg-sand-50 px-3 py-2 text-sm font-semibold text-sand-800">{editing.employee?.name ?? '—'}</p></Field>
                  <Field label="Tipe Potongan">
                    <p className="rounded-xl bg-sand-50 px-3 py-2 text-sm text-sand-800">
                      {editingType?.name ?? editing.deductionType?.name ?? '—'}
                      {isPercent ? <span className="ml-1 text-xs text-sand-500">({editingType?.percent ?? editing.deductionType?.percent ?? 0}% dari {editingType?.base === 'REST' ? 'bersih' : 'kotor'})</span> : null}
                    </p>
                  </Field>
                </>
              ) : (
                <>
                  <Field label="Pegawai"><SearchSelect name="employeeId" required load={loadEmp} label={empLabel} sub={empSub} placeholder="Ketik nama pegawai…" /></Field>
                  <Field label="Tipe Potongan">
                    <Select name="deductionTypeId" required searchable>
                      <option value="">—</option>
                      {dedTypes.filter((t) => t.isActive).map((t) => (
                        <option key={t.id} value={t.id}>{t.name}{t.method === 'PERCENT' ? ` (${t.percent}% dari ${t.base === 'REST' ? 'bersih' : 'kotor'})` : ''}</option>
                      ))}
                    </Select>
                  </Field>
                </>
              )}
              <div className="grid gap-3 sm:grid-cols-3">
                {isPercent ? (
                  <Field label="Persen override (%)" hint={`default tipe ${editingType?.percent ?? 0}%`}>
                    <Input name="percent" type="number" min={0} step={0.1} defaultValue={editing?.percent ?? ''} />
                  </Field>
                ) : (
                  <Field label="Nominal override"><RpInput name="amount" defaultValue={editing?.amount} /></Field>
                )}
                {!editing || !isPercent ? (
                  <Field label="Persen override (%)"><Input name="percent" type="number" min={0} step={0.1} defaultValue={editing?.percent ?? ''} /></Field>
                ) : null}
                <Field label="Bulan (kosong = tiap bulan)"><Input name="month" type="month" defaultValue={editing?.month ?? ''} /></Field>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={async () => setDedModal(null)}>Batal</Button>
                <Button type="submit" disabled={busy}>Simpan</Button>
              </div>
            </form>
          );
        })() : null}
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
              <Select name="cashAccountId" searchable>
                <option value="">—</option>
                {accounts.filter((a) => a.isActive).map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Pokok"><RpInput name="principal" /></Field>
            <Field label="Jasa total"><RpInput name="fee" defaultValue={0} /></Field>
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
              <Field label="Angsuran/bulan"><RpInput name="monthlyAmount" defaultValue={loanEdit.monthlyAmount} /></Field>
              <Field label="Sisa" hint="Bisa diubah bila guru melunasi/menyesuaikan di luar"><RpInput name="remaining" defaultValue={loanEdit.remaining} /></Field>
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
            <Field label="Nominal"><RpInput name="amount" /></Field>
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
