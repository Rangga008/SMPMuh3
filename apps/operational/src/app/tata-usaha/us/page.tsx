'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { Badge, Button, Field, Input, Modal, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { DataTable } from '@/components/data-table';
import { PageTitle, StatCard, Widget } from '@/components/widgets';
import {
  createExamRecord,
  deleteExamRecord,
  listAcademicYears,
  listClasses,
  listExamRecords,
  updateExamRecord,
  type AcademicYear,
  type ExamRecord,
} from '@/lib/api';
import {
  createGraduationCategory,
  deleteGraduationCategory,
  getUsCandidates,
  listGraduationCategories,
  updateGraduation,
  updateGraduationCategory,
  type GraduationCategory,
  type UsCandidate,
  type UsCandidates,
} from '@/lib/api-ops';
import { PERMISSIONS } from '@smpmuh3/types';
import { me } from '@/lib/api';
import { esc as escPrint } from '@/lib/print';

import { RowBtn } from '@/components/row-btn';
import { useConfirm } from '@/components/confirm-dialog';
const RESULT: Record<ExamRecord['result'], { label: string; tone: 'primary' | 'accent' | 'danger' }> = {
  PENDING: { label: 'Belum Dinilai', tone: 'accent' },
  PASSED: { label: 'Lulus', tone: 'primary' },
  FAILED: { label: 'Tidak Lulus', tone: 'danger' },
};

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export default function UsPage() {
  const { confirm, dialog } = useConfirm();
  const [period, setPeriod] = useState<'US1' | 'US2'>('US1');
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [yearId, setYearId] = useState('');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<ExamRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<ExamRecord | 'new' | null>(null);
  const [docGrade, setDocGrade] = useState<number>(9);
  const [docBusy, setDocBusy] = useState(false);
  const [gradeOpts, setGradeOpts] = useState<number[]>([7, 8, 9]);
  // Data administrasi siswa (kandidat US) — tabel + edit + kategori pasca-lulus.
  const [usData, setUsData] = useState<UsCandidates | null>(null);
  const [usLoading, setUsLoading] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [categories, setCategories] = useState<GraduationCategory[]>([]);
  const [editStu, setEditStu] = useState<(UsCandidate & { rombel: string }) | null>(null);
  const [catModal, setCatModal] = useState(false);

  useEffect(() => {
    listAcademicYears()
      .then((ys) => {
        setYears(ys);
        const active = ys.find((y) => y.isActive) ?? ys[0];
        if (active) setYearId(active.id);
      })
      .catch(() => setError('Gagal memuat tahun ajaran.'));
  }, []);

  useEffect(() => {
    if (!yearId) return;
    listClasses(yearId).then((cs) => {
      const g = [...new Set(cs.map((c) => c.gradeLevel))].sort((a, b) => a - b);
      if (g.length) setGradeOpts(g);
      if (g.length && !g.includes(docGrade)) setDocGrade(Math.max(...g));
    }).catch(() => {});
  }, [yearId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    me().then((u) => setCanManage(u.permissions.includes(PERMISSIONS.STUDENT_MANAGE))).catch(() => undefined);
    listGraduationCategories().then(setCategories).catch(() => undefined);
  }, []);

  const loadUs = useCallback(() => {
    if (!yearId) return;
    setUsLoading(true);
    getUsCandidates(yearId, docGrade)
      .then(setUsData)
      .catch(() => setError('Gagal memuat data siswa.'))
      .finally(() => setUsLoading(false));
  }, [yearId, docGrade]);

  useEffect(() => { loadUs(); }, [loadUs]);

  const KOP_CSS = `
    body{font-family:'Times New Roman',serif;color:#111;margin:14px;font-size:11pt}
    .kop{display:flex;align-items:center;gap:14px;border-bottom:3px double #111;padding-bottom:8px;margin-bottom:10px}
    .kop img{height:60px}
    .kop .mid{flex:1;text-align:center}
    .kop .yayasan{font-size:10.5pt}.kop .nama{font-size:15pt;font-weight:800;color:#0f3a63}
    .kop .alamat{font-size:9.5pt}
    .kop .kanan{text-align:right;font-size:9pt;line-height:1.4}
    h1{text-align:center;font-size:13pt;margin:8px 0 2px;text-decoration:underline}
    h2{text-align:center;font-size:11pt;margin:0 0 10px;font-weight:400}
    table.us{width:100%;border-collapse:collapse;font-size:8.2pt;margin-bottom:16px}
    .us th,.us td{border:1px solid #111;padding:3px 4px;vertical-align:top}
    .us th{background:#eee;text-align:center}
    .us td.c{text-align:center}
    .kelas{font-weight:800;font-size:11pt;margin:12px 0 4px}
    .ttd{display:flex;justify-content:space-between;margin-top:20px;font-size:10.5pt}
    .ttd div{text-align:center;width:230px}
    .ttd .nm{margin-top:60px;text-decoration:underline;font-weight:700}
    @page{size:A4 landscape;margin:10mm}
    @media print{.kelas,.us{page-break-inside:avoid} h1{page-break-after:avoid}}
  `;
  const kop = (school: { name?: string; logoUrl?: string | null; npsn?: string | null; address?: string | null } | null) => `
    <div class="kop">
      ${school?.logoUrl ? `<img src="/logo.png" onerror="this.style.display='none'"/>` : ''}
      <div class="mid">
        <div class="yayasan">MAJELIS PENDIDIKAN DASAR DAN MENENGAH<br>PIMPINAN DAERAH MUHAMMADIYAH KOTA BANDUNG</div>
        <div class="nama">${escPrint((school?.name ?? 'SMP MUHAMMADIYAH 3 KOTA BANDUNG').toUpperCase())}</div>
        <div class="alamat">${escPrint(school?.address ?? '')}</div>
      </div>
      <div class="kanan">NPSN<br>${escPrint(school?.npsn ?? '—')}</div>
    </div>`;
  const esc = (v?: string | null) => escPrint(v ?? '—');

  async function printUs(kind: 'us1' | 'us2') {
    if (!yearId) return;
    setDocBusy(true); setError(null);
    try {
      const d = await getUsCandidates(yearId, docGrade);
      const w = window.open('', '_blank', 'width=860,height=900');
      if (!w) return;
      const school = d.school;
      let body = '';
      if (kind === 'us1') {
        body = `<h1>DAFTAR CALON PESERTA UJIAN SEKOLAH (US-1)</h1>
          <h2>Tahun Pelajaran ${esc(d.academicYear.name)}</h2>` +
          d.classes.map((c) => `
            <p class="kelas">Rombel: ${esc(c.name)} &nbsp;·&nbsp; Wali Kelas: ${esc(c.homeroom ?? '—')}</p>
            <table class="us"><thead><tr>
              <th style="width:22px">No</th><th>NISN</th><th>NIS</th><th>Nama Peserta</th>
              <th style="width:24px">L/P</th><th>Rombel</th><th>Agama</th><th>Nama Orang Tua/Wali</th>
              <th>Tempat Lahir</th><th>Tgl Lahir</th><th style="width:30px">Absen</th>
              <th>Token / Kode</th><th>No. Ijazah</th>
              <th style="width:52px">TA Kls 7</th><th style="width:52px">TA Kls 8</th><th style="width:52px">TA Kls 9</th>
            </tr></thead><tbody>
            ${c.students.map((s, i) => `<tr>
              <td class="c">${i + 1}</td><td>${esc(s.nisn)}</td><td>${esc(s.nis)}</td>
              <td>${esc(s.name)}</td><td class="c">${s.gender === 'MALE' ? 'L' : s.gender === 'FEMALE' ? 'P' : '—'}</td>
              <td class="c">${esc(c.name)}</td><td class="c">${esc(s.agama)}</td>
              <td>${esc(s.fatherName ?? s.parent?.name ?? s.motherName)}</td>
              <td>${esc(s.birthPlace)}</td><td>${s.birthDate ? esc(new Date(s.birthDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })) : '—'}</td>
              <td class="c">${esc(s.absenceNo?.toString())}</td>
              <td>${[s.password, s.examCode].filter(Boolean).map(esc).join('<br>') || '—'}</td>
              <td>${esc(s.diplomaNo)}</td>
              <td class="c">${esc(s.rapor?.[7])}</td><td class="c">${esc(s.rapor?.[8])}</td><td class="c">${esc(s.rapor?.[9])}</td>
            </tr>`).join('')}
            </tbody></table>`).join('') +
          `<div class="ttd"><div>Mengetahui,<br>Kepala Sekolah<div class="nm">${esc(school?.headmaster ?? '(………………………)')}</div>NIP/NUPTK. ${esc(school?.headmasterNip ?? '……………')}</div>
           <div>Bandung, ………………… 20…<br>Panitia Ujian Sekolah<div class="nm">(………………………)</div>NIP/NUPTK. ……………</div></div>`;
      } else {
        const tL = d.classes.reduce((a, c) => a + c.male, 0);
        const tP = d.classes.reduce((a, c) => a + c.female, 0);
        body = `<h1>DAFTAR REKAPITULASI CALON PESERTA UJIAN SEKOLAH (US-2)</h1>
          <h2>Tahun Pelajaran ${esc(d.academicYear.name)}</h2>
          <table class="us"><thead><tr>
            <th style="width:30px">No</th><th>Rombongan Belajar</th><th>Wali Kelas</th>
            <th style="width:70px">Laki-laki</th><th style="width:70px">Perempuan</th><th style="width:70px">Jumlah</th>
          </tr></thead><tbody>
          ${d.classes.map((c, i) => `<tr>
            <td style="text-align:center">${i + 1}</td><td>${esc(c.name)}</td><td>${esc(c.homeroom ?? '—')}</td>
            <td style="text-align:center">${c.male}</td><td style="text-align:center">${c.female}</td><td style="text-align:center"><b>${c.total}</b></td>
          </tr>`).join('')}
          <tr><td colspan="3" style="text-align:center;font-weight:800">JUMLAH</td>
            <td style="text-align:center;font-weight:800">${tL}</td>
            <td style="text-align:center;font-weight:800">${tP}</td>
            <td style="text-align:center;font-weight:800">${tL + tP}</td></tr>
          </tbody></table>
          <div class="ttd"><div>Mengetahui,<br>Kepala Sekolah<div class="nm">${esc(school?.headmaster ?? '(………………………)')}</div>NIP/NUPTK. ${esc(school?.headmasterNip ?? '……………')}</div>
           <div>Bandung, ………………… 20…<br>Panitia Ujian Sekolah<div class="nm">(………………………)</div>NIP/NUPTK. ……………</div></div>`;
      }
      w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${kind === 'us1' ? 'US-1 Daftar Calon Peserta' : 'US-2 Rekapitulasi'}</title><style>${KOP_CSS}</style></head><body>${kop(school)}${body}<script>window.print()</script></body></html>`);
      w.document.close();
    } catch (e) { setError(e instanceof Error ? e.message : 'Gagal membuat dokumen.'); }
    finally { setDocBusy(false); }
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listExamRecords(period, yearId || undefined, search || undefined));
      setError(null);
    } catch {
      setError('Gagal memuat rekap ujian.');
    } finally {
      setLoading(false);
    }
  }, [period, yearId, search]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 300);
    return () => clearTimeout(t);
  }, [load]);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await fn();
      setModal(null);
      setNotice(ok);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Aksi gagal.');
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const val = (k: string) => String(f.get(k) ?? '').trim() || undefined;
    const dto = {
      studentName: val('studentName'),
      nisn: val('nisn') ?? null,
      score: val('score') ? Number(val('score')) : null,
      result: (val('result') ?? 'PENDING') as ExamRecord['result'],
      notes: val('notes') ?? null,
    };
    if (modal === 'new') {
      await run(
        () => createExamRecord({ ...dto, period, academicYearId: yearId }),
        'Catatan ujian ditambah.',
      );
    } else if (modal) {
      await run(() => updateExamRecord(modal.id, dto), 'Catatan diperbarui.');
    }
  }

  const passed = rows.filter((r) => r.result === 'PASSED').length;
  const failed = rows.filter((r) => r.result === 'FAILED').length;

  return (
    <Shell>
      <PageTitle
        title="Administrasi Ujian Sekolah Kelas 9"
        subtitle="Rekap hasil Ujian Sekolah (US 1 & 2) per periode dan tahun ajaran"
        actions={
          <Button size="sm" onClick={async () => setModal('new')} disabled={!yearId}>
            + Tambah Catatan
          </Button>
        }
      />
      {error ? (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
      ) : null}
      {notice ? (
        <p role="status" className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{notice}</p>
      ) : null}

      <div className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl border border-sand-200 bg-white p-4 shadow-card">
        <div>
          <p className="text-sm font-bold text-sand-900">Dokumen US-1 / US-2</p>
          <p className="text-xs text-sand-500">US-1: daftar calon peserta per rombel · US-2: rekapitulasi jumlah peserta</p>
        </div>
        <Field label="Jenjang" className="w-32">
          <Select value={String(docGrade)} onChange={(e) => setDocGrade(Number(e.target.value))} searchable={false}>
            {gradeOpts.map((g) => <option key={g} value={g}>Kelas {g}</option>)}
          </Select>
        </Field>
        <Button size="sm" variant="outline" onClick={() => void printUs('us1')} disabled={docBusy || !yearId}>🖨 Cetak US-1</Button>
        <Button size="sm" variant="outline" onClick={() => void printUs('us2')} disabled={docBusy || !yearId}>🖨 Cetak US-2</Button>
        <span className="grow" />
        {canManage ? (
          <Button size="sm" variant="outline" onClick={() => setCatModal(true)}>⚙ Kategori Kelanjutan</Button>
        ) : null}
      </div>

      {/* Data administrasi siswa kelas 9 — sesuai kolom buku induk US:
          NISN, NIS, Nama, L/P, Rombel, Agama, Ortu, TTL, Absen, Token/Kode,
          No Ijazah, TA rapor 7/8/9, status ijazah & transkrip, kelanjutan. */}
      <Widget title={`Data Siswa Kelas ${docGrade} — ${usData ? `${usData.classes.reduce((a, c) => a + c.total, 0)} siswa` : '…'}`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1450px] text-sm">
            <thead>
              <tr className="border-b border-sand-200 text-left text-[11px] uppercase tracking-wide text-sand-500">
                <th className="px-2 py-2">No</th><th className="px-2 py-2">NISN</th><th className="px-2 py-2">NIS</th>
                <th className="px-2 py-2">Nama</th><th className="px-2 py-2">L/P</th><th className="px-2 py-2">Rombel</th>
                <th className="px-2 py-2">Agama</th><th className="px-2 py-2">Orang Tua</th>
                <th className="px-2 py-2">Tempat Lahir</th><th className="px-2 py-2">Tgl Lahir</th>
                <th className="px-2 py-2">Absen</th><th className="px-2 py-2">Token/Kode</th>
                <th className="px-2 py-2">No. Ijazah</th>
                <th className="px-2 py-2" title="Tahun rapor kelas 7">TA7</th>
                <th className="px-2 py-2" title="Tahun rapor kelas 8">TA8</th>
                <th className="px-2 py-2" title="Tahun rapor kelas 9">TA9</th>
                <th className="px-2 py-2">Ijazah</th><th className="px-2 py-2">Transkrip</th>
                <th className="px-2 py-2">Kelanjutan</th><th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {usLoading ? (
                <tr><td colSpan={20} className="px-3 py-6 text-center text-sand-400">Memuat data siswa…</td></tr>
              ) : !usData?.classes.some((c) => c.students.length) ? (
                <tr><td colSpan={20} className="px-3 py-6 text-center text-sand-400">Belum ada siswa di jenjang ini.</td></tr>
              ) : (
                usData.classes.map((c) => (
                  <Fragment key={c.id}>
                    <tr className="bg-sand-50">
                      <td colSpan={20} className="px-3 py-2 text-xs font-bold text-sand-700">
                        Rombel {c.name} · Wali: {c.homeroom ?? '—'} · {c.total} siswa
                      </td>
                    </tr>
                    {c.students.map((s, i) => (
                      <tr key={s.id} className="border-b border-sand-100 hover:bg-sand-50/60">
                        <td className="px-2 py-2 text-sand-500">{i + 1}</td>
                        <td className="px-2 py-2 font-mono text-xs">{s.nisn ?? '—'}</td>
                        <td className="px-2 py-2 font-mono text-xs">{s.nis ?? '—'}</td>
                        <td className="px-2 py-2 font-semibold text-sand-900">{s.name}</td>
                        <td className="px-2 py-2 text-center">{s.gender === 'MALE' ? 'L' : s.gender === 'FEMALE' ? 'P' : '—'}</td>
                        <td className="px-2 py-2">{c.name}</td>
                        <td className="px-2 py-2">{s.agama ?? '—'}</td>
                        <td className="px-2 py-2 text-xs">{s.fatherName ?? s.parent?.name ?? s.motherName ?? '—'}</td>
                        <td className="px-2 py-2 text-xs">{s.birthPlace ?? '—'}</td>
                        <td className="px-2 py-2 text-xs">{fmtDate(s.birthDate)}</td>
                        <td className="px-2 py-2 text-center font-bold">{s.absenceNo ?? '—'}</td>
                        <td className="px-2 py-2 font-mono text-[11px]">{[s.password, s.examCode].filter(Boolean).join(' / ') || '—'}</td>
                        <td className="px-2 py-2 font-mono text-xs">{s.diplomaNo ?? '—'}</td>
                        <td className="px-2 py-2 text-center text-[11px]">{s.rapor?.[7] ?? '—'}</td>
                        <td className="px-2 py-2 text-center text-[11px]">{s.rapor?.[8] ?? '—'}</td>
                        <td className="px-2 py-2 text-center text-[11px]">{s.rapor?.[9] ?? '—'}</td>
                        <td className="px-2 py-2 text-center">
                          {s.ijazahTakenAt ? <Badge tone="primary">✓ {fmtDate(s.ijazahTakenAt)}</Badge> : <Badge tone="neutral">Belum</Badge>}
                        </td>
                        <td className="px-2 py-2 text-center">
                          {s.transcriptTakenAt ? <Badge tone="primary">✓ {fmtDate(s.transcriptTakenAt)}</Badge> : <Badge tone="neutral">Belum</Badge>}
                        </td>
                        <td className="px-2 py-2 text-xs">
                          {s.continuation ? (
                            <span><Badge tone="accent">{s.continuation.name}</Badge>{s.continuationDetail ? <p className="mt-0.5 text-[10px] text-sand-500">{s.continuationDetail}</p> : null}</span>
                          ) : '—'}
                        </td>
                        <td className="px-2 py-2 text-right">
                          {canManage ? (
                            <RowBtn type="button" onClick={() => setEditStu({ ...s, rombel: c.name })}>Edit</RowBtn>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Widget>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-xl border border-sand-200 bg-white p-1 shadow-sm">
          {(['US1', 'US2'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={async () => setPeriod(p)}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors ${
                period === p ? 'bg-primary-700 text-white' : 'text-sand-600 hover:bg-sand-100'
              }`}
>
              {p === 'US1' ? 'US 1' : 'US 2'}
            </button>
          ))}
        </div>
        <Select value={yearId} onChange={(e) => setYearId(e.target.value)} className="w-44" searchable>
          {years.map((y) => (
            <option key={y.id} value={y.id}>
              {y.name}
              {y.isActive ? ' (aktif)' : ''}
            </option>
          ))}
        </Select>
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nama / NISN…"
          className="w-56 max-w-full"
        />
      </div>

      <div className="mb-5 grid grid-cols-3 gap-3">
        <StatCard label="Total Siswa" value={rows.length} />
        <StatCard label="Lulus" value={passed} />
        <StatCard label="Tidak Lulus" value={failed} />
      </div>

      <DataTable
        head={['Nama Siswa', 'NISN', 'Nilai', 'Hasil', 'Catatan', '']}
        loading={loading}
        error={error}
        empty={rows.length === 0 ? 'Belum ada catatan ujian.' : undefined}
