'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Field, Input, Modal, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { PageTitle, Widget } from '@/components/widgets';
import { DataTable } from '@/components/data-table';
import {
  assignClassToRoom, createExamRoom, deleteExamRoom, getExamCards, getExamConfig,
  getExamRoomRoster, getRombelAvailability, listExamRooms, listPrasaranas,
  removeExamSeat, renumberRoom,
  setRoomAttendance, setSeatAttendance, updateExamConfig, updateExamRoom,
  type ExamRoomView, type ExamSeatView, type Prasarana,
} from '@/lib/api-ops';
import { listAcademicYears, listClasses, type AcademicYear, type ClassView } from '@/lib/api';
import { printHtml, esc } from '@/lib/print';

function SeatTable({ seats, roomName, roomId, onChanged }: { seats: ExamSeatView[]; roomName: string; roomId: string; onChanged: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState<Record<string, boolean | null>>({});
  const val = (s: ExamSeatView) => (s.id in tick ? tick[s.id] : s.present ?? null);
  const hadir = seats.filter((s) => val(s) === true).length;
  const setOne = async (s: ExamSeatView, present: boolean | null) => {
    setTick((t) => ({ ...t, [s.id]: present }));
    try { await setSeatAttendance(s.id, present); }
    catch (err) { setTick((t) => ({ ...t, [s.id]: s.present ?? null })); setError(err instanceof Error ? err.message : 'Gagal.'); }
  };
  const setAll = async (all: boolean | null) => {
    try {
      if (all === null) {
        // Reset — kosongkan checklist semuanya.
        await setRoomAttendance(roomId, []);
        setTick({});
      } else {
        await setRoomAttendance(roomId, seats.map((s) => s.student.id));
        setTick(Object.fromEntries(seats.map((s) => [s.id, true])));
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Gagal.'); }
    onChanged();
  };
  return (
    <>
      {error ? <p className="mb-2 text-xs text-red-600">{error}</p> : null}
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <Badge tone="primary">Hadir {hadir}/{seats.length}</Badge>
        <button type="button" className="font-semibold text-primary-700 hover:underline" onClick={() => void setAll(true)}>✓ Semua hadir</button>
        <button type="button" className="font-semibold text-sand-500 hover:underline" onClick={() => void setAll(null)}>↺ Reset absen</button>
      </div>
      <div className="overflow-x-auto"><table className="w-full max-w-3xl text-sm">
        <thead><tr className="border-b border-sand-200 text-left text-xs uppercase tracking-wide text-sand-500">
          <th className="py-1.5 pr-3">Hadir</th>
          <th className="py-1.5 pr-4">No</th><th className="py-1.5 pr-4">NIS</th><th className="py-1.5 pr-4">Nama</th>
          <th className="py-1.5 pr-4">Kelas</th><th className="py-1.5 pr-4">Kode Peserta</th><th className="py-1.5"></th>
        </tr></thead>
        <tbody>
          {seats.map((s) => (
            <tr key={s.id} className="border-b border-sand-100 last:border-0">
              <td className="py-1.5 pr-3">
                <input
                  type="checkbox"
                  aria-label={`Hadir ${s.student.name}`}
                  checked={val(s) === true}
                  onChange={() => void setOne(s, val(s) === true ? false : true)}
                />
              </td>
              <td className="py-1.5 pr-4 font-semibold text-sand-800">{s.seatNo ?? '—'}</td>
              <td className="py-1.5 pr-4 font-mono text-xs text-sand-600">{s.student.nis ?? '—'}</td>
              <td className="py-1.5 pr-4 font-medium text-sand-900">{s.student.name}</td>
              <td className="py-1.5 pr-4 text-sand-600">{s.class?.name ?? '—'}</td>
              <td className="py-1.5 pr-4 font-mono text-xs text-sand-500">{s.code ?? '—'}</td>
              <td className="py-1.5 text-right">
                <button type="button" className="text-xs font-semibold text-red-500 hover:text-red-700" onClick={async () => {
                  if (!window.confirm(`Keluarkan ${s.student.name} dari ${roomName}?`)) return;
                  try { await removeExamSeat(s.id); onChanged(); } catch (err) { setError(err instanceof Error ? err.message : 'Gagal.'); }
                }}>Keluarkan</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </>
  );
}

export default function UjianPage() {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [classes, setClasses] = useState<ClassView[]>([]);
  const [yearId, setYearId] = useState('');
  const [rooms, setRooms] = useState<ExamRoomView[]>([]);
  const [prasaranas, setPrasaranas] = useState<Prasarana[]>([]);
  const [seatRoomId, setSeatRoomId] = useState<string | null>(null);
  const [roomModal, setRoomModal] = useState(false);
  const [editRoom, setEditRoom] = useState<ExamRoomView | null>(null);
  const [assignModal, setAssignModal] = useState<{ room: ExamRoomView } | null>(null);
  const [assignClassId, setAssignClassId] = useState('');
  /** Ruang yang dibuka di modal kursi — objek live dari `rooms` agar ikut refresh. */
  const seatRoom = rooms.find((r) => r.id === seatRoomId) ?? null;
  const [assignFrom, setAssignFrom] = useState('');
  const [assignTo, setAssignTo] = useState('');
  /** Absen bebas per rombel (diambil saat modal buka) — sisa riil se-periode. */
  const [avail, setAvail] = useState<{ classId: string; name: string; gradeLevel: number | null; total: number; freeAbsen: number[]; seatedAbsen: number[] }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [examCode, setExamCode] = useState('145');
  const [examCodeEdit, setExamCodeEdit] = useState('');
  const [renumberTarget, setRenumberTarget] = useState<ExamRoomView | null>(null);
  const [renumberMode, setRenumberMode] = useState<'sequential' | 'zigzag'>('sequential');

  useEffect(() => {
    listAcademicYears().then((ys) => {
      setYears(ys);
      const a = ys.find((x) => x.isActive) ?? ys[0];
      if (a) setYearId(a.id);
    });
  }, []);
  const load = useCallback(() => {
    if (!yearId) return;
    listExamRooms(yearId).then(setRooms).catch(() => {});
    listPrasaranas().then(setPrasaranas).catch(() => {});
    listClasses(yearId).then(setClasses).catch(() => {});
    getExamConfig().then((c) => { setExamCode(c.examCode); setExamCodeEdit(c.examCode); }).catch(() => {});
  }, [yearId]);
  useEffect(load, [load]);

  /** Kartu ujian serentak — satu kartu per siswa: identitas + password CBT +
   *  jadwal semua ujiannya + ruang/kursi tetap + nomor peserta. Kartu meja
   *  diletakkan MELEBAR di bawah kartu (digunting & ditempel di bangku).
   *  Satu lembar HVS (A4) = tepat 4 kartu (2 kolom × 2 baris). */
  const printCards = async (roomId: string) => {
    const { room, school, cards } = await getExamCards(roomId);
    const fmt = (s?: string | null) =>
      s ? new Date(s).toLocaleString('id-ID', { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
    const pairs = cards.map((c) => `
      <div class="pair">
      <div class="card">
        <div class="kop">${school?.logoUrl ? `<img src="/logo.png" class="logo" onerror="this.style.display='none'"/>` : ''}<div>
          <b>${esc(school?.name ?? 'SMP Muhammadiyah 3 Kota Bandung')}</b>${school?.npsn ? ` · NPSN ${esc(school.npsn)}` : ''}<br>
          <span class="sub">Kartu Peserta ${esc(room.period)} · TA ${esc(room.academicYear?.name ?? '')}</span></div></div>
        <div class="peserta">${esc(c.code ?? '—')}</div>
        <table class="bio">
          <tr><td>Nama</td><td>: <b>${esc(c.student.name)}</b></td></tr>
          <tr><td>NIS</td><td>: <b class="kode">${esc(c.student.nis ?? '—')}</b></td></tr>
          <tr><td>Kelas</td><td>: ${esc(c.className ?? '—')}</td></tr>
          ${c.password ? `<tr><td>Password</td><td>: <b class="kode">${esc(c.password)}</b></td></tr>` : ''}
          <tr><td>Ruang</td><td>: <b>${esc(room.name)}</b> · Meja No. ${esc(c.seatNo ?? '—')}</td></tr>
        </table>
        <table class="jadwal">
          <thead><tr><th>Ujian</th><th>Hari &amp; Waktu</th><th>Durasi</th></tr></thead>
          <tbody>
            ${c.rows.length ? c.rows.map((r) => `<tr>
              <td>${esc(r.examTitle)}</td>
              <td>${fmt(r.startAt)}${r.endAt ? `–${new Date(r.endAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}` : ''}</td>
              <td class="c">${r.durationMin} mnt</td>
            </tr>`).join('') : '<tr><td colspan="3"><i>Jadwal ujian belum ada — ikuti pengumuman pengawas.</i></td></tr>'}
          </tbody>
        </table>
        <div class="hint">Login CBT: <b>NIS</b> &amp; <b>Password</b> di atas. <b>Kode ujian diumumkan pengawas</b> di ruang. Simpan kartu ini.</div>
      </div>
      <div class="meja">
        <div class="mb"><span class="mtl">Meja</span><span class="mc">${esc(c.seatNo ?? '—')}</span></div>
        <div class="mi"><b class="kode">${esc(c.code ?? '—')}</b><br>${esc(c.student.name)}<br><span class="sub2">${esc(c.className ?? '—')} · ${esc(room.name)}</span></div>
        <div class="mcut">✂<br>tempel<br>di meja</div>
      </div>
      </div>`);
    // Kelompokkan 4 kartu per lembar — grid 2×2, page-break antar lembar.
    const sheets: string[] = [];
    for (let i = 0; i < pairs.length; i += 4) {
      sheets.push(`<div class="sheet">${pairs.slice(i, i + 4).join('')}</div>`);
    }
    printHtml(`Kartu Ujian ${room.period} — ${room.name}`, `
      <style>
        @page{size:A4;margin:10mm 8mm}
        body{margin:0}
        .sheet{display:grid;grid-template-columns:94mm 94mm;grid-auto-rows:minmax(0,auto);gap:5mm;justify-content:center;align-content:start;page-break-after:always}
        .sheet:last-child{page-break-after:auto}
        .pair{display:flex;flex-direction:column;page-break-inside:avoid}
        .card{border:1.5px solid #334155;border-radius:8px 8px 0 0;padding:10px 12px;flex:1}
        .meja{border:1.5px solid #334155;border-top:2px dashed #94a3b8;border-radius:0 0 8px 8px;padding:8px 14px;display:flex;align-items:center;gap:14px}
        .mb{display:flex;align-items:baseline;gap:6px;white-space:nowrap}
        .mtl{font-size:11px;letter-spacing:.12em;color:#64748b;text-transform:uppercase}
        .mc{font-family:ui-monospace,monospace;font-size:40px;font-weight:800;letter-spacing:.03em}
        .mi{font-size:12px;line-height:1.45;flex:1}
        .sub2{color:#64748b}
        .mcut{font-size:9px;color:#94a3b8;text-align:center;border-left:1px dashed #cbd5e1;padding-left:10px;line-height:1.4}
        .peserta{font-family:ui-monospace,monospace;font-size:16px;font-weight:800;letter-spacing:.05em;margin:0 0 6px}
        .kop{display:flex;gap:8px;align-items:center;border-bottom:2px solid #0f3a63;padding-bottom:6px;margin-bottom:6px}
        .logo{height:36px}.sub{font-size:11px;color:#475569}
        table.bio{font-size:12px}table.bio td{padding:1.5px 5px 1.5px 0}
        table.jadwal{width:100%;border-collapse:collapse;font-size:10.5px;margin-top:6px}
        table.jadwal th,table.jadwal td{border:1px solid #cbd5e1;padding:3px 4px;text-align:left}
        table.jadwal th{background:#f1f5f9;font-size:9px;text-transform:uppercase;letter-spacing:.04em}
        table.jadwal td.c{text-align:center}
        .kode{font-family:ui-monospace,monospace;font-size:12px;letter-spacing:.04em}
        .hint{margin-top:6px;font-size:10px;color:#64748b;border-top:1px dashed #cbd5e1;padding-top:5px}
      </style>${sheets.join('')}`);
  };

  /** Daftar duduk + absensi: nomor bangku → siswa, dikelompokkan kelas, dengan
   *  kolom tanda tangan peserta — dipakai pengawas sekaligus daftar hadir. */
  const printSeating = (r: ExamRoomView) => {
    const seats = [...(r.seats ?? [])].sort((a, b) => (a.seatNo ?? 999) - (b.seatNo ?? 999));
    const byClass = new Map<string, typeof seats>();
    for (const s of seats) {
      const k = s.class?.name ?? '—';
      byClass.set(k, [...(byClass.get(k) ?? []), s]);
    }
    const rows = [...byClass.entries()].map(([cls, list]) => `
      <h3>Kelas ${esc(cls)} <span class="cnt">(${list.length} siswa)</span></h3>
      <div className="overflow-x-auto"><table><thead><tr>
        <th>Meja</th><th>NIS</th><th>Nama</th><th>Kode Peserta</th><th colspan="2">Tanda Tangan</th>
      </tr></thead><tbody>
      ${list.map((s) => `<tr>
        <td class="no">${esc(s.seatNo ?? '—')}</td><td>${esc(s.student.nis ?? '—')}</td><td>${esc(s.student.name)}</td>
        <td class="mono">${esc(s.code ?? '—')}</td><td class="ttd"></td><td class="ttd"></td>
      </tr>`).join('')}
      </tbody></table></div>`).join('');
    printHtml(`Daftar Duduk & Absensi ${r.name} — ${r.period}`, `
      <style>
        body{font-family:Georgia,serif;padding:24px;color:#1e293b}
        h1{font-size:18px;margin:0 0 4px}p.sub{font-size:12px;color:#64748b;margin:0 0 18px}
        h3{font-size:13px;margin:16px 0 4px;color:#0f3a63}.cnt{font-weight:normal;color:#64748b}
        table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:8px}
        th,td{border:1px solid #cbd5e1;padding:4px 8px;text-align:left}
        th{background:#f1f5f9;font-size:10px;text-transform:uppercase;letter-spacing:.05em}
        .no{font-weight:700;text-align:center;width:56px}.mono{font-family:ui-monospace,monospace;font-size:11px}
        .ttd{width:70px;height:24px}
      </style>
      <h1>Daftar Duduk &amp; Absensi — ${esc(r.name)}</h1>
      <p class="sub">${esc(r.period)} · ${seats.length}/${r.capacity} kursi · tanda tangan peserta di kolom kanan</p>
      ${rows}`);
  };

  /** Daftar peserta resmi per ruang — NO / NO PESERTA / NAMA / L-P / KLS
   *  (mirror sheet R.XX di Excel) dengan kop sekolah & jumlah peserta. */
  /** Rekap satu periode — matriks jumlah peserta per rombel × ruang + L/P
   *  (mirror sheet REKAP di Excel). */
  const printRekap = async (period: string) => {
    const roster = await getExamRoomRoster(yearId, period);
    const classNames = [...new Set(roster.rooms.flatMap((r) => r.seats.map((s) => s.class?.name)))]
      .filter((x): x is string => !!x)
      .sort((a, b) => a.localeCompare(b, 'id', { numeric: true }));
    const seatsOf = (r: (typeof roster.rooms)[number]) => r.seats;
    let tM = 0, tF = 0, tAll = 0;
    const body = roster.rooms.map((r) => {
      const seats = seatsOf(r);
      const male = seats.filter((s) => s.student.gender === 'MALE').length;
      const female = seats.filter((s) => s.student.gender === 'FEMALE').length;
      tM += male; tF += female; tAll += seats.length;
      const cnt = (cn: string) => seats.filter((s) => s.class?.name === cn).length;
      return `<tr><td><b>${esc(r.name)}</b></td>${classNames.map((cn) => `<td class="c">${cnt(cn) || ''}</td>`).join('')}
        <td class="c b">${seats.length}</td><td class="c">${male}</td><td class="c">${female}</td></tr>`;
    }).join('');
    printHtml(`Rekap Peserta ${period}`, `
      <style>
        body{font-family:Georgia,serif;padding:24px;color:#1e293b}
        h1{font-size:16px;margin:0 0 2px;text-align:center;text-transform:uppercase}
        p.sub{font-size:12px;color:#475569;margin:0 0 14px;text-align:center}
        table{width:100%;border-collapse:collapse;font-size:11.5px}
        th,td{border:1px solid #94a3b8;padding:4px 7px;text-align:left}
        th{background:#e8edf3;font-size:9.5px;text-transform:uppercase;letter-spacing:.05em;text-align:center}
        td.c{text-align:center}.b,td.b{font-weight:700}
        tfoot td{font-weight:700;background:#f1f5f9;text-align:center}
        @media print{body{padding:0}}
      </style>
      <h1>Rekapitulasi Peserta ${esc(roster.period)}</h1>
      <p class="sub">${esc(roster.school?.name ?? '')} · TA ${esc(roster.academicYear?.name ?? '')}</p>
      <table><thead><tr><th>RUANG</th>${classNames.map((cn) => `<th>${esc(cn)}</th>`).join('')}<th>JUMLAH</th><th>L</th><th>P</th></tr></thead>
      <tbody>${body || '<tr><td class="c" colspan="99"><i>Belum ada peserta.</i></td></tr>'}</tbody>
      <tfoot><tr><td>JUMLAH</td>${classNames.map((cn) => `<td>${roster.rooms.reduce((a, r) => a + seatsOf(r).filter((s) => s.class?.name === cn).length, 0) || ''}</td>`).join('')}<td>${tAll}</td><td>${tM}</td><td>${tF}</td></tr></tfoot></table>`);
  };

  /** Semua peserta satu periode — satu baris per siswa (dedupe lintas ruang),
   *  nomor peserta dari kursi pertamanya. Mirror sheet SEMUA PESERTA. */
  const printSemuaPeserta = async (period: string) => {
    const roster = await getExamRoomRoster(yearId, period);
    const seen = new Map<string, { code: string | null | undefined; name: string; gender?: string | null; className: string; room: string }>();
    for (const r of roster.rooms) {
      for (const s of r.seats) {
        if (!seen.has(s.student.id)) {
          seen.set(s.student.id, { code: s.code, name: s.student.name, gender: s.student.gender ?? null, className: s.class?.name ?? '—', room: r.name });
        }
      }
    }
    const rows = [...seen.values()].map((x, i) => `<tr>
      <td class="c">${i + 1}</td><td class="mono b">${esc(x.code ?? '—')}</td><td>${esc(x.name)}</td>
      <td class="c">${x.gender === 'MALE' ? 'L' : x.gender === 'FEMALE' ? 'P' : '—'}</td>
      <td class="c">${esc(x.className)}</td><td class="c">${esc(x.room)}</td></tr>`).join('');
    printHtml(`Semua Peserta ${period}`, `
      <style>
        body{font-family:Georgia,serif;padding:24px;color:#1e293b}
        h1{font-size:16px;margin:0 0 2px;text-align:center;text-transform:uppercase}
        p.sub{font-size:12px;color:#475569;margin:0 0 14px;text-align:center}
        table{width:100%;border-collapse:collapse;font-size:11.5px}
        th,td{border:1px solid #94a3b8;padding:4px 7px;text-align:left}
        th{background:#e8edf3;font-size:9.5px;text-transform:uppercase;letter-spacing:.05em;text-align:center}
        td.c{text-align:center}.mono{font-family:ui-monospace,monospace;font-size:11px}.b{font-weight:700}
        @media print{body{padding:0}}
      </style>
      <h1>Daftar Seluruh Peserta ${esc(roster.period)}</h1>
      <p class="sub">${esc(roster.school?.name ?? '')} · TA ${esc(roster.academicYear?.name ?? '')} · ${seen.size} peserta</p>
      <table><thead><tr><th style="width:36px">NO</th><th style="width:130px">NO PESERTA</th><th>NAMA SISWA</th><th style="width:40px">L/P</th><th style="width:60px">KLS</th><th style="width:80px">RUANG</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6" class="c"><i>Belum ada peserta.</i></td></tr>'}</tbody></table>`);
  };

  const [printPeriod, setPrintPeriod] = useState('');
  /** Periode-periode yang punya ruang — untuk cetak rekap/semua peserta. */
  const periods = [...new Set(rooms.map((r) => r.period))];
  const effectivePeriod = periods.includes(printPeriod) ? printPeriod : (periods[0] ?? '');

  return (
    <Shell>
      <PageTitle title="Administrasi Asesmen Sumatif" subtitle="Tempat duduk peserta dipatok per periode — satu ruang boleh campur rombel & jenjang. Jadwal tiap ujian diatur di Asesmen & Ujian dan berjalan serentak."
        actions={<Button size="sm" onClick={() => setRoomModal(true)}>+ Ruang</Button>} />
      {error ? <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {notice ? <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p> : null}

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Tahun Ajaran" className="max-w-56">
          <Select value={yearId} onChange={(e) => setYearId(e.target.value)} searchable>
            {years.map((y) => <option key={y.id} value={y.id}>{y.name}{y.isActive ? ' (aktif)' : ''}</option>)}
          </Select>
        </Field>
        {periods.length ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-sand-200 bg-sand-50/60 px-3 py-2">
            <span className="text-xs font-semibold text-sand-600">Cetak per periode:</span>
            <Select value={effectivePeriod} onChange={(e) => setPrintPeriod(e.target.value)} className="w-44">
              {periods.map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
            <Button size="sm" variant="outline" onClick={() => void printRekap(effectivePeriod)}>Rekap Ruang</Button>
            <Button size="sm" variant="outline" onClick={() => void printSemuaPeserta(effectivePeriod)}>Semua Peserta</Button>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-sand-200 bg-sand-50/60 px-3 py-2" title={`Format nomor peserta: {jenjang}-${examCode}-{urut}, mis. 07-${examCode}-001 — berlaku untuk kursi baru`}>
          <span className="text-xs font-semibold text-sand-600">Kode sekolah</span>
          <Input value={examCodeEdit} onChange={(e) => setExamCodeEdit(e.target.value)} className="w-20" maxLength={10} />
          <Button size="sm" variant="outline" disabled={busy || !examCodeEdit.trim() || examCodeEdit.trim() === examCode} onClick={async () => {
            setBusy(true);
            try {
              const res = await updateExamConfig(examCodeEdit.trim());
              setExamCode(res.examCode); setExamCodeEdit(res.examCode);
              setNotice(`Kode sekolah → ${res.examCode}. Nomor peserta baru: 07-${res.examCode}-001 — kode yang sudah tercetak tidak berubah.`);
            } catch (err) { setError(err instanceof Error ? err.message : 'Gagal menyimpan.'); } finally { setBusy(false); }
          }}>Simpan</Button>
        </div>
      </div>

      <Widget title={`Ruang Ujian (${rooms.length})`} subtitle="Klik baris untuk membuka kursi & peserta ruang.">
        <DataTable head={['Ruang', 'Periode', 'Peserta', 'Kapasitas', 'Aksi']} loading={false} empty={rooms.length === 0 ? 'Belum ada ruang ujian.' : undefined}>
          {rooms.map((r) => (
            <tr key={r.id} className="cursor-pointer hover:bg-sand-50/60" onClick={() => setSeatRoomId(r.id)}>
              <td className="px-5 py-3 font-semibold text-sand-900">{r.name}
                {r.prasarana ? <span className="block text-xs font-normal text-sand-500">🏫 {r.prasarana.name}</span> : null}</td>
              <td className="px-5 py-3 text-sand-600">{r.period}</td>
              <td className="px-5 py-3">
                {(r.seats?.length ?? 0)
                  ? <Badge tone="primary">{r.seats!.length} peserta</Badge>
                  : <span className="text-xs text-sand-400">belum ada peserta</span>}
              </td>
              <td className="px-5 py-3"><Badge tone={r.seats.length >= r.capacity ? 'danger' : 'primary'}>{r.seats.length}/{r.capacity}</Badge></td>
              <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => setEditRoom(r)}>Edit</Button>
                  <Button size="sm" variant="outline" className="text-red-600" onClick={async () => {
                    if (!window.confirm(`Hapus ruang ${r.name}? Semua peserta ikut terhapus.`)) return;
                    try { await deleteExamRoom(r.id); setNotice('Ruang dihapus.'); load(); }
                    catch (err) { setError(err instanceof Error ? err.message : 'Gagal menghapus.'); }
                  }}>Hapus</Button>
                </div>
              </td>
            </tr>
          ))}
        </DataTable>
      </Widget>

      <Modal open={!!seatRoom} onClose={() => setSeatRoomId(null)} title={`Kursi & Peserta — ${seatRoom?.name ?? ''}`} size="2xl">
        {seatRoom ? (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge tone="accent">Kursi tetap</Badge>
              <span className="text-xs text-sand-500">Satu siswa satu meja sepanjang periode — berlaku untuk semua ujian.</span>
              <span className="ml-auto flex flex-wrap items-center gap-1.5">
                <Button size="sm" variant="outline" onClick={() => {
                  setAssignModal({ room: seatRoom });
                  setAssignClassId(''); setAssignFrom(''); setAssignTo(''); setAvail(null);
                  getRombelAvailability(seatRoom.id).then(setAvail).catch(() => {});
                }}>+ Rombel</Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={seatRoom.seats.length < 2}
                  title="Susun ulang nomor meja — kode peserta tetap"
                  onClick={() => { setRenumberTarget(seatRoom); setRenumberMode('sequential'); }}
                >Susun Meja…</Button>
                <Button size="sm" onClick={() => void printCards(seatRoom.id)} disabled={!seatRoom.seats.length} title="Kartu ujian + kartu meja dengan jadwal & nomor peserta">Cetak Kartu</Button>
                <Button size="sm" variant="outline" onClick={() => printSeating(seatRoom)} disabled={!seatRoom.seats.length} title="Daftar duduk + kolom tanda tangan — sekaligus lembar absensi pengawas">Daftar Duduk &amp; Absen</Button>
              </span>
            </div>
            {seatRoom.seats.length === 0
              ? <p className="text-sm text-sand-400">Belum ada peserta — klik <b>+ Rombel</b>.</p>
              : <SeatTable seats={seatRoom.seats} roomName={seatRoom.name} roomId={seatRoom.id} onChanged={load} />}
          </>
        ) : null}
      </Modal>

      <Modal open={roomModal} onClose={() => setRoomModal(false)} title="Ruang Ujian Baru">
        <form className="grid gap-4" onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          setBusy(true);
          try {
            await createExamRoom({
              name: String(fd.get('name')) || prasaranas.find((p) => p.id === String(fd.get('prasaranaId')))?.name || 'Ruang',
              period: String(fd.get('period')),
              academicYearId: yearId, capacity: Number(fd.get('capacity')) || 24,
              ...(String(fd.get('prasaranaId') ?? '') ? { prasaranaId: String(fd.get('prasaranaId')) } : {}),
            });
            setRoomModal(false); load(); setNotice('Ruang dibuat — buka barisnya lalu tempatkan rombel.');
          } catch (err) { setError(err instanceof Error ? err.message : 'Gagal.'); } finally { setBusy(false); }
        }}>
          <Field label="Ruangan (Prasarana)">
            <Select name="prasaranaId" defaultValue="" searchable>
              <option value="">— ketik nama manual —</option>
              {prasaranas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="Nama ruang"><Input name="name" placeholder="otomatis dari prasarana bila dipilih" /></Field>
          <Field label="Periode ujian"><Input name="period" required placeholder="US 2026 / PTS Ganjil" /></Field>
          <Field label="Kapasitas"><Input name="capacity" type="number" min={1} defaultValue={24} /></Field>
          <div className="flex justify-end"><Button type="submit" disabled={busy}>Simpan</Button></div>
        </form>
      </Modal>

      <Modal open={!!editRoom} onClose={() => setEditRoom(null)} title={`Edit ${editRoom?.name ?? ''}`}>
        <form className="grid gap-4" onSubmit={async (e) => {
          e.preventDefault();
          if (!editRoom) return;
          const fd = new FormData(e.currentTarget);
          setBusy(true);
          try {
            await updateExamRoom(editRoom.id, {
              name: String(fd.get('name')), period: String(fd.get('period')),
              capacity: Number(fd.get('capacity')) || editRoom.capacity,
              prasaranaId: String(fd.get('prasaranaId') ?? '') || null,
            });
            setEditRoom(null); load(); setNotice('Ruang diperbarui.');
          } catch (err) { setError(err instanceof Error ? err.message : 'Gagal.'); } finally { setBusy(false); }
        }}>
          <Field label="Nama ruang"><Input name="name" required defaultValue={editRoom?.name ?? ''} /></Field>
          <Field label="Periode ujian"><Input name="period" required defaultValue={editRoom?.period ?? ''} /></Field>
          <Field label={`Kapasitas`}><Input name="capacity" type="number" min={1} defaultValue={editRoom?.capacity ?? 24} /></Field>
          <Field label="Ruangan (Prasarana)">
            <Select name="prasaranaId" defaultValue={editRoom?.prasaranaId ?? ''} searchable>
              <option value="">— tidak ditautkan —</option>
              {prasaranas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <div className="flex justify-end"><Button type="submit" disabled={busy}>Simpan</Button></div>
        </form>
      </Modal>

      <Modal open={!!renumberTarget} onClose={() => setRenumberTarget(null)} title={`Susun nomor meja — ${renumberTarget?.name ?? ''}`}>
        <p className="text-xs text-sand-500">
          Menyusun ulang <b>nomor meja</b> ({renumberTarget?.seats.length ?? 0} kursi). Kode peserta <b>tidak berubah</b>.
        </p>
        <div className="mt-4 grid gap-2">
          {(
            [
              ['sequential', '↕ Berurut per rombel', 'Meja 1, 2, 3… mengikuti urutan daftar tiap rombel'],
              ['zigzag', '⚡ Zigzag campur kelas', 'Meja berselang-seling antar kelas — meja 1 kelas A, meja 2 kelas B, dst'],
            ] as const
          ).map(([v, label, hint]) => (
            <label
              key={v}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 text-sm ${
                renumberMode === v ? 'border-emerald-500 bg-emerald-50' : 'border-sand-200 hover:bg-sand-50'
              }`}
            >
              <input
                type="radio"
                name="renumberMode"
                checked={renumberMode === v}
                onChange={() => setRenumberMode(v)}
                className="mt-0.5 accent-emerald-700"
              />
              <span>
                <b>{label}</b>
                <span className="block text-xs text-sand-500">{hint}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setRenumberTarget(null)}>Batal</Button>
          <Button
            disabled={busy}
            onClick={async () => {
              if (!renumberTarget) return;
              setBusy(true);
              try {
                const res = await renumberRoom(renumberTarget.id, renumberMode);
                setNotice(`Nomor meja ${renumberTarget.name} disusun ulang ${renumberMode === 'zigzag' ? 'zigzag (kelas berselang-seling)' : 'berurut per rombel'} — ${res.count} kursi.`);
                setRenumberTarget(null);
                load();
              } catch (err) { setError(err instanceof Error ? err.message : 'Gagal menyusun meja.'); }
              finally { setBusy(false); }
            }}
          >{busy ? 'Menyusun…' : 'Terapkan'}</Button>
        </div>
      </Modal>

      <Modal open={!!assignModal} onClose={() => setAssignModal(null)} title={`Masukkan rombel — ${assignModal?.room.name ?? ''}`}>
        <div className="grid gap-4">
          <Field label="Kelas" hint="Menampilkan sisa siswa yang BELUM duduk di periode ini — ruang boleh campur beberapa rombel & jenjang.">
            <Select value={assignClassId} onChange={(e) => {
              const cid = e.target.value;
              setAssignClassId(cid);
              const a = avail?.find((x) => x.classId === cid);
              // Prefill: mulai dari absen bebas pertama, sampai sisa.
              setAssignFrom(a?.freeAbsen.length ? String(a.freeAbsen[0]) : '');
              setAssignTo('');
            }} searchable>
              <option value="">— pilih kelas —</option>
              {classes.map((c) => {
                const a = avail?.find((x) => x.classId === c.id);
                const total = a?.total ?? c._count?.enrollments ?? 0;
                const sisa = a?.freeAbsen.length ?? total;
                return <option key={c.id} value={c.id} disabled={sisa === 0}>{c.name} ({c.gradeLevel ?? ''} · sisa {sisa}/{total} siswa)</option>;
              })}
            </Select>
          </Field>
          {(() => {
            const a = avail?.find((x) => x.classId === assignClassId);
            if (!a) return avail === null ? <p className="text-xs text-sand-400">Memuat absen bebas…</p> : null;
            const ranges: string[] = [];
            let start: number | null = null;
            a.freeAbsen.forEach((n, i) => {
              if (start === null) start = n;
              if (a.freeAbsen[i + 1] !== n + 1) { ranges.push(start === n ? `${n}` : `${start}–${n}`); start = null; }
            });
            return a.freeAbsen.length
              ? <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">Absen bebas: <b>{ranges.join(', ')}</b> — {a.freeAbsen.length} siswa belum dapat tempat.</p>
              : <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Semua siswa kelas ini sudah duduk di periode ini.</p>;
          })()}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Dari absen" hint="Nomor absen pertama yang ditempatkan.">
              <Input type="number" min={1} value={assignFrom} onChange={(e) => setAssignFrom(e.target.value)} placeholder="1" />
            </Field>
            <Field label="Sampai absen" hint="Kosongkan = sampai sisa rombel.">
              <Input type="number" min={1} value={assignTo} onChange={(e) => setAssignTo(e.target.value)} placeholder="sisa" />
            </Field>
          </div>
          <Button disabled={!assignClassId || busy} onClick={async () => {
            if (!assignModal || !assignClassId) return;
            setBusy(true);
            try {
              const r = await assignClassToRoom(
                assignModal.room.id, assignClassId,
                assignFrom ? Number(assignFrom) : undefined,
                assignTo ? Number(assignTo) : undefined,
              );
              setNotice(`${r.added} siswa ditempatkan${r.skipped ? ` · ${r.skipped} dilewati (sudah duduk / kursi penuh)` : ''}.`);
              // Refresh availability untuk penempatan lanjutan tanpa tutup modal.
              getRombelAvailability(assignModal.room.id).then(setAvail).catch(() => {});
              load();
            } catch (err) { setError(err instanceof Error ? err.message : 'Gagal menempatkan.'); } finally { setBusy(false); }
          }}>Tempatkan Rombel</Button>
          <p className="text-xs text-sand-500">Pecah satu kelas ke beberapa ruang: mis. absen 1–15 di ruang ini, lalu 16–30 (atau kosong = sisa) di ruang berikutnya — siswa yang sudah duduk dilewati otomatis, tak ada duplikat. Nomor peserta lanjut antar ruang.</p>
        </div>
      </Modal>
    </Shell>
  );
}
