'use client';

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
export const mLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
export const shortNum = (n: number) =>
  Math.abs(n) >= 1_000_000_000
    ? `${(n / 1_000_000_000).toFixed(1)} M`
    : Math.abs(n) >= 1_000_000
      ? `${(n / 1_000_000).toFixed(1)} jt`
      : Math.abs(n) >= 1_000
        ? `${Math.round(n / 1_000)} rb`
        : `${n}`;

const PALETTE = ['#0e7490', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#2563eb', '#db2777', '#65a30d', '#0891b2', '#9333ea'];

export const rupiah = (n: number) => `Rp${n.toLocaleString('id-ID')}`;

/** Grafik batang berdampingan — pemasukan vs pengeluaran per bulan. */
export function TrendChart({ data }: { data: { month: string; income: number; expense: number }[] }) {
  const W = 720, H = 240, P = { l: 56, r: 12, t: 16, b: 28 };
  const max = Math.max(1, ...data.flatMap((d) => [d.income, d.expense]));
  const iw = W - P.l - P.r;
  const gw = iw / Math.max(1, data.length);
  const bw = Math.min(24, gw / 3);
  const y = (v: number) => P.t + (H - P.t - P.b) * (1 - v / max);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} stroke="currentColor" strokeOpacity={0.12} />
          <text x={P.l - 6} y={y(t) + 4} textAnchor="end" fontSize={10} fill="currentColor" opacity={0.55}>{shortNum(t)}</text>
        </g>
      ))}
      {data.map((d, i) => {
        const cx = P.l + i * gw + gw / 2;
        return (
          <g key={d.month}>
            <rect x={cx - bw - 2} y={y(d.income)} width={bw} height={Math.max(1, H - P.b - y(d.income))} rx={3} fill="#16a34a">
              <title>{`Masuk ${mLabel(d.month)}: ${rupiah(d.income)}`}</title>
            </rect>
            <rect x={cx + 2} y={y(d.expense)} width={bw} height={Math.max(1, H - P.b - y(d.expense))} rx={3} fill="#dc2626">
              <title>{`Keluar ${mLabel(d.month)}: ${rupiah(d.expense)}`}</title>
            </rect>
            <text x={cx} y={H - 8} textAnchor="middle" fontSize={10} fill="currentColor" opacity={0.6}>{mLabel(d.month)}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** Donut breakdown per kategori dengan legenda. */
export function Donut({ data, total }: { data: { name: string; total: number }[]; total: number }) {
  const R = 62, C = 2 * Math.PI * R;
  let acc = 0;
  const top = data.slice(0, 7);
  const rest = data.slice(7).reduce((s, d) => s + d.total, 0);
  const slices = rest > 0 ? [...top, { name: 'Lainnya', total: rest }] : top;
  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 160 160" className="w-40 shrink-0">
        <circle cx={80} cy={80} r={R} fill="none" stroke="currentColor" strokeOpacity={0.08} strokeWidth={22} />
        {slices.map((s, i) => {
          const frac = total > 0 ? s.total / total : 0;
          const dash = frac * C;
          const el = (
            <circle
              key={s.name}
              cx={80} cy={80} r={R} fill="none"
              stroke={PALETTE[i % PALETTE.length]} strokeWidth={22}
              strokeDasharray={`${Math.max(0.5, dash - 1.5)} ${C}`}
              strokeDashoffset={-acc * C + C / 4}
            >
              <title>{`${s.name}: ${rupiah(s.total)}`}</title>
            </circle>
          );
          acc += frac;
          return el;
        })}
        <text x={80} y={76} textAnchor="middle" fontSize={11} fill="currentColor" opacity={0.6}>Total</text>
        <text x={80} y={92} textAnchor="middle" fontSize={13} fontWeight={700} fill="currentColor">{shortNum(total)}</text>
      </svg>
      <ul className="grid flex-1 gap-1.5 text-sm">
        {slices.map((s, i) => (
          <li key={s.name} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} />
            <span className="flex-1 truncate">{s.name}</span>
            <span className="font-medium tabular-nums">{shortNum(s.total)}</span>
            <span className="w-10 text-right text-xs opacity-55">{total > 0 ? Math.round((s.total / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Bar horizontal — untuk pengeluaran per standar. */
export function HBars({ data, label }: { data: { name: string; total: number }[]; label?: (n: string) => string }) {
  const max = Math.max(1, ...data.map((d) => d.total));
  return (
    <ul className="grid gap-2.5">
      {data.map((d) => (
        <li key={d.name}>
          <div className="mb-1 flex justify-between text-sm">
            <span className="truncate">{label ? label(d.name) : d.name}</span>
            <span className="font-medium tabular-nums">{rupiah(d.total)}</span>
          </div>
          <div className="h-2 rounded-full" style={{ background: 'color-mix(in srgb, currentColor 8%, transparent)' }}>
            <div className="h-2 rounded-full bg-amber-600" style={{ width: `${(d.total / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Unduh CSV — delimiter ";" + BOM UTF-8 agar langsung kebaca Excel Indonesia. */
export function downloadCsv(filename: string, head: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = '﻿' + [head, ...rows].map((r) => r.map(esc).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
