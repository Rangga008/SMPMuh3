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
  reopenPayrollRun,
  updatePayrollItem,
  updatePayrollRun,
  voidPayrollRun,
  type CashAccountView,
  type PayrollRunView,
  type School,
} from '@/lib/api';
import { jp, monthLabel, periodLabel, printEl, RUN_LABEL, RUN_TONE, rupiah, SlipView } from '@/components/payroll-slip';

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
  const [editModal, setEditModal] = useState(false);
  const [slipId, setSlipId] = useState<string | null>(null);
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
        setTreasurer(sc.treasurer ?? localStorage.getItem('payroll.treasurer') ?? '');
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

  /** Item slip yang dibuka — diambil live dari `run` agar koreksi langsung terlihat di slip. */
  const slipItem = run?.items?.find((i) => i.id === slipId) ?? null;

  const totalNet = (run?.items ?? []).reduce((s, i) => s + i.netAmount, 0);
  const totalGross = (run?.items ?? []).reduce((s, i) => s + i.grossAmount, 0);
  const totalDed = (run?.items ?? []).reduce((s, i) => s + i.deductionAmount, 0);

  return (
    <Shell>
      <PageTitle
        title={run ? `Payroll ${monthLabel(run.month)}` : 'Detail Run'}
        subtitle={run ? `${run.items?.length ?? 0} pegawai · ${run.weeks} minggu aktif · absen ${periodLabel(run)}` : 'Memuat…'}
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
                  {run.status === 'DRAFT' ? (
                    <Button size="sm" variant="outline" onClick={() => setEditModal(true)} disabled={busy}>Edit Periode</Button>
                  ) : null}
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
                  {run.status === 'VOID' ? (
                    <Button size="sm" variant="outline" onClick={async () => { if (await confirm('Aktifkan lagi run ini? Status kembali ke Draft — item gaji tetap tersimpan.')) void run_(() => reopenPayrollRun(run.id), 'Run diaktifkan lagi (Draft).'); }} disabled={busy}>Aktifkan Lagi</Button>
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
              head={['Pegawai', 'JP wajib', 'JP hadir', 'Gaji pokok', 'Transport', 'Bruto', 'Potongan', 'Netto', '']}
              loading={loading}
              error={null}
              empty={(run.items?.length ?? 0) === 0 ? 'Tidak ada pegawai aktif.' : undefined}
>
              {(run.items ?? []).map((it) => (
                <tr key={it.id} className="cursor-pointer" onClick={() => setSlipId(it.id)}>
                  <td className="px-5 py-3">
                    <p className="font-medium text-sand-900">{it.employee?.name}</p>
                    <p className="text-[10px] text-sand-400">{it.employee?.nip ?? ''}{it.employee?.payScale?.name ? ` · ${it.employee.payScale.name}` : ''}</p>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-xs font-semibold text-sand-700">{jp(it.requiredJp)}</td>
                  <td className="whitespace-nowrap px-5 py-3 text-xs">
                    <span className={(it.transportJp ?? 0) > 0 ? 'font-semibold text-emerald-700' : 'text-sand-400'}>
                      {jp(it.transportJp)}
                    </span>
                    <span className="block text-[10px] font-normal text-sand-400">
                      absen {jp((it.transportJp ?? 0) - (it.manualJp ?? 0))}
                      {(it.manualJp ?? 0) !== 0 ? ` ${(it.manualJp ?? 0) > 0 ? '+' : '−'}manual ${jp(Math.abs(it.manualJp ?? 0))}` : ''}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-right">{rupiah(it.basePay)}</td>
                  <td className="whitespace-nowrap px-5 py-3 text-right">{rupiah(it.transportPay)}</td>
                  <td className="whitespace-nowrap px-5 py-3 text-right font-semibold text-sand-900">{rupiah(it.grossAmount)}</td>
                  <td className="whitespace-nowrap px-5 py-3 text-right text-red-600">{it.deductionAmount > 0 ? `-${rupiah(it.deductionAmount)}` : '—'}</td>
                  <td className="whitespace-nowrap px-5 py-3 text-right font-bold text-sand-900">{rupiah(it.netAmount)}</td>
                  <td className="whitespace-nowrap px-5 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <RowBtn type="button" onClick={() => setSlipId(it.id)}>Slip</RowBtn>
                  </td>
                </tr>
              ))}
            </DataTable>
            <p className="mt-3 rounded-xl bg-sand-50 px-4 py-2.5 text-xs text-sand-500">
              <b>JP wajib</b> = jam pelajaran per bulan (Pengaturan → Gaji) — gaji pokok TETAP, tidak dipotong absen. <b>JP hadir</b> diakumulasi dari absensi: menit hadir tiap hari ÷ menit-per-JP, dibulatkan per hari lalu dijumlahkan sebulan. Transport dibayar per JP hadir.
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
      {/* Edit run DRAFT — bulan, rentang tanggal absen, minggu, catatan.
          Item dihitung ulang otomatis setelah simpan. */}
      <Modal open={editModal && !!run} onClose={() => setEditModal(false)} title="Edit Run Penggajian">
        {run ? (
          <form
            key={run.id}
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run_(
                () =>
                  updatePayrollRun(run.id, {
                    month: String(f.get('month')),
                    ...(f.get('periodStart') ? { periodStart: String(f.get('periodStart')) } : {}),
                    ...(f.get('periodEnd') ? { periodEnd: String(f.get('periodEnd')) } : {}),
                    weeks: Number(f.get('weeks')) || run.weeks,
                    note: String(f.get('note') ?? ''),
                  }),
                'Run diperbarui & dihitung ulang.',
              ).then((ok) => { if (ok) setEditModal(false); });
            }}
          >
            <Field label="Bulan Tagihan" hint="Ganti bulan tanpa tanggal baru → periode dihitung ulang dari siklus">
              <Input name="month" type="month" required defaultValue={run.month}
                onChange={(e) => {
                  // Periode ikut bergeser mengikuti siklus saat bulan diganti.
                  const [y, m] = e.target.value.split('-').map(Number);
                  if (!y || !m || !run.periodStart || !run.periodEnd) return;
                  const sDay = new Date(`${run.periodStart}T00:00:00Z`).getUTCDate();
                  const eDay = new Date(`${run.periodEnd}T00:00:00Z`).getUTCDate();
                  const startMonth = sDay > eDay ? m - 1 : m;
                  const clamp = (yy: number, mm: number, d: number) => {
                    const dim = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
                    return new Date(Date.UTC(yy, mm - 1, Math.min(d, dim))).toISOString().slice(0, 10);
                  };
                  const form = e.target.form;
                  const si = form?.elements.namedItem('periodStart') as HTMLInputElement | null;
                  const ei = form?.elements.namedItem('periodEnd') as HTMLInputElement | null;
                  if (si) si.value = clamp(startMonth < 1 ? y - 1 : y, ((startMonth - 1 + 12) % 12) + 1, sDay);
                  if (ei) ei.value = clamp(y, m, eDay);
                }} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Absen mulai">
                <Input name="periodStart" type="date" defaultValue={run.periodStart?.slice(0, 10) ?? ''} />
              </Field>
              <Field label="Absen sampai">
                <Input name="periodEnd" type="date" defaultValue={run.periodEnd?.slice(0, 10) ?? ''} />
              </Field>
            </div>
            <p className="-mt-1 text-[11px] text-sand-400">
              Periode absen boleh melintasi bulan (mis. 21 bulan lalu → 19 bulan tagihan). Menghitung ulang semua item dari absen rentang ini.
            </p>
            <Field label="Jumlah Minggu Aktif">
              <Input name="weeks" type="number" min={1} max={6} defaultValue={run.weeks} required />
            </Field>
            <Field label="Catatan">
              <Input name="note" defaultValue={run.note ?? ''} placeholder="opsional" />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setEditModal(false)}>Batal</Button>
              <Button type="submit" disabled={busy}>Simpan & Hitung Ulang</Button>
            </div>
          </form>
        ) : null}
      </Modal>

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
            <Select name="cashAccountId" required searchable>
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

      {/* Modal slip + koreksi — satu dialog agar tak bolak-balik buka tutup */}
      <Modal open={!!slipId} onClose={() => setSlipId(null)} title={`Slip Gaji — ${slipItem?.employee?.name ?? ''}`} size="2xl">
        {slipItem && run ? (
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
            {canManage && (run.status === 'DRAFT' || run.status === 'FINALIZED') ? (
              <form
                key={`${slipItem.id}-${slipItem.requiredJp}-${slipItem.manualJp}`}
                className="grid gap-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3 print:hidden"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void run_(
                    () =>
                      updatePayrollItem(slipItem.id, {
                        requiredJp: Number(f.get('requiredJp')) || 0,
                        manualJp: Number(f.get('manualJp')) || 0,
                        ...(String(f.get('manualNote') ?? '').trim() ? { manualNote: String(f.get('manualNote')).trim() } : { manualNote: '' }),
                      }),
                    'Koreksi tersimpan.',
                  );
                }}
              >
                <p className="text-xs font-bold uppercase tracking-wide text-amber-700">Koreksi angka</p>
                <p className="rounded-lg bg-white/70 px-3 py-2 text-xs text-sand-600">
                  JP hadir dari absen: <b>{jp((slipItem.transportJp ?? 0) - (slipItem.manualJp ?? 0))}</b>. Koreksi manual <b>ditambahkan</b> ke hasil absen — isi negatif untuk mengurangi. Nilai bertahan saat Hitung Ulang.
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="JP wajib /bulan" hint="Gaji pokok = JP wajib × tarif">
                    <Input name="requiredJp" type="number" step="0.5" min={0} defaultValue={(slipItem.requiredJp ?? 0).toString()} required />
                  </Field>
                  <Field label="Koreksi JP transport (±JP)" hint="mis. +2 atau -1.5">
                    <Input name="manualJp" type="number" step="0.5" defaultValue={(slipItem.manualJp ?? 0).toString()} />
                  </Field>
                  <Field label="Alasan koreksi" hint="mis. 'mengajar pengganti 2 jam'">
                    <Input name="manualNote" defaultValue={slipItem.manualNote ?? ''} placeholder="opsional" />
                  </Field>
                </div>
                <div className="flex justify-end">
                  <Button type="submit" size="sm" disabled={busy}>Simpan Koreksi</Button>
                </div>
              </form>
            ) : null}
            <div ref={printRef} className="rounded-xl border border-sand-200 p-5">
              <SlipView run={run} item={slipItem} school={school} principal={principal} treasurer={treasurer} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setSlipId(null)}>Tutup</Button>
              <Button type="button" onClick={async () => printEl(printRef.current)}>Print Slip</Button>
            </div>
          </div>
        ) : null}
      </Modal>
          {dialog}
      </Shell>
  );
}