>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="px-5 py-3 font-semibold text-sand-900">{r.studentName}</td>
            <td className="px-5 py-3 text-sand-600">{r.nisn ?? '—'}</td>
            <td className="px-5 py-3 text-center font-bold text-sand-900">{r.score ?? '—'}</td>
            <td className="px-5 py-3">
              <Badge tone={RESULT[r.result].tone}>{RESULT[r.result].label}</Badge>
            </td>
            <td className="px-5 py-3 text-xs text-sand-500">{r.notes ?? '—'}</td>
            <td className="px-5 py-3 text-right">
              <span className="flex justify-end gap-2">
                <RowBtn type="button" onClick={async () => setModal(r)}>
                  Ubah
                </RowBtn>
                <RowBtn tone="danger" type="button" onClick={async () => { if (await confirm(`Hapus catatan ${r.studentName}?`)) { void run(() => deleteExamRecord(r.id), 'Catatan dihapus.'); } }}>
                  Hapus
                </RowBtn>
              </span>
            </td>
          </tr>
        ))}
      </DataTable>

      <Modal
        open={modal !== null}
        onClose={() => setModal(null)}
        title={modal === 'new' ? `Catatan ${period === 'US1' ? 'US 1' : 'US 2'}` : 'Ubah Catatan'}
>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={onSubmit}>
          <Field label="Nama Siswa" className="sm:col-span-2">
            <Input name="studentName" required minLength={3} defaultValue={modal !== 'new' ? modal?.studentName : ''} />
          </Field>
          <Field label="NISN">
            <Input name="nisn" defaultValue={modal !== 'new' ? modal?.nisn ?? '' : ''} />
          </Field>
          <Field label="Nilai (0-100)">
            <Input name="score" type="number" min={0} max={100} defaultValue={modal !== 'new' ? modal?.score ?? '' : ''} />
          </Field>
          <Field label="Hasil">
            <Select name="result" defaultValue={modal !== 'new' ? modal?.result : 'PENDING'}>
              <option value="PENDING">Belum Dinilai</option>
              <option value="PASSED">Lulus</option>
              <option value="FAILED">Tidak Lulus</option>
            </Select>
          </Field>
          <Field label="Catatan">
            <Input name="notes" defaultValue={modal !== 'new' ? modal?.notes ?? '' : ''} />
          </Field>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="ghost" onClick={async () => setModal(null)}>Batal</Button>
            <Button type="submit" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</Button>
          </div>
        </form>
      </Modal>

      {/* Modal edit administrasi siswa — absen, ijazah/transkrip, kelanjutan. */}
      <Modal open={!!editStu} onClose={() => setEditStu(null)} title={`Administrasi — ${editStu?.name ?? ''}`} size="md">
        {editStu ? (
          <form
            className="grid gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              setBusy(true);
              try {
                await updateGraduation(editStu.id, {
                  academicYearId: yearId,
                  absenceNo: fd.get('absenceNo') ? Number(fd.get('absenceNo')) : null,
                  diplomaNo: String(fd.get('diplomaNo') || '').trim() || null,
                  ijazahTaken: fd.get('ijazahTaken') === 'on',
                  transcriptTaken: fd.get('transcriptTaken') === 'on',
                  continuationId: String(fd.get('continuationId') || '') || null,
                  continuationDetail: String(fd.get('continuationDetail') || '').trim() || null,
                });
                setNotice(`Data ${editStu.name} disimpan.`);
                setEditStu(null);
                loadUs();
              } catch {
                setError('Gagal menyimpan data.');
              } finally {
                setBusy(false);
              }
            }}
          >
            <p className="text-xs text-sand-500">{editStu.rombel} · NISN {editStu.nisn ?? '—'}</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="No. Absen">
                <Input name="absenceNo" type="number" min={1} defaultValue={editStu.absenceNo ?? ''} />
              </Field>
              <Field label="No. Ijazah">
                <Input name="diplomaNo" defaultValue={editStu.diplomaNo ?? ''} />
              </Field>
            </div>
            <Field label="Kelanjutan (melanjutkan / bekerja / dll)">
              <Select name="continuationId" defaultValue={editStu.continuation?.id ?? ''}>
                <option value="">— Belum diatur —</option>
                {categories.filter((c) => c.isActive).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Keterangan kelanjutan (nama sekolah / tempat kerja)">
              <Input name="continuationDetail" defaultValue={editStu.continuationDetail ?? ''} placeholder="mis. SMAN 5 Bandung" />
            </Field>
            <div className="flex flex-wrap gap-5 rounded-lg border border-sand-200 p-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="ijazahTaken" defaultChecked={!!editStu.ijazahTakenAt} />
                Ijazah sudah diambil{editStu.ijazahTakenAt ? ` (${fmtDate(editStu.ijazahTakenAt)})` : ''}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="transcriptTaken" defaultChecked={!!editStu.transcriptTakenAt} />
                Transkrip sudah diambil{editStu.transcriptTakenAt ? ` (${fmtDate(editStu.transcriptTakenAt)})` : ''}
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setEditStu(null)}>Batal</Button>
              <Button type="submit" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</Button>
            </div>
          </form>
        ) : null}
      </Modal>

      {/* Modal kelola kategori kelanjutan pasca-lulus. */}
      <Modal open={catModal} onClose={() => setCatModal(false)} title="Kategori Kelanjutan Pasca-Lulus" size="md">
        <div className="grid gap-3">
          <ul className="grid gap-2">
            {categories.map((c) => (
              <li key={c.id} className="flex items-center gap-2 rounded-lg border border-sand-200 px-3 py-2">
                <span className={`grow text-sm ${c.isActive ? '' : 'text-sand-400 line-through'}`}>{c.name}</span>
                <RowBtn
                  type="button"
                  onClick={async () => {
                    try {
                      const u = await updateGraduationCategory(c.id, { isActive: !c.isActive });
                      setCategories((cs) => cs.map((x) => (x.id === u.id ? u : x)));
                    } catch { setError('Gagal mengubah kategori.'); }
                  }}
                >{c.isActive ? 'Nonaktifkan' : 'Aktifkan'}</RowBtn>
                <RowBtn
                  type="button" tone="danger"
                  onClick={async () => {
                    if (!(await confirm(`Hapus kategori "${c.name}"? Siswa yang memakainya akan dikosongkan.`))) return;
                    try {
                      await deleteGraduationCategory(c.id);
                      setCategories((cs) => cs.filter((x) => x.id !== c.id));
                    } catch { setError('Gagal menghapus kategori.'); }
                  }}
                >Hapus</RowBtn>
              </li>
            ))}
            {!categories.length ? <li className="py-3 text-center text-sm text-sand-400">Belum ada kategori.</li> : null}
          </ul>
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const name = String(fd.get('name') || '').trim();
              if (!name) return;
              setBusy(true);
              try {
                const c = await createGraduationCategory(name);
                setCategories((cs) => [...cs, c]);
                (e.target as HTMLFormElement).reset();
              } catch { setError('Gagal menambah kategori.'); } finally { setBusy(false); }
            }}
          >
            <Input name="name" placeholder="Kategori baru (mis. Bekerja)" className="grow" />
            <Button type="submit" size="sm" disabled={busy}>Tambah</Button>
          </form>
        </div>
      </Modal>
          {dialog}
      </Shell>
  );
}
