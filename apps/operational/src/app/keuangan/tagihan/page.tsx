'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Badge, Button, Field, Input, Modal, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { DataTable } from '@/components/data-table';
import { PageTitle, Widget } from '@/components/widgets';
import { SearchSelect } from '@/components/search-select';
import { PERMISSIONS, type StudentDto } from '@smpmuh3/types';
import {
  InvoiceDetail,
  KINDS,
  STATUS_LABEL,
  STATUS_TONE,
  kindLabel,
} from '@/components/invoice-detail';
import {
  createStudentInvoice,
  deleteBillingBatch,
  generateBilling,
  getStudentBills,
  listAcademicYears,
  listBillingBatches,
  listCashAccounts,
  listClasses,
  listSemesters,
  listStudentInvoices,
  listStudents,
  me,
  notifyInvoice,
  recordBillingPayment,
  updateStudentInvoice,
  voidBillingBatch,
  type AcademicYear,
  type BillingBatchView,
  type CashAccountView,
  type ClassView,
  type PaymentReceipt,
  type StudentInvoice,
  phoneLocal,
} from '@/lib/api';

import { RowBtn, rowActionClasses } from '@/components/row-btn';
import { useConfirm } from '@/components/confirm-dialog';
const rupiah = (n: number) => `Rp${n.toLocaleString('id-ID')}`;
const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

type PayTarget = { invoiceId: string; itemId?: string; label: string; max: number };

function StudentPicker({
  value,
  onPick,
}: {
  value: StudentDto | null;
  onPick: (s: StudentDto | null) => void;
}) {
  return (
    <SearchSelect
      value={value}
      onPick={onPick}
      placeholder="Cari nama/NIS siswa…"
      load={(q) => listStudents({ search: q }).then((r) => r.slice(0, 8))}
      label={(s) => s.name}
      sub={(s) =>
        `${s.nis ? `NIS ${s.nis}` : (s.nisn ?? '')}${s.status && s.status !== 'ACTIVE' ? ` · ${s.status === 'GRADUATED' ? 'Alumni' : s.status}` : ''}`
      }
    />
  );
}

