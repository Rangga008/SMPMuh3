'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Button, Field, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { PageTitle, Widget } from '@/components/widgets';
import { downloadCsv, mLabel, rupiah } from '@/components/finance-charts';
import { printEl } from '@/components/payroll-slip';
import { PERMISSIONS } from '@smpmuh3/types';
import {
  getAccountLedger,
  getFinanceReport,
  getSchool,
  listAcademicYears,
  listCashAccounts,
  listFinanceCategories,
  listFinanceTransactions,
  listSemesters,
  listStudentInvoices,
  me,
  type AcademicYear,
  type AccountLedger,
  type CashAccountView,
  type FinanceCategory,
  type FinanceReport,
  type FinanceTransaction,
  type School,
  type SemesterView,
  type StudentInvoice,
  phoneLocal,
} from '@/lib/api';

const STD_FULL: Record<string, string> = {
  ISI: 'Standar Isi',
  PROSES: 'Standar Proses',
  KELULUSAN: 'Standar Kompetensi Lulusan',
  TENAGA: 'Standar Pendidik & Tenaga',
  SARANA: 'Standar Sarana Prasarana',
  PENGELOLAAN: 'Standar Pengelolaan',
  PEMBIAYAAN: 'Standar Pembiayaan',
  PENILAIAN: 'Standar Penilaian',
};
const SRC_LABEL: Record<string, string> = {
  manual: 'Manual', spmb: 'SPMB', billing: 'Tagihan', expense: 'Pengeluaran',
  payroll: 'Payroll', savings: 'Tabungan', loan: 'Pinjaman', bank: 'Bank',
};

type TabId = 'bulanan' | 'sheet' | 'kategori' | 'sumber' | 'kas' | 'siswa' | 'kelas' | 'jenjang' | 'piutang' | 'tabloan' | 'rab';
const TABS: { id: TabId; label: string }[] = [
  { id: 'bulanan', label: 'Rekap per Bulan' },
  { id: 'sheet', label: 'Sheet per Bulan' },
  { id: 'kategori', label: 'Per Kategori' },
  { id: 'sumber', label: 'Per Sumber' },
  { id: 'kas', label: 'Per Kas' },
  { id: 'siswa', label: 'Siswa per Bulan' },
  { id: 'kelas', label: 'Tagihan per Kelas' },
  { id: 'jenjang', label: 'Tagihan per Jenjang' },
  { id: 'piutang', label: 'Piutang (Belum Lunas)' },
  { id: 'tabloan', label: 'Tabungan & Pinjaman' },
  { id: 'rab', label: 'RAB vs Realisasi' },
];
const INVOICE_TABS: TabId[] = ['kelas', 'jenjang', 'piutang'];

const th = 'pb-2 pr-3 text-left text-xs uppercase opacity-55';
const thr = `${th} text-right`;
const td = 'py-1.5 pr-3';
const tdr = `${td} text-right tabular-nums`;

