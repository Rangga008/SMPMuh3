'use client';

import type { PayrollItemView, PayrollRunView, School } from '@/lib/api';
import type { CSSProperties } from 'react';

export const rupiah = (n?: number | null) => `Rp${(n ?? 0).toLocaleString('id-ID')}`;
/** Format jam pelajaran — buang .0 (203 bukan 203,0). */
export const jp = (n?: number | null) =>
  `${(+(n ?? 0).toFixed(1)).toLocaleString('id-ID')} JP`;
export const monthLabel = (m?: string | null) =>
  m ? new Date(`${m}-15T00:00:00`).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }) : '—';
/** Rentang absen run — "21 Okt – 19 Nov 2026", fallback bulan kalender. */
export const periodLabel = (run: { month: string; periodStart?: string | null; periodEnd?: string | null }) => {
  if (!run.periodStart || !run.periodEnd) return monthLabel(run.month);
  const fmt = (s: string, withYear: boolean) =>
    new Date(`${s.slice(0, 10)}T12:00:00`).toLocaleDateString('id-ID',
      withYear ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' });
  return `${fmt(run.periodStart, false)} – ${fmt(run.periodEnd, true)}`;
};

export const RUN_TONE: Record<string, 'primary' | 'accent' | 'neutral' | 'danger'> = {
  DRAFT: 'neutral',
  FINALIZED: 'accent',
  PAID: 'primary',
  VOID: 'danger',
};
export const RUN_LABEL: Record<string, string> = {
  DRAFT: 'Draft',
  FINALIZED: 'Final',
  PAID: 'Dibayar',
  VOID: 'Batal',
};

/**
 * Kop surat resmi — seluruhnya inline style supaya tetap utuh saat
 * innerHTML disalin ke jendela print (printEl tidak membawa Tailwind).
 */
export function KopSurat({ school }: { school?: School | null | undefined }) {
  // Kop gambar utuh (diunggah di Pengaturan Gaji) menggantikan kop teks.
  if (school?.kopUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src="/kop.png" alt="Kop surat" style={{ width: '100%', display: 'block', marginBottom: 4 }} />
    );
  }
  const blue = '#1e4e79';
  const cell: CSSProperties = { padding: '1px 0', verticalAlign: 'top' };
  const idLine = (label: string, val?: string | null) =>
    val ? (
      <div style={{ fontSize: 11, fontWeight: 600, color: '#1c1917', whiteSpace: 'nowrap' }}>
        {label}
        <span style={{ display: 'inline-block', width: 10 }} />:{' '}
        <span style={{ fontWeight: 700 }}>{val}</span>
      </div>
    ) : null;
  return (
    <div style={{ borderBottom: `4px double ${blue}`, paddingBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        {school?.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/logo.png" alt="Logo" style={{ height: 72, width: 72, objectFit: 'contain', flexShrink: 0 }} />
        ) : null}
        <div style={{ flex: 1, minWidth: 0, color: blue }}>
          {school?.kopLine1 ? <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.3 }}>{school.kopLine1}</p> : null}
          {school?.kopLine2 ? <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.3 }}>{school.kopLine2}</p> : null}
          <p style={{ fontSize: 24, fontWeight: 800, letterSpacing: 0.5, marginTop: 1 }}>
            {(school?.name ?? 'Sekolah').toUpperCase()}
          </p>
          {school?.accreditation ? (
            <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5 }}>
              TERAKREDITASI &ldquo;{school.accreditation}&rdquo;
            </p>
          ) : null}
          {school?.address ? <p style={{ fontSize: 11, fontWeight: 700, fontStyle: 'italic', marginTop: 2 }}>Alamat : {school.address}</p> : null}
          {school?.email ? (
            <p style={{ fontSize: 11, fontWeight: 700, fontStyle: 'italic', textDecoration: 'underline' }}>Email : {school.email}</p>
          ) : null}
        </div>
        {school?.npsn || school?.nss || school?.nds ? (
          <div style={{ flexShrink: 0, paddingTop: 4 }}>
            {idLine('NPSN', school?.npsn)}
            {idLine('NSS', school?.nss)}
            {idLine('NDS', school?.nds)}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Slip gaji — format rincian honorarium (contoh SD): kop, info pegawai,
 *  A. PENERIMAAN / B. POTONGAN bernomor dengan subtotal, tanda tangan
 *  Kepala Sekolah & Bendahara bertanggal. Inline style penuh agar hasil
 *  print identik dengan tampilan layar. */
export function SlipView({
  run,
  item,
  school,
  principal,
  treasurer,
}: {
  run: PayrollRunView;
  item: PayrollItemView;
  school?: School | null;
  principal: string;
  treasurer: string;
}) {
  const inc = (item.lines ?? []).filter((l) => l.amount > 0);
  const dec = (item.lines ?? []).filter((l) => l.amount < 0);
  const jabatan =
    item.employee?.additionalDuty ??
    item.employee?.staffKind ??
    (item.employee?.type === 'TEACHER' ? 'Guru' : item.employee?.type === 'TENDIK' ? 'Tenaga Kependidikan' : null);
  const printDate = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

  const td: CSSProperties = { padding: '2px 0', verticalAlign: 'top', fontSize: 12 };
  const tdR: CSSProperties = { ...td, textAlign: 'right', whiteSpace: 'nowrap' };
  const muted: CSSProperties = { color: '#78716c' };
  const secTitle: CSSProperties = { fontWeight: 700, fontSize: 12, marginTop: 14, marginBottom: 2 };
  const secBody: CSSProperties = { borderTop: '1px solid #d6d3d1', borderBottom: '1px solid #d6d3d1', padding: '6px 0' };

  const MoneyRows = ({ lines, negative }: { lines: { id: string; label: string; amount: number }[]; negative?: boolean }) => (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <tbody>
        {lines.map((l, i) => (
          <tr key={l.id}>
            <td style={td}>{i + 1}. {l.label}</td>
            <td style={{ ...td, width: 20, textAlign: 'center', color: '#a8a29e' }}>:</td>
            <td style={tdR}>Rp {(negative ? Math.abs(l.amount) : l.amount).toLocaleString('id-ID')}</td>
          </tr>
        ))}
        <tr>
          <td style={{ ...td, textAlign: 'right', fontWeight: 700, paddingTop: 4 }}>Jumlah</td>
          <td />
          <td style={{ ...tdR, fontWeight: 700, paddingTop: 4 }}>
            Rp {lines.reduce((s, l) => s + Math.abs(l.amount), 0).toLocaleString('id-ID')}
          </td>
        </tr>
      </tbody>
    </table>
  );

  return (
    <div style={{ color: '#1c1917', fontFamily: 'ui-sans-serif, system-ui, sans-serif', fontSize: 12 }}>
      <KopSurat school={school} />
      <p style={{ textAlign: 'center', fontSize: 13, fontWeight: 700, margin: '14px 0 10px', lineHeight: 1.4 }}>
        DAFTAR RINCINAN HONORARIUM<br />
        GURU DAN KARYAWAN<br />
        {(school?.name ?? 'Sekolah').toUpperCase()}
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 4 }}>
        <tbody>
          <tr>
            <td style={{ ...td, width: '12%', ...muted }}>Nama</td>
            <td style={{ ...td, width: '52%' }}>: <b>{item.employee?.name}</b></td>
            <td style={{ ...td, ...muted }}>Jabatan</td>
            <td style={td}>: {jabatan ?? '—'}</td>
          </tr>
          <tr>
            <td style={{ ...td, ...muted }}>NIP/NUPTK</td>
            <td style={td}>: {item.employee?.nip ?? '—'}</td>
            <td style={{ ...td, ...muted }}>Bulan</td>
            <td style={td}>: {monthLabel(run.month)}{run.periodStart && run.periodEnd ? <span style={{ ...muted, fontSize: 10 }}> (absen {periodLabel(run)})</span> : null}</td>
          </tr>
          <tr>
            <td style={{ ...td, ...muted }}>Jam wajib</td>
            <td style={td}>
              : {jp(item.requiredJp)}
              <span style={{ ...muted, fontSize: 11 }}> · JP hadir {jp(item.transportJp)}</span>
              {(item.manualJp ?? 0) !== 0 ? (
                <span style={{ ...muted, fontSize: 11 }}> (absen {jp(item.transportJp - (item.manualJp ?? 0))} + koreksi {jp(item.manualJp ?? 0)})</span>
              ) : null}
            </td>
            <td colSpan={2} style={td} />
          </tr>
        </tbody>
      </table>

      <p style={secTitle}>A&nbsp;&nbsp;&nbsp;PENERIMAAN</p>
      <div style={secBody}>
        {inc.length ? <MoneyRows lines={inc} /> : <p style={{ ...td, ...muted }}>—</p>}
      </div>
      <p style={secTitle}>B&nbsp;&nbsp;&nbsp;POTONGAN</p>
      <div style={secBody}>
        {dec.length ? <MoneyRows lines={dec} negative /> : <p style={{ ...td, color: '#a8a29e' }}>Tidak ada potongan.</p>}
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
        <tbody>
          <tr>
            <td style={{ ...td, fontWeight: 700, fontSize: 13 }}>Jumlah yang diterima bersih</td>
            <td style={{ ...td, width: 20, textAlign: 'center' }}>:</td>
            <td style={{ ...tdR, fontWeight: 700, fontSize: 13 }}>Rp {item.netAmount.toLocaleString('id-ID')}</td>
          </tr>
        </tbody>
      </table>

      <div style={{ display: 'flex', gap: 24, marginTop: 36, fontSize: 12 }}>
        <div style={{ flex: 1 }}>
          <p>Kepala Sekolah,</p>
          {school?.headmasterSignatureUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/signature.png" alt="TTD" style={{ height: 52, objectFit: 'contain', marginTop: 4, display: 'block' }} />
          ) : null}
          <p style={{ fontWeight: 700, textDecoration: 'underline', marginTop: school?.headmasterSignatureUrl ? 4 : 52 }}>
            {principal || '…………………………'}
          </p>
          {school?.headmasterNip ? <p style={{ ...muted, marginTop: 2 }}>NIP/NUPTK. {school.headmasterNip}</p> : null}
        </div>
        <div style={{ flex: 1 }}>
          <p>Bandung, {printDate}</p>
          <p>Bendahara,</p>
          <p style={{ fontWeight: 700, textDecoration: 'underline', marginTop: 56 }}>{treasurer || '…………………………'}</p>
          {school?.treasurerNip ? <p style={{ ...muted, marginTop: 2 }}>NIP/NUPTK. {school.treasurerNip}</p> : null}
        </div>
      </div>
    </div>
  );
}

