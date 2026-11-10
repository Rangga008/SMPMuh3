'use client';

import type { PayrollItemView, PayrollRunView, School } from '@/lib/api';

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
  return (
    <div className="text-sm text-sand-900">
      <div className="flex items-center gap-3 border-b-2 border-sand-900 pb-3">
        {school?.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/logo.png" alt="Logo" className="size-12 object-contain" />
        ) : null}
        <div className="flex-1 text-center">
          <p className="text-base font-bold uppercase tracking-wide">{school?.name ?? 'Sekolah'}</p>
          <p className="text-xs text-sand-600">
            {school?.address ?? ''}
            {school?.phone ? ` · Telp ${school.phone}` : ''}
          </p>
          <p className="mt-1 text-sm font-semibold">SLIP GAJI — {monthLabel(run.month)}</p>
        </div>
        {school?.logoUrl ? <span className="size-12" /> : null}
      </div>
      <table className="mt-3 w-full text-sm">
        <tbody>
          <tr>
            <td className="py-0.5 text-sand-500">Nama</td>
            <td className="py-0.5 font-semibold">{item.employee?.name}</td>
            <td className="py-0.5 text-right text-sand-500">NIP/NUPTK</td>
            <td className="py-0.5 text-right">{item.employee?.nip ?? '—'}</td>
          </tr>
          <tr>
            <td className="py-0.5 text-sand-500">Jam wajib</td>
            <td className="py-0.5">{jam(item.requiredMinutes)}</td>
            <td className="py-0.5 text-right text-sand-500">Jam hadir</td>
            <td className="py-0.5 text-right">{jam(item.workedMinutes)}</td>
          </tr>
        </tbody>
      </table>
      <div className="mt-3 grid grid-cols-2 gap-4">
        <div>
          <p className="border-b border-sand-300 pb-1 text-xs font-bold uppercase tracking-wider">Pendapatan</p>
          <table className="w-full text-sm">
            <tbody>
              {inc.map((l) => (
                <tr key={l.id}>
                  <td className="py-0.5 pr-2 align-top">{l.label}</td>
                  <td className="py-0.5 text-right align-top whitespace-nowrap">{rupiah(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <p className="border-b border-sand-300 pb-1 text-xs font-bold uppercase tracking-wider">Potongan</p>
          <table className="w-full text-sm">
            <tbody>
              {dec.length === 0 ? (
                <tr><td className="py-0.5 text-sand-400">—</td><td /></tr>
              ) : (
                dec.map((l) => (
                  <tr key={l.id}>
                    <td className="py-0.5 pr-2 align-top">{l.label}</td>
                    <td className="py-0.5 text-right align-top whitespace-nowrap">{rupiah(Math.abs(l.amount))}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className="mt-3 flex justify-between border-t-2 border-sand-900 pt-2 font-bold">
        <span>DITERIMA BERSIH</span>
        <span>{rupiah(item.netAmount)}</span>
      </div>
      <div className="mt-8 grid grid-cols-2 gap-4 text-center text-xs">
        <div>
          <p>Kepala Sekolah</p>
          {school?.headmasterSignatureUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/signature.png" alt="TTD" style={{ height: 52, objectFit: 'contain', margin: '4px auto 0' }} />
          ) : null}
          <p className={`font-semibold underline ${school?.headmasterSignatureUrl ? 'mt-1' : 'mt-14'}`}>
            {principal || '…………………………'}
          </p>
          {school?.headmasterNip ? <p className="mt-0.5 text-sand-500">NIP/NUPTK {school.headmasterNip}</p> : null}
        </div>
        <div>
          <p>Bendahara / Keuangan</p>
          <p className="mt-14 font-semibold underline">{treasurer || '…………………………'}</p>
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
