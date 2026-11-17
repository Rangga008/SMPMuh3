'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { Badge, Button, Field, Input, Modal, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { PageTitle, Widget } from '@/components/widgets';
import { DataTable } from '@/components/data-table';
import {
  addRoomLink, assignClassToRoom, createExamRoom, deleteExamRoom, getExamCards, getExamRoomRoster, getStudentCards,
  linkSessionEnd, linkSessionName, linkSessionStart,
  listExamRooms, listExams, listPrasaranas, removeExamSeat, removeRoomLink,
  setLinkAttendance, setSeatAttendance, updateExamRoom,
  type ExamRoomLinkView, type ExamRoomView, type ExamSeatView, type ExamView, type Prasarana,
} from '@/lib/api-ops';
import { listAcademicYears, listClasses, type AcademicYear, type ClassView } from '@/lib/api';
import { printHtml } from '@/lib/print';

const fmtDt = (s?: string | null) =>
  s ? new Date(s).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : null;
/** Judul tautan sesi — sesi CBT → nama sesi, sesi umum → label manual. */
const linkTitle = (l: ExamRoomLinkView) => linkSessionName(l) ?? l.exam?.title ?? 'Sesi';

function SeatTable({ seats, roomName, linkId, onChanged }: { seats: ExamSeatView[]; roomName: string; linkId?: string; onChanged: () => void }) {
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
    if (!linkId) return;
    try {
      if (all === null) {
        // Reset — kosongkan checklist semuanya (satu-satu, API massal hanya hadir/tidak).
        await setLinkAttendance(linkId, []);
        setTick({});
      } else {
        await setLinkAttendance(linkId, seats.map((s) => s.student.id));
        setTick(Object.fromEntries(seats.map((s) => [s.id, true])));
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Gagal.'); }
    onChanged();
  };
  return (
    <>
      {error ? <p className="mb-2 text-xs text-red-600">{error}</p> : null}
      {linkId ? (
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
          <Badge tone="primary">Hadir {hadir}/{seats.length}</Badge>
          <button type="button" className="font-semibold text-primary-700 hover:underline" onClick={() => void setAll(true)}>✓ Semua hadir</button>
          <button type="button" className="font-semibold text-sand-500 hover:underline" onClick={() => void setAll(null)}>↺ Reset absen</button>
        </div>
      ) : null}
      <div className="overflow-x-auto"><table className="w-full max-w-3xl text-sm">
        <thead><tr className="border-b border-sand-200 text-left text-xs uppercase tracking-wide text-sand-500">
          {linkId ? <th className="py-1.5 pr-3">Hadir</th> : null}
          <th className="py-1.5 pr-4">No</th><th className="py-1.5 pr-4">NIS</th><th className="py-1.5 pr-4">Nama</th>
          <th className="py-1.5 pr-4">Kelas</th><th className="py-1.5 pr-4">Kode Peserta</th><th className="py-1.5"></th>
        </tr></thead>
        <tbody>
          {seats.map((s) => (
            <tr key={s.id} className="border-b border-sand-100 last:border-0">
              {linkId ? (
                <td className="py-1.5 pr-3">
                  <input
                    type="checkbox"
                    aria-label={`Hadir ${s.student.name}`}
                    checked={val(s) === true}
                    onChange={() => void setOne(s, val(s) === true ? false : true)}
                  />
                </td>
              ) : null}
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
  const [exams, setExams] = useState<ExamView[]>([]);
  const [yearId, setYearId] = useState('');
  const [rooms, setRooms] = useState<ExamRoomView[]>([]);
  const [prasaranas, setPrasaranas] = useState<Prasarana[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [roomModal, setRoomModal] = useState(false);
  const [editRoom, setEditRoom] = useState<ExamRoomView | null>(null);
  const [linkModal, setLinkModal] = useState<ExamRoomView | null>(null);
  const [linkPick, setLinkPick] = useState(''); // sessionId | 'manual' | ''
  const [assignModal, setAssignModal] = useState<{ room: ExamRoomView; link: ExamRoomLinkView | null } | null>(null);
  const [assignClassId, setAssignClassId] = useState('');
  const [assignCount, setAssignCount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
    listExams(yearId).then(setExams).catch(() => setExams([]));
  }, [yearId]);
  useEffect(load, [load]);

  /** Kartu peserta: NIS + PASSWORD (kredensial CBT) + ruang/no kursi.
   *  Kode ujian tidak dicetak — diumumkan pengawas di ruang ujian. */
  const printCards = async (roomId: string, linkId?: string) => {
    const { room, link, credentials, school, seatExam } = await getExamCards(roomId, linkId);
    const exam = link?.exam ?? room.exam;
    const sessionInfo = link
      ? [linkSessionName(link), fmtDt(linkSessionStart(link)), fmtDt(linkSessionEnd(link))].filter(Boolean).join(' · ')
      : null;
    // Kode ujian SENGAJA tidak dicetak — diumumkan pengawas di ruang agar
    // ujian tidak bisa dikerjakan dari luar sekolah.
    const cards = room.seats.map((s) => {
      const pw = credentials?.[s.student.id];
      // Sesi terikat ujian → satu judul untuk semua; sesi umum → ujian per siswa.
      const examTitle = exam?.title ?? seatExam?.[s.id] ?? null;
      const examLine = examTitle
        ? `<tr><td>Ujian</td><td>: ${examTitle}</td></tr>`
        : '<tr><td>Ujian</td><td>: <i>lihat pengumuman pengawas</i></td></tr>';
      return `
      <div class="pair">
      <div class="card">
        <div class="kop">${school?.logoUrl ? `<img src="/logo.png" class="logo" onerror="this.style.display='none'"/>` : ''}<div>
          <b>${school?.name ?? 'SMP Muhammadiyah 3 Kota Bandung'}</b>${school?.npsn ? ` · NPSN ${school.npsn}` : ''}<br>
          <span class="sub">Kartu Peserta ${room.period}${sessionInfo ? ` · ${sessionInfo}` : ''} · TA ${room.academicYear?.name ?? ''}</span></div></div>
        <div class="peserta">${s.code ?? '—'}</div>
        <div className="overflow-x-auto"><table>
          <tr><td>Nama</td><td>: <b>${s.student.name}</b></td></tr>
          <tr><td>NIS</td><td>: <b class="kode">${s.student.nis ?? '—'}</b></td></tr>
          ${examLine}
          ${pw ? `<tr><td>Password</td><td>: <b class="kode">${pw}</b></td></tr>` : ''}
          <tr><td>Kelas</td><td>: ${s.class?.name ?? '—'}</td></tr>
          <tr><td>Ruang</td><td>: <b>${room.name}</b> · No. ${s.seatNo ?? '—'}</td></tr>
        </table></div>
        <div class="hint">Login CBT: masukkan <b>NIS</b> &amp; <b>Password</b> di atas. <b>Kode ujian diumumkan pengawas</b> di ruang. Simpan kartu ini.</div>
      </div>
      <div class="meja">
        <div class="mt">Kartu Meja</div>
        <div class="mc">${s.code ?? '—'}</div>
        <div class="mi">${s.student.name}<br>${s.class?.name ?? '—'} · ${room.name} · No. ${s.seatNo ?? '—'}</div>
        <div class="mcut">✂ tempel di meja — gunting di sini</div>
      </div>
      </div>`;
    }).join('');
    printHtml(`Kartu ${room.name}${sessionInfo ? ` ${sessionInfo}` : ''}`, `
      <style>
        .pair{display:inline-flex;align-items:stretch;margin:0 0 14px;vertical-align:top}
        .card{border:1.5px solid #334155;border-radius:8px 0 0 8px;border-right:none;padding:14px;width:340px}
        .meja{width:200px;border:1.5px solid #334155;border-left:2px dashed #94a3b8;border-radius:0 8px 8px 0;padding:14px;display:flex;flex-direction:column}
        .mt{font-size:9px;letter-spacing:.12em;color:#64748b;text-transform:uppercase}
        .mc{font-family:ui-monospace,monospace;font-size:24px;font-weight:800;letter-spacing:.03em;margin:8px 0}
        .mi{font-size:11.5px;line-height:1.5}
        .mcut{margin-top:auto;padding-top:8px;font-size:9px;color:#94a3b8;border-top:1px dashed #cbd5e1}
        .peserta{font-family:ui-monospace,monospace;font-size:17px;font-weight:800;letter-spacing:.05em;margin:2px 0 8px}
        .kop{display:flex;gap:10px;align-items:center;border-bottom:2px solid #0f3a63;padding-bottom:8px;margin-bottom:8px}
        .logo{height:40px}.sub{font-size:11px;color:#475569}
        table{font-size:12.5px}td{padding:2px 6px 2px 0}
        .kode{font-family:ui-monospace,monospace;font-size:13px;letter-spacing:.04em}
        .hint{margin-top:8px;font-size:10.5px;color:#64748b;border-top:1px dashed #cbd5e1;padding-top:6px}
        @media print{.pair{page-break-inside:avoid}}
      </style>${cards}`);
  };

  /** Kartu gabungan — satu kartu per siswa memuat SEMUA jadwal ujiannya
   *  (ujian serentak: tiap sesi bisa beda ruang). */
  const printStudentCards = async (linkId: string) => {
    const { room, school, cards } = await getStudentCards(linkId);
    const fmt = (s?: string | null) =>
      s ? new Date(s).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
    const html = cards.map((c) => `
      <div class="pair">
      <div class="card">
        <div class="kop">${school?.logoUrl ? `<img src="/logo.png" class="logo" onerror="this.style.display='none'"/>` : ''}<div>
          <b>${school?.name ?? 'SMP Muhammadiyah 3 Kota Bandung'}</b>${school?.npsn ? ` · NPSN ${school.npsn}` : ''}<br>
          <span class="sub">Kartu Ujian ${room.period} · TA ${room.academicYear?.name ?? ''}</span></div></div>
        <table class="bio">
          <tr><td>Nama</td><td>: <b>${c.student.name}</b></td></tr>
          <tr><td>NIS</td><td>: <b class="kode">${c.student.nis ?? '—'}</b></td></tr>
          <tr><td>Kelas</td><td>: ${c.className ?? '—'}</td></tr>
          ${c.password ? `<tr><td>Password</td><td>: <b class="kode">${c.password}</b></td></tr>` : ''}
        </table>
        <table class="jadwal">
          <thead><tr><th>Ujian</th><th>Sesi</th><th>Waktu</th><th>Ruang</th><th>Kursi</th><th>Kode</th></tr></thead>
          <tbody>
            ${c.rows.map((r) => `<tr>
              <td>${r.examTitle ?? '—'}</td><td>${r.sessionName}</td>
              <td>${fmt(r.startAt)}${r.endAt ? `–${new Date(r.endAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}` : ''}</td>
              <td><b>${r.roomName}</b></td><td class="c">${r.seatNo ?? '—'}</td><td class="mono">${r.code ?? '—'}</td>
            </tr>`).join('')}
          </tbody>
        </table>
        <div class="hint">Login CBT: <b>NIS</b> &amp; <b>Password</b> di atas. <b>Kode ujian diumumkan pengawas</b> di ruang. Simpan kartu ini.</div>
      </div>
      <div class="mejacol">
        ${c.rows.map((r) => `<div class="meja">
          <div class="mt">Kartu Meja — ${r.sessionName}</div>
          <div class="mc">${r.code ?? '—'}</div>
          <div class="mi">${c.student.name}<br>${r.roomName} · No. ${r.seatNo ?? '—'}<br>${fmt(r.startAt)}</div>
          <div class="mcut">✂ tempel di meja</div>
        </div>`).join('')}
      </div>
      </div>`).join('');
    printHtml(`Kartu Ujian ${room.period} — ${room.name}`, `
      <style>
        .pair{display:inline-flex;align-items:flex-start;margin:0 0 14px;vertical-align:top}
        .card{border:1.5px solid #334155;border-radius:8px 0 0 8px;border-right:none;padding:14px;width:430px}
        .mejacol{display:flex;flex-direction:column;border-left:2px dashed #94a3b8}
        .meja{width:190px;border:1.5px solid #334155;border-left:none;padding:10px 14px;display:flex;flex-direction:column}
        .meja:first-child{border-radius:0 8px 0 0}
        .meja:last-child{border-radius:0 0 8px 0;border-top:none}
        .mt{font-size:8.5px;letter-spacing:.1em;color:#64748b;text-transform:uppercase}
        .mc{font-family:ui-monospace,monospace;font-size:20px;font-weight:800;letter-spacing:.03em;margin:6px 0}
        .mi{font-size:10.5px;line-height:1.5}
        .mcut{margin-top:6px;padding-top:6px;font-size:8.5px;color:#94a3b8;border-top:1px dashed #cbd5e1}
        .kop{display:flex;gap:10px;align-items:center;border-bottom:2px solid #0f3a63;padding-bottom:8px;margin-bottom:8px}
        .logo{height:40px}.sub{font-size:11px;color:#475569}
        table.bio{font-size:12.5px}table.bio td{padding:2px 6px 2px 0}
        table.jadwal{width:100%;border-collapse:collapse;font-size:10.5px;margin-top:8px}
        table.jadwal th,table.jadwal td{border:1px solid #cbd5e1;padding:3px 5px;text-align:left}
        table.jadwal th{background:#f1f5f9;font-size:9px;text-transform:uppercase;letter-spacing:.04em}
        table.jadwal td.c{text-align:center;font-weight:700}
        .kode{font-family:ui-monospace,monospace;font-size:12px;letter-spacing:.04em}
        .mono{font-family:ui-monospace,monospace;font-size:10px}
        .hint{margin-top:8px;font-size:10.5px;color:#64748b;border-top:1px dashed #cbd5e1;padding-top:6px}
        @media print{.pair{page-break-inside:avoid}}
      </style>${html}`);
  };

  /** Daftar duduk: nomor bangku → siswa, dikelompokkan kelas, untuk ditempel di pintu/dibawa pengawas. */
  const printSeating = (r: ExamRoomView, l: ExamRoomLinkView) => {
    const seats = [...(l.seats ?? [])].sort((a, b) => (a.seatNo ?? 999) - (b.seatNo ?? 999));
    const byClass = new Map<string, typeof seats>();
    for (const s of seats) {
      const k = s.class?.name ?? '—';
      byClass.set(k, [...(byClass.get(k) ?? []), s]);
    }
    const rows = [...byClass.entries()].map(([cls, list]) => `
      <h3>Kelas ${cls} <span class="cnt">(${list.length} siswa)</span></h3>
      <div className="overflow-x-auto"><table><thead><tr><th>Bangku</th><th>NIS</th><th>Nama</th><th>Kode Peserta</th></tr></thead><tbody>
      ${list.map((s) => `<tr><td class="no">${s.seatNo ?? '—'}</td><td>${s.student.nis ?? '—'}</td><td>${s.student.name}</td><td class="mono">${s.code ?? '—'}</td></tr>`).join('')}
      </tbody></table></div>`).join('');
    printHtml(`Daftar Duduk ${r.name} — ${linkTitle(l)}`, `
      <style>
        body{font-family:Georgia,serif;padding:24px;color:#1e293b}
        h1{font-size:18px;margin:0 0 4px}p.sub{font-size:12px;color:#64748b;margin:0 0 18px}
        h3{font-size:13px;margin:16px 0 4px;color:#0f3a63}.cnt{font-weight:normal;color:#64748b}
        table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:8px}
        th,td{border:1px solid #cbd5e1;padding:4px 8px;text-align:left}
        th{background:#f1f5f9;font-size:10px;text-transform:uppercase;letter-spacing:.05em}
        .no{font-weight:700;text-align:center;width:70px}.mono{font-family:ui-monospace,monospace;font-size:11px}
      </style>
      <h1>Daftar Duduk — ${r.name}</h1>
      <p class="sub">${linkTitle(l)}${l.exam ? ` — ${l.exam.title}` : ''}${linkSessionStart(l) ? ` · ${fmtDt(linkSessionStart(l))}` : ''} · ${seats.length}/${r.capacity} kursi</p>
      ${rows}`);
  };

  /** Daftar peserta resmi per ruang+sesi — NO / NO PESERTA / NAMA / L-P / KLS
   *  (mirror sheet R.XX di Excel) dengan kop sekolah & jumlah peserta. */
  const printDaftarPeserta = async (r: ExamRoomView, l: ExamRoomLinkView) => {
    const roster = await getExamRoomRoster(yearId, r.period);
    const room = roster.rooms.find((x) => x.id === r.id);
    const link = room?.links.find((x) => x.id === l.id);
    const seats = link?.seats ?? [];
    const male = seats.filter((s) => s.student.gender === 'MALE').length;
    const female = seats.filter((s) => s.student.gender === 'FEMALE').length;
    const s = roster.school;
    const kop = `<div class="kop">
      ${s?.logoUrl ? `<img src="/logo.png" class="logo" onerror="this.style.display='none'"/>` : ''}
      <div class="koptxt"><b>${s?.name ?? 'SMP Muhammadiyah 3 Kota Bandung'}</b>${s?.npsn ? ` · NPSN ${s.npsn}` : ''}<br>
      <span>${s?.address ?? ''}</span></div></div>`;
    const rows = seats.map((x, i) => `<tr>
      <td class="c">${i + 1}</td><td class="mono b">${x.code ?? '—'}</td><td>${x.student.name}</td>
      <td class="c">${x.student.gender === 'MALE' ? 'L' : x.student.gender === 'FEMALE' ? 'P' : '—'}</td>
      <td class="c">${x.class?.name ?? '—'}</td></tr>`).join('');
    printHtml(`Daftar Peserta ${roster.period} — ${room?.name ?? r.name}`, `
      <style>
        body{font-family:Georgia,serif;padding:24px;color:#1e293b}
        .kop{display:flex;gap:14px;align-items:center;justify-content:center;text-align:center;border-bottom:3px double #0f3a63;padding-bottom:10px;margin-bottom:14px}
        .logo{height:56px}.koptxt{font-size:14px;line-height:1.45}.koptxt span{font-size:11px;color:#475569}
        h1{font-size:16px;margin:0 0 2px;text-align:center;text-transform:uppercase}
        p.sub{font-size:12px;color:#475569;margin:0 0 14px;text-align:center}
        table{width:100%;border-collapse:collapse;font-size:12px}
        th,td{border:1px solid #94a3b8;padding:4px 8px;text-align:left}
        th{background:#e8edf3;font-size:10px;text-transform:uppercase;letter-spacing:.05em;text-align:center}
        td.c{text-align:center}.mono{font-family:ui-monospace,monospace;font-size:11.5px}.b{font-weight:700}
        tfoot td{font-weight:700;background:#f1f5f9}
        @media print{body{padding:0}}
      </style>
      ${kop}
      <h1>Daftar Peserta ${roster.period}</h1>
      <p class="sub">${link ? linkTitle(link) : linkTitle(l)} — Ruang <b>${room?.name ?? r.name}</b> · TA ${roster.academicYear?.name ?? ''} · ${seats.length} peserta</p>
      <table><thead><tr><th style="width:36px">NO</th><th style="width:130px">NO PESERTA</th><th>NAMA SISWA</th><th style="width:40px">L/P</th><th style="width:60px">KLS</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5" class="c"><i>Belum ada peserta.</i></td></tr>'}</tbody>
      <tfoot><tr><td></td><td colspan="2">Jumlah</td><td class="c">L ${male} · P ${female}</td><td class="c">${seats.length}</td></tr></tfoot></table>`);
  };

  /** Rekap satu periode — matriks jumlah peserta per rombel × ruang + L/P
   *  (mirror sheet REKAP di Excel). */
  const printRekap = async (period: string) => {
    const roster = await getExamRoomRoster(yearId, period);
    const classNames = [...new Set(roster.rooms.flatMap((r) => r.links.flatMap((l) => l.seats.map((s) => s.class?.name).concat(r.seats.map((s) => s.class?.name)))))]
      .filter((x): x is string => !!x)
      .sort((a, b) => a.localeCompare(b, 'id', { numeric: true }));
    const seatsOf = (r: (typeof roster.rooms)[number]) => [...r.links.flatMap((l) => l.seats), ...r.seats];
    let tM = 0, tF = 0, tAll = 0;
    const body = roster.rooms.map((r) => {
      const seats = seatsOf(r);
      const male = seats.filter((s) => s.student.gender === 'MALE').length;
      const female = seats.filter((s) => s.student.gender === 'FEMALE').length;
      tM += male; tF += female; tAll += seats.length;
      const cnt = (cn: string) => seats.filter((s) => s.class?.name === cn).length;
      return `<tr><td><b>${r.name}</b></td>${classNames.map((cn) => `<td class="c">${cnt(cn) || ''}</td>`).join('')}
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
      <h1>Rekapitulasi Peserta ${roster.period}</h1>
      <p class="sub">${roster.school?.name ?? ''} · TA ${roster.academicYear?.name ?? ''}</p>
      <table><thead><tr><th>RUANG</th>${classNames.map((cn) => `<th>${cn}</th>`).join('')}<th>JUMLAH</th><th>L</th><th>P</th></tr></thead>
      <tbody>${body || '<tr><td class="c" colspan="99"><i>Belum ada peserta.</i></td></tr>'}</tbody>
      <tfoot><tr><td>JUMLAH</td>${classNames.map((cn) => `<td>${roster.rooms.reduce((a, r) => a + seatsOf(r).filter((s) => s.class?.name === cn).length, 0) || ''}</td>`).join('')}<td>${tAll}</td><td>${tM}</td><td>${tF}</td></tr></tfoot></table>`);
  };

  /** Semua peserta satu periode — satu baris per siswa (dedupe lintas sesi),
   *  nomor peserta dari kursi pertamanya. Mirror sheet SEMUA PESERTA. */
  const printSemuaPeserta = async (period: string) => {
    const roster = await getExamRoomRoster(yearId, period);
    const seen = new Map<string, { code: string | null | undefined; name: string; gender?: string | null; className: string; room: string }>();
    for (const r of roster.rooms) {
      const all = [...r.links.flatMap((l) => l.seats), ...r.seats];
      for (const s of all) {
        if (!seen.has(s.student.id)) {
          seen.set(s.student.id, { code: s.code, name: s.student.name, gender: s.student.gender ?? null, className: s.class?.name ?? '—', room: r.name });
        }
      }
    }
    const rows = [...seen.values()].map((x, i) => `<tr>
      <td class="c">${i + 1}</td><td class="mono b">${x.code ?? '—'}</td><td>${x.name}</td>
      <td class="c">${x.gender === 'MALE' ? 'L' : x.gender === 'FEMALE' ? 'P' : '—'}</td>
      <td class="c">${x.className}</td><td class="c">${x.room}</td></tr>`).join('');
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
      <h1>Daftar Seluruh Peserta ${roster.period}</h1>
      <p class="sub">${roster.school?.name ?? ''} · TA ${roster.academicYear?.name ?? ''} · ${seen.size} peserta</p>
      <table><thead><tr><th style="width:36px">NO</th><th style="width:130px">NO PESERTA</th><th>NAMA SISWA</th><th style="width:40px">L/P</th><th style="width:60px">KLS</th><th style="width:80px">RUANG</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6" class="c"><i>Belum ada peserta.</i></td></tr>'}</tbody></table>`);
  };

  const [printPeriod, setPrintPeriod] = useState('');
  const linksOf = (r: ExamRoomView) => r.links ?? [];
  const looseSeats = (r: ExamRoomView) => r.seats ?? [];
  /** Periode-periode yang punya ruang — untuk cetak rekap/semua peserta. */
  const periods = [...new Set(rooms.map((r) => r.period))];
  const effectivePeriod = periods.includes(printPeriod) ? printPeriod : (periods[0] ?? '');
  /** Semua sesi ujian CBT tahun ini — satu daftar flat (ujian hanya label). */
  const sessionOptions = exams.flatMap((x) =>
    (x.sessions ?? []).map((s) => ({ ...s, examTitle: x.title, examCode: x.code })),
  );

  return (
    <Shell>
      <PageTitle title="Administrasi Asesmen Sumatif" subtitle="Satu ruang bisa host beberapa sesi — sesi CBT (sinkron nama, waktu & rombel) atau sesi umum campur kelas lintas jenjang; tempatkan rombel lalu cetak kartu."
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
      </div>

      <Widget title={`Ruang Ujian (${rooms.length})`} subtitle="Klik baris untuk membuka sesi & peserta ruang.">
        <DataTable head={['Ruang', 'Periode', 'Sesi / Ujian', 'Kapasitas', 'Aksi']} loading={false} empty={rooms.length === 0 ? 'Belum ada ruang ujian.' : undefined}>
          {rooms.map((r) => (
            <Fragment key={r.id}>
              <tr className="cursor-pointer hover:bg-sand-50/60" onClick={() => setOpen(open === r.id ? null : r.id)}>
                <td className="px-5 py-3 font-semibold text-sand-900">{open === r.id ? '▾' : '▸'} {r.name}
                  {r.prasarana ? <span className="block text-xs font-normal text-sand-500">🏫 {r.prasarana.name}</span> : null}</td>
                <td className="px-5 py-3 text-sand-600">{r.period}</td>
                <td className="px-5 py-3">
                  {linksOf(r).length
                    ? <div className="flex flex-wrap gap-1">{linksOf(r).map((l) => <Badge key={l.id} tone="accent">{linkTitle(l)}</Badge>)}</div>
                    : <span className="text-xs text-sand-400">belum ada sesi</span>}
                </td>
                <td className="px-5 py-3"><Badge tone="primary">{r.capacity}</Badge></td>
                <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                  <div className="flex flex-wrap gap-1.5">
                    <Button size="sm" variant="outline" onClick={() => { setLinkPick(''); setLinkModal(r); }}>+ Sesi</Button>
                    <Button size="sm" variant="outline" onClick={() => setEditRoom(r)}>Edit</Button>
                    <Button size="sm" variant="outline" className="text-red-600" onClick={async () => {
                      if (!window.confirm(`Hapus ruang ${r.name}? Semua sesi & peserta ikut terhapus.`)) return;
                      try { await deleteExamRoom(r.id); setNotice('Ruang dihapus.'); load(); }
                      catch (err) { setError(err instanceof Error ? err.message : 'Gagal menghapus.'); }
                    }}>Hapus</Button>
                  </div>
                </td>
              </tr>
              {open === r.id ? (
                <tr>
                  <td colSpan={5} className="bg-sand-50/50 px-5 py-4 space-y-5">
                    {linksOf(r).length === 0 && looseSeats(r).length === 0 ? (
                      <p className="py-1 text-sm text-sand-400">Belum ada sesi — klik <b>+ Sesi</b> untuk menjadwalkan sesi di ruang ini.</p>
                    ) : null}
                    {linksOf(r).map((l) => (
                      <div key={l.id} className="rounded-xl border border-sand-200 bg-white p-4">
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                          {l.exam ? <Badge tone="accent">{l.exam.title}</Badge> : <Badge tone="neutral">Sesi umum</Badge>}
                          {l.exam ? <span className="font-mono text-xs text-sand-500">{l.exam.code}</span> : null}
                          {linkSessionName(l) ? <Badge tone="primary">{linkSessionName(l)}</Badge> : null}
                          {linkSessionStart(l) || linkSessionEnd(l) ? (
                            <span className="text-xs text-sand-500">
                              {fmtDt(linkSessionStart(l)) ?? '…'} — {fmtDt(linkSessionEnd(l)) ?? '…'}
                            </span>
                          ) : null}
                          <span className="ml-auto flex flex-wrap gap-1.5">
                            <Badge tone={l._count.seats >= r.capacity ? 'danger' : 'primary'}>{l._count.seats}/{r.capacity}</Badge>
                            <Button size="sm" variant="outline" onClick={() => { setAssignModal({ room: r, link: l }); setAssignClassId(''); setAssignCount(''); }}>+ Rombel</Button>
                            <Button size="sm" onClick={() => void printCards(r.id, l.id)} disabled={!l._count.seats}>Cetak Kartu</Button>
                            <Button size="sm" variant="outline" onClick={() => void printStudentCards(l.id)} disabled={!l._count.seats} title="Satu kartu per siswa berisi semua jadwal ujiannya">Kartu Gabungan</Button>
                            <Button size="sm" variant="outline" onClick={() => printSeating(r, l)} disabled={!l._count.seats}>Daftar Duduk</Button>
                            <Button size="sm" variant="outline" onClick={() => void printDaftarPeserta(r, l)} disabled={!l._count.seats} title="Daftar peserta resmi: no peserta, L/P, kelas">Daftar Peserta</Button>
                            <button type="button" className="text-xs font-semibold text-red-500 hover:text-red-700" onClick={async () => {
                              if (!window.confirm(`Lepas sesi "${linkTitle(l)}" dari ${r.name}? ${l._count.seats} peserta ikut terhapus.`)) return;
                              try { await removeRoomLink(l.id); setNotice('Sesi dilepas.'); load(); }
                              catch (err) { setError(err instanceof Error ? err.message : 'Gagal.'); }
                            }}>Lepas</button>
                          </span>
                        </div>
                        {l.seats.length === 0
                          ? <p className="text-sm text-sand-400">Belum ada peserta — klik <b>+ Rombel</b>.</p>
                          : <SeatTable seats={l.seats} roomName={r.name} linkId={l.id} onChanged={load} />}
                      </div>
                    ))}
                    {looseSeats(r).length ? (
                      <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-700">Peserta tanpa sesi (data lama)</p>
                        <SeatTable seats={looseSeats(r)} roomName={r.name} onChanged={load} />
                        <Button size="sm" className="mt-3" onClick={() => void printCards(r.id)}>Cetak Kartu (tanpa sesi)</Button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ) : null}
            </Fragment>
          ))}
        </DataTable>
      </Widget>

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
              ...(String(fd.get('participantCode') ?? '').trim() ? { participantCode: String(fd.get('participantCode')).trim() } : {}),
              ...(String(fd.get('prasaranaId') ?? '') ? { prasaranaId: String(fd.get('prasaranaId')) } : {}),
            });
            setRoomModal(false); load(); setNotice('Ruang dibuat — tambahkan sesi ujian dari tombol + Sesi/Ujian.');
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
          <div className="grid grid-cols-2 gap-3">
            <Field label="Kapasitas"><Input name="capacity" type="number" min={1} defaultValue={24} /></Field>
            <Field label="Kode peserta" hint="Segmen tengah no. peserta — hasil: 07-145-001"><Input name="participantCode" defaultValue="145" maxLength={10} /></Field>
          </div>
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
              ...(String(fd.get('participantCode') ?? '').trim() ? { participantCode: String(fd.get('participantCode')).trim() } : {}),
              prasaranaId: String(fd.get('prasaranaId') ?? '') || null,
            });
            setEditRoom(null); load(); setNotice('Ruang diperbarui.');
          } catch (err) { setError(err instanceof Error ? err.message : 'Gagal.'); } finally { setBusy(false); }
        }}>
          <Field label="Nama ruang"><Input name="name" required defaultValue={editRoom?.name ?? ''} /></Field>
          <Field label="Periode ujian"><Input name="period" required defaultValue={editRoom?.period ?? ''} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Kapasitas`}><Input name="capacity" type="number" min={1} defaultValue={editRoom?.capacity ?? 24} /></Field>
            <Field label="Kode peserta" hint="Segmen tengah no. peserta baru — kode yang sudah tercetak tidak berubah"><Input name="participantCode" defaultValue={editRoom?.participantCode ?? '145'} maxLength={10} /></Field>
          </div>
          <Field label="Ruangan (Prasarana)">
            <Select name="prasaranaId" defaultValue={editRoom?.prasaranaId ?? ''} searchable>
              <option value="">— tidak ditautkan —</option>
              {prasaranas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <div className="flex justify-end"><Button type="submit" disabled={busy}>Simpan</Button></div>
        </form>
      </Modal>

      <Modal open={!!linkModal} onClose={() => setLinkModal(null)} title={`Jadwalkan sesi di ${linkModal?.name ?? ''}`}>
        <form className="grid gap-4" onSubmit={async (e) => {
          e.preventDefault();
          if (!linkModal || !linkPick) return;
          const fd = new FormData(e.currentTarget);
          setBusy(true);
          try {
            await addRoomLink(linkModal.id, linkPick === 'manual'
              ? {
                  ...(String(fd.get('sessionLabel') ?? '').trim() ? { sessionLabel: String(fd.get('sessionLabel')).trim() } : {}),
                  ...(String(fd.get('startsAt') ?? '') ? { startsAt: String(fd.get('startsAt')) } : {}),
                  ...(String(fd.get('endsAt') ?? '') ? { endsAt: String(fd.get('endsAt')) } : {}),
                }
              : { sessionId: linkPick });
            setLinkModal(null); load(); setNotice('Sesi ditambahkan — tempatkan rombel lalu cetak kartu.');
          } catch (err) { setError(err instanceof Error ? err.message : 'Gagal.'); } finally { setBusy(false); }
        }}>
          <Field label="Sesi" hint="Pilih sesi dari ujian CBT (nama, waktu & rombel mengikuti sesi itu), atau sesi umum untuk campur rombel lintas jenjang.">
            <Select value={linkPick} onChange={(e) => setLinkPick(e.target.value)} searchable>
              <option value="">— pilih sesi —</option>
              {sessionOptions.map((s) => (
                <option key={s.id} value={s.id}>{s.name} · {s.examTitle} · {fmtDt(s.startAt)}—{fmtDt(s.endAt)}</option>
              ))}
              <option value="manual">➕ Sesi umum (manual) — campur rombel bebas</option>
            </Select>
          </Field>
          {linkPick === 'manual' ? (
            <>
              <Field label="Label sesi" hint='Label sama di ruang lain dianggap slot yang sama — siswa yang sudah duduk di "Sesi 1" ruang lain dilewati otomatis.'>
                <Input name="sessionLabel" required placeholder="Sesi 1 / Pagi / Sesi 2" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Mulai (opsional)"><Input name="startsAt" type="datetime-local" /></Field>
                <Field label="Selesai (opsional)"><Input name="endsAt" type="datetime-local" /></Field>
              </div>
            </>
          ) : null}
          <p className="text-xs text-sand-500">Satu sesi bisa memakai beberapa ruang & rombel campuran — buat sesi yang sama di ruang lain lalu tempatkan rombel; sistem otomatis melanjutkan sisa siswa tanpa duplikat.</p>
          <div className="flex justify-end"><Button type="submit" disabled={busy || !linkPick}>Tautkan</Button></div>
        </form>
      </Modal>

      <Modal open={!!assignModal} onClose={() => setAssignModal(null)} title={`Masukkan rombel — ${assignModal?.link ? linkTitle(assignModal.link) : assignModal?.room.name ?? ''}`}>
        <div className="grid gap-4">
          <Field label="Kelas" hint={assignModal?.link?.session ? `Hanya rombel peserta ${assignModal.link.session.name} yang bisa ditempatkan.` : 'Sesi umum — semua rombel bisa dicampur di sini.'}>
            <Select value={assignClassId} onChange={(e) => setAssignClassId(e.target.value)} searchable>
              <option value="">— pilih kelas —</option>
              {classes
                .filter((c) => {
                  const allowed = assignModal?.link?.session?.classIds;
                  return !allowed?.length || allowed.includes(c.id);
                })
                .map((c) => <option key={c.id} value={c.id}>{c.name} ({c.gradeLevel ?? ''}{c._count?.enrollments != null ? ` · ${c._count.enrollments} siswa` : ''})</option>)}
            </Select>
          </Field>
          <Field label="Jumlah siswa (kosong = sisa)" hint="Siswa yang sudah duduk di sesi ini (ruang lain pun) otomatis dilewati — isi angka untuk batasi, kosongkan untuk semua sisa sampai kursi penuh.">
            <Input type="number" min={1} value={assignCount} onChange={(e) => setAssignCount(e.target.value)} placeholder="sisa" />
          </Field>
          <Button disabled={!assignClassId || busy} onClick={async () => {
            if (!assignModal || !assignClassId) return;
            setBusy(true);
            try {
              const r = await assignClassToRoom(assignModal.room.id, assignClassId, assignModal.link?.id, assignCount ? Number(assignCount) : undefined);
              setNotice(`${r.added} siswa ditempatkan${r.skipped ? ` · ${r.skipped} sudah ada` : ''}${r.remaining ? ` · sisa ${r.remaining} belum dapat kursi` : ''}.`);
              setAssignClassId(''); setAssignCount('');
              load();
            } catch (err) { setError(err instanceof Error ? err.message : 'Gagal menempatkan.'); } finally { setBusy(false); }
          }}>Tempatkan Rombel</Button>
          <p className="text-xs text-sand-500">Pecah satu kelas ke beberapa ruang: tempatkan di ruang pertama, lalu di ruang berikutnya siswa yang sudah duduk dilewati otomatis — tak ada duplikat.</p>
        </div>
      </Modal>
    </Shell>
  );
}