/** Buka jendela print berisi elemen slip (format bersih untuk kertas). */
export function printEl(el: HTMLElement | null, title = 'Slip Gaji') {
  if (!el) return;
  const w = window.open('', '_blank', 'width=800,height=900');
  if (!w) return;
  w.document.write(`<html><head><base href="${window.location.origin}"><title>${title}</title><style>
    body{font-family:ui-sans-serif,system-ui,sans-serif;padding:24px;color:#1c1917}
    table{width:100%;border-collapse:collapse;font-size:12px}
    th,td{padding:5px 8px;border-bottom:1px solid #e7e5e4;text-align:left;vertical-align:top}
    thead th{border-bottom:2px solid #1c1917;font-size:11px;text-transform:uppercase;letter-spacing:.03em}
    [class*="text-right"]{text-align:right}
    [class*="font-bold"],[class*="font-semibold"]{font-weight:700}
    [class*="text-green"],[class*="green-6"]{color:#15803d}
    [class*="text-red"],[class*="red-6"]{color:#b91c1c}
    [class*="text-xs"]{font-size:11px}
    [class*="opacity-"]{opacity:1}
    svg{max-width:100%}
    .grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
    .b2{border-bottom:2px solid #1c1917}.b1{border-bottom:1px solid #d6d3d1}
    .ctr{text-align:center}.r{text-align:right}.b{font-weight:700}
    .xs{font-size:11px}.sm{font-size:13px}.mt2{margin-top:8px}.mt4{margin-top:16px}.mt10{margin-top:40px}
    .up{text-transform:uppercase;letter-spacing:.05em;font-weight:700;font-size:11px}
    @page{margin:12mm}
    </style></head><body>${el.innerHTML}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}
