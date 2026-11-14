'use client';

import type { PayrollItemView, PayrollRunView, School } from '@/lib/api';
import type { CSSProperties } from 'react';

export const rupiah = (n: number) => `Rp${n.toLocaleString('id-ID')}`;
export const jam = (m: number) =>
  `${(m / 60).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jam`;
export const monthLabel = (m: string) =>
  new Date(`${m}-15T00:00:00`).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

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

/** Slip gaji — inline style penuh agar hasil print identik dengan tampilan layar. */
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
  const td: CSSProperties = { padding: '2px 0', verticalAlign: 'top', fontSize: 13 };
  const tdR: CSSProperties = { ...td, textAlign: 'right', whiteSpace: 'nowrap' };
  const muted: CSSProperties = { color: '#78716c' };
  return (
    <div style={{ color: '#1c1917', fontFamily: 'ui-sans-serif, system-ui, sans-serif', fontSize: 13 }}>
      <KopSurat school={school} />
      <p style={{ textAlign: 'center', fontSize: 14, fontWeight: 700, letterSpacing: 1, margin: '12px 0 8px' }}>
        SLIP GAJI — {monthLabel(run.month).toUpperCase()}
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          <tr>
            <td style={{ ...td, ...muted, width: '12%' }}>Nama</td>
            <td style={{ ...td, fontWeight: 600, width: '44%' }}>{item.employee?.name}</td>
            <td style={{ ...tdR, ...muted, width: '12%' }}>NIP/NUPTK</td>
            <td style={tdR}>{item.employee?.nip ?? '—'}</td>
          </tr>
          <tr>
            <td style={{ ...td, ...muted }}>Jam wajib</td>
            <td style={td}>{jam(item.requiredMinutes)}</td>
            <td style={{ ...tdR, ...muted }}>Jam hadir</td>
            <td style={tdR}>
              {jam(item.workedMinutes + (item.manualMinutes ?? 0))}
              {(item.manualMinutes ?? 0) !== 0 ? (
                <span style={{ ...muted, fontSize: 11 }}> (absen {jam(item.workedMinutes)} + koreksi {jam(item.manualMinutes ?? 0)})</span>
              ) : null}
            </td>
          </tr>
        </tbody>
      </table>
      <div style={{ display: 'flex', gap: 24, marginTop: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ borderBottom: '1px solid #d6d3d1', paddingBottom: 4, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
            Pendapatan
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {inc.map((l) => (
                <tr key={l.id}>
                  <td style={{ ...td, paddingRight: 8 }}>{l.label}</td>
                  <td style={tdR}>{rupiah(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ borderBottom: '1px solid #d6d3d1', paddingBottom: 4, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
            Potongan
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {dec.length === 0 ? (
                <tr><td style={{ ...td, color: '#a8a29e' }}>—</td><td /></tr>
              ) : (
                dec.map((l) => (
                  <tr key={l.id}>
                    <td style={{ ...td, paddingRight: 8 }}>{l.label}</td>
                    <td style={tdR}>{rupiah(Math.abs(l.amount))}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid #1c1917', marginTop: 12, paddingTop: 8, fontWeight: 700, fontSize: 14 }}>
        <span>DITERIMA BERSIH</span>
        <span>{rupiah(item.netAmount)}</span>
      </div>
      <div style={{ display: 'flex', gap: 24, marginTop: 40, textAlign: 'center', fontSize: 12 }}>
        <div style={{ flex: 1 }}>
          <p>Kepala Sekolah</p>
          {school?.headmasterSignatureUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/signature.png" alt="TTD" style={{ height: 52, objectFit: 'contain', margin: '4px auto 0', display: 'block' }} />
          ) : null}
          <p style={{ fontWeight: 600, textDecoration: 'underline', marginTop: school?.headmasterSignatureUrl ? 4 : 52 }}>
            {principal || '…………………………'}
          </p>
          {school?.headmasterNip ? <p style={{ ...muted, marginTop: 2 }}>NIP/NUPTK {school.headmasterNip}</p> : null}
        </div>
        <div style={{ flex: 1 }}>
          <p>Bendahara / Keuangan</p>
          <p style={{ fontWeight: 600, textDecoration: 'underline', marginTop: 56 }}>{treasurer || '…………………………'}</p>
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
