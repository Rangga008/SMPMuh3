'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Field, Input, Modal, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { PageTitle, Widget } from '@/components/widgets';
import { DataTable } from '@/components/data-table';
import { useConfirm } from '@/components/confirm-dialog';
import { FilePick } from '@/components/file-pick';
import { createSubmission, deleteSubmission, listSubmissions, reviewSubmission, type ProgramSubmissionView } from '@/lib/api-ops';
import { useFileViewer } from '@/components/file-viewer';
import { me } from '@/lib/api';
import { PERMISSIONS } from '@smpmuh3/types';

const KINDS = ['RKS', 'PROKER', 'RENCANA', 'REALISASI'];
const DEPTS = ['KURIKULUM', 'KESISWAAN', 'TATA_USAHA', 'KEUANGAN', 'LAINNYA'];
const rp = (n: number) => `Rp${n.toLocaleString('id-ID')}`;
const TONE = { PENDING: 'accent', APPROVED: 'primary', REJECTED: 'danger' } as const;

export default function PengajuanPage() {
  const { confirm, dialog } = useConfirm();
  const fv = useFileViewer();
  const [rows, setRows] = useState<ProgramSubmissionView[]>([]);
  const [fDept, setFDept] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [modal, setModal] = useState(false);
  const [rab, setRab] = useState<{ name: string; qty: number; unit: string; price: number }[]>([{ name: '', qty: 1, unit: 'paket', price: 0 }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Review lewat modal proper (bukan prompt/confirm native) — aksi + catatan.
  const [review, setReview] = useState<{ sub: ProgramSubmissionView; action: 'APPROVED' | 'REJECTED' } | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [myId, setMyId] = useState('');
  const [canManage, setCanManage] = useState(false);

  useEffect(() => {
    me().then((u) => {
      setMyId(u.id);
      setCanManage(u.permissions.includes(PERMISSIONS.ACADEMIC_MANAGE));
    }).catch(() => undefined);
  }, []);

  const load = useCallback(() => {
    listSubmissions({ department: fDept || undefined, status: fStatus || undefined }).then(setRows).catch(() => {});
  }, [fDept, fStatus]);
  useEffect(load, [load]);

  const total = rab.reduce((s, r) => s + r.qty * r.price, 0);

  return (
    <Shell>
      <PageTitle title="Pengajuan Program & RKS" subtitle="RKS, program kerja, rencana & realisasi kegiatan per bidang — menunggu persetujuan Kepala Sekolah."
        actions={<Button size="sm" onClick={() => setModal(true)}>+ Pengajuan Baru</Button>} />
      {dialog}
      {fv.viewer}
      {error ? <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {notice ? <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p> : null}

      <div className="mb-4 flex flex-wrap gap-2">
        <Select value={fDept} onChange={(e) => setFDept(e.target.value)} className="min-w-40" aria-label="Filter bidang" searchable>
          <option value="">Semua bidang</option>{DEPTS.map((d) => <option key={d} value={d}>{d}</option>)}
        </Select>
        <Select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className="min-w-36" aria-label="Filter status">
          <option value="">Semua status</option><option value="PENDING">Menunggu</option><option value="APPROVED">Disetujui</option><option value="REJECTED">Ditolak</option>
        </Select>
      </div>

      <Widget title={`Daftar Pengajuan (${rows.length})`}>
        <DataTable head={['Bidang', 'Jenis', 'Judul', 'RAB', 'Status', '']} empty={!rows.length ? 'Belum ada pengajuan.' : undefined}>
          {rows.map((s) => (
            <tr key={s.id}>
              <td className="px-5 py-2.5 text-sand-600">{s.department}</td>
              <td className="px-5 py-2.5"><Badge tone="neutral">{s.kind}</Badge></td>
              <td className="px-5 py-2.5 font-medium text-sand-900">
                {s.title}
                {s.fileName ? <button type="button" onClick={() => fv.open({ path: `/ops/submissions/${s.id}/file`, name: s.fileName!, mime: s.mimeType })} className="ml-2 text-xs font-bold text-primary-700 hover:underline">{s.fileName}</button> : null}
                {s.reviewNote ? <p className="text-xs text-sand-500">Catatan KS: {s.reviewNote}</p> : null}
              </td>
              <td className="px-5 py-2.5 text-right font-semibold">{s.amountTotal ? rp(s.amountTotal) : '—'}</td>
              <td className="px-5 py-2.5"><Badge tone={TONE[s.status]}>{s.status === 'PENDING' ? 'Menunggu' : s.status === 'APPROVED' ? 'Disetujui' : 'Ditolak'}</Badge></td>
              <td className="px-5 py-2.5 text-right">
                <span className="flex justify-end gap-2">
                  {s.status === 'PENDING' && canManage ? (
                    <>
                      <button
                        type="button"
                        className="text-xs font-bold text-emerald-700 hover:underline"
                        onClick={() => { setReviewNote(''); setReview({ sub: s, action: 'APPROVED' }); }}
                      >Setujui</button>
                      <button
                        type="button"
                        className="text-xs font-bold text-red-600 hover:underline"
                        onClick={() => { setReviewNote(''); setReview({ sub: s, action: 'REJECTED' }); }}
                      >Tolak</button>
                    </>
                  ) : null}
                  {(canManage || (s.status === 'PENDING' && s.submittedBy === myId)) ? (
                    <button
                      type="button"
                      className="text-xs font-bold text-sand-500 hover:text-red-600 hover:underline"
                      onClick={async () => {
                        if (!(await confirm({
                          title: `Hapus pengajuan "${s.title}"?`,
                          body: 'Lampiran yang terunggah ikut terhapus permanen.',
                          confirmLabel: 'Ya, hapus',
                        }))) return;
                        try {
                          await deleteSubmission(s.id);
                          setNotice('Pengajuan dihapus.');
                          load();
                        } catch (err) { setError(err instanceof Error ? err.message : 'Gagal menghapus.'); }
                      }}
                    >Hapus</button>
                  ) : null}
                </span>
              </td>
            </tr>
          ))}
        </DataTable>
      </Widget>

      {/* Modal review — pengganti prompt()+confirm() native: catatan
          persetujuan/penolakan diisi di sini, warna tombol mengikuti aksi. */}
      <Modal
        open={review !== null}
        onClose={() => setReview(null)}
        title={review ? `${review.action === 'APPROVED' ? 'Setujui' : 'Tolak'} — "${review.sub.title}"` : ''}
        size="md"
      >
        {review ? (
          <form
            className="grid gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true); setError(null);
              try {
                await reviewSubmission(review.sub.id, review.action, reviewNote.trim() || undefined);
                setNotice(review.action === 'APPROVED' ? 'Pengajuan disetujui.' : 'Pengajuan ditolak.');
                setReview(null);
                load();
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Gagal menyimpan review.');
              } finally { setBusy(false); }
            }}
          >
            <div className="rounded-xl bg-sand-50 px-3 py-2 text-xs text-sand-600">
              {review.sub.kind} · {review.sub.department}
              {review.sub.amountTotal ? ` · RAB ${rp(review.sub.amountTotal)}` : ''}
            </div>
            <Field label={review.action === 'APPROVED' ? 'Catatan persetujuan (opsional)' : 'Alasan penolakan'}>
              <textarea
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                rows={3}
                autoFocus
                required={review.action === 'REJECTED'}
                placeholder={review.action === 'APPROVED' ? 'mis. Disetujui sesuai RAB…' : 'mis. Anggaran belum tersedia semester ini…'}
                className="w-full rounded-xl border border-sand-300 bg-white px-3 py-2 text-sm text-sand-800"
              />
            </Field>
            {review.action === 'REJECTED' ? (
              <p className="-mt-2 text-[11px] text-sand-400">Alasan wajib diisi — ditampilkan ke pengaju sebagai catatan KS.</p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setReview(null)}>Batal</Button>
              <Button
                type="submit"
                variant={review.action === 'REJECTED' ? 'danger' : 'primary'}
                disabled={busy || (review.action === 'REJECTED' && !reviewNote.trim())}
              >
                {busy ? 'Menyimpan…' : review.action === 'APPROVED' ? 'Ya, setujui' : 'Ya, tolak'}
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>

      <Modal open={modal} onClose={() => setModal(false)} title="Pengajuan Baru">
        <form className="grid gap-4" onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const file = fd.get('file') as File;
          setBusy(true); setError(null);
          try {
            await createSubmission({
              department: String(fd.get('department')), kind: String(fd.get('kind')),
              title: String(fd.get('title')), description: String(fd.get('description') || '') || undefined,
              rab: rab.filter((r) => r.name).map((r) => ({ ...r, amount: r.qty * r.price })),
              amountTotal: total,
            }, file?.size ? file : undefined);
            setNotice('Pengajuan terkirim — menunggu persetujuan KS.');
            setModal(false); load();
          } catch (err) { setError(err instanceof Error ? err.message : 'Gagal mengirim.'); } finally { setBusy(false); }
        }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Bidang">
              <Select name="department" searchable>{DEPTS.map((d) => <option key={d} value={d}>{d}</option>)}</Select>
            </Field>
            <Field label="Jenis">
              <Select name="kind" searchable>{KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</Select>
            </Field>
          </div>
          <Field label="Judul"><Input name="title" required placeholder="RKS Semester Ganjil 2026" /></Field>
          <Field label="Deskripsi"><Input name="description" placeholder="Ringkasan program…" /></Field>
          <Field label="RAB (rencana anggaran)">
            <div className="space-y-2">
              {rab.map((r, i) => (
                <div key={i} className="grid grid-cols-[1fr_60px_80px_110px_32px] items-center gap-2">
                  <Input value={r.name} onChange={(e) => setRab((rs) => rs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Item" aria-label={`RAB item ${i + 1}`} />
                  <Input type="number" min={1} value={r.qty} onChange={(e) => setRab((rs) => rs.map((x, j) => (j === i ? { ...x, qty: Number(e.target.value) } : x)))} aria-label="Qty" />
                  <Input value={r.unit} onChange={(e) => setRab((rs) => rs.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)))} aria-label="Satuan" />
                  <Input type="number" min={0} value={r.price} onChange={(e) => setRab((rs) => rs.map((x, j) => (j === i ? { ...x, price: Number(e.target.value) } : x)))} aria-label="Harga" />
                  <button type="button" className="text-red-500" onClick={() => setRab((rs) => rs.filter((_, j) => j !== i))}>×</button>
                </div>
              ))}
              <div className="flex items-center justify-between">
                <Button type="button" variant="ghost" size="sm" onClick={() => setRab((rs) => [...rs, { name: '', qty: 1, unit: 'paket', price: 0 }])}>+ item</Button>
                <span className="text-sm font-bold">Total: {rp(total)}</span>
              </div>
            </div>
          </Field>
          <Field label="Lampiran (opsional)"><FilePick name="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xlsx,.xls" /></Field>
          <div className="flex justify-end gap-2"><Button type="submit" disabled={busy}>Kirim ke KS</Button></div>
        </form>
      </Modal>
    </Shell>
  );
}
