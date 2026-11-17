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

  /** Satu sumber HTML kwitansi — dipakai pratinjau modal & jendela cetak. */
  const receiptCss = `
      .kw{font-family:Georgia,serif;color:#1e293b}
      .kw .kop{display:flex;align-items:center;gap:14px;border-bottom:4px double #0f3a63;padding-bottom:12px}
      .kw .logo{height:64px;width:auto}
      .kw .kop-yayasan{font-size:11.5px;font-weight:bold;color:#0f3a63;margin:0;text-transform:uppercase;letter-spacing:.5px}
      .kw .kop-name{font-size:19px;font-weight:bold;color:#0f3a63;margin:2px 0 0;text-transform:uppercase;letter-spacing:.5px}
      .kw .kop-tag{font-size:12px;color:#475569;margin:2px 0 0}
      .kw .kop-sub{font-size:11.5px;color:#475569;margin:3px 0 0}
      .kw .title{display:flex;justify-content:space-between;align-items:baseline;margin:22px 0 8px;border-bottom:1px solid #cbd5e1;padding-bottom:8px}
      .kw h1{font-size:21px;margin:0;letter-spacing:2px}.kw .num{font-family:monospace;font-size:13px}
      .kw table{width:100%;border-collapse:collapse;margin:12px 0}.kw td{padding:8px 4px;vertical-align:top}
      .kw .amt{font-size:26px;font-weight:bold;border:2px solid #334155;display:inline-block;padding:8px 18px;margin:12px 0}
      .kw .signs{margin-top:44px;display:flex;justify-content:space-between}.kw .sign{text-align:center}.kw .sign .nm{margin-top:70px;border-bottom:1px solid #334155;min-width:180px}.kw .sign .nmv{font-weight:700}.kw .sign .nip{font-size:11.5px;color:#475569;margin-top:2px}
      .kw .unit{clear:both;font-size:11px;color:#64748b;margin-top:80px}
      @media print{button{display:none}}`;

  const receiptHtml = (r: ReceiptRow) => {
    const s = school;
    // Kop gambar bila diunggah; bila file gagal termuat → otomatis jatuh ke kop teks.
    const kop = `
      ${s?.kopUrl ? `<img src="/kop.png" alt="Kop surat" style="width:100%;display:block;margin-bottom:4px" onerror="this.style.display='none';var t=document.getElementById('koptext');if(t)t.style.display='flex'" />` : ''}
      <div class="kop" id="koptext"${s?.kopUrl ? ' style="display:none"' : ''}>
        ${s?.logoUrl ? `<img src="/logo.png" alt="Logo" class="logo" onerror="this.style.display='none'" />` : ''}
        <div class="kop-text">
          ${s?.kopLine1 ? `<p class="kop-yayasan">${s.kopLine1}</p>` : ''}
          ${s?.kopLine2 ? `<p class="kop-yayasan" style="font-weight:normal">${s.kopLine2}</p>` : ''}
          <p class="kop-name">${s?.name ?? 'SMP Muhammadiyah 3 Kota Bandung'}</p>
          ${s?.tagline ? `<p class="kop-tag">${s.tagline}</p>` : ''}
          ${s?.npsn ? `<p class="kop-tag">NPSN: ${s.npsn}</p>` : ''}
          <p class="kop-sub">${[s?.address, s?.phone ? `Telp. ${s.phone}` : null].filter(Boolean).join(' · ')}</p>
        </div>
      </div>`;
    return `<div class="kw">
      ${kop}
      <div class="title"><h1>KWITANSI</h1><div class="num">No. ${r.number}</div></div>
      <table>
        <tr><td style="width:140px">Sudah diterima dari</td><td>: <b>${r.recipient}</b></td></tr>
        <tr><td>Untuk</td><td>: ${r.body}</td></tr>
        <tr><td>Jenis</td><td>: ${REF_LABEL[r.refType ?? 'payment'] ?? r.refType ?? 'Pembayaran'}</td></tr>
        <tr><td>Tanggal terbit</td><td>: ${fmtDate(r.createdAt)}</td></tr>
      </table>
      <div class="amt">${r.payment?.amount != null ? rp(r.payment.amount) : '—'}</div>
      <div class="signs">
        <div class="sign">Penerima,<div class="nm">&nbsp;</div><div class="nip">&nbsp;</div></div>
        <div class="sign">Bendahara,<div class="nm">${s?.treasurer ? `<span class="nmv">${s.treasurer}</span>` : '&nbsp;'}</div>${s?.treasurerNip ? `<div class="nip">NIP/NUPTK. ${s.treasurerNip}</div>` : '<div class="nip">&nbsp;</div>'}</div>
      </div>
      <p class="unit">Dicetak oleh Bidang Keuangan ${s?.name ? `— ${s.name}` : ''}</p>
    </div>`;
  };

  const print = (r: ReceiptRow) => {
    const w = window.open('', '_blank', 'width=720,height=560');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>${r.number}</title><style>body{margin:32px}${receiptCss}</style></head><body>
      ${receiptHtml(r)}
      <script>window.onload=function(){window.print()}</script>
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

      <Modal open={view !== null} onClose={() => setView(null)} title={`Pratinjau — ${view?.number ?? ''}`} size="xl">
        {view && (
          <div>
            <div className="mb-4 max-h-[65vh] overflow-y-auto rounded-xl border border-sand-200 bg-white p-6">
              <style>{receiptCss}</style>
              {/* Pratinjau persis hasil cetak — HTML yang sama dipakai jendela print. */}
              <div dangerouslySetInnerHTML={{ __html: receiptHtml(view) }} />
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
