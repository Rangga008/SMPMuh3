'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Field, Input, Modal, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { DataTable } from '@/components/data-table';
import { PageTitle, StatCard } from '@/components/widgets';
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
import { getUsCandidates } from '@/lib/api-ops';

import { RowBtn } from '@/components/row-btn';
import { useConfirm } from '@/components/confirm-dialog';
const RESULT: Record<ExamRecord['result'], { label: string; tone: 'primary' | 'accent' | 'danger' }> = {
  PENDING: { label: 'Belum Dinilai', tone: 'accent' },
  PASSED: { label: 'Lulus', tone: 'primary' },
  FAILED: { label: 'Tidak Lulus', tone: 'danger' },
};

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

  const KOP_CSS = `
    body{font-family:'Times New Roman',serif;color:#111;margin:18px;font-size:12pt}
    .kop{display:flex;align-items:center;gap:14px;border-bottom:3px double #111;padding-bottom:8px;margin-bottom:10px}
    .kop img{height:64px}
    .kop .mid{flex:1;text-align:center}
    .kop .yayasan{font-size:11pt}.kop .nama{font-size:16pt;font-weight:800;color:#0f3a63}
    .kop .alamat{font-size:10pt}
    .kop .kanan{text-align:right;font-size:9.5pt;line-height:1.4}
    h1{text-align:center;font-size:13.5pt;margin:10px 0 2px;text-decoration:underline}
    h2{text-align:center;font-size:11.5pt;margin:0 0 12px;font-weight:400}
    table.us{width:100%;border-collapse:collapse;font-size:10.5pt;margin-bottom:18px}
    .us th,.us td{border:1px solid #111;padding:4px 6px}
    .us th{background:#eee;text-align:center}
    .kelas{font-weight:800;font-size:12pt;margin:14px 0 4px}
    .ttd{display:flex;justify-content:space-between;margin-top:22px;font-size:11pt}
    .ttd div{text-align:center;width:230px}
    .ttd .nm{margin-top:64px;text-decoration:underline;font-weight:700}
    @page{size:A4;margin:12mm}
    @media print{.kelas,.us{page-break-inside:avoid} h1{page-break-after:avoid}}
  `;
  const kop = (school: { name?: string; logoUrl?: string | null; npsn?: string | null; address?: string | null } | null) => `
    <div class="kop">
      ${school?.logoUrl ? `<img src="/logo.png" onerror="this.style.display='none'"/>` : ''}
      <div class="mid">
        <div class="yayasan">MAJELIS PENDIDIKAN DASAR DAN MENENGAH<br>PIMPINAN DAERAH MUHAMMADIYAH KOTA BANDUNG</div>
        <div class="nama">${(school?.name ?? 'SMP MUHAMMADIYAH 3 KOTA BANDUNG').toUpperCase()}</div>
        <div class="alamat">${school?.address ?? ''}</div>
      </div>
      <div class="kanan">NPSN<br>${school?.npsn ?? '—'}</div>
    </div>`;
  const esc = (v?: string | null) => (v ?? '—').replace(/</g, '&lt;');
  const ttl = (p?: string | null, d?: string | null) =>
    [p, d ? new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : null].filter(Boolean).join(', ') || '—';

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
          <h2>Tahun Pelajaran ${d.academicYear.name}</h2>` +
          d.classes.map((c) => `
            <p class="kelas">Rombel: ${c.name} &nbsp;·&nbsp; Wali Kelas: ${c.homeroom ?? '—'}</p>
            <table class="us"><thead><tr>
              <th style="width:26px">No</th><th>NISN</th><th>NIS</th><th>Nama Peserta</th>
              <th style="width:30px">L/P</th><th>Tempat, Tgl Lahir</th><th>Nama Orang Tua/Wali</th>
            </tr></thead><tbody>
            ${c.students.map((s, i) => `<tr>
              <td style="text-align:center">${i + 1}</td><td>${esc(s.nisn)}</td><td>${esc(s.nis)}</td>
              <td>${esc(s.name)}</td><td style="text-align:center">${s.gender === 'MALE' ? 'L' : s.gender === 'FEMALE' ? 'P' : '—'}</td>
              <td>${ttl(s.birthPlace, s.birthDate)}</td><td>${esc(s.fatherName ?? s.parent?.name ?? s.motherName)}</td>
            </tr>`).join('')}
            </tbody></table>`).join('') +
          `<div class="ttd"><div>Mengetahui,<br>Kepala Sekolah<div class="nm">${school?.headmaster ?? '(………………………)'}</div>NIP/NUPTK. ${school?.headmasterNip ?? '……………'}</div>
           <div>Bandung, ………………… 20…<br>Panitia Ujian Sekolah<div class="nm">(………………………)</div>NIP/NUPTK. ……………</div></div>`;
      } else {
        const tL = d.classes.reduce((a, c) => a + c.male, 0);
        const tP = d.classes.reduce((a, c) => a + c.female, 0);
        body = `<h1>DAFTAR REKAPITULASI CALON PESERTA UJIAN SEKOLAH (US-2)</h1>
          <h2>Tahun Pelajaran ${d.academicYear.name}</h2>
          <table class="us"><thead><tr>
            <th style="width:30px">No</th><th>Rombongan Belajar</th><th>Wali Kelas</th>
            <th style="width:70px">Laki-laki</th><th style="width:70px">Perempuan</th><th style="width:70px">Jumlah</th>
          </tr></thead><tbody>
          ${d.classes.map((c, i) => `<tr>
            <td style="text-align:center">${i + 1}</td><td>${c.name}</td><td>${c.homeroom ?? '—'}</td>
            <td style="text-align:center">${c.male}</td><td style="text-align:center">${c.female}</td><td style="text-align:center"><b>${c.total}</b></td>
          </tr>`).join('')}
          <tr><td colspan="3" style="text-align:center;font-weight:800">JUMLAH</td>
            <td style="text-align:center;font-weight:800">${tL}</td>
            <td style="text-align:center;font-weight:800">${tP}</td>
            <td style="text-align:center;font-weight:800">${tL + tP}</td></tr>
          </tbody></table>
          <div class="ttd"><div>Mengetahui,<br>Kepala Sekolah<div class="nm">${school?.headmaster ?? '(………………………)'}</div>NIP/NUPTK. ${school?.headmasterNip ?? '……………'}</div>
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
        title="Ujian Sekolah (US 1 & 2)"
        subtitle="Rekap hasil Ujian Sekolah per periode dan tahun ajaran"
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
      </div>

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
        <Select value={yearId} onChange={(e) => setYearId(e.target.value)} className="w-44">
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
          {dialog}
      </Shell>
  );
}
