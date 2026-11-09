'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Input, Modal, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { DataTable } from '@/components/data-table';
import { RowBtn } from '@/components/row-btn';
import { PageTitle, Widget } from '@/components/widgets';
import { getSchool, listReceipts, type ReceiptRow, type School } from '@/lib/api';

const rp = (n: number) => `Rp${n.toLocaleString('id-ID')}`;
const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
const REF_LABEL: Record<string, string> = {
  payment: 'Pembayaran Siswa',
  expense: 'Pengeluaran',
  transaction: 'Transaksi Kas',
};

/** Galeri kwitansi — semua kwitansi yang diterbitkan bidang keuangan. */
export default function KwitansiPage() {
  const [rows, setRows] = useState<ReceiptRow[]>([]);
  const [refType, setRefType] = useState('');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<ReceiptRow | null>(null);
  const [school, setSchool] = useState<School | null>(null);

  const load = useCallback(() => {
    listReceipts({ ...(refType ? { refType } : {}), ...(search ? { search } : {}) })
      .then(setRows).catch(() => {});
  }, [refType, search]);
  useEffect(load, [load]);
  useEffect(() => {
    getSchool().then(setSchool).catch(() => {});
  }, []);

  const print = (r: ReceiptRow) => {
    const w = window.open('', '_blank', 'width=720,height=520');
    if (!w) return;
    const s = school;
    const kop = `
      <div class="kop">
        ${s?.logoUrl ? `<img src="${s.logoUrl}" alt="Logo" class="logo" onerror="this.style.display='none'" />` : ''}
        <div class="kop-text">
          <p class="kop-name">${s?.name ?? 'SMP Muhammadiyah 3 Kota Bandung'}</p>
          ${s?.tagline ? `<p class="kop-tag">${s.tagline}</p>` : ''}
          <p class="kop-sub">${[s?.address, s?.phone ? `Telp. ${s.phone}` : null].filter(Boolean).join(' · ')}</p>
        </div>
      </div>`;
    w.document.write(`<!doctype html><html><head><title>${r.number}</title><style>
      body{font-family:Georgia,serif;margin:32px;color:#1e293b}
      .kop{display:flex;align-items:center;gap:14px;border-bottom:4px double #0f3a63;padding-bottom:12px}
      .logo{height:64px;width:auto}
      .kop-name{font-size:19px;font-weight:bold;color:#0f3a63;margin:0;text-transform:uppercase;letter-spacing:.5px}
      .kop-tag{font-size:12px;color:#475569;margin:2px 0 0}
      .kop-sub{font-size:11.5px;color:#475569;margin:3px 0 0}
      .title{display:flex;justify-content:space-between;align-items:baseline;margin:22px 0 8px;border-bottom:1px solid #cbd5e1;padding-bottom:8px}
      h1{font-size:21px;margin:0;letter-spacing:2px}.num{font-family:monospace;font-size:13px}
      table{width:100%;border-collapse:collapse;margin:12px 0}td{padding:8px 4px;vertical-align:top}
      .amt{font-size:26px;font-weight:bold;border:2px solid #334155;display:inline-block;padding:8px 18px;margin:12px 0}
      .sign{margin-top:44px;float:right;text-align:center}.sign .nm{margin-top:70px;border-bottom:1px solid #334155;min-width:180px}
      .unit{clear:both;font-size:11px;color:#64748b;margin-top:80px}
      @media print{button{display:none}}
    </style></head><body>
      ${kop}
      <div class="title"><h1>KWITANSI</h1><div class="num">No. ${r.number}</div></div>
      <table>
        <tr><td style="width:140px">Sudah diterima dari</td><td>: <b>${r.recipient}</b></td></tr>
        <tr><td>Untuk</td><td>: ${r.body}</td></tr>
        <tr><td>Jenis</td><td>: ${REF_LABEL[r.refType ?? 'payment'] ?? r.refType ?? 'Pembayaran'}</td></tr>
        <tr><td>Tanggal terbit</td><td>: ${fmtDate(r.createdAt)}</td></tr>
      </table>
      <div class="amt">${r.payment?.amount != null ? rp(r.payment.amount) : '—'}</div>
      <div class="sign">Bendahara,<div class="nm"></div></div>
      <p class="unit">Dicetak oleh Bidang Keuangan ${s?.name ? `— ${s.name}` : ''}</p>
      <script>window.print()</script>
    </body></html>`);
    w.document.close();
  };

  return (
    <Shell>
      <PageTitle title="Galeri Kwitansi" subtitle="Semua kwitansi yang pernah diterbitkan bidang keuangan — bisa dicetak ulang kapan saja" />
      <Widget title="Kwitansi Terbit">
        <div className="mb-3 grid gap-2 sm:grid-cols-3">
          <Input placeholder="Cari nomor / penerima…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select value={refType} onChange={(e) => setRefType(e.target.value)}>
            <option value="">Semua jenis</option>
            <option value="payment">Pembayaran Siswa</option>
            <option value="expense">Pengeluaran</option>
            <option value="transaction">Transaksi Kas</option>
          </Select>
          <div className="text-sm text-slate-500 self-center">{rows.length} kwitansi</div>
        </div>
        <DataTable head={['Nomor', 'Tanggal', 'Penerima', 'Jenis', 'Isi', '']}>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="px-5 py-2.5 font-mono text-sm font-semibold">{r.number}</td>
              <td className="px-5 py-2.5">{fmtDate(r.createdAt)}</td>
              <td className="px-5 py-2.5">{r.recipient}</td>
              <td className="px-5 py-2.5">
                <Badge tone={r.refType === 'expense' ? 'danger' : r.refType === 'transaction' ? 'accent' : 'primary'}>
                  {REF_LABEL[r.refType ?? 'payment'] ?? r.refType ?? '—'}
                </Badge>
              </td>
              <td className="px-5 py-2.5 text-xs text-slate-500 line-clamp-2 max-w-xs">{r.body}</td>
              <td className="px-5 py-2.5 text-right">
                <span className="flex gap-2 justify-end">
                  <RowBtn onClick={() => setView(r)}>Lihat</RowBtn>
                  <RowBtn onClick={() => print(r)}>Cetak</RowBtn>
                </span>
              </td>
            </tr>
          ))}
        </DataTable>
        {rows.length === 0 && <p className="py-6 text-center text-sm text-slate-500">Belum ada kwitansi — terbitkan dari halaman Pengeluaran, Transaksi Harian, atau Tagihan.</p>}
      </Widget>

      <Modal open={view !== null} onClose={() => setView(null)} title={view?.number ?? ''}>
        {view && (
          <div className="text-sm">
            <div className="mb-4 rounded-xl border border-sand-200 bg-sand-50 p-4 font-serif">
              <p className="text-lg font-bold">KWITANSI — {view.number}</p>
              <p className="mt-2"><b>Diterima dari:</b> {view.recipient}</p>
              <p className="mt-1"><b>Untuk:</b> {view.body}</p>
              {view.payment?.amount != null && <p className="mt-2 text-xl font-bold">{rp(view.payment.amount)}</p>}
              <p className="mt-1 text-xs text-slate-500">Diterbitkan {fmtDate(view.createdAt)}</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setView(null)}>Tutup</Button>
              <Button onClick={() => print(view)}>Cetak</Button>
            </div>
          </div>
        )}
      </Modal>
    </Shell>
  );
}