export default function TagihanPage() {
  const { confirm, dialog } = useConfirm();
  const [canManage, setCanManage] = useState(false);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [classes, setClasses] = useState<ClassView[]>([]);
  const [semesters, setSemesters] = useState<{ id: string; name: string }[]>([]);
  const [accounts, setAccounts] = useState<CashAccountView[]>([]);
  const [batches, setBatches] = useState<BillingBatchView[]>([]);

  const [yearId, setYearId] = useState('');
  const [classId, setClassId] = useState('');
  const [status, setStatus] = useState('');
  const [kind, setKind] = useState('');
  const [studentStatus, setStudentStatus] = useState('');
  const [search, setSearch] = useState('');

  const [rows, setRows] = useState<StudentInvoice[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [createModal, setCreateModal] = useState(false);
  const [genModal, setGenModal] = useState(false);
  const [payTarget, setPayTarget] = useState<StudentInvoice | null>(null);
  const [detail, setDetail] = useState<StudentInvoice | null>(null);
  const [receipt, setReceipt] = useState<PaymentReceipt | null>(null);
  const [createStudent, setCreateStudent] = useState<StudentDto | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    listStudentInvoices({
      ...(yearId ? { academicYearId: yearId } : {}),
      ...(classId ? { classId } : {}),
      ...(status ? { status } : {}),
      ...(kind ? { kind } : {}),
      status: status || 'active', // riwayat (lunas/batal) ada di halaman sendiri
      ...(studentStatus ? { studentStatus } : {}),
      ...(search ? { search } : {}),
      take: '100',
    })
      .then((r) => {
        setRows(r.items);
        setTotal(r.total);
      })
      .catch(() => setError('Gagal memuat tagihan.'))
      .finally(() => setLoading(false));
  }, [yearId, classId, status, kind, studentStatus, search]);

  useEffect(() => {
    Promise.all([listAcademicYears(), listCashAccounts(), listBillingBatches()])
      .then(([ys, accs, bs]) => {
        setYears(ys);
        setAccounts(accs);
        setBatches(bs);
        const active = ys.find((y) => y.isActive) ?? ys[0];
        if (active) setYearId(active.id);
      })
      .catch(() => undefined);
    me()
      .then((u) => setCanManage(u.permissions.includes(PERMISSIONS.FINANCE_MANAGE)))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!yearId) return;
    listClasses(yearId).then(setClasses).catch(() => setClasses([]));
    listSemesters(yearId).then((s) => setSemesters(s.map((x) => ({ id: x.id, name: x.name })))).catch(() => setSemesters([]));
    listBillingBatches(yearId).then(setBatches).catch(() => undefined);
  }, [yearId]);

  const firstRun = useRef(true);
  useEffect(() => {
    const t = setTimeout(load, firstRun.current ? 0 : search ? 350 : 100);
    firstRun.current = false;
    return () => clearTimeout(t);
  }, [load, search]);

  async function run(fn: () => Promise<unknown>, msg: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fn();
      setNotice(msg);
      load();
      listBillingBatches(yearId || undefined).then(setBatches).catch(() => undefined);
      return res;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Aksi gagal.');
      return null;
    } finally {
      setBusy(false);
    }
  }

  const activeAccounts = accounts.filter((a) => a.isActive);

  async function onTagih(inv: StudentInvoice) {
    if (!inv.student?.parent?.phone) {
      setError(`Ortu ${inv.student?.name ?? 'siswa'} belum punya nomor HP — kirim manual.`);
      return;
    }
    if (
      !(await confirm(
        `Kirim pengingat tagihan ${inv.number} (${rupiah(inv.remaining)}) via WhatsApp ke ${phoneLocal(inv.student.parent.phone)}?`,
      ))
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await notifyInvoice(inv.id);
      if (res.queued) {
        setNotice(`Pengingat masuk antrean WhatsApp ke ${phoneLocal(res.phone)}.`);
        if (res.waUrl) window.open(res.waUrl, '_blank', 'noopener');
      } else if (res.waUrl) {
        window.open(res.waUrl, '_blank', 'noopener');
        setNotice('Pengingat diterbitkan — WhatsApp dibuka untuk dikirim manual.');
      } else {
        setNotice('Pengingat dikirim.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal mengirim pengingat.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <PageTitle
        title="Tagihan Siswa"
        subtitle="SPP, daftar ulang, DSP, seragam, KAT — satu tagihan bisa multi-komponen, pembayaran bisa dipecah dan dicicil"
        actions={
          <>
            <Link href="/keuangan/tagihan/riwayat" className={rowActionClasses('neutral')}>
              Riwayat →
            </Link>
            {canManage ? (
              <>
                <Button variant="outline" size="sm" onClick={async () => setGenModal(true)}>
                  + Tagihan Massal
                </Button>
                <Button size="sm" onClick={async () => setCreateModal(true)}>
                  + Tagihan Baru
                </Button>
              </>
            ) : null}
          </>
        }
      />
      {error ? (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
      ) : null}
      {notice ? (
        <p role="status" className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{notice}</p>
      ) : null}

      <div className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl border border-sand-200 bg-white p-4 shadow-card">
        <label className="flex min-w-36 flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-sand-500">Tahun Ajaran</span>
          <Select value={yearId} onChange={(e) => setYearId(e.target.value)} aria-label="Filter tahun ajaran">
            <option value="">Semua</option>
            {years.map((y) => (
              <option key={y.id} value={y.id}>{y.name}{y.isActive ? ' (aktif)' : ''}</option>
            ))}
          </Select>
        </label>
        <label className="flex min-w-32 flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-sand-500">Kelas</span>
          <Select value={classId} onChange={(e) => setClassId(e.target.value)} aria-label="Filter kelas">
            <option value="">Semua</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </label>
        <label className="flex min-w-32 flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-sand-500">Jenis</span>
          <Select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Filter jenis tagihan">
            <option value="">Semua</option>
            {KINDS.map((k) => (
              <option key={k.key} value={k.key}>{k.label}</option>
            ))}
          </Select>
        </label>
        <label className="flex min-w-32 flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-sand-500">Status</span>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter status">
            <option value="">Semua aktif</option>
            <option value="OPEN">Belum dibayar</option>
            <option value="PARTIAL">Sebagian</option>
          </Select>
        </label>
        <label className="flex min-w-32 flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-sand-500">Siswa</span>
          <Select value={studentStatus} onChange={(e) => setStudentStatus(e.target.value)} aria-label="Filter status siswa">
            <option value="">Semua</option>
            <option value="ACTIVE">Aktif</option>
            <option value="GRADUATED">Alumni / Lulus</option>
            <option value="TRANSFERRED">Pindah</option>
            <option value="DROPPED">Keluar</option>
          </Select>
        </label>
        <label className="flex min-w-40 flex-1 flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-sand-500">Pencarian</span>
          <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nama siswa / no. tagihan…" aria-label="Cari tagihan" />
        </label>
      </div>

      {batches.length > 0 ? (
        <details className="mb-5 rounded-2xl border border-sand-200 bg-white p-4 shadow-card">
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-wider text-sand-500">
            Riwayat Tagihan Massal ({batches.length})
          </summary>
          <ul className="mt-3 space-y-2">
            {batches.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-sand-50 px-3 py-2 text-sm">
                <span className="text-sand-800">
                  <b>{b.title}</b> · {kindLabel(b.kind)} · {rupiah(b.amount)}/siswa
                </span>
                <span className="flex items-center gap-3 text-xs text-sand-500">
                  {b.generatedCount} dibuat{b.skippedCount ? ` · ${b.skippedCount} dilewati` : ''} · {fmtDate(b.createdAt)}
                  {canManage ? (
                    <span className="flex gap-2">
                      <RowBtn tone="danger" type="button" onClick={async () => { if (await confirm('Batalkan semua tagihan batch ini yang belum dibayar?')) void run(() => voidBillingBatch(b.id), 'Batch dibatalkan.'); }}>
                        Batalkan
                      </RowBtn>
                      <RowBtn tone="danger" type="button" onClick={async () => { if (await confirm(`Hapus batch "${b.title}" beserta seluruh tagihannya? Hanya bisa bila belum ada pembayaran.`)) void run(() => deleteBillingBatch(b.id), 'Batch beserta tagihannya dihapus.'); }}>
                        Hapus
                      </RowBtn>
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <Widget title={`Daftar Tagihan (${total})`}>
        <DataTable
          head={['Siswa', 'Kelas', 'No. HP Ortu', 'Total', 'Terbayar', 'Sisa', 'Status', ...(canManage ? [''] : [])]}
          loading={loading}
          error={null}
          empty={rows.length === 0 ? 'Belum ada tagihan siswa.' : undefined}
>
          {rows.map((inv) => (
            <tr key={inv.id} className="cursor-pointer" onClick={async () => setDetail(inv)}>
              <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                {inv.student?.id ? (
                  <Link href={`/kesiswaan/${inv.student.id}`} className="font-medium text-sand-900 hover:text-primary-700 hover:underline">
                    {inv.student.name ?? '—'}
                  </Link>
                ) : (
                  <p className="font-medium text-sand-900">—</p>
                )}
                {inv.student?.nis ? <p className="text-[10px] text-sand-400">NIS {inv.student.nis}</p> : null}
                {inv.student?.status && inv.student.status !== 'ACTIVE' ? (
                  <Badge tone={inv.student.status === 'GRADUATED' ? 'accent' : 'danger'}>
                    {inv.student.status === 'GRADUATED' ? 'Alumni' : inv.student.status === 'TRANSFERRED' ? 'Pindah' : 'Keluar'}
                  </Badge>
                ) : null}
              </td>
              <td className="px-5 py-3 text-sand-600">{inv.class?.name ?? '—'}</td>
              <td className="whitespace-nowrap px-5 py-3 text-sand-600">
                {inv.student?.parent?.phone ? (
                  <span title={inv.student.parent.name}>{phoneLocal(inv.student.parent.phone)}</span>
                ) : '—'}
              </td>
              <td className="whitespace-nowrap px-5 py-3 text-right font-semibold text-sand-900">{rupiah(inv.amount)}</td>
              <td className="whitespace-nowrap px-5 py-3 text-right text-emerald-700">{inv.paidAmount > 0 ? rupiah(inv.paidAmount) : '—'}</td>
              <td className={`whitespace-nowrap px-5 py-3 text-right font-bold ${inv.remaining > 0 ? 'text-red-600' : 'text-sand-400'}`}>
                {inv.status === 'CANCELLED' ? '—' : rupiah(inv.remaining)}
              </td>
              <td className="px-5 py-3">
                <Badge tone={STATUS_TONE[inv.status] ?? 'neutral'}>{STATUS_LABEL[inv.status] ?? inv.status}</Badge>
                {inv.dueAt && (inv.status === 'OPEN' || inv.status === 'PARTIAL') ? (() => {
                  const days = Math.ceil((new Date(inv.dueAt).getTime() - Date.now()) / 86400000);
                  return days < 0 ? (
                    <p className="mt-0.5 text-[10px] font-bold text-red-600">Lewat tempo {-days} hr</p>
                  ) : days <= 7 ? (
                    <p className="mt-0.5 text-[10px] font-bold text-amber-600">Tempo {days === 0 ? 'hari ini' : `${days} hr lagi`}</p>
                  ) : null;
                })() : null}
              </td>
              {canManage ? (
                <td className="whitespace-nowrap px-5 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                  <span className="flex justify-end gap-2">
                    {inv.status === 'OPEN' || inv.status === 'PARTIAL' ? (
                      <>
                        <RowBtn tone="success" type="button" onClick={async () => setPayTarget(inv)}>
                          Bayar
                        </RowBtn>
                        <RowBtn
                          type="button"
                          disabled={busy}
                          title="Kirim pengingat tagihan via WhatsApp"
                          onClick={async () => void onTagih(inv)}
                        >
                          Tagih
                        </RowBtn>
                      </>
                    ) : null}
                    <RowBtn type="button" onClick={async () => setDetail(inv)}>
                      Detail
                    </RowBtn>
                    {(inv.status === 'OPEN' || inv.status === 'PARTIAL') && inv.paidAmount === 0 ? (
                      <RowBtn tone="danger" type="button" onClick={async () => { if (await confirm(`Batalkan tagihan ${inv.number}? Tagihan batal dipindah ke Riwayat.`)) void run(() => updateStudentInvoice(inv.id, { status: 'CANCELLED' }), 'Tagihan dibatalkan.'); }}>
                        Batal
                      </RowBtn>
                    ) : null}
                  </span>
                </td>
              ) : null}
            </tr>
          ))}
        </DataTable>
      </Widget>

      {/* Modal buat tagihan */}
      <Modal open={createModal} onClose={() => setCreateModal(false)} title="Tagihan Baru">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!createStudent) {
              setError('Pilih siswa dulu.');
              return;
            }
            const f = new FormData(e.currentTarget);
            const itemKinds = f.getAll('itemKind').map(String);
            const itemLabels = f.getAll('itemLabel').map(String);
            const itemAmounts = f.getAll('itemAmount').map((v) => Number(v));
            const items = itemLabels
              .map((label, i) => ({ kind: itemKinds[i] || 'other', label, amount: itemAmounts[i] || 0 }))
              .filter((i) => i.label.trim() && i.amount > 0);
            if (items.length === 0) {
              setError('Minimal satu komponen tagihan.');
              return;
            }
            void run(
              () =>
                createStudentInvoice({
                  studentId: createStudent.id,
                  title: String(f.get('title')),
                  kind: String(f.get('kind')),
                  ...(f.get('payerLabel') ? { payerLabel: String(f.get('payerLabel')) } : {}),
                  ...(f.get('academicYearId') ? { academicYearId: String(f.get('academicYearId')) } : {}),
                  ...(f.get('semesterId') ? { semesterId: String(f.get('semesterId')) } : {}),
                  ...(f.get('dueAt') ? { dueAt: String(f.get('dueAt')) } : {}),
                  ...(f.get('note') ? { note: String(f.get('note')) } : {}),
                  items,
                  notifyParent: f.get('notifyParent') === 'on',
                }),
              'Tagihan dibuat.',
            ).then((ok) => {
              if (ok) {
                setCreateModal(false);
                setCreateStudent(null);
              }
            });
          }}
          className="grid gap-3"
>
          <Field label="Siswa" hint="Tagihan menempel ke siswa — bisa dicicil dan dipecah per komponen">
            <StudentPicker value={createStudent} onPick={setCreateStudent} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Judul Tagihan">
              <Input name="title" required placeholder="SPP November 2026" />
            </Field>
            <Field label="Jenis">
              <Select name="kind" required>
                {KINDS.map((k) => (
                  <option key={k.key} value={k.key}>{k.label}</option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Tahun Ajaran">
              <Select name="academicYearId" defaultValue={yearId}>
                <option value="">—</option>
                {years.map((y) => (
                  <option key={y.id} value={y.id}>{y.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Semester">
              <Select name="semesterId">
                <option value="">—</option>
                {semesters.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Jatuh Tempo">
              <Input name="dueAt" type="date" />
            </Field>
          </div>
          <Field label="Penanggung Bayar (opsional)">
            <Input name="payerLabel" placeholder="Nama ortu/wali" />
          </Field>

          <fieldset className="rounded-2xl border border-sand-200 p-3">
            <legend className="px-1 text-xs font-bold uppercase tracking-wider text-sand-500">Komponen Tagihan</legend>
            <ItemRows />
          </fieldset>

          <Field label="Catatan">
            <Input name="note" placeholder="opsional" />
          </Field>
          <label className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-900">
            <input type="checkbox" name="notifyParent" defaultChecked className="size-4 accent-emerald-600" />
            Kirim pengingat tagihan ke WhatsApp ortu setelah dibuat
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={async () => setCreateModal(false)}>Batal</Button>
            <Button type="submit" disabled={busy}>Simpan</Button>
          </div>
        </form>
      </Modal>

      {/* Modal tagihan massal */}
      <Modal open={genModal} onClose={() => setGenModal(false)} title="Tagihan Massal">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void run(
              () =>
                generateBilling({
                  academicYearId: String(f.get('academicYearId')),
                  ...(f.get('semesterId') ? { semesterId: String(f.get('semesterId')) } : {}),
                  ...(f.get('classId') ? { classId: String(f.get('classId')) } : {}),
                  ...(f.get('gradeLevel') ? { gradeLevel: Number(f.get('gradeLevel')) } : {}),
                  kind: String(f.get('kind')),
                  title: String(f.get('title')),
                  itemLabel: String(f.get('itemLabel')),
                  amount: Number(f.get('amount')),
                  ...(f.get('dueAt') ? { dueAt: String(f.get('dueAt')) } : {}),
                  notifyParents: f.get('notifyParents') === 'on',
                }),
              'Tagihan massal dibuat.',
            ).then((ok) => {
              if (ok) setGenModal(false);
            });
          }}
          className="grid gap-3"
>
          <p className="rounded-xl bg-sand-50 px-3 py-2 text-xs text-sand-600">
            Membuat satu tagihan per siswa aktif pada cakupan yang dipilih. Siswa yang sudah punya
            tagihan serupa otomatis dilewati.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Tahun Ajaran">
              <Select name="academicYearId" required defaultValue={yearId}>
                {years.map((y) => (
                  <option key={y.id} value={y.id}>{y.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Semester">
              <Select name="semesterId">
                <option value="">—</option>
                {semesters.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Jatuh Tempo">
              <Input name="dueAt" type="date" />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Kelas" hint="kosong = semua kelas">
              <Select name="classId">
                <option value="">Semua kelas</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Jenjang" hint="kosong = semua jenjang">
              <Select name="gradeLevel">
                <option value="">Semua</option>
                <option value="1">Kelas 7</option>
                <option value="2">Kelas 8</option>
                <option value="3">Kelas 9</option>
              </Select>
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Jenis Tagihan">
              <Select name="kind" required>
                {KINDS.map((k) => (
                  <option key={k.key} value={k.key}>{k.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Nominal per Siswa">
              <Input name="amount" type="number" min={1} required placeholder="250000" />
            </Field>
          </div>
          <Field label="Judul Tagihan">
            <Input name="title" required placeholder="SPP November 2026" />
          </Field>
          <Field label="Nama Komponen" hint="muncul di rincian kwitansi">
            <Input name="itemLabel" required placeholder="SPP Bulan November" />
          </Field>
          <label className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-900">
            <input type="checkbox" name="notifyParents" defaultChecked className="size-4 accent-emerald-600" />
            Kirim pengingat ke WhatsApp ortu tiap siswa setelah dibuat
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={async () => setGenModal(false)}>Batal</Button>
            <Button type="submit" disabled={busy}>Buat Tagihan</Button>
          </div>
        </form>
      </Modal>

      {/* Modal bayar */}
      {payTarget ? (
        <PayModal
          invoice={payTarget}
          accounts={activeAccounts}
          onClose={() => setPayTarget(null)}
          onPaid={(r) => {
            setPayTarget(null);
            setReceipt(r);
            load();
          }}
          run={run}
        />
      ) : null}

      {/* Modal detail */}
      <Modal open={detail !== null} onClose={() => setDetail(null)} title={detail ? `Tagihan ${detail.number}` : ''}>
        {detail ? <InvoiceDetail invoice={detail} /> : null}
      </Modal>

      {/* Modal kwitansi */}
      <Modal open={receipt !== null} onClose={() => setReceipt(null)} title="Kwitansi Pembayaran">
        {receipt ? <ReceiptView receipt={receipt} /> : null}
      </Modal>
          {dialog}
      </Shell>
  );
}

/** Baris komponen dinamis untuk form tagihan. */
function ItemRows() {
  const [rows, setRows] = useState([{ k: 'spp', l: '', a: '' }]);
  const total = rows.reduce((s, r) => s + (Number(r.a) || 0), 0);
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-[8rem_1fr_8rem_auto]">
          <Select
            name="itemKind"
            value={r.k}
            onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, k: e.target.value } : x)))}
            aria-label={`Jenis komponen ${i + 1}`}
>
            {KINDS.map((k) => (
              <option key={k.key} value={k.key}>{k.label}</option>
            ))}
          </Select>
          <Input
            name="itemLabel"
            value={r.l}
            onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, l: e.target.value } : x)))}
            placeholder="Nama komponen (mis. SPP November)"
            aria-label={`Label komponen ${i + 1}`}
          />
          <Input
            name="itemAmount"
            type="number"
            min={0}
            value={r.a}
            onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))}
            placeholder="0"
            aria-label={`Nominal komponen ${i + 1}`}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={async () => setRows(rows.filter((_, j) => j !== i))}
            disabled={rows.length === 1}
            aria-label="Hapus komponen"
>
            ✕
          </Button>
        </div>
      ))}
      <div className="flex items-center justify-between pt-1">
        <Button type="button" variant="outline" size="sm" onClick={async () => setRows([...rows, { k: 'other', l: '', a: '' }])}>
          + Komponen
        </Button>
        <p className="text-sm font-bold text-sand-900">Total: {rupiah(total)}</p>
      </div>
    </div>
  );
}

function ReceiptView({ receipt }: { receipt: PaymentReceipt }) {
  const parent = receipt.invoice.student?.parent;
  const school = receipt.school;
  const waText = encodeURIComponent(
    `Kwitansi Pembayaran\n${receipt.invoice.number}\na.n. ${receipt.invoice.student?.name ?? ''}\n` +
      receipt.allocations.map((a) => `- ${a.item?.label ?? a.invoice.title}: Rp${a.amount.toLocaleString('id-ID')}`).join('\n') +
      `\nTotal: Rp${receipt.amount.toLocaleString('id-ID')}\nTerima kasih.`,
  );
  return (
    <div className="space-y-4 text-sm">
      <div className="rounded-2xl border border-sand-200 p-4">
        {/* Kop sekolah — sesuai Pengaturan → Profil & Kontak */}
        <div className="mb-4 flex items-center gap-3 border-b-2 border-sand-800 pb-3">
          {school?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/logo.png" alt="Logo" className="size-12 object-contain" />
          ) : null}
          <div className="flex-1 text-center">
            <p className="text-sm font-extrabold uppercase tracking-wide text-sand-900">{school?.name ?? 'Sekolah'}</p>
            <p className="text-[11px] text-sand-500">
              {school?.address ?? ''}
              {school?.phone ? ` · Telp ${school.phone}` : ''}
            </p>
          </div>
          {school?.logoUrl ? <span className="size-12" /> : null}
        </div>
        <div className="mb-3 flex items-center justify-between">
          <p className="font-bold text-sand-900">
            {receipt.receipts?.[0]?.number ?? receipt.invoice.number}
          </p>
          <p className="text-xs text-sand-500">{fmtDate(receipt.paidAt)}</p>
        </div>
        <p className="mb-3 text-sand-700">
          a.n. <b>{receipt.invoice.student?.name}</b>
          {receipt.invoice.student?.nis ? ` · NIS ${receipt.invoice.student.nis}` : ''}
          {parent?.name ? ` · Ortu: ${parent.name}` : ''}
        </p>
        <ul className="divide-y divide-sand-100 border-y border-sand-200 py-1">
          {receipt.allocations.map((a) => (
            <li key={a.id} className="flex items-center justify-between py-2">
              <span>
                {a.item?.label ?? a.invoice.title}
                {a.invoice.number !== receipt.invoice.number ? (
                  <span className="ml-1 text-xs text-sand-400">({a.invoice.number})</span>
                ) : null}
              </span>
              <span className="font-semibold">{rupiah(a.amount)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-sand-600">
            {receipt.method ?? 'cash'} · {receipt.cashAccount?.name ?? ''}
          </span>
          <span className="text-lg font-extrabold text-emerald-700">{rupiah(receipt.amount)}</span>
        </div>
      </div>
      {parent?.phone ? (
        <a
          href={`https://wa.me/${parent.phone.replace(/^0/, '62').replace(/\D/g, '')}?text=${waText}`}
          target="_blank"
          rel="noreferrer"
          className="block rounded-xl bg-emerald-600 px-4 py-2.5 text-center text-sm font-bold text-white hover:bg-emerald-700"
>
          Kirim Kwitansi via WhatsApp ({phoneLocal(parent.phone)})
        </a>
      ) : (
        <p className="text-center text-xs text-sand-500">No. HP ortu tidak tersedia untuk kwitansi WA.</p>
      )}
    </div>
  );
}

function PayModal({
  invoice,
  accounts,
  onClose,
  onPaid,
  run,
}: {
  invoice: StudentInvoice;
  accounts: CashAccountView[];
  onClose: () => void;
  onPaid: (r: PaymentReceipt) => void;
  run: (fn: () => Promise<unknown>, msg: string) => Promise<unknown>;
}) {
  const [bills, setBills] = useState<StudentInvoice[]>([]);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getStudentBills(invoice.studentId)
      .then((r) => {
        const open = r.bills.filter((b) => b.status === 'OPEN' || b.status === 'PARTIAL');
        setBills(open);
        // Prefill: sisa invoice yang diklik.
        const clicked = open.find((b) => b.id === invoice.id);
        if (clicked) {
          const targets: PayTarget[] = allocTargets(clicked);
          const first = targets[0];
          if (first) {
            setAmounts({ [`${first.invoiceId}:${first.itemId ?? ''}`]: String(first.max) });
          }
        }
      })
      .catch(() => setError('Gagal memuat tagihan siswa.'));
  }, [invoice]);

  function allocTargets(inv: StudentInvoice): PayTarget[] {
    const items = (inv.items ?? []).filter((i) => (i.remaining ?? i.amount) > 0);
    if (items.length > 1) {
      return items.map((i) => ({
        invoiceId: inv.id,
        itemId: i.id,
        label: i.label,
        max: i.remaining ?? i.amount,
      }));
    }
    return [{ invoiceId: inv.id, label: inv.title, max: inv.remaining }];
  }

  const total = Object.values(amounts).reduce((s, v) => s + (Number(v) || 0), 0);

  return (
    <Modal open onClose={onClose} title={`Terima Pembayaran — ${invoice.student?.name ?? ''}`}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          const f = new FormData(e.currentTarget);
          const allocations = bills.flatMap((inv) =>
            allocTargets(inv)
              .map((t) => ({ ...t, amount: Number(amounts[`${t.invoiceId}:${t.itemId ?? ''}`]) || 0 }))
              .filter((t) => t.amount > 0)
              .map((t) => ({
                invoiceId: t.invoiceId,
                ...(t.itemId ? { itemId: t.itemId } : {}),
                amount: t.amount,
              })),
          );
          if (allocations.length === 0) {
            setError('Isi nominal minimal satu alokasi.');
            return;
          }
          setBusy(true);
          run(
            () =>
              recordBillingPayment({
                invoiceId: invoice.id,
                ...(f.get('cashAccountId') ? { cashAccountId: String(f.get('cashAccountId')) } : {}),
                method: String(f.get('method')),
                ...(f.get('paidAt') ? { paidAt: String(f.get('paidAt')) } : {}),
                allocations,
              }),
            'Pembayaran dicatat.',
          ).then((r) => {
            setBusy(false);
            if (r) onPaid(r as PaymentReceipt);
          });
        }}
        className="grid gap-4"
>
        {error ? (
          <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : null}
        <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
          {bills.map((inv) => (
            <fieldset key={inv.id} className="rounded-2xl border border-sand-200 p-3">
              <legend className="px-1 text-xs font-bold text-sand-700">
                {inv.title} <span className="font-normal text-sand-400">· sisa {rupiah(inv.remaining)}</span>
              </legend>
              {allocTargets(inv).map((t) => {
                const key = `${t.invoiceId}:${t.itemId ?? ''}`;
                return (
                  <div key={key} className="mt-2 flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm text-sand-700" title={t.label}>
                      {t.label}
                      <span className="ml-1 text-xs text-sand-400">maks {rupiah(t.max)}</span>
                    </span>
                    <RowBtn type="button" onClick={async () => setAmounts((m) => ({ ...m, [key]: String(t.max) }))}>
                      Penuh
                    </RowBtn>
                    <Input
                      type="number"
                      min={0}
                      max={t.max}
                      value={amounts[key] ?? ''}
                      onChange={(e) => setAmounts((m) => ({ ...m, [key]: e.target.value }))}
                      placeholder="0"
                      className="w-32 text-right"
                      aria-label={`Nominal ${t.label}`}
                    />
                  </div>
                );
              })}
            </fieldset>
          ))}
          {bills.length === 0 ? <p className="text-sm text-sand-500">Tidak ada tagihan terbuka.</p> : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Masuk ke Kas">
            <Select name="cashAccountId" required defaultValue={accounts.find((a) => a.key === 'tunai')?.id ?? accounts[0]?.id ?? ''}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Metode">
            <Select name="method" defaultValue="cash">
              <option value="cash">Tunai</option>
              <option value="transfer">Transfer</option>
            </Select>
          </Field>
          <Field label="Tanggal">
            <Input name="paidAt" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
          </Field>
        </div>
        <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-3">
          <span className="text-sm font-semibold text-emerald-900">Total diterima</span>
          <span className="text-lg font-extrabold text-emerald-700">{rupiah(total)}</span>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Batal</Button>
          <Button type="submit" disabled={busy || total <= 0}>Catat Pembayaran</Button>
        </div>
      </form>
    </Modal>
  );
}
