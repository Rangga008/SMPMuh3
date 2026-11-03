'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { DOC_TYPE_LABELS, PERMISSIONS, STUDENT_STATUS_LABELS } from '@smpmuh3/types';
import { Badge, Button, Field, Input, Modal, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { PageTitle, Widget } from '@/components/widgets';
import {
  addAchievement,
  addViolation,
  getStudent,
  getStudentBills,
  listAcademicYears,
  listCashAccounts,
  listClasses,
  enrollStudent,
  me,
  notifyInvoice,
  recordBillingPayment,
  updateStudent,
  type AcademicYear,
  type CashAccountView,
  type ClassView,
  type StudentBillsView,
  type StudentDetail,
  type StudentInvoice,
} from '@/lib/api';

const rupiah = (n: number) => `Rp${n.toLocaleString('id-ID')}`;
const STATUS_BILL: Record<string, string> = {
  OPEN: 'Belum bayar', PARTIAL: 'Angsuran', PAID: 'Lunas', EXPIRED: 'Kedaluwarsa', CANCELLED: 'Batal',
};

export default function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [s, setS] = useState<StudentDetail | null>(null);
  const [year, setYear] = useState<AcademicYear | null>(null);
  const [classes, setClasses] = useState<ClassView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Keuangan
  const [billsView, setBillsView] = useState<StudentBillsView | null>(null);
  const [accounts, setAccounts] = useState<CashAccountView[]>([]);
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
    me()
      .then((u) => {
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
    } catch {
      setError('Aksi gagal — periksa data yang diisi.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  const val = (f: FormData, k: string) => String(f.get(k) ?? '').trim() || undefined;

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

  return (
    <Shell>
      <Link href="/kesiswaan" className="text-sm font-semibold text-primary-700 hover:text-primary-800">
        ← Data siswa
      </Link>
      <div className="mt-2">
        <PageTitle
          title={s?.name ?? 'Detail Siswa'}
          subtitle={s ? [s.nis && `NIS ${s.nis}`, s.nisn && `NISN ${s.nisn}`].filter(Boolean).join(' · ') || undefined : undefined}
          actions={s ? <Badge tone={s.status === 'ACTIVE' ? 'primary' : 'neutral'}>{STUDENT_STATUS_LABELS[s.status]}</Badge> : undefined}
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
            <Widget title="Data Diri">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  run(
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
                  );
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
                <div className="sm:col-span-2">
                  <Button type="submit" disabled={busy}>Simpan Perubahan</Button>
                </div>
              </form>
            </Widget>

            <Widget title={`Rombel TA ${year?.name ?? ''}`}>
              {s.enrollments.length === 0 ? (
                <p className="mb-4 text-sm text-sand-500">Belum ditempatkan di rombel.</p>
              ) : (
                <ul className="mb-4 space-y-2">
                  {s.enrollments.map((en) => (
                    <li key={en.id} className="rounded-xl border border-sand-200 bg-sand-50 px-4 py-3 text-sm font-semibold text-sand-900">
                      {en.class.name} <span className="font-normal text-sand-500">· Kelas {en.class.gradeLevel} · {en.academicYear.name}</span>
                    </li>
                  ))}
                </ul>
              )}
              {s.enrollments.some((e) => e.academicYear.name === year?.name) ? null : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    run(
                      () => enrollStudent({ studentId: id, classId: String(f.get('classId')) }),
                      'Siswa ditempatkan di rombel.',
                    );
                  }}
                  className="flex flex-wrap items-end gap-3 rounded-2xl border border-sand-200 bg-sand-50 p-4"
                >
                  <Field label="Tempatkan di Rombel" className="min-w-52 flex-1">
                    <Select name="classId" required defaultValue="">
                      <option value="" disabled>Pilih rombel…</option>
                      {classes.map((c) => (
                        <option key={c.id} value={c.id}>{c.name} ({c._count?.enrollments ?? 0} siswa)</option>
                      ))}
                    </Select>
                  </Field>
                  <Button type="submit" disabled={busy} variant="outline">Tempatkan</Button>
                </form>
              )}
            </Widget>
            <Widget title={`Dokumen (${s.documents?.length ?? 0})`}>
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
                        {DOC_TYPE_LABELS[type as keyof typeof DOC_TYPE_LABELS] ?? type}
                      </p>
                      <ul className="space-y-1.5">
                        {docs.map((d) => (
                          <li
                            key={d.id}
                            className="flex items-center justify-between gap-3 rounded-xl border border-sand-200 bg-sand-50 px-4 py-2.5 text-sm"
                          >
                            <span className="min-w-0 truncate font-medium text-sand-800">{d.fileName}</span>
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
            <Widget title="Orang Tua / Wali">
              {!s.parent ? (
                <p className="text-sm text-sand-500">Belum ada akun orang tua terhubung.</p>
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
                        className="text-xs font-semibold text-primary-700 hover:underline"
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

            <Widget title={`Prestasi (${s.achievements.length})`}>
              <ul className="mb-4 space-y-2 text-sm">
                {s.achievements.map((a) => (
                  <li key={a.id} className="rounded-xl bg-primary-50 px-4 py-2.5">
                    <p className="font-semibold text-sand-900">{a.title}</p>
                    <p className="text-xs text-sand-500">{[a.level, a.year].filter(Boolean).join(' · ')}</p>
                  </li>
                ))}
                {s.achievements.length === 0 ? (
                  <li className="text-sand-500">Belum ada prestasi.</li>
                ) : null}
              </ul>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  const ok = await run(
                    () => addAchievement(id, { title: val(f, 'title'), level: val(f, 'level'), year: Number(val(f, 'year')) || undefined }),
                    'Prestasi ditambahkan.',
                  );
                  if (ok) e.currentTarget.reset();
                }}
                className="space-y-3"
              >
                <Input name="title" required placeholder="Judul prestasi" />
                <div className="flex gap-3">
                  <Input name="level" placeholder="Tingkat (kota, provinsi…)" className="flex-1" />
                  <Input name="year" type="number" placeholder="Tahun" className="w-24" />
                </div>
                <Button type="submit" size="sm" disabled={busy} variant="outline">+ Tambah Prestasi</Button>
              </form>
            </Widget>

            <Widget title={`Pelanggaran (${s.violations.length})`}>
              <ul className="mb-4 space-y-2 text-sm">
                {s.violations.map((v) => (
                  <li key={v.id} className="rounded-xl bg-red-50 px-4 py-2.5">
                    <p className="font-semibold text-sand-900">{v.type} <span className="text-red-700">· {v.points} poin</span></p>
                    <p className="text-xs text-sand-500">{v.date.slice(0, 10)}{v.description ? ` — ${v.description}` : ''}</p>
                  </li>
                ))}
                {s.violations.length === 0 ? (
                  <li className="text-sand-500">Tidak ada pelanggaran.</li>
                ) : null}
              </ul>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  const ok = await run(
                    () => addViolation(id, { type: val(f, 'type'), points: Number(val(f, 'points')) || 0, description: val(f, 'description'), date: new Date().toISOString() }),
                    'Pelanggaran dicatat.',
                  );
                  if (ok) e.currentTarget.reset();
                }}
                className="space-y-3"
              >
                <div className="flex gap-3">
                  <Input name="type" required placeholder="Jenis" className="flex-1" />
                  <Input name="points" type="number" min={0} placeholder="Poin" className="w-24" />
                </div>
                <Input name="description" placeholder="Keterangan (opsional)" />
                <Button type="submit" size="sm" disabled={busy} variant="outline">+ Catat Pelanggaran</Button>
              </form>
            </Widget>
          </div>
        </div>
      )}

      {/* ---- Keuangan: tagihan, angsuran, pengingat WA, tabungan ---- */}
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
                <Link href={`/keuangan/tabungan/${id}`} className="font-semibold text-primary-700 hover:underline">
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
                                  <button
                                    type="button"
                                    className="text-xs font-semibold text-primary-700 hover:underline"
                                    onClick={() => setPayModal(b)}
                                  >
                                    Bayar / Angsur
                                  </button>
                                  <button
                                    type="button"
                                    className="text-xs font-semibold text-emerald-700 hover:underline disabled:opacity-50"
                                    disabled={waBusy === b.id}
                                    onClick={() => sendWa(b)}
                                  >
                                    {waBusy === b.id ? 'Mengantre…' : 'Ingatkan WA'}
                                  </button>
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
        </div>
      ) : null}

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
