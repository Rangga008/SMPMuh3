'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { DOC_TYPE_LABELS, PERMISSIONS, STUDENT_STATUS_LABELS } from '@smpmuh3/types';
import { Badge, Button, Field, Input, Modal, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { SearchSelect } from '@/components/search-select';
import { PageTitle, Widget } from '@/components/widgets';
import {
  addAchievement,
  addEkskulMember,
  addViolation,
  getBillingReceipt,
  getStudent,
  getStudentBills,
  listAcademicYears,
  listCashAccounts,
  listClasses,
  listEkskul,
  enrollStudent,
  me,
  notifyInvoice,
  openStudentDocument,
  recordBillingPayment,
  removeEkskulMember,
  updateStudent,
  uploadStudentDocument,
  type AcademicYear,
  type CashAccountView,
  type ClassView,
  type StudentBillsView,
  type StudentDetail,
  type StudentInvoice,
  type StudentPaymentRow,
  type EkskulDto,
} from '@/lib/api';

import { RowBtn, rowActionClasses } from '@/components/row-btn';
import { FilePick } from '@/components/file-pick';
const rupiah = (n: number) => `Rp${n.toLocaleString('id-ID')}`;
const STATUS_BILL: Record<string, string> = {
  OPEN: 'Belum bayar', PARTIAL: 'Angsuran', PAID: 'Lunas', EXPIRED: 'Kedaluwarsa', CANCELLED: 'Batal',
};
const METHOD_LABEL: Record<string, string> = {
  cash: 'Tunai', transfer: 'Transfer', mock_transfer: 'Transfer', qris: 'QRIS',
};
const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const DOC_TYPES = [
  ['kk', 'Kartu Keluarga'],
  ['akta', 'Akta Kelahiran'],
  ['ijazah', 'Ijazah / SK Lulus'],
  ['ktp_ortu', 'Fotokopi KTP Orang Tua'],
  ['foto', 'Pas Foto'],
  ['sertifikat', 'Sertifikat / Piagam'],
  ['lainnya', 'Dokumen Lainnya'],
] as const;
const DOC_TYPE_FALLBACK: Record<string, string> = {
  prestasi: 'Bukti Prestasi',
  pelanggaran: 'Bukti Pelanggaran',
};
const docLabel = (t: string) =>
  DOC_TYPE_LABELS[t as keyof typeof DOC_TYPE_LABELS] ?? DOC_TYPE_FALLBACK[t] ?? t;

type ModalKind =
  | 'profil' | 'ortu' | 'rombel' | 'prestasi' | 'pelanggaran' | 'dokumen' | 'ekskul' | null;

export default function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [s, setS] = useState<StudentDetail | null>(null);
  const [year, setYear] = useState<AcademicYear | null>(null);
  const [classes, setClasses] = useState<ClassView[]>([]);
  const [ekskulList, setEkskulList] = useState<EkskulDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<ModalKind>(null);
  // Keuangan
  const [billsView, setBillsView] = useState<StudentBillsView | null>(null);
  const [accounts, setAccounts] = useState<CashAccountView[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [canFinRead, setCanFinRead] = useState(false);
  const [canFinManage, setCanFinManage] = useState(false);
  const [payModal, setPayModal] = useState<StudentInvoice | null>(null);
  const [waBusy, setWaBusy] = useState<string | null>(null);
  const [waUrl, setWaUrl] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setS(await getStudent(id));
  }, [id]);

  const refreshBills = useCallback(() => {
    getStudentBills(id).then(setBillsView).catch(() => setBillsView(null));
  }, [id]);

  useEffect(() => {
    refresh().catch(() => setError('Siswa tidak ditemukan.'));
    listAcademicYears()
      .then(async (ys) => {
        const active = ys.find((y) => y.isActive) ?? null;
        setYear(active);
        if (active) setClasses(await listClasses(active.id));
      })
      .catch(() => undefined);
    listEkskul().then(setEkskulList).catch(() => undefined);
    me()
      .then((u) => {
        setCanManage(u.permissions.includes(PERMISSIONS.STUDENT_MANAGE));
        const finRead = u.permissions.includes(PERMISSIONS.FINANCE_READ);
        setCanFinRead(finRead);
        setCanFinManage(u.permissions.includes(PERMISSIONS.FINANCE_MANAGE));
        if (finRead) {
          refreshBills();
          listCashAccounts().then(setAccounts).catch(() => undefined);
        }
      })
      .catch(() => undefined);
  }, [refresh, refreshBills]);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await fn();
      await refresh();
      setNotice(ok);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Aksi gagal — periksa data yang diisi.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  const val = (f: FormData, k: string) => String(f.get(k) ?? '').trim() || undefined;

  /** Upload file bukti (bila dipilih) lalu kembalikan id dokumennya. */
  async function uploadEvidence(file: File | null, type: string) {
    if (!file) return undefined;
    const doc = await uploadStudentDocument(id, file, type);
    return doc.id;
  }

  function openDoc(docId: string) {
    openStudentDocument(docId)
      .then((url) => window.open(url, '_blank'))
      .catch(() => setError('Dokumen tidak dapat dibuka.'));
  }

  // Bayar/angsur — nominal bisa sebagian (cicilan) maupun lunas.
  function onPay(e: React.FormEvent<HTMLFormElement>, inv: StudentInvoice) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const amount = Number(f.get('amount'));
    void run(
      () =>
        recordBillingPayment({
          invoiceId: inv.id,
          ...(f.get('cashAccountId') ? { cashAccountId: String(f.get('cashAccountId')) } : {}),
          ...(f.get('method') ? { method: String(f.get('method')) } : {}),
          ...(f.get('paidAt') ? { paidAt: String(f.get('paidAt')) } : {}),
          ...(f.get('note') ? { note: String(f.get('note')) } : {}),
          allocations: [{ invoiceId: inv.id, amount }],
        }),
      amount < inv.remaining ? `Angsuran ${rupiah(amount)} tercatat.` : `Pembayaran ${rupiah(amount)} tercatat.`,
    ).then((ok) => {
      if (ok) {
        setPayModal(null);
        refreshBills();
      }
    });
  }

  function sendWa(inv: StudentInvoice) {
    setWaBusy(inv.id);
    setError(null);
    setWaUrl(null);
    notifyInvoice(inv.id)
      .then((r) => {
        setNotice(`Pengingat ${r.queued ? 'masuk antrean WA' : 'terkirim'} ke ${r.phone}.`);
        setWaUrl(r.waUrl);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Gagal mengantre WA.'))
      .finally(() => setWaBusy(null));
  }

  /** Cetak kwitansi satu pembayaran — jendela print seperti laporan. */
  async function printReceipt(payment: StudentPaymentRow) {
    try {
      const r = await getBillingReceipt(payment.id);
      const win = window.open('', '_blank', 'width=760,height=900');
      if (!win) {
        setError('Popup diblokir — izinkan popup untuk mencetak kwitansi.');
        return;
      }
      const school = r.school;
      const number = r.receipts?.[0]?.number ?? `KWT-${r.id.slice(0, 8).toUpperCase()}`;
      const rows = r.allocations
        .map(
          (a, i) => `<tr>
            <td style="padding:7px 10px;border-bottom:1px solid #e5e0d8">${i + 1}</td>
            <td style="padding:7px 10px;border-bottom:1px solid #e5e0d8">${a.item?.label ?? a.invoice.title}<br/><span style="font-size:11px;color:#8a8578">${a.invoice.number}</span></td>
            <td style="padding:7px 10px;border-bottom:1px solid #e5e0d8;text-align:right">${rupiah(a.amount)}</td>
          </tr>`,
        )
        .join('');
      win.document.write(`<!doctype html><html><head><base href="${window.location.origin}"><title>Kwitansi ${number}</title>
        <style>
          body{font-family:ui-sans-serif,system-ui,sans-serif;color:#29261f;margin:32px;font-size:13px}
          .kop{display:flex;align-items:center;gap:12px;border-bottom:3px double #29261f;padding-bottom:12px;margin-bottom:18px}
          .kop h1{font-size:17px;margin:0}
          .kop p{font-size:11px;color:#6b675a;margin:2px 0 0}
          .nomor{text-align:center;margin:14px 0 20px}
          .nomor b{font-size:15px}
          table{width:100%;border-collapse:collapse}
          th{background:#f4f1ea;text-align:left;padding:7px 10px;font-size:11px;text-transform:uppercase;letter-spacing:.05em}
          .meta td{padding:3px 0;font-size:13px}
          .meta td:first-child{width:150px;color:#6b675a}
          .total td{padding:9px 10px;font-weight:700;font-size:14px;border-top:2px solid #29261f}
          .ttd{display:flex;justify-content:space-between;margin-top:44px}
          .ttd div{text-align:center;width:190px}
          .ttd .nm{margin-top:64px;border-top:1px solid #29261f;padding-top:5px;font-weight:600}
          .ttd .nm.hassig{margin-top:8px}
          .ttd img.sig{height:52px;object-fit:contain;margin-top:8px}
          @media print{body{margin:12mm}}
        </style></head><body>
        <div class="kop">
          ${school?.logoUrl ? `<img src="/logo.png" alt="" style="width:56px;height:56px;object-fit:contain"/>` : ''}
          <div style="flex:1;text-align:center">
            <h1>${school?.name ?? 'Sekolah'}</h1>
            <p>${school?.address ?? ''}${school?.phone ? ` · Telp ${school.phone}` : ''}${school?.whatsapp ? ` · WA ${school.whatsapp}` : ''}</p>
          </div>
          ${school?.logoUrl ? '<span style="width:56px"></span>' : ''}
        </div>
        <div class="nomor"><b>KWITANSI PEMBAYARAN</b><br/><span style="font-size:12px;color:#6b675a">No. ${number}</span></div>
        <table class="meta"><tbody>
          <tr><td>Telah diterima dari</td><td><b>${r.invoice.student?.parent?.name ?? 'Orang Tua/Wali'}</b></td></tr>
          <tr><td>Untuk pembayaran siswa</td><td><b>${r.invoice.student?.name ?? '-'}</b>${r.invoice.student?.nis ? ` · NIS ${r.invoice.student.nis}` : ''}</td></tr>
          <tr><td>Tanggal bayar</td><td>${fmtDate(r.paidAt)}</td></tr>
          <tr><td>Metode / Kas</td><td>${METHOD_LABEL[r.method ?? ''] ?? r.method ?? '-'}${r.cashAccount?.name ? ` · ${r.cashAccount.name}` : ''}</td></tr>
        </tbody></table>
        <br/>
        <table><thead><tr><th style="width:34px">No</th><th>Rincian Pembayaran</th><th style="width:130px;text-align:right">Jumlah</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr class="total"><td></td><td>TOTAL DITERIMA</td><td style="text-align:right">${rupiah(r.amount)}</td></tr></tfoot>
        </table>
        <div class="ttd">
          <div><p>Orang Tua/Wali</p><p class="nm">${r.invoice.student?.parent?.name ?? '( …………………… )'}</p></div>
          ${school?.headmaster ? `<div><p>Mengetahui,<br/>Kepala Sekolah</p>${school.headmasterSignatureUrl ? `<img class="sig" src="/signature.png" alt=""/>` : ''}<p class="nm${school.headmasterSignatureUrl ? ' hassig' : ''}">${school.headmaster}${school.headmasterNip ? `<br/><span style="font-weight:400;font-size:11px">NIP/NUPTK ${school.headmasterNip}</span>` : ''}</p></div>` : ''}
          <div><p>Bandung, ${fmtDate(r.paidAt)}<br/>Bendahara,</p><p class="nm">${r.cashierName ?? '( …………………… )'}</p></div>
        </div>
        <script>window.onload=()=>{window.print();}<\/script>
        </body></html>`);
      win.document.close();
    } catch {
      setError('Gagal memuat data kwitansi.');
    }
  }

  return (
    <Shell>
      <Link href="/kesiswaan" className="text-sm font-semibold text-primary-700 hover:text-primary-800">
        ← Data siswa
      </Link>
      <div className="mt-2">
        <PageTitle
          title={s?.name ?? 'Detail Siswa'}
          subtitle={s ? [s.nis && `NIS ${s.nis}`, s.nisn && `NISN ${s.nisn}`].filter(Boolean).join(' · ') || undefined : undefined}
          actions={s ? (
            <span className="flex items-center gap-2">
              <Link href={`/kesiswaan/${s.id}/induk`} className={rowActionClasses('neutral')}>
                Buku Induk →
              </Link>
              <Badge tone={s.status === 'ACTIVE' ? 'primary' : 'neutral'}>{STUDENT_STATUS_LABELS[s.status]}</Badge>
            </span>
          ) : undefined}
        />
      </div>

      {error ? (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
      ) : null}
      {notice ? (
        <p role="status" className="mb-4 rounded-xl bg-primary-50 px-4 py-3 text-sm font-medium text-primary-800">{notice}</p>
      ) : null}

      {!s ? (
        <p className="text-sm text-sand-500">Memuat…</p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            <Widget
              title="Data Diri"
              action={canManage ? <Button variant="outline" size="sm" onClick={() => setModal('profil')}>Ubah</Button> : undefined}
>
              <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                <div><dt className="text-xs font-bold uppercase tracking-wide text-sand-400">Nama Lengkap</dt><dd className="mt-0.5 font-semibold text-sand-900">{s.name}</dd></div>
                <div><dt className="text-xs font-bold uppercase tracking-wide text-sand-400">Jenis Kelamin</dt><dd className="mt-0.5 text-sand-800">{s.gender === 'MALE' ? 'Laki-laki' : s.gender === 'FEMALE' ? 'Perempuan' : '—'}</dd></div>
                <div><dt className="text-xs font-bold uppercase tracking-wide text-sand-400">NIS</dt><dd className="mt-0.5 text-sand-800">{s.nis ?? '—'}</dd></div>
                <div><dt className="text-xs font-bold uppercase tracking-wide text-sand-400">NISN</dt><dd className="mt-0.5 text-sand-800">{s.nisn ?? '—'}</dd></div>
                <div><dt className="text-xs font-bold uppercase tracking-wide text-sand-400">Tempat, Tanggal Lahir</dt><dd className="mt-0.5 text-sand-800">{[s.birthPlace, s.birthDate ? fmtDate(s.birthDate) : null].filter(Boolean).join(', ') || '—'}</dd></div>
                <div><dt className="text-xs font-bold uppercase tracking-wide text-sand-400">Alamat</dt><dd className="mt-0.5 text-sand-800">{s.address ?? '—'}</dd></div>
              </dl>
            </Widget>

            <Widget
              title={`Rombel TA ${year?.name ?? ''}`}
              action={
                canManage && !s.enrollments.some((e) => e.academicYear.name === year?.name)
                  ? <Button variant="outline" size="sm" onClick={() => setModal('rombel')}>Tempatkan di Rombel</Button>
                  : undefined
              }
>
              {s.enrollments.length === 0 ? (
                <p className="text-sm text-sand-500">Belum ditempatkan di rombel.</p>
              ) : (
                <ul className="space-y-2">
                  {s.enrollments.map((en) => (
                    <li key={en.id} className="rounded-xl border border-sand-200 bg-sand-50 px-4 py-3 text-sm font-semibold text-sand-900">
                      {en.class.name} <span className="font-normal text-sand-500">· Kelas {en.class.gradeLevel} · {en.academicYear.name}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Widget>

            <Widget
              title={`Dokumen (${s.documents?.length ?? 0})`}
              action={canManage ? <Button variant="outline" size="sm" onClick={() => setModal('dokumen')}>+ Unggah</Button> : undefined}
>
              {!s.documents?.length ? (
                <p className="text-sm text-sand-500">Belum ada dokumen terunggah.</p>
              ) : (
                <div className="space-y-4">
                  {Object.entries(
                    s.documents.reduce<Record<string, typeof s.documents>>(
                      (acc, d) => {
                        (acc[d.type] ??= []).push(d);
                        return acc;
                      },
                      {},
                    ),
                  ).map(([type, docs]) => (
                    <div key={type}>
                      <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-primary-700">
                        {docLabel(type)}
                      </p>
                      <ul className="space-y-1.5">
                        {docs.map((d) => (
                          <li
                            key={d.id}
                            className="flex items-center justify-between gap-3 rounded-xl border border-sand-200 bg-sand-50 px-4 py-2.5 text-sm"
>
                            <RowBtn type="button" onClick={() => openDoc(d.id)} className="min-w-0 truncate text-left" title="Buka dokumen">
                              {d.fileName}
                            </RowBtn>
                            <span className="flex shrink-0 items-center gap-2 text-xs text-sand-500">
                              {(d.sizeBytes / 1024).toFixed(0)} KB
                              {d.verifiedAt ? <Badge tone="primary">Terverifikasi</Badge> : null}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </Widget>
          </div>

          <div className="space-y-5">
            <Widget
              title="Orang Tua / Wali"
              action={canManage ? <Button variant="outline" size="sm" onClick={() => setModal('ortu')}>{s.parent ? 'Ubah' : '+ Isi'}</Button> : undefined}
>
              {!s.parent ? (
                <p className="text-sm text-sand-500">
                  Belum ada data orang tua — isi nama &amp; no. HP agar pengingat tagihan dan kwitansi bisa dikirim.
                </p>
              ) : (
                <div className="space-y-2 text-sm">
                  <p className="font-semibold text-sand-900">{s.parent.name}</p>
                  {s.parent.email ? <p className="text-xs text-sand-500">{s.parent.email}</p> : null}
                  <p className="flex items-center gap-2">
                    <span className="font-medium text-sand-800">{s.parent.phone ?? '—'}</span>
                    {s.parent.phone ? (
                      <a
                        href={`https://wa.me/${s.parent.phone.replace(/[^0-9]/g, '').replace(/^0/, '62')}`}
                        target="_blank"
                        rel="noreferrer"
                        className={rowActionClasses('success')}
                      >
                        Chat WA →
                      </a>
                    ) : null}
                  </p>
                  {s.spmbNumber ? (
                    <Badge tone="accent">Alumni SPMB {s.spmbNumber}</Badge>
                  ) : null}
                </div>
              )}
            </Widget>

            <Widget
              title={`Prestasi (${s.achievements.length})`}
              action={canManage ? <Button variant="outline" size="sm" onClick={() => setModal('prestasi')}>+ Tambah</Button> : undefined}
>
              <ul className="space-y-2 text-sm">
                {s.achievements.map((a) => (
                  <li key={a.id} className="rounded-xl bg-primary-50 px-4 py-2.5">
                    <p className="font-semibold text-sand-900">{a.title}</p>
                    <p className="text-xs text-sand-500">
                      {[a.level, a.year].filter(Boolean).join(' · ')}
                      {a.evidenceDocument ? (
                        <>
                          {' · '}
                          <RowBtn type="button" onClick={() => openDoc(a.evidenceDocument!.id)}>
                            bukti: {a.evidenceDocument.fileName}
                          </RowBtn>
                        </>
                      ) : null}
                    </p>
                  </li>
                ))}
                {s.achievements.length === 0 ? (
                  <li className="text-sand-500">Belum ada prestasi.</li>
                ) : null}
              </ul>
            </Widget>

            <Widget
              title={`Ekstrakurikuler (${s.ekskulMemberships?.length ?? 0})`}
              action={canManage ? <Button variant="outline" size="sm" onClick={() => setModal('ekskul')}>+ Daftar</Button> : undefined}
>
              <ul className="space-y-2 text-sm">
                {(s.ekskulMemberships ?? []).map((m) => (
                  <li key={m.id} className="flex items-start justify-between gap-2 rounded-xl bg-emerald-50 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="font-semibold text-sand-900">
                        {m.extracurricular.name}
                        {!m.extracurricular.isActive ? <span className="ml-1 text-xs font-normal text-sand-400">(nonaktif)</span> : null}
                      </p>
                      <p className="text-xs text-sand-500">
                        {[m.role, m.extracurricular.schedule, m.extracurricular.coach?.name && `Pembina: ${m.extracurricular.coach.name}`]
                          .filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    {canManage ? (
                      <RowBtn
                        type="button"
                        tone="danger"
                        className="shrink-0"
                        onClick={() =>
                          void run(() => removeEkskulMember(m.id), 'Keanggotaan ekskul dihapus.')
                        }
                      >
                        Keluarkan
                      </RowBtn>
                    ) : null}
                  </li>
                ))}
                {(s.ekskulMemberships?.length ?? 0) === 0 ? (
                  <li className="text-sand-500">Belum ikut ekstrakurikuler.</li>
                ) : null}
              </ul>
            </Widget>

            <Widget
              title={`Pelanggaran (${s.violations.length})`}
              action={canManage ? <Button variant="outline" size="sm" onClick={() => setModal('pelanggaran')}>+ Catat</Button> : undefined}
>
              <ul className="space-y-2 text-sm">
                {s.violations.map((v) => (
                  <li key={v.id} className="rounded-xl bg-red-50 px-4 py-2.5">
                    <p className="font-semibold text-sand-900">{v.type} <span className="text-red-700">· {v.points} poin</span></p>
                    <p className="text-xs text-sand-500">
                      {v.date.slice(0, 10)}{v.description ? ` — ${v.description}` : ''}
                      {v.evidenceDocument ? (
                        <>
                          {' · '}
                          <RowBtn type="button" onClick={() => openDoc(v.evidenceDocument!.id)}>
                            bukti: {v.evidenceDocument.fileName}
                          </RowBtn>
                        </>
                      ) : null}
                    </p>
                  </li>
                ))}
                {s.violations.length === 0 ? (
                  <li className="text-sand-500">Tidak ada pelanggaran.</li>
                ) : null}
              </ul>
            </Widget>
          </div>
        </div>
      )}

      {/* ---- Keuangan: tagihan, angsuran, pengingat WA, kwitansi ---- */}
      {s && canFinRead ? (
        <div className="mt-6">
          <Widget
            title="Tagihan & Pembayaran"
            action={
              <span className="flex items-center gap-3 text-xs">
                {billsView ? (
                  <span className="text-sand-500">
                    Saldo tabungan <b className="text-primary-800">{rupiah(billsView.savings)}</b>
                  </span>
                ) : null}
                <Link href={`/keuangan/tabungan/${id}`} className={rowActionClasses()}>
                  Buku Tabungan →
                </Link>
              </span>
            }
>
            {!billsView ? (
              <p className="py-4 text-sm text-sand-500">Memuat tagihan…</p>
            ) : billsView.bills.length === 0 ? (
              <p className="py-4 text-sm text-sand-500">Belum ada tagihan terbit.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider text-sand-500">
                      <th className="pb-2 pr-3">Tagihan</th>
                      <th className="pb-2 pr-3">Jatuh Tempo</th>
                      <th className="pb-2 pr-3 text-right">Total</th>
                      <th className="pb-2 pr-3 text-right">Terbayar</th>
                      <th className="pb-2 pr-3 text-right">Sisa</th>
                      <th className="w-40 pb-2 pr-3">Status</th>
                      {canFinManage ? <th className="pb-2 text-right">Aksi</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {billsView.bills.map((b) => {
                      const pct = b.amount > 0 ? Math.min(100, Math.round((b.paidAmount / b.amount) * 100)) : 0;
                      const active = b.status === 'OPEN' || b.status === 'PARTIAL';
                      return (
                        <tr key={b.id} className="border-t border-sand-100">
                          <td className="max-w-64 py-3 pr-3">
                            <p className="truncate font-semibold text-sand-900" title={b.title}>{b.title}</p>
                            <p className="text-xs text-sand-400">{b.number}</p>
                          </td>
                          <td className="whitespace-nowrap py-3 pr-3 text-xs text-sand-500">
                            {b.dueAt ? b.dueAt.slice(0, 10) : '—'}
                          </td>
                          <td className="whitespace-nowrap py-3 pr-3 text-right tabular-nums">{rupiah(b.amount)}</td>
                          <td className="whitespace-nowrap py-3 pr-3 text-right tabular-nums text-emerald-700">{rupiah(b.paidAmount)}</td>
                          <td className={`whitespace-nowrap py-3 pr-3 text-right font-semibold tabular-nums ${b.remaining > 0 ? 'text-amber-700' : 'text-sand-400'}`}>
                            {rupiah(b.remaining)}
                          </td>
                          <td className="py-3 pr-3">
                            <div className="flex items-center gap-2">
                              <Badge tone={b.status === 'PAID' ? 'primary' : b.status === 'PARTIAL' ? 'accent' : b.status === 'OPEN' ? 'neutral' : 'danger'}>
                                {STATUS_BILL[b.status] ?? b.status}
                              </Badge>
                              {b.status === 'PARTIAL' ? (
                                <div className="h-1.5 w-14 overflow-hidden rounded-full bg-sand-100">
                                  <div className="h-full rounded-full bg-amber-500" style={{ width: `${pct}%` }} />
                                </div>
                              ) : null}
                            </div>
                          </td>
                          {canFinManage ? (
                            <td className="whitespace-nowrap py-3 text-right">
                              {active ? (
                                <span className="flex justify-end gap-2">
                                  <RowBtn type="button" onClick={() => setPayModal(b)}>
                                    Bayar / Angsur
                                  </RowBtn>
                                  <RowBtn tone="success" type="button" className="disabled:opacity-50" disabled={waBusy === b.id} onClick={() => sendWa(b)}>
                                    {waBusy === b.id ? 'Mengantre…' : 'Ingatkan WA'}
                                  </RowBtn>
                                </span>
                              ) : null}
                            </td>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {waUrl ? (
                  <p className="mt-3 text-xs text-sand-500">
                    Bila pesan tak terkirim otomatis, kirim manual:{' '}
                    <a href={waUrl} target="_blank" rel="noreferrer" className="font-semibold text-primary-700 hover:underline">
                      buka wa.me →
                    </a>
                  </p>
                ) : null}
              </div>
            )}
          </Widget>

          <Widget title={`Riwayat Pembayaran & Kwitansi (${billsView?.payments.length ?? 0})`}>
            {!billsView || billsView.payments.length === 0 ? (
              <p className="py-2 text-sm text-sand-500">Belum ada pembayaran tercatat.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider text-sand-500">
                      <th className="pb-2 pr-3">No. Kwitansi</th>
                      <th className="pb-2 pr-3">Tanggal</th>
                      <th className="pb-2 pr-3">Rincian</th>
                      <th className="pb-2 pr-3">Metode</th>
                      <th className="pb-2 pr-3 text-right">Jumlah</th>
                      <th className="pb-2 text-right"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {billsView.payments.map((p) => (
                      <tr key={p.id} className="border-t border-sand-100">
                        <td className="whitespace-nowrap py-3 pr-3 font-mono text-xs font-semibold text-primary-800">
                          {p.receipts?.[0]?.number ?? '—'}
                        </td>
                        <td className="whitespace-nowrap py-3 pr-3 text-sand-600">{fmtDate(p.paidAt)}</td>
                        <td className="max-w-72 py-3 pr-3 text-sand-700">
                          {p.allocations.map((a) => (
                            <p key={a.id} className="truncate" title={a.item?.label ?? a.invoice.title}>
                              {a.item?.label ?? a.invoice.title}
                            </p>
                          ))}
                        </td>
                        <td className="whitespace-nowrap py-3 pr-3 text-xs text-sand-500">
                          {METHOD_LABEL[p.method ?? ''] ?? p.method ?? '—'}
                          {p.cashAccount?.name ? ` · ${p.cashAccount.name}` : ''}
                        </td>
                        <td className="whitespace-nowrap py-3 pr-3 text-right font-semibold tabular-nums text-sand-900">
                          {rupiah(p.amount)}
                        </td>
                        <td className="whitespace-nowrap py-3 text-right">
                          <RowBtn type="button" onClick={() => void printReceipt(p)}>
                            Cetak Kwitansi
                          </RowBtn>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Widget>
        </div>
      ) : null}

      {/* ============ MODAL ============ */}

      {/* Ubah data diri */}
      <Modal open={modal === 'profil'} onClose={() => setModal(null)} title="Ubah Data Diri" size="lg">
        {s ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(
                () =>
                  updateStudent(id, {
                    name: val(f, 'name'),
                    nis: val(f, 'nis'),
                    nisn: val(f, 'nisn'),
                    gender: val(f, 'gender'),
                    birthPlace: val(f, 'birthPlace'),
                    birthDate: val(f, 'birthDate'),
                    address: val(f, 'address'),
                  }),
                'Data tersimpan.',
              ).then((ok) => ok && setModal(null));
            }}
            className="grid gap-4 sm:grid-cols-2"
>
            <Field label="Nama Lengkap" className="sm:col-span-2">
              <Input name="name" required defaultValue={s.name} />
            </Field>
            <Field label="NIS"><Input name="nis" defaultValue={s.nis ?? ''} /></Field>
            <Field label="NISN"><Input name="nisn" defaultValue={s.nisn ?? ''} /></Field>
            <Field label="Jenis Kelamin">
              <Select name="gender" defaultValue={s.gender ?? ''}>
                <option value="">Pilih…</option>
                <option value="MALE">Laki-laki</option>
                <option value="FEMALE">Perempuan</option>
              </Select>
            </Field>
            <Field label="Tempat Lahir"><Input name="birthPlace" defaultValue={s.birthPlace ?? ''} /></Field>
            <Field label="Tanggal Lahir"><Input name="birthDate" type="date" defaultValue={s.birthDate?.slice(0, 10) ?? ''} /></Field>
            <Field label="Alamat"><Input name="address" defaultValue={s.address ?? ''} /></Field>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button type="button" variant="ghost" onClick={() => setModal(null)}>Batal</Button>
              <Button type="submit" disabled={busy}>Simpan Perubahan</Button>
            </div>
          </form>
        ) : null}
      </Modal>

      {/* Data orang tua / wali */}
      <Modal open={modal === 'ortu'} onClose={() => setModal(null)} title="Orang Tua / Wali">
        {s ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(
                () =>
                  updateStudent(id, {
                    name: s.name, // wajib di DTO
                    parentName: val(f, 'parentName') ?? '',
                    parentPhone: val(f, 'parentPhone') ?? '',
                  }),
                'Data orang tua tersimpan.',
              ).then((ok) => ok && setModal(null));
            }}
            className="grid gap-4"
>
            <p className="rounded-xl bg-sand-50 px-4 py-3 text-xs text-sand-600">
              Untuk siswa yang tidak masuk lewat SPMB (kelas lanjutan/mutasi), akun
              orang tua dibuat otomatis dari data ini — no. HP dipakai untuk
              pengingat tagihan &amp; pengiriman kwitansi via WhatsApp.
            </p>
            <Field label="Nama Orang Tua / Wali">
              <Input name="parentName" required minLength={3} defaultValue={s.parent?.name ?? ''} placeholder="mis. Budi Santoso" />
            </Field>
            <Field label="No. HP / WhatsApp" hint="Format bebas — dinormalisasi ke 62… saat mengirim WA">
              <Input name="parentPhone" defaultValue={s.parent?.phone ?? ''} placeholder="08xxxxxxxxxx" />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setModal(null)}>Batal</Button>
              <Button type="submit" disabled={busy}>Simpan</Button>
            </div>
          </form>
        ) : null}
      </Modal>

      {/* Tempatkan di rombel */}
      <Modal open={modal === 'rombel'} onClose={() => setModal(null)} title={`Tempatkan di Rombel — TA ${year?.name ?? ''}`}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void run(
              () => enrollStudent({ studentId: id, classId: String(f.get('classId')) }),
              'Siswa ditempatkan di rombel.',
            ).then((ok) => ok && setModal(null));
          }}
          className="grid gap-4"
>
          <Field label="Rombel" hint="Ketik untuk mencari nama kelas">
            <SearchSelect
              name="classId"
              required
              placeholder="Ketik nama rombel…"
              load={async (q) =>
                classes.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()))
              }
              label={(c) => c.name}
              sub={(c) => `Kelas ${c.gradeLevel} · ${c._count?.enrollments ?? 0} siswa`}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setModal(null)}>Batal</Button>
            <Button type="submit" disabled={busy}>Tempatkan</Button>
          </div>
        </form>
      </Modal>

      {/* Tambah prestasi */}
      <Modal open={modal === 'prestasi'} onClose={() => setModal(null)} title="Tambah Prestasi">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const file = (f.get('evidence') as File | null) ?? null;
            const ok = await run(
              async () =>
                addAchievement(id, {
                  title: val(f, 'title'),
                  level: val(f, 'level'),
                  year: Number(val(f, 'year')) || undefined,
                  description: val(f, 'description'),
                  evidenceDocumentId: await uploadEvidence(file?.size ? file : null, 'prestasi'),
                }),
              'Prestasi ditambahkan.',
            );
            if (ok) setModal(null);
          }}
          className="grid gap-4"
>
          <Field label="Judul Prestasi">
            <Input name="title" required minLength={3} placeholder="mis. Juara 1 O2SN Matematika" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tingkat">
              <Input name="level" placeholder="Kota / Provinsi / Nasional" />
            </Field>
            <Field label="Tahun">
              <Input name="year" type="number" min={1990} max={2100} placeholder={String(new Date().getFullYear())} />
            </Field>
          </div>
          <Field label="Keterangan (opsional)">
            <Input name="description" placeholder="Detail prestasi" />
          </Field>
          <Field label="Bukti — foto/PDF (opsional)" hint="Piagam, sertifikat, atau foto — maks 5 MB">
            <FilePick name="evidence" accept="image/jpeg,image/png,image/webp,application/pdf" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setModal(null)}>Batal</Button>
            <Button type="submit" disabled={busy}>Simpan Prestasi</Button>
          </div>
        </form>
      </Modal>

      {/* Daftar ekstrakurikuler — sinkron dengan daftar di /kesiswaan/ekskul */}
      <Modal open={modal === 'ekskul'} onClose={() => setModal(null)} title="Daftar Ekstrakurikuler">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const ekskulId = String(f.get('ekskulId') ?? '');
            if (!ekskulId) {
              setError('Pilih ekstrakurikuler dulu.');
              return;
            }
            void run(
              () => addEkskulMember(ekskulId, id, val(f, 'role')),
              'Siswa terdaftar di ekstrakurikuler.',
            ).then((ok) => ok && setModal(null));
          }}
          className="grid gap-4"
>
          <Field label="Ekstrakurikuler" hint="Ketik untuk mencari — daftar sama dengan menu Kesiswaan › Ekskul">
            <Select name="ekskulId" required defaultValue="">
              <option value="" disabled>Pilih…</option>
              {ekskulList
                .filter((x) => x.isActive && !(s?.ekskulMemberships ?? []).some((m) => m.extracurricular.id === x.id))
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}{x.schedule ? ` · ${x.schedule}` : ''}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Peran (opsional)">
            <Input name="role" placeholder="mis. Ketua / Anggota" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setModal(null)}>Batal</Button>
            <Button type="submit" disabled={busy}>Daftarkan</Button>
          </div>
        </form>
      </Modal>

      {/* Catat pelanggaran */}
      <Modal open={modal === 'pelanggaran'} onClose={() => setModal(null)} title="Catat Pelanggaran">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const file = (f.get('evidence') as File | null) ?? null;
            const ok = await run(
              async () =>
                addViolation(id, {
                  type: val(f, 'type'),
                  points: Number(val(f, 'points')) || 0,
                  description: val(f, 'description'),
                  date: val(f, 'date') ?? new Date().toISOString(),
                  evidenceDocumentId: await uploadEvidence(file?.size ? file : null, 'pelanggaran'),
                }),
              'Pelanggaran dicatat.',
            );
            if (ok) setModal(null);
          }}
          className="grid gap-4"
>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Jenis Pelanggaran">
              <Input name="type" required minLength={3} placeholder="mis. Terlambat / Atribut" />
            </Field>
            <Field label="Poin">
              <Input name="points" type="number" min={0} max={100} defaultValue={0} />
            </Field>
          </div>
          <Field label="Tanggal">
            <Input name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
          </Field>
          <Field label="Keterangan (opsional)">
            <Input name="description" placeholder="Kronologi singkat" />
          </Field>
          <Field label="Bukti — foto/PDF (opsional)" hint="Foto kejadian atau surat — maks 5 MB">
            <FilePick name="evidence" accept="image/jpeg,image/png,image/webp,application/pdf" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setModal(null)}>Batal</Button>
            <Button type="submit" disabled={busy}>Catat Pelanggaran</Button>
          </div>
        </form>
      </Modal>

      {/* Unggah dokumen */}
      <Modal open={modal === 'dokumen'} onClose={() => setModal(null)} title="Unggah Dokumen Siswa">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const file = f.get('file') as File | null;
            if (!file?.size) {
              setError('Pilih file dulu.');
              return;
            }
            const ok = await run(
              () => uploadStudentDocument(id, file, String(f.get('dtype') ?? 'lainnya')),
              'Dokumen terunggah.',
            );
            if (ok) setModal(null);
          }}
          className="grid gap-4"
>
          <Field label="Jenis Dokumen">
            <Select name="dtype" defaultValue="lainnya">
              {DOC_TYPES.map(([k, l]) => (
                <option key={k} value={k}>{l}</option>
              ))}
            </Select>
          </Field>
          <Field label="File" hint="JPG, PNG, WebP, atau PDF — maks 5 MB">
            <FilePick name="file" required accept="image/jpeg,image/png,image/webp,application/pdf" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setModal(null)}>Batal</Button>
            <Button type="submit" disabled={busy}>Unggah</Button>
          </div>
        </form>
      </Modal>

      {/* Modal bayar/angsur */}
      <Modal open={payModal !== null} onClose={() => setPayModal(null)} title={payModal ? `Bayar — ${payModal.title}` : ''}>
        {payModal ? (
          <form onSubmit={(e) => onPay(e, payModal)} className="grid gap-4">
            <div className="rounded-xl bg-sand-50 px-4 py-3 text-sm">
              <p>Sisa tagihan: <b className="text-amber-700">{rupiah(payModal.remaining)}</b> dari {rupiah(payModal.amount)}</p>
              <p className="mt-1 text-xs text-sand-500">Isi nominal lebih kecil dari sisa untuk mencatat angsuran/cicilan.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nominal Bayar (Rp)">
                <Input name="amount" type="number" min={1} max={payModal.remaining} required defaultValue={payModal.remaining} />
              </Field>
              <Field label="Metode">
                <Select name="method" defaultValue="cash">
                  <option value="cash">Tunai</option>
                  <option value="transfer">Transfer</option>
                </Select>
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Kas Tujuan" hint="Kosong = akun default">
                <Select name="cashAccountId" defaultValue="">
                  <option value="">Default</option>
                  {accounts.filter((a) => a.isActive).map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Tanggal Bayar">
                <Input name="paidAt" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
              </Field>
            </div>
            <Field label="Catatan">
              <Input name="note" placeholder="mis. Angsuran ke-2 DSP" />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setPayModal(null)}>Batal</Button>
              <Button type="submit" disabled={busy}>Catat Pembayaran</Button>
            </div>
          </form>
        ) : null}
      </Modal>
    </Shell>
  );
}
