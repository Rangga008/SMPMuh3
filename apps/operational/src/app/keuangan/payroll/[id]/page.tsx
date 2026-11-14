'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Badge, Button, Field, Input, Modal, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { DataTable } from '@/components/data-table';
import { PageTitle, Widget } from '@/components/widgets';
import { PERMISSIONS } from '@smpmuh3/types';
import {
  deletePayrollRun,
  finalizePayrollRun,
  getPayrollRun,
  getSchool,
  listCashAccounts,
  me,
  payPayrollRun,
  recomputePayrollRun,
  updatePayrollItem,
  voidPayrollRun,
  type CashAccountView,
  type PayrollItemView,
  type PayrollRunView,
  type School,
} from '@/lib/api';
import { jam, monthLabel, printEl, RUN_LABEL, RUN_TONE, rupiah, SlipView } from '@/components/payroll-slip';

import { RowBtn } from '@/components/row-btn';
import { useConfirm } from '@/components/confirm-dialog';
export default function PayrollRunPage() {
  const { confirm, dialog } = useConfirm();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [canManage, setCanManage] = useState(false);
  const [accounts, setAccounts] = useState<CashAccountView[]>([]);
  const [school, setSchool] = useState<School | null>(null);
  const [run, setRun] = useState<PayrollRunView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [payModal, setPayModal] = useState(false);
  const [slip, setSlip] = useState<PayrollItemView | null>(null);
  const [editItem, setEditItem] = useState<PayrollItemView | null>(null);
  const [principal, setPrincipal] = useState('');
  const [treasurer, setTreasurer] = useState('');
  const printRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    getPayrollRun(id)
      .then(setRun)
      .catch(() => setError('Run tidak ditemukan.'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    Promise.all([listCashAccounts(), getSchool()])
      .then(([accs, sc]) => {
        setAccounts(accs);
        setSchool(sc);
        // Nama penanda tangan: profil sekolah dulu, lalu cache lokal.
        setPrincipal(sc.headmaster ?? localStorage.getItem('payroll.principal') ?? '');
        setTreasurer(localStorage.getItem('payroll.treasurer') ?? '');
      })
      .catch(() => undefined);
    me().then((u) => setCanManage(u.permissions.includes(PERMISSIONS.PAYROLL_MANAGE))).catch(() => undefined);
    load();
  }, [load]);

  async function run_(fn: () => Promise<unknown>, msg: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setNotice(msg);
      load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Aksi gagal.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  const totalNet = (run?.items ?? []).reduce((s, i) => s + i.netAmount, 0);
  const totalGross = (run?.items ?? []).reduce((s, i) => s + i.grossAmount, 0);
  const totalDed = (run?.items ?? []).reduce((s, i) => s + i.deductionAmount, 0);

  return (
    <Shell>
      <PageTitle
        title={run ? `Payroll ${monthLabel(run.month)}` : 'Detail Run'}
        subtitle={run ? `${run.items?.length ?? 0} pegawai · ${run.weeks} minggu aktif` : 'Memuat…'}
        actions={
          <Link
            href="/keuangan/payroll"
            className="rounded-xl border border-sand-200 bg-white px-3 py-2 text-sm font-semibold text-primary-700 shadow-sm hover:bg-sand-50"
>
            ← Daftar Run
          </Link>
        }
      />
      {error ? <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p> : null}
      {notice ? <p role="status" className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{notice}</p> : null}

      {run ? (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-sand-200 bg-white p-4 shadow-card">
              <p className="text-xs font-semibold uppercase tracking-wide text-sand-500">Status</p>
              <p className="mt-1"><Badge tone={RUN_TONE[run.status] ?? 'neutral'}>{RUN_LABEL[run.status] ?? run.status}</Badge></p>
            </div>
            <div className="rounded-2xl border border-sand-200 bg-white p-4 shadow-card">
              <p className="text-xs font-semibold uppercase tracking-wide text-sand-500">Total Bruto</p>
              <p className="mt-1 text-lg font-extrabold text-sand-900">{rupiah(totalGross)}</p>
            </div>
            <div className="rounded-2xl border border-sand-200 bg-white p-4 shadow-card">
              <p className="text-xs font-semibold uppercase tracking-wide text-sand-500">Total Potongan</p>
              <p className="mt-1 text-lg font-extrabold text-red-600">{rupiah(totalDed)}</p>
            </div>
            <div className="rounded-2xl border border-sand-200 bg-white p-4 shadow-card">
              <p className="text-xs font-semibold uppercase tracking-wide text-sand-500">Total Dibayarkan</p>
              <p className="mt-1 text-lg font-extrabold text-primary-800">{rupiah(totalNet)}</p>
            </div>
          </div>

          <Widget
            title={`Slip per Pegawai (${run.items?.length ?? 0})`}
            action={
              canManage ? (
                <span className="flex gap-2">
                  {run.status === 'DRAFT' || run.status === 'FINALIZED' ? (
                    <Button size="sm" variant="outline" onClick={async () => void run_(() => recomputePayrollRun(run.id), 'Dihitung ulang.')} disabled={busy}>Hitung Ulang</Button>
                  ) : null}
                  {run.status === 'DRAFT' ? (
                    <Button size="sm" onClick={async () => void run_(() => finalizePayrollRun(run.id), 'Run difinalkan.')} disabled={busy}>Finalkan</Button>
                  ) : null}
                  {run.status === 'FINALIZED' ? (
                    <Button size="sm" onClick={async () => setPayModal(true)} disabled={busy}>Bayar via Kas</Button>
                  ) : null}
                  {run.status !== 'PAID' && run.status !== 'VOID' ? (
                    <Button size="sm" variant="ghost" onClick={async () => { if (await confirm('Batalkan run ini?')) void run_(() => voidPayrollRun(run.id), 'Run dibatalkan.'); }} disabled={busy}>Void</Button>
                  ) : null}
                  {run.status !== 'PAID' ? (
                    <Button size="sm" variant="ghost" onClick={async () => { if (await confirm('Hapus run ini beserta semua item?')) void run_(async () => { await deletePayrollRun(run.id); router.push('/keuangan/payroll'); }, 'Run dihapus.'); }} disabled={busy}>Hapus</Button>
                  ) : null}
                  {run.status === 'PAID' ? (
                    <Button size="sm" variant="ghost" onClick={async () => { if (await confirm('Void run PAID? Kas & pinjaman dikembalikan.')) void run_(() => voidPayrollRun(run.id), 'Run dibatalkan — kas dikembalikan.'); }} disabled={busy}>Void</Button>
                  ) : null}
                </span>
              ) : undefined
            }
>
            {run.note ? <p className="mb-3 text-xs italic text-sand-500">{run.note}</p> : null}
            {run.status === 'DRAFT' ? (
              <p className="mb-3 rounded-xl bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
                Masih draft — absensi & pengaturan yang diubah setelah ini bisa dihitung ulang lewat tombol <b>Hitung Ulang</b>. Finalkan dulu sebelum dibayar.
              </p>
            ) : null}
            {run.status === 'FINALIZED' ? (
              <p className="mb-3 rounded-xl bg-sky-50 px-4 py-2.5 text-xs text-sky-800">
                Sudah final — angka masih bisa dikoreksi per pegawai (tombol <b>Koreksi</b>) sampai dibayar via kas.
              </p>
            ) : null}
            <DataTable
              head={['Pegawai', 'Jam wajib', 'Jam hadir', 'Gaji wajib', 'Transport', 'Bruto', 'Potongan', 'Netto', '']}
              loading={loading}
              error={null}
              empty={(run.items?.length ?? 0) === 0 ? 'Tidak ada pegawai aktif.' : undefined}
>
              {(run.items ?? []).map((it) => (
                <tr key={it.id} className="cursor-pointer" onClick={async () => setSlip(it)}>
                  <td className="px-5 py-3">
                    <p className="font-medium text-sand-900">{it.employee?.name}</p>
                    <p className="text-[10px] text-sand-400">{it.employee?.nip ?? ''}{it.employee?.payScale?.name ? ` · ${it.employee.payScale.name}` : ''}</p>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-xs font-semibold text-sand-700">{jam(it.requiredMinutes)}</td>
                  <td className="whitespace-nowrap px-5 py-3 text-xs">
                    <span className={it.workedMinutes + (it.manualMinutes ?? 0) > 0 ? 'font-semibold text-emerald-700' : 'text-sand-400'}>
                      {jam(it.workedMinutes + (it.manualMinutes ?? 0))}
                    </span>
                    <span className="block text-[10px] font-normal text-sand-400">
                      absen {jam(it.workedMinutes)}
                      {(it.manualMinutes ?? 0) !== 0 ? ` ${it.manualMinutes > 0 ? '+' : '−'}manual ${jam(Math.abs(it.manualMinutes))}` : ''}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-right">{rupiah(it.basePay)}</td>
                  <td className="whitespace-nowrap px-5 py-3 text-right">{rupiah(it.transportPay)}</td>
                  <td className="whitespace-nowrap px-5 py-3 text-right font-semibold text-sand-900">{rupiah(it.grossAmount)}</td>
                  <td className="whitespace-nowrap px-5 py-3 text-right text-red-600">{it.deductionAmount > 0 ? `-${rupiah(it.deductionAmount)}` : '—'}</td>
                  <td className="whitespace-nowrap px-5 py-3 text-right font-bold text-sand-900">{rupiah(it.netAmount)}</td>
                  <td className="whitespace-nowrap px-5 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <span className="flex justify-end gap-2">
                      <RowBtn type="button" onClick={async () => setSlip(it)}>Slip</RowBtn>
                      {canManage && (run.status === 'DRAFT' || run.status === 'FINALIZED') ? (
                        <RowBtn type="button" onClick={async () => setEditItem(it)}>Koreksi</RowBtn>
                      ) : null}
                    </span>
                  </td>
                </tr>
              ))}
            </DataTable>
            <p className="mt-3 rounded-xl bg-sand-50 px-4 py-2.5 text-xs text-sand-500">
              <b>Jam wajib</b> = jam/minggu × {run?.weeks ?? 0} minggu (dari Pengaturan payroll). <b>Jam hadir</b> dihitung otomatis dari absensi — menit mengajar sesuai jadwal untuk guru, durasi masuk–pulang untuk staf. Transport dibayar per jam hadir.
            </p>
            {(run.items?.length ?? 0) > 0 ? (
              <p className="mt-3 text-right text-sm font-bold text-sand-900">
                Total netto: {rupiah(totalNet)}
                {run.cashAccount?.name ? <span className="ml-2 font-normal text-sand-500">· dibayar dari {run.cashAccount.name}</span> : null}
              </p>
            ) : null}
          </Widget>
        </>
      ) : null}

      {/* Modal bayar */}
      <Modal open={payModal} onClose={() => setPayModal(false)} title="Bayar Run">
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!run) return;
            const f = new FormData(e.currentTarget);
            void run_(
              () => payPayrollRun(run.id, String(f.get('cashAccountId'))),
              'Gaji dibayar — gerakan kas & pinjaman tercatat.',
            ).then((ok) => { if (ok) setPayModal(false); });
          }}