export default function LaporanPage() {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [semesters, setSemesters] = useState<SemesterView[]>([]);
  const [yearId, setYearId] = useState('');
  const [semesterId, setSemesterId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [tab, setTab] = useState<TabId>('bulanan');
  const [report, setReport] = useState<FinanceReport | null>(null);
  const [school, setSchool] = useState<School | null>(null);
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const printRef = useRef<HTMLDivElement>(null);

  // Data pendukung
  const [accounts, setAccounts] = useState<CashAccountView[]>([]);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [invoices, setInvoices] = useState<StudentInvoice[] | null>(null);
  // Rincian
  const [kasId, setKasId] = useState('');
  const [kasLedger, setKasLedger] = useState<AccountLedger | null>(null);
  const [katId, setKatId] = useState('');
  const [katRows, setKatRows] = useState<FinanceTransaction[]>([]);
  // Filter kas global — semua laporan transaksi ikut tersaring ke kas ini.
  const [kasFilter, setKasFilter] = useState('');
  // Sheet per bulan — semua transaksi rentang ini, dikelompokkan per bulan.
  const [txAll, setTxAll] = useState<FinanceTransaction[] | null>(null);
  const [bulanSel, setBulanSel] = useState('');
  // Siswa per bulan — filter jenjang/kelas.
  const [siswaJenjang, setSiswaJenjang] = useState('');
  const [siswaKelas, setSiswaKelas] = useState('');

  useEffect(() => {
    me().then((u) => setAllowed(u.permissions.includes(PERMISSIONS.FINANCE_READ)));
    listAcademicYears().then((ys) => {
      setYears(ys);
      const active = ys.find((y) => y.isActive) ?? ys[0];
      if (active) setYearId(active.id);
    });
    listCashAccounts().then(setAccounts).catch(() => undefined);
    listFinanceCategories().then(setCategories).catch(() => undefined);
    getSchool().then(setSchool).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!yearId) return;
    listSemesters(yearId).then(setSemesters).catch(() => setSemesters([]));
    setInvoices(null);
  }, [yearId]);

  const load = useCallback(() => {
    if (!yearId) return;
    setLoading(true);
    setError('');
    getFinanceReport({
      academicYearId: yearId,
      ...(semesterId ? { semesterId } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(kasFilter ? { cashAccountId: kasFilter } : {}),
    })
      .then(setReport)
      .catch(() => setError('Gagal memuat laporan'))
      .finally(() => setLoading(false));
  }, [yearId, semesterId, from, to, kasFilter]);

  useEffect(load, [load]);

  // Tagihan — dimuat sekali per TA/semester saat tab tagihan dibuka.
  useEffect(() => {
    if (!INVOICE_TABS.includes(tab) || !yearId || invoices !== null) return;
    listStudentInvoices({
      academicYearId: yearId,
      ...(semesterId ? { semesterId } : {}),
      take: '1000',
    })
      .then((r) => setInvoices(r.items))
      .catch(() => setInvoices([]));
  }, [tab, yearId, semesterId, invoices]);

  // Ledger akun terpilih — mengikuti rentang periode laporan.
  useEffect(() => {
    if (!kasId || tab !== 'kas') {
      setKasLedger(null);
      return;
    }
    getAccountLedger(kasId, { ...(from ? { from } : {}), ...(to ? { to } : {}) })
      .then(setKasLedger)
      .catch(() => setKasLedger(null));
  }, [kasId, tab, from, to]);

  // Transaksi kategori terpilih.
  useEffect(() => {
    if (!katId || !yearId || tab !== 'kategori') {
      setKatRows([]);
      return;
    }
    listFinanceTransactions({
      academicYearId: yearId,
      categoryId: katId,
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      take: '500',
    })
      .then((r) => setKatRows(r.items))
      .catch(() => setKatRows([]));
  }, [katId, yearId, tab, from, to]);

  // Semua transaksi rentang — untuk sheet per bulan.
  useEffect(() => {
    if (tab !== 'sheet' || !yearId) {
      setTxAll(null);
      return;
    }
    listFinanceTransactions({
      academicYearId: yearId,
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(kasFilter ? { cashAccountId: kasFilter } : {}),
      take: '5000',
    })
      .then((r) => setTxAll(r.items))
      .catch(() => setTxAll([]));
  }, [tab, yearId, from, to, kasFilter]);

  const periodLabel = report
    ? report.range.semesterName
      ? `Semester ${report.range.semesterName}`
      : report.range.from && report.range.to
        ? `${new Date(report.range.from).toLocaleDateString('id-ID')} — ${new Date(report.range.to).toLocaleDateString('id-ID')}`
        : 'Seluruh tahun ajaran'
    : '';

  // ---------- Agregasi tabel ----------

  const monthlyRows = useMemo(() => {
    let run = 0;
    return (report?.monthly ?? []).map((m) => {
      run += m.income - m.expense;
      return { ...m, diff: m.income - m.expense, run };
    });
  }, [report]);

  const kategoriRows = useMemo(() => {
    const inc = (report?.incomeByCategory ?? []).map((c) => ({ name: c.name, type: 'Pemasukan', masuk: c.total, keluar: 0 }));
    const exp = (report?.expenseByCategory ?? []).map((c) => ({ name: c.name, type: 'Pengeluaran', masuk: 0, keluar: c.total }));
    return [...inc, ...exp];
  }, [report]);

  const sumberRows = useMemo(() => {
    const map = new Map<string, { masuk: number; keluar: number }>();
    for (const s of report?.incomeBySource ?? []) {
      map.set(s.source, { masuk: s.total, keluar: map.get(s.source)?.keluar ?? 0 });
    }
    for (const s of report?.expenseBySource ?? []) {
      map.set(s.source, { masuk: map.get(s.source)?.masuk ?? 0, keluar: s.total });
    }
    return [...map.entries()].map(([source, v]) => ({ source, ...v }));
  }, [report]);

  const byKelas = useMemo(() => {
    if (!invoices) return [];
    const map = new Map<string, { name: string; grade: number; count: number; total: number; paid: number; sisa: number }>();
    for (const inv of invoices) {
      const key = inv.class?.id ?? 'none';
      const g = map.get(key) ?? {
        name: inv.class?.name ?? 'Tanpa Kelas', grade: inv.class?.gradeLevel ?? 99,
        count: 0, total: 0, paid: 0, sisa: 0,
      };
      g.count += 1; g.total += inv.amount; g.paid += inv.paidAmount; g.sisa += inv.remaining;
      map.set(key, g);
    }
    return [...map.values()].sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name));
  }, [invoices]);

  const byJenjang = useMemo(() => {
    if (!invoices) return [];
    const map = new Map<number, { name: string; count: number; total: number; paid: number; sisa: number }>();
    for (const inv of invoices) {
      const g = inv.class?.gradeLevel ?? 0;
      const row = map.get(g) ?? { name: g ? `Jenjang ${g}` : 'Tanpa Kelas', count: 0, total: 0, paid: 0, sisa: 0 };
      row.count += 1; row.total += inv.amount; row.paid += inv.paidAmount; row.sisa += inv.remaining;
      map.set(g, row);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
  }, [invoices]);

  const piutangRows = useMemo(
    () => (invoices ?? []).filter((i) => i.status === 'OPEN' || i.status === 'PARTIAL').sort((a, b) => b.remaining - a.remaining),
    [invoices],
  );

  // === Sheet per bulan — transaksi dikelompokkan per YYYY-MM ===
  const monthKeys = useMemo(
    () => [...new Set((txAll ?? []).map((t) => t.occurredAt.slice(0, 7)))].sort(),
    [txAll],
  );
  const bulanAktif = bulanSel && monthKeys.includes(bulanSel) ? bulanSel : monthKeys[0] ?? '';
  const bulanRows = useMemo(() => {
    const rows = (txAll ?? [])
      .filter((t) => t.occurredAt.slice(0, 7) === bulanAktif)
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    const inc = rows.filter((t) => t.type === 'INCOME');
    const exp = rows.filter((t) => t.type === 'EXPENSE');
    return {
      inc, exp,
      inTot: inc.reduce((s, t) => s + t.amount, 0),
      outTot: exp.reduce((s, t) => s + t.amount, 0),
    };
  }, [txAll, bulanAktif]);
  // Saldo akhir bulan = saldo berjalan bulan itu dari rekap bulanan.
  const saldoBulan = monthlyRows.find((m) => m.month === bulanAktif)?.run ?? 0;

  // === Pemasukan siswa per bulan — matriks entitas × bulan ===
  const siswaData = useMemo(() => {
    const all = report?.paymentsByStudentMonth ?? [];
    const jenjangs = [...new Set(all.map((r) => r.gradeLevel))].sort((a, b) => a - b);
    const kelasNames = [...new Set(
      all.filter((r) => !siswaJenjang || r.gradeLevel === Number(siswaJenjang)).map((r) => r.className || '—'),
    )].sort();
    const pays = all.filter(
      (r) =>
        (!siswaJenjang || r.gradeLevel === Number(siswaJenjang)) &&
        (!siswaKelas || (r.className || '—') === siswaKelas),
    );
    const months = [...new Set(all.map((r) => r.month))].sort();
    // Baris: per siswa (kelas dipilih) / per kelas (jenjang) / per jenjang (default).
    const agg = new Map<string, { label: string; sub: string; cells: Map<string, number> }>();
    for (const r of pays) {
      const key = siswaKelas ? r.studentId : siswaJenjang ? (r.className || '—') : String(r.gradeLevel);
      const cur = agg.get(key) ?? {
        label: siswaKelas ? r.studentName : siswaJenjang ? (r.className || '—') : `Jenjang ${r.gradeLevel}`,
        sub: siswaKelas ? `${r.className || '—'}` : '',
        cells: new Map<string, number>(),
      };
      cur.cells.set(r.month, (cur.cells.get(r.month) ?? 0) + r.total);
      agg.set(key, cur);
    }
    const rows = [...agg.entries()]
      .map(([key, v]) => ({
        key,
        label: v.label,
        sub: v.sub,
        cells: months.map((m) => v.cells.get(m) ?? 0),
        total: [...v.cells.values()].reduce((s, n) => s + n, 0),
      }))
      .sort((a, b) => b.total - a.total);
    const colTot = months.map((m) => pays.filter((r) => r.month === m).reduce((s, r) => s + r.total, 0));
    return { jenjangs, kelasNames, months, rows, colTot, grand: colTot.reduce((s, n) => s + n, 0) };
  }, [report, siswaJenjang, siswaKelas]);

  const kasIn = kasLedger?.items.filter((m) => m.direction === 'IN').reduce((s, m) => s + m.amount, 0) ?? 0;
  const kasOut = kasLedger?.items.filter((m) => m.direction === 'OUT').reduce((s, m) => s + m.amount, 0) ?? 0;
  const tabLabel = TABS.find((t) => t.id === tab)?.label ?? '';

  // ---------- Ekspor ----------

  function exportCsv() {
    if (!report) return;
    const base = `laporan-${tab}-${from || 'awal'}_${to || 'akhir'}.csv`;
    if (tab === 'bulanan') {
      downloadCsv(base, ['Bulan', 'Masuk', 'Keluar', 'Selisih', 'Saldo Berjalan'], [
        ...monthlyRows.map((m) => [mLabel(m.month), m.income, m.expense, m.diff, m.run]),
        ['TOTAL', report.income, report.expense, report.balance, ''],
      ]);
    } else if (tab === 'kategori') {
      const rows: (string | number)[][] = [
        ...kategoriRows.map((r) => [r.name, r.type, r.masuk || '', r.keluar || '', ''] as (string | number)[]),
        ['TOTAL', '', report.income, report.expense, ''],
      ];
      if (katId) {
        const cat = categories.find((c) => c.id === katId);
        rows.push(['', '', '', '', '']);
        rows.push([`RINCIAN — ${cat?.name ?? 'Kategori'}`, '', '', '', '']);
        rows.push(['Tanggal', 'Keterangan', 'Kas', 'Masuk', 'Keluar']);
        let mIn = 0;
        let mOut = 0;
        for (const t of katRows) {
          if (t.type === 'INCOME') mIn += t.amount;
          else mOut += t.amount;
          rows.push([
            t.occurredAt.slice(0, 10),
            t.description ?? '',
            t.cashAccount?.name ?? '',
            t.type === 'INCOME' ? t.amount : '',
            t.type === 'EXPENSE' ? t.amount : '',
          ]);
        }
        rows.push(['TOTAL RINCIAN', '', '', mIn, mOut]);
      }
      downloadCsv(base, ['Kategori', 'Tipe', 'Masuk', 'Keluar', 'Keterangan'], rows);
    } else if (tab === 'sumber') {
      downloadCsv(base, ['Sumber', 'Masuk', 'Keluar'], [
        ...sumberRows.map((r) => [SRC_LABEL[r.source] ?? r.source, r.masuk || '', r.keluar || ''] as (string | number)[]),
      ]);
    } else if (tab === 'kas') {
      const head = ['Kas', 'Masuk', 'Keluar', 'Net'];
      const rows = report.byCashAccount.map((a) => [a.name, a.income, a.expense, a.net] as (string | number)[]);
      if (kasLedger) {
        downloadCsv(`buku-kas-${kasLedger.account.key}.csv`, ['Tanggal', 'Uraian', 'Masuk', 'Keluar', 'Saldo'], [
          ['SALDO AWAL', '', '', '', kasLedger.opening],
          ...kasLedger.items.map((m) => [
            m.occurredAt.slice(0, 10), m.description ?? m.refType,
            m.direction === 'IN' ? m.amount : '', m.direction === 'OUT' ? m.amount : '', m.balance,
          ]),
          ['TOTAL', '', kasIn, kasOut, ''],
          ['SALDO AKHIR', '', '', '', kasLedger.closing],
        ]);
      } else downloadCsv(base, head, rows);
    } else if (tab === 'kelas') {
      downloadCsv(base, ['Kelas', 'Jml Tagihan', 'Total', 'Terbayar', 'Sisa'],
        byKelas.map((r) => [r.name, r.count, r.total, r.paid, r.sisa]));
    } else if (tab === 'jenjang') {
      downloadCsv(base, ['Jenjang', 'Jml Tagihan', 'Total', 'Terbayar', 'Sisa'],
        byJenjang.map((r) => [r.name, r.count, r.total, r.paid, r.sisa]));
    } else if (tab === 'piutang') {
      downloadCsv(base, ['Siswa', 'Kelas', 'No HP Ortu', 'Tagihan', 'Jatuh Tempo', 'Sisa'],
        piutangRows.map((i) => [
          i.student?.name ?? '', i.class?.name ?? '', i.student?.parent?.phone ?? '',
          i.title, i.dueAt ? i.dueAt.slice(0, 10) : '', i.remaining,
        ]));
    } else if (tab === 'sheet') {
      // Satu file, semua bulan jadi seksi terpisah — mirip "beda sheet per bulan".
      const rows: (string | number)[][] = [];
      for (const m of monthKeys) {
        const txs = (txAll ?? []).filter((t) => t.occurredAt.slice(0, 7) === m);
        const inc = txs.filter((t) => t.type === 'INCOME');
        const exp = txs.filter((t) => t.type === 'EXPENSE');
        const inT = inc.reduce((s, t) => s + t.amount, 0);
        const outT = exp.reduce((s, t) => s + t.amount, 0);
        const saldo = monthlyRows.find((x) => x.month === m)?.run ?? 0;
        rows.push([`=== ${mLabel(m)} ===`, '', '', '']);
        rows.push(['Tanggal', 'Uraian', 'Masuk', 'Keluar']);
        for (const t of [...inc, ...exp].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))) {
          rows.push([t.occurredAt.slice(0, 10), t.description ?? '', t.type === 'INCOME' ? t.amount : '', t.type === 'EXPENSE' ? t.amount : '']);
        }
        rows.push(['Total bulan ini', '', inT, outT]);
        rows.push(['Selisih', '', '', inT - outT]);
        rows.push(['Saldo akhir bulan', '', '', saldo]);
        rows.push(['', '', '', '']);
      }
      downloadCsv(base, ['', '', '', ''], rows);
    } else if (tab === 'siswa') {
      downloadCsv(base, ['Nama', 'Keterangan', ...siswaData.months.map(mLabel), 'Total'], [
        ...siswaData.rows.map((r) => [r.label, r.sub, ...r.cells, r.total] as (string | number)[]),
        ['TOTAL', '', ...siswaData.colTot, siswaData.grand],
      ]);
    } else if (tab === 'tabloan') {
      const sv = report.savings;
      const ln = report.loans;
      downloadCsv(base, ['Keterangan', 'Jumlah'], [
        ['Tabungan masuk (setor)', sv.in],
        ['Tabungan keluar (tarik)', sv.out],
        ['Tabungan net', sv.in - sv.out],
        [''],
        ['Pinjaman dicairkan (jumlah)', ln.disbursedCount],
        ['Pinjaman dicairkan (nominal)', ln.disbursedAmount],
        ['Cicilan terpotong payroll', ln.repaidAmount],
        ['Sisa pinjaman berjalan', ln.outstanding],
        [''],
        ['Bulan', 'Setor', 'Tarik'],
        ...sv.monthly.map((m) => [mLabel(m.month), m.in, m.out] as (string | number)[]),
      ]);
    } else if (tab === 'rab') {
      downloadCsv(base, ['Kategori', 'Tipe', 'Rencana', 'Realisasi', 'Selisih', '%'],
        report.budgets.map((b) => [b.name, b.type, b.planned, b.actual, b.diff, `${b.pct}%`]));
    }
  }

  // ---------- Render ----------

  return (
    <Shell>
      <PageTitle title="Laporan Keuangan" subtitle="Rekapitulasi tabel — ekspor ke Excel atau cetak PDF" />

      <Widget title="Periode & Ekspor" className="mb-6">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Tahun Ajaran" className="w-48">
            <Select value={yearId} onChange={(e) => { setYearId(e.target.value); setSemesterId(''); }}>
              {years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
            </Select>
          </Field>
          <Field label="Semester" className="w-40">
            <Select value={semesterId} onChange={(e) => setSemesterId(e.target.value)} disabled={Boolean(from || to)}>
              <option value="">Semua</option>
              {semesters.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Dari tanggal" className="w-40">
            <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); if (e.target.value) setSemesterId(''); }}
              className="w-full rounded-lg border border-current/20 bg-transparent px-3 py-2 text-sm" />
          </Field>
          <Field label="Sampai tanggal" className="w-40">
            <input type="date" value={to} onChange={(e) => { setTo(e.target.value); if (e.target.value) setSemesterId(''); }}
              className="w-full rounded-lg border border-current/20 bg-transparent px-3 py-2 text-sm" />
          </Field>
          <Field label="Kas" className="w-44">
            <Select value={kasFilter} onChange={(e) => setKasFilter(e.target.value)} aria-label="Filter kas">
              <option value="">Semua kas</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
          <span className="ml-auto flex gap-2">
            <Button variant="outline" disabled={!report} onClick={exportCsv}>Excel</Button>
            <Button variant="outline" disabled={!report} onClick={() => printEl(printRef.current, `Laporan — ${tabLabel}`)}>PDF</Button>
          </span>
        </div>
      </Widget>

      {!allowed ? (
        <Widget title="Akses">Anda tidak memiliki izin melihat laporan keuangan.</Widget>
      ) : (
        <>
          {/* Pemilih jenis laporan */}
          <div className="mb-6 flex flex-wrap gap-2">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`rounded-full border px-4 py-1.5 text-sm transition ${
                  tab === t.id
                    ? 'border-cyan-700 bg-cyan-700 text-white'
                    : 'border-current/20 hover:border-current/40'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {error ? (
            <Widget title="Laporan">{error}</Widget>
          ) : !report || (loading && !report) ? (
            <Widget title="Laporan">Memuat…</Widget>
          ) : (
            <div ref={printRef}>
              {/* Kepala laporan — hanya tampil saat cetak (kelas 'hidden' tak berlaku di jendela print) */}
              <div className="hidden">
                <div className="b2" style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 8 }}>
                  {school?.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src="/logo.png" alt="" style={{ width: 48, height: 48, objectFit: 'contain' }} />
                  ) : null}
                  <div className="ctr" style={{ flex: 1 }}>
                    <div className="b" style={{ fontSize: 16 }}>{school?.name ?? 'Sekolah'}</div>
                    <div className="xs">
                      {school?.address ?? ''}
                      {school?.phone ? ` · Telp ${school.phone}` : ''}
                    </div>
                    <div className="up mt2">Laporan — {tabLabel}</div>
                    <div className="xs">Periode: {periodLabel} · {years.find((y) => y.id === yearId)?.name ?? ''} · Digenerate {new Date().toLocaleString('id-ID')}</div>
                  </div>
                  {school?.logoUrl ? <span style={{ width: 48 }} /> : null}
                </div>
              </div>

              <Widget title={`${tabLabel} — ${periodLabel}`} className={loading ? 'opacity-60' : ''}>

                {tab === 'bulanan' && (
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th className={th}>Bulan</th><th className={thr}>Masuk</th><th className={thr}>Keluar</th>
                        <th className={thr}>Selisih</th><th className={thr}>Saldo Berjalan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyRows.length === 0 && <tr><td colSpan={5} className="py-4 text-center opacity-55">Belum ada transaksi.</td></tr>}
                      {monthlyRows.map((m) => (
                        <tr key={m.month} className="border-t border-current/10">
                          <td className={td}>{mLabel(m.month)}</td>
                          <td className={`${tdr} text-green-600`}>{rupiah(m.income)}</td>
                          <td className={`${tdr} text-red-600`}>{rupiah(m.expense)}</td>
                          <td className={`${tdr} ${m.diff < 0 ? 'text-red-600' : ''}`}>{rupiah(m.diff)}</td>
                          <td className={`${tdr} font-medium`}>{rupiah(m.run)}</td>
                        </tr>
                      ))}
                      {monthlyRows.length > 0 && (
                        <tr className="border-t-2 border-current/25 font-bold">
                          <td className="py-2 text-xs uppercase opacity-60">Total</td>
                          <td className={`${tdr} text-green-600`}>{rupiah(report.income)}</td>
                          <td className={`${tdr} text-red-600`}>{rupiah(report.expense)}</td>
                          <td className={tdr}>{rupiah(report.balance)}</td>
                          <td />
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}

                {tab === 'sheet' && (
                  <>
                    {/* Pil bulan — satu "sheet" per bulan */}
                    {monthKeys.length === 0 && <p className="py-4 text-center text-sm opacity-55">Belum ada transaksi pada rentang ini.</p>}
                    {monthKeys.length > 0 && (
                      <>
                        <div className="mb-4 flex flex-wrap gap-1.5">
                          {monthKeys.map((m) => (
                            <button
                              key={m}
                              onClick={() => setBulanSel(m)}
                              className={`rounded-lg border px-3 py-1 text-xs font-medium transition ${
                                m === bulanAktif ? 'border-cyan-700 bg-cyan-700 text-white' : 'border-current/20 hover:border-current/40'
                              }`}
                            >
                              {mLabel(m)}
                            </button>
                          ))}
                        </div>
                        <div className="mb-3 grid gap-3 sm:grid-cols-3">
                          <div className="rounded-lg border border-current/10 px-4 py-3">
                            <p className="text-xs uppercase opacity-55">Pemasukan {mLabel(bulanAktif)}</p>
                            <p className="text-lg font-bold text-green-600">{rupiah(bulanRows.inTot)}</p>
                          </div>
                          <div className="rounded-lg border border-current/10 px-4 py-3">
                            <p className="text-xs uppercase opacity-55">Pengeluaran {mLabel(bulanAktif)}</p>
                            <p className="text-lg font-bold text-red-600">{rupiah(bulanRows.outTot)}</p>
                          </div>
                          <div className="rounded-lg border border-current/10 px-4 py-3">
                            <p className="text-xs uppercase opacity-55">Saldo akhir {mLabel(bulanAktif)}</p>
                            <p className={`text-lg font-bold ${saldoBulan < 0 ? 'text-red-600' : ''}`}>{rupiah(saldoBulan)}</p>
                          </div>
                        </div>
                        <div className="grid gap-6 lg:grid-cols-2">
                          <div>
                            <p className="mb-2 text-sm font-semibold text-green-700">Pemasukan</p>
                            <table className="w-full text-sm">
                              <thead>
                                <tr><th className={th}>Tanggal</th><th className={th}>Uraian</th><th className={thr}>Jumlah</th></tr>
                              </thead>
                              <tbody>
                                {bulanRows.inc.length === 0 && <tr><td colSpan={3} className="py-3 text-center opacity-50">—</td></tr>}
                                {bulanRows.inc.map((t) => (
                                  <tr key={t.id} className="border-t border-current/10">
                                    <td className={`${td} whitespace-nowrap text-xs opacity-70`}>{t.occurredAt.slice(0, 10)}</td>
                                    <td className={`${td} max-w-56 truncate`} title={t.description ?? ''}>
                                      {t.description ?? '—'}
                                      <span className="block text-xs opacity-55">{t.category?.name ?? ''}{t.cashAccount ? ` · ${t.cashAccount.name}` : ''}</span>
                                    </td>
                                    <td className={`${tdr} text-green-600`}>{rupiah(t.amount)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <div>
                            <p className="mb-2 text-sm font-semibold text-red-700">Pengeluaran</p>
                            <table className="w-full text-sm">
                              <thead>
                                <tr><th className={th}>Tanggal</th><th className={th}>Uraian</th><th className={thr}>Jumlah</th></tr>
                              </thead>
                              <tbody>
                                {bulanRows.exp.length === 0 && <tr><td colSpan={3} className="py-3 text-center opacity-50">—</td></tr>}
                                {bulanRows.exp.map((t) => (
                                  <tr key={t.id} className="border-t border-current/10">
                                    <td className={`${td} whitespace-nowrap text-xs opacity-70`}>{t.occurredAt.slice(0, 10)}</td>
                                    <td className={`${td} max-w-56 truncate`} title={t.description ?? ''}>
                                      {t.description ?? '—'}
                                      <span className="block text-xs opacity-55">{t.category?.name ?? ''}{t.cashAccount ? ` · ${t.cashAccount.name}` : ''}</span>
                                    </td>
                                    <td className={`${tdr} text-red-600`}>{rupiah(t.amount)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                        <div className="mt-4 border-t-2 border-current/25 pt-3 text-sm font-bold">
                          Selisih {mLabel(bulanAktif)}: {rupiah(bulanRows.inTot - bulanRows.outTot)}
                        </div>
                      </>
                    )}
                  </>
                )}

                {tab === 'kategori' && (
                  <>
                    <table className="w-full text-sm">
                      <thead>
                        <tr><th className={th}>Kategori</th><th className={th}>Tipe</th><th className={thr}>Masuk</th><th className={thr}>Keluar</th></tr>
                      </thead>
                      <tbody>
                        {kategoriRows.length === 0 && <tr><td colSpan={4} className="py-4 text-center opacity-55">Belum ada transaksi.</td></tr>}
                        {kategoriRows.map((r) => (
                          <tr key={r.type + r.name} className="border-t border-current/10">
                            <td className={td}>{r.name}</td>
                            <td className={`${td} text-xs opacity-60`}>{r.type}</td>
                            <td className={`${tdr} text-green-600`}>{r.masuk ? rupiah(r.masuk) : ''}</td>
                            <td className={`${tdr} text-red-600`}>{r.keluar ? rupiah(r.keluar) : ''}</td>
                          </tr>
                        ))}
                        {kategoriRows.length > 0 && (
                          <tr className="border-t-2 border-current/25 font-bold">
                            <td className="py-2 text-xs uppercase opacity-60" colSpan={2}>Total</td>
                            <td className={`${tdr} text-green-600`}>{rupiah(report.income)}</td>
                            <td className={`${tdr} text-red-600`}>{rupiah(report.expense)}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>

                    {/* Rincian transaksi satu kategori */}
                    <div className="mt-6 border-t border-current/10 pt-4">
                      <div className="mb-3 flex flex-wrap items-center gap-3">
                        <span className="text-sm font-semibold">Rincian transaksi kategori</span>
                        <Select value={katId} onChange={(e) => setKatId(e.target.value)} className="h-9 w-56 text-xs" aria-label="Pilih kategori">
                          <option value="">— Pilih kategori —</option>
                          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </Select>
                      </div>
                      {katId && katRows.length > 0 && (
                        <table className="w-full text-sm">
                          <thead>
                            <tr><th className={th}>Tanggal</th><th className={th}>Deskripsi</th><th className={th}>Kas</th><th className={thr}>Masuk</th><th className={thr}>Keluar</th></tr>
                          </thead>
                          <tbody>
                            {katRows.map((t) => (
                              <tr key={t.id} className="border-t border-current/10">
                                <td className={`${td} whitespace-nowrap text-xs opacity-70`}>{t.occurredAt.slice(0, 10)}</td>
                                <td className={`${td} max-w-72 truncate`} title={t.description ?? ''}>{t.description ?? '—'}</td>
                                <td className={`${td} text-xs opacity-70`}>{t.cashAccount?.name ?? '—'}</td>
                                <td className={`${tdr} text-green-600`}>{t.type === 'INCOME' ? rupiah(t.amount) : ''}</td>
                                <td className={`${tdr} text-red-600`}>{t.type === 'EXPENSE' ? rupiah(t.amount) : ''}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                      {katId && katRows.length === 0 && <p className="text-sm opacity-55">Tidak ada transaksi pada periode ini.</p>}
                    </div>
                  </>
                )}

                {tab === 'sumber' && (
                  <table className="w-full text-sm">
                    <thead>
                      <tr><th className={th}>Sumber</th><th className={thr}>Masuk</th><th className={thr}>Keluar</th><th className={thr}>Net</th></tr>
                    </thead>
                    <tbody>
                      {sumberRows.length === 0 && <tr><td colSpan={4} className="py-4 text-center opacity-55">Belum ada transaksi.</td></tr>}
                      {sumberRows.map((r) => (
                        <tr key={r.source} className="border-t border-current/10">
                          <td className={td}>{SRC_LABEL[r.source] ?? r.source}</td>
                          <td className={`${tdr} text-green-600`}>{r.masuk ? rupiah(r.masuk) : ''}</td>
                          <td className={`${tdr} text-red-600`}>{r.keluar ? rupiah(r.keluar) : ''}</td>
                          <td className={`${tdr} font-medium`}>{rupiah(r.masuk - r.keluar)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {tab === 'kas' && (
                  <>
                    <table className="w-full text-sm">
                      <thead>
                        <tr><th className={th}>Kas</th><th className={thr}>Masuk</th><th className={thr}>Keluar</th><th className={thr}>Net (Sisa)</th></tr>
                      </thead>
                      <tbody>
                        {report.byCashAccount.map((a) => (
                          <tr key={a.accountId} className="border-t border-current/10">
                            <td className={td}>{a.name}</td>
                            <td className={`${tdr} text-green-600`}>{rupiah(a.income)}</td>
                            <td className={`${tdr} text-red-600`}>{rupiah(a.expense)}</td>
                            <td className={`${tdr} font-medium`}>{rupiah(a.net)}</td>
                          </tr>
                        ))}
                        <tr className="border-t-2 border-current/25 font-bold">
                          <td className="py-2 text-xs uppercase opacity-60">Total</td>
                          <td className={`${tdr} text-green-600`}>{rupiah(report.income)}</td>
                          <td className={`${tdr} text-red-600`}>{rupiah(report.expense)}</td>
                          <td className={tdr}>{rupiah(report.balance)}</td>
                        </tr>
                      </tbody>
                    </table>

                    {/* Rincian satu kas — buku kas periode ini */}
                    <div className="mt-6 border-t border-current/10 pt-4">
                      <div className="mb-3 flex flex-wrap items-center gap-3">
                        <span className="text-sm font-semibold">Buku kas per akun</span>
                        <Select value={kasId} onChange={(e) => setKasId(e.target.value)} className="h-9 w-56 text-xs" aria-label="Pilih kas">
                          <option value="">— Pilih kas —</option>
                          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </Select>
                      </div>
                      {kasId && kasLedger && kasLedger.items.length > 0 && (
                        <table className="w-full text-sm">
                          <thead>
                            <tr><th className={th}>Tanggal</th><th className={th}>Uraian</th><th className={thr}>Masuk</th><th className={thr}>Keluar</th><th className={thr}>Saldo</th></tr>
                          </thead>
                          <tbody>
                            <tr className="bg-current/5 font-semibold">
                              <td className="py-1.5 text-xs uppercase opacity-60" colSpan={4}>Saldo awal</td>
                              <td className={`${tdr} font-semibold`}>{rupiah(kasLedger.opening)}</td>
                            </tr>
                            {kasLedger.items.map((m) => (
                              <tr key={m.id} className="border-t border-current/10">
                                <td className={`${td} whitespace-nowrap text-xs opacity-70`}>{m.occurredAt.slice(0, 10)}</td>
                                <td className={td}>{m.description ?? m.refType}</td>
                                <td className={`${tdr} text-green-600`}>{m.direction === 'IN' ? rupiah(m.amount) : ''}</td>
                                <td className={`${tdr} text-red-600`}>{m.direction === 'OUT' ? rupiah(m.amount) : ''}</td>
                                <td className={`${tdr} font-medium`}>{rupiah(m.balance)}</td>
                              </tr>
                            ))}
                            <tr className="border-t-2 border-current/25 font-bold">
                              <td className="py-2 text-xs uppercase opacity-60" colSpan={2}>Total periode</td>
                              <td className={`${tdr} text-green-600`}>{rupiah(kasIn)}</td>
                              <td className={`${tdr} text-red-600`}>{rupiah(kasOut)}</td>
                              <td className={tdr}>{rupiah(kasLedger.closing)}</td>
                            </tr>
                          </tbody>
                        </table>
                      )}
                      {kasId && (!kasLedger || kasLedger.items.length === 0) && <p className="text-sm opacity-55">Tidak ada gerakan pada periode ini.</p>}
                    </div>
                  </>
                )}

                {tab === 'siswa' && (
                  <>
                    <div className="mb-4 flex flex-wrap items-end gap-3">
                      <Field label="Jenjang" className="w-36">
                        <Select value={siswaJenjang} onChange={(e) => { setSiswaJenjang(e.target.value); setSiswaKelas(''); }}>
                          <option value="">Semua</option>
                          {siswaData.jenjangs.map((g) => <option key={g} value={g}>Jenjang {g}</option>)}
                        </Select>
                      </Field>
                      <Field label="Kelas" className="w-44">
                        <Select value={siswaKelas} onChange={(e) => setSiswaKelas(e.target.value)}>
                          <option value="">Semua kelas</option>
                          {siswaData.kelasNames.map((k) => <option key={k} value={k}>{k}</option>)}
                        </Select>
                      </Field>
                      <p className="pb-2 text-xs opacity-55">
                        {siswaKelas ? 'Rincian per siswa' : siswaJenjang ? 'Rincian per kelas' : 'Rincian per jenjang'} — pilih kelas untuk melihat tiap siswa.
                      </p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr>
                            <th className={th}>{siswaKelas ? 'Siswa' : siswaJenjang ? 'Kelas' : 'Jenjang'}</th>
                            {siswaData.months.map((m) => <th key={m} className={`${thr} whitespace-nowrap`}>{mLabel(m)}</th>)}
                            <th className={thr}>Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {siswaData.rows.length === 0 && (
                            <tr><td colSpan={siswaData.months.length + 2} className="py-4 text-center opacity-55">Belum ada pembayaran tagihan pada rentang ini.</td></tr>
                          )}
                          {siswaData.rows.map((r) => (
                            <tr key={r.key} className="border-t border-current/10">
                              <td className={td}>
                                {r.label}
                                {r.sub ? <span className="block text-xs opacity-55">{r.sub}</span> : null}
                              </td>
                              {r.cells.map((c, i) => (
                                <td key={i} className={`${tdr} ${c ? 'text-green-700' : 'opacity-30'}`}>{c ? rupiah(c) : '—'}</td>
                              ))}
                              <td className={`${tdr} font-semibold`}>{rupiah(r.total)}</td>
                            </tr>
                          ))}
                          {siswaData.rows.length > 0 && (
                            <tr className="border-t-2 border-current/25 font-bold">
                              <td className="py-2 text-xs uppercase opacity-60">Total</td>
                              {siswaData.colTot.map((c, i) => <td key={i} className={tdr}>{c ? rupiah(c) : '—'}</td>)}
                              <td className={tdr}>{rupiah(siswaData.grand)}</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                {tab === 'kelas' && (
                  !invoices ? <p className="py-4 text-sm opacity-55">Memuat tagihan…</p> : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr><th className={th}>Kelas</th><th className={thr}>Jml Tagihan</th><th className={thr}>Total</th><th className={thr}>Terbayar</th><th className={thr}>Sisa</th></tr>
                      </thead>
                      <tbody>
                        {byKelas.length === 0 && <tr><td colSpan={5} className="py-4 text-center opacity-55">Belum ada tagihan.</td></tr>}
                        {byKelas.map((r) => (
                          <tr key={r.name} className="border-t border-current/10">
                            <td className={td}>{r.name}</td>
                            <td className={tdr}>{r.count}</td>
                            <td className={tdr}>{rupiah(r.total)}</td>
                            <td className={`${tdr} text-green-600`}>{rupiah(r.paid)}</td>
                            <td className={`${tdr} ${r.sisa > 0 ? 'font-medium text-amber-600' : ''}`}>{rupiah(r.sisa)}</td>
                          </tr>
                        ))}
                        {byKelas.length > 0 && (
                          <tr className="border-t-2 border-current/25 font-bold">
                            <td className="py-2 text-xs uppercase opacity-60">Total</td>
                            <td className={tdr}>{byKelas.reduce((s, r) => s + r.count, 0)}</td>
                            <td className={tdr}>{rupiah(byKelas.reduce((s, r) => s + r.total, 0))}</td>
                            <td className={`${tdr} text-green-600`}>{rupiah(byKelas.reduce((s, r) => s + r.paid, 0))}</td>
                            <td className={tdr}>{rupiah(byKelas.reduce((s, r) => s + r.sisa, 0))}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  )
                )}

                {tab === 'jenjang' && (
                  !invoices ? <p className="py-4 text-sm opacity-55">Memuat tagihan…</p> : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr><th className={th}>Jenjang</th><th className={thr}>Jml Tagihan</th><th className={thr}>Total</th><th className={thr}>Terbayar</th><th className={thr}>Sisa</th></tr>
                      </thead>
                      <tbody>
                        {byJenjang.length === 0 && <tr><td colSpan={5} className="py-4 text-center opacity-55">Belum ada tagihan.</td></tr>}
                        {byJenjang.map((r) => (
                          <tr key={r.name} className="border-t border-current/10">
                            <td className={td}>{r.name}</td>
                            <td className={tdr}>{r.count}</td>
                            <td className={tdr}>{rupiah(r.total)}</td>
                            <td className={`${tdr} text-green-600`}>{rupiah(r.paid)}</td>
                            <td className={`${tdr} ${r.sisa > 0 ? 'font-medium text-amber-600' : ''}`}>{rupiah(r.sisa)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )
                )}

                {tab === 'piutang' && (
                  !invoices ? <p className="py-4 text-sm opacity-55">Memuat tagihan…</p> : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr>
                          <th className={th}>Siswa</th><th className={th}>Kelas</th><th className={th}>No HP Ortu</th>
                          <th className={th}>Tagihan</th><th className={th}>Jatuh Tempo</th><th className={thr}>Sisa</th>
                        </tr>
                      </thead>
                      <tbody>
                        {piutangRows.length === 0 && <tr><td colSpan={6} className="py-4 text-center opacity-55">Semua tagihan lunas.</td></tr>}
                        {piutangRows.map((i) => (
                          <tr key={i.id} className="border-t border-current/10">
                            <td className={td}>
                              {i.student?.id ? (
                                <Link href={`/kesiswaan/${i.student.id}`} className="hover:underline">{i.student.name}</Link>
                              ) : '—'}
                            </td>
                            <td className={`${td} text-xs opacity-70`}>{i.class?.name ?? '—'}</td>
                            <td className={`${td} text-xs`}>{phoneLocal(i.student?.parent?.phone) || '—'}</td>
                            <td className={`${td} max-w-64 truncate`} title={i.title}>{i.title}</td>
                            <td className={`${td} whitespace-nowrap text-xs opacity-70`}>{i.dueAt ? i.dueAt.slice(0, 10) : '—'}</td>
                            <td className={`${tdr} font-medium text-amber-600`}>{rupiah(i.remaining)}</td>
                          </tr>
                        ))}
                        {piutangRows.length > 0 && (
                          <tr className="border-t-2 border-current/25 font-bold">
                            <td className="py-2 text-xs uppercase opacity-60" colSpan={5}>Total piutang</td>
                            <td className={`${tdr} text-amber-600`}>{rupiah(piutangRows.reduce((s, i) => s + i.remaining, 0))}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  )
                )}

                {tab === 'tabloan' && (
                  <>
                    <div className="mb-5 grid gap-3 sm:grid-cols-4">
                      <div className="rounded-lg border border-current/10 px-4 py-3">
                        <p className="text-xs uppercase opacity-55">Setor tabungan</p>
                        <p className="text-lg font-bold text-green-600">{rupiah(report.savings.in)}</p>
                      </div>
                      <div className="rounded-lg border border-current/10 px-4 py-3">
                        <p className="text-xs uppercase opacity-55">Tarik tabungan</p>
                        <p className="text-lg font-bold text-red-600">{rupiah(report.savings.out)}</p>
                      </div>
                      <div className="rounded-lg border border-current/10 px-4 py-3">
                        <p className="text-xs uppercase opacity-55">Pinjaman dicairkan</p>
                        <p className="text-lg font-bold">{rupiah(report.loans.disbursedAmount)}</p>
                        <p className="text-xs opacity-55">{report.loans.disbursedCount} pinjaman</p>
                      </div>
                      <div className="rounded-lg border border-current/10 px-4 py-3">
                        <p className="text-xs uppercase opacity-55">Sisa pinjaman berjalan</p>
                        <p className="text-lg font-bold text-amber-600">{rupiah(report.loans.outstanding)}</p>
                        <p className="text-xs opacity-55">tercicil {rupiah(report.loans.repaidAmount)}</p>
                      </div>
                    </div>
                    <p className="mb-2 text-sm font-semibold">Tabungan per bulan</p>
                    <table className="w-full text-sm">
                      <thead>
                        <tr><th className={th}>Bulan</th><th className={thr}>Setor</th><th className={thr}>Tarik</th><th className={thr}>Net</th></tr>
                      </thead>
                      <tbody>
                        {report.savings.monthly.length === 0 && <tr><td colSpan={4} className="py-4 text-center opacity-55">Belum ada gerakan tabungan.</td></tr>}
                        {report.savings.monthly.map((m) => (
                          <tr key={m.month} className="border-t border-current/10">
                            <td className={td}>{mLabel(m.month)}</td>
                            <td className={`${tdr} text-green-600`}>{rupiah(m.in)}</td>
                            <td className={`${tdr} text-red-600`}>{rupiah(m.out)}</td>
                            <td className={`${tdr} font-medium`}>{rupiah(m.in - m.out)}</td>
                          </tr>
                        ))}
                        {report.savings.monthly.length > 0 && (
                          <tr className="border-t-2 border-current/25 font-bold">
                            <td className="py-2 text-xs uppercase opacity-60">Total</td>
                            <td className={`${tdr} text-green-600`}>{rupiah(report.savings.in)}</td>
                            <td className={`${tdr} text-red-600`}>{rupiah(report.savings.out)}</td>
                            <td className={tdr}>{rupiah(report.savings.in - report.savings.out)}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </>
                )}

                {tab === 'rab' && (
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th className={th}>Kategori</th><th className={thr}>Rencana</th><th className={thr}>Realisasi</th>
                        <th className={thr}>Selisih</th><th className={`${th} w-40`}>%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.budgets.length === 0 && <tr><td colSpan={5} className="py-4 text-center opacity-55">Belum ada anggaran untuk TA ini.</td></tr>}
                      {report.budgets.map((b) => (
                        <tr key={b.categoryId} className="border-t border-current/10">
                          <td className={td}>
                            {b.name}
                            <span className="ml-2 text-xs opacity-50">{b.type === 'INCOME' ? 'pemasukan' : 'pengeluaran'}</span>
                          </td>
                          <td className={tdr}>{rupiah(b.planned)}</td>
                          <td className={tdr}>{rupiah(b.actual)}</td>
                          <td className={`${tdr} ${b.diff < 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {b.diff < 0 ? '-' : ''}{rupiah(Math.abs(b.diff))}
                          </td>
                          <td className={td}>
                            <div className="flex items-center gap-2">
                              <div className="h-2 flex-1 rounded-full" style={{ background: 'color-mix(in srgb, currentColor 8%, transparent)' }}>
                                <div
                                  className={`h-2 rounded-full ${b.pct > 100 ? 'bg-red-500' : b.pct > 80 ? 'bg-amber-500' : 'bg-green-600'}`}
                                  style={{ width: `${Math.min(100, b.pct)}%` }}
                                />
                              </div>
                              <span className="w-10 text-right text-xs tabular-nums">{b.pct}%</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Widget>

              {/* Ringkasan bawah */}
              <div className="mt-4 flex flex-wrap gap-6 text-sm">
                <span>Pemasukan: <b className="text-green-600">{rupiah(report.income)}</b></span>
                <span>Pengeluaran: <b className="text-red-600">{rupiah(report.expense)}</b></span>
                <span>Selisih: <b className={report.balance >= 0 ? 'text-cyan-700' : 'text-red-600'}>{rupiah(report.balance)}</b></span>
                {report.expenseByStandard.length > 0 && report.expenseByStandard[0] ? (
                  <span className="opacity-70">
                    Standar terbesar: {STD_FULL[report.expenseByStandard[0].group] ?? report.expenseByStandard[0].group} ({rupiah(report.expenseByStandard[0].total)})
                  </span>
                ) : null}
              </div>
            </div>
          )}
        </>
      )}
    </Shell>
  );
}
