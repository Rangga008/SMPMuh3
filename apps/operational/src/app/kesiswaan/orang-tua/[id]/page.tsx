'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge, Button, Modal } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { DataTable } from '@/components/data-table';
import { PageTitle, Widget } from '@/components/widgets';
import { RowBtn, rowActionClasses } from '@/components/row-btn';
import {
  getStudentParent,
  remindStudentParent,
  sendTitipanCode,
  type ParentDetail,
} from '@/lib/api';

const rupiah = (n: number) => `Rp${n.toLocaleString('id-ID')}`;
const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const TITIPAN_LABEL: Record<string, string> = {
  PENDING: 'Menunggu verifikasi',
  WAITING: 'Dalam antrean',
  CODE_SENT: 'Kode terkirim',
  REGISTERED: 'Kode terpakai',
  CANCELLED: 'Dibatalkan',
};
const TITIPAN_TONE: Record<string, 'primary' | 'accent' | 'neutral' | 'danger'> = {
  PENDING: 'accent',
  WAITING: 'primary',
  CODE_SENT: 'primary',
  REGISTERED: 'neutral',
  CANCELLED: 'danger',
};

/** Detail orang tua — data diri, anak, tagihan, kode titipan, reminder WA. */
export default function OrangTuaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [d, setD] = useState<ParentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reminder, setReminder] = useState<{ message: string; waUrl: string; queued: boolean } | null>(null);

  const load = useCallback(() => {
    getStudentParent(id).then(setD).catch((e) => setError(e instanceof Error ? e.message : 'Gagal memuat detail.'));
  }, [id]);
  useEffect(load, [load]);

  async function remind() {
    setBusy(true);
    setError(null);
    try {
      const r = await remindStudentParent(id);
      setReminder(r);
      setNotice(r.queued ? 'Pengingat masuk antrean WhatsApp.' : 'Pengingat disiapkan.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal mengirim pengingat.');
    } finally {
      setBusy(false);
    }
  }

  async function sendCode(titipanId: string) {
    setBusy(true);
    setError(null);
    try {
      const r = await sendTitipanCode(titipanId);
      setNotice(r.queued ? 'Kode formulir masuk antrean WhatsApp.' : 'Kode disiapkan — buka tautan WA untuk mengirim.');
      if (r.waUrl) window.open(r.waUrl, '_blank');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal mengirim kode.');
    } finally {
      setBusy(false);
    }
  }

  const p = d?.parent;
  const openTotal = d?.invoices.reduce((s, i) => s + i.remaining, 0) ?? 0;
  const waUrl = p?.phone
    ? `https://wa.me/${p.phone.replace(/^0/, '62')}?text=${encodeURIComponent(`Assalamu'alaikum Bpk/Ibu ${p.name}.`)}`
    : null;

  return (
    <Shell>
      <Link href="/kesiswaan/orang-tua" className="text-sm font-semibold text-primary-700 hover:text-primary-800">
        ← Orang tua / wali
      </Link>
      <div className="mt-2">
        <PageTitle
          title={p?.name ?? 'Detail Orang Tua'}
          subtitle="Data diri, anak-anak yang terdaftar, tagihan, dan kode formulir titipan"
          actions={
            <>
              {waUrl ? (
                <a href={waUrl} target="_blank" rel="noreferrer" className={rowActionClasses('success')}>
                  Chat WA →
                </a>
              ) : null}
              <Button size="sm" variant="outline" disabled={busy || openTotal === 0} onClick={() => void remind()}>
                Ingatkan Tagihan via WA
              </Button>
            </>
          }
        />
      </div>
      {error ? (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
      ) : null}
      {notice ? (
        <p role="status" className="mb-4 rounded-xl bg-primary-50 px-4 py-3 text-sm font-medium text-primary-800">{notice}</p>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Widget title={`Tagihan Terbuka${openTotal > 0 ? ` — sisa ${rupiah(openTotal)}` : ''}`}>
            <DataTable
              head={['Anak', 'Tagihan', 'Jatuh Tempo', 'Total', 'Sisa', 'Status']}
              loading={!d}
              empty={d?.invoices.length === 0 ? 'Tidak ada tagihan terbuka — semua lunas.' : undefined}
            >
              {d?.invoices.map((inv) => (
                <tr key={inv.id}>
                  <td className="px-5 py-3 font-medium text-sand-900">{inv.student.name}</td>
                  <td className="px-5 py-3">
                    <p className="text-sand-800">{inv.title}</p>
                    <p className="text-[10px] text-sand-400">{inv.number}</p>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-sand-600">{fmtDate(inv.dueAt)}</td>
                  <td className="whitespace-nowrap px-5 py-3 text-right font-semibold">{rupiah(inv.amount)}</td>
                  <td className="whitespace-nowrap px-5 py-3 text-right font-semibold text-red-600">
                    {rupiah(inv.remaining)}
                  </td>
                  <td className="px-5 py-3">
                    <Badge tone={inv.status === 'PARTIAL' ? 'accent' : 'primary'}>
                      {inv.status === 'PARTIAL' ? 'Sebagian' : 'Belum dibayar'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </DataTable>
          </Widget>

          <Widget title="Kode Formulir Titipan (sekali pakai)">
            {d?.titipan.length ? (
              <ul className="divide-y divide-sand-100">
                {d.titipan.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                    <div>
                      <p className="font-medium text-sand-900">
                        {t.formCode ?? '—'} · {t.candidateName}
                      </p>
                      <p className="text-xs text-sand-500">
                        {t.academicYear.name}
                        {t.codeSentAt ? ` · dikirim ${fmtDate(t.codeSentAt)}` : ''}
                        {t.codeUsedAt ? ` · dipakai ${fmtDate(t.codeUsedAt)}` : ''}
                      </p>
                    </div>
                    <span className="flex items-center gap-2">
                      <Badge tone={TITIPAN_TONE[t.status] ?? 'neutral'}>
                        {TITIPAN_LABEL[t.status] ?? t.status}
                      </Badge>
                      {t.status === 'WAITING' || t.status === 'CODE_SENT' || t.status === 'PENDING' ? (
                        <RowBtn tone="success" type="button" disabled={busy} onClick={() => void sendCode(t.id)}>
                          {t.status === 'CODE_SENT' ? 'Kirim Ulang' : 'Kirim Kode'}
                        </RowBtn>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-4 text-sm text-sand-400">
                Tidak ada titipan/kode formulir untuk orang tua ini.
              </p>
            )}
            <p className="border-t border-sand-100 px-5 py-3 text-xs text-sand-400">
              Kode formulir bersifat sekali pakai — setelah ditukar menjadi
              pendaftaran, kode tidak bisa dipakai atau dicek ulang.
            </p>
          </Widget>
        </div>

        <div className="space-y-5">
          <Widget title="Data Orang Tua">
            <dl className="space-y-3 px-5 py-4 text-sm">
              <div><dt className="text-xs text-sand-500">Nama</dt><dd className="font-semibold text-sand-900">{p?.name ?? '—'}</dd></div>
              <div><dt className="text-xs text-sand-500">Nomor HP / WhatsApp</dt><dd className="font-semibold text-sand-900">{p?.phone ?? '—'}</dd></div>
              <div><dt className="text-xs text-sand-500">Email</dt><dd className="font-semibold text-sand-900">{p?.email ?? '—'}</dd></div>
              <div><dt className="text-xs text-sand-500">Terdaftar sejak</dt><dd className="font-semibold text-sand-900">{fmtDate(p?.createdAt)}</dd></div>
            </dl>
          </Widget>

          <Widget title={`Anak (${d?.students.length ?? 0})`}>
            {d?.students.length ? (
              <ul className="divide-y divide-sand-100">
                {d.students.map((s) => {
                  const reg = s.candidate?.registrations?.[0];
                  return (
                    <li key={s.id} className="px-5 py-3">
                      <Link href={`/kesiswaan/${s.id}`} className="font-medium text-sand-900 hover:text-primary-700 hover:underline">
                        {s.name} →
                      </Link>
                      <p className="text-xs text-sand-500">
                        {s.nis ? `NIS ${s.nis}` : 'Tanpa NIS'}
                        {s.nisn ? ` · NISN ${s.nisn}` : ''}
                        {s.enrollments[0] ? ` · ${s.enrollments[0].class.name}` : ' · belum ada rombel'}
                      </p>
                      {reg ? (
                        <p className="mt-0.5 text-[10px] text-primary-700">Alumni {reg.number}</p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-5 py-4 text-sm text-sand-400">Belum ada anak terdaftar.</p>
            )}
          </Widget>
        </div>
      </div>

      <Modal open={reminder !== null} onClose={() => setReminder(null)} title="Pengingat Terkirim ke Antrean">
        {reminder ? (
          <div className="space-y-4 text-sm">
            <p className="whitespace-pre-line rounded-2xl bg-sand-50 p-4 text-sand-800">{reminder.message}</p>
            {reminder.waUrl ? (
              <a href={reminder.waUrl} target="_blank" rel="noreferrer" className={rowActionClasses('success')}>
                Kirim manual via wa.me →
              </a>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </Shell>
  );
}