>
          <Field label="Kas Pembayar" hint="Total netto keluar dari kas ini (satu gerakan per pegawai)">
            <Select name="cashAccountId" required>
              <option value="">— Pilih kas —</option>
              {accounts.filter((a) => a.isActive).map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          </Field>
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Pembayaran memotong angsuran pinjaman dan mencatat dana pensiun. Pastikan angka sudah final.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={async () => setPayModal(false)}>Batal</Button>
            <Button type="submit" disabled={busy}>Bayar Sekarang</Button>
          </div>
        </form>
      </Modal>

      {/* Modal slip */}
      <Modal open={!!slip} onClose={() => setSlip(null)} title="Slip Gaji" size="xl">
        {slip && run ? (
          <div className="grid gap-3">
            <div className="grid gap-2 rounded-xl bg-sand-50 p-3 sm:grid-cols-2 print:hidden">
              <Field label="Nama Kepala Sekolah" hint="Default dari Pengaturan → Profil & Kontak">
                <Input
                  value={principal}
                  onChange={(e) => { setPrincipal(e.target.value); localStorage.setItem('payroll.principal', e.target.value); }}
                  placeholder="Nama + gelar"
                />
              </Field>
              <Field label="Nama Bendahara">
                <Input
                  value={treasurer}
                  onChange={(e) => { setTreasurer(e.target.value); localStorage.setItem('payroll.treasurer', e.target.value); }}
                  placeholder="Nama bendahara"
                />
              </Field>
            </div>
            <div ref={printRef} className="rounded-xl border border-sand-200 p-5">
              <SlipView run={run} item={slip} school={school} principal={principal} treasurer={treasurer} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={async () => setSlip(null)}>Tutup</Button>
              <Button type="button" onClick={async () => printEl(printRef.current)}>Print Slip</Button>
            </div>
          </div>
        ) : null}
      </Modal>
      {/* Modal koreksi item */}
      <Modal open={!!editItem} onClose={() => setEditItem(null)} title={`Koreksi — ${editItem?.employee?.name ?? ''}`}>
        {editItem ? (
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const reqJam = Number(f.get('requiredJam')) || 0;
              const manualJam = Number(f.get('manualJam')) || 0;
              void run_(
                () =>
                  updatePayrollItem(editItem.id, {
                    requiredMinutes: Math.round(reqJam * 60),
                    manualMinutes: Math.round(manualJam * 60),
                    ...(String(f.get('manualNote') ?? '').trim() ? { manualNote: String(f.get('manualNote')).trim() } : { manualNote: '' }),
                  }),
                'Koreksi tersimpan.',
              ).then((ok) => { if (ok) setEditItem(null); });
            }}
          >
            <p className="rounded-xl bg-sand-50 px-3 py-2 text-xs text-sand-600">
              Jam hadir dari absen: <b>{jam(editItem.workedMinutes)}</b>. Koreksi manual <b>ditambahkan</b> ke hasil absen — isi negatif untuk mengurangi. Nilai bertahan saat Hitung Ulang.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Jam wajib total (jam)" hint={`${run?.weeks ?? 0} minggu × jam/minggu — override bila perlu`}>
                <Input name="requiredJam" type="number" step="0.5" min={0} defaultValue={(editItem.requiredMinutes / 60).toString()} required />
              </Field>
              <Field label="Koreksi jam transport (±jam)" hint="mis. +2 atau -1.5">
                <Input name="manualJam" type="number" step="0.5" defaultValue={((editItem.manualMinutes ?? 0) / 60).toString()} />
              </Field>
            </div>
            <Field label="Alasan koreksi" hint="Dicatat di audit — mis. 'mengajar pengganti 2 jam'">
              <Input name="manualNote" defaultValue={editItem.manualNote ?? ''} placeholder="opsional tapi disarankan" />
            </Field>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={async () => setEditItem(null)}>Batal</Button>
              <Button type="submit" disabled={busy}>Simpan</Button>
            </div>
          </form>
        ) : null}
      </Modal>
          {dialog}
      </Shell>
  );
}
