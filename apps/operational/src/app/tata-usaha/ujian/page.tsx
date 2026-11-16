'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { Badge, Button, Field, Input, Modal, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { PageTitle, Widget } from '@/components/widgets';
import { DataTable } from '@/components/data-table';
import {
  addRoomLink, assignClassToRoom, createExamRoom, deleteExamRoom, getExamCards,
  listExamRooms, listExams, listPrasaranas, removeExamSeat, removeRoomLink, updateExamRoom,
  type ExamRoomLinkView, type ExamRoomView, type ExamSeatView, type ExamView, type Prasarana,
} from '@/lib/api-ops';
import { listAcademicYears, listClasses, type AcademicYear, type ClassView } from '@/lib/api';
import { printHtml } from '@/lib/print';

const fmtDt = (s?: string | null) =>
  s ? new Date(s).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : null;

function SeatTable({ seats, roomName, onChanged }: { seats: ExamSeatView[]; roomName: string; onChanged: () => void }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      {error ? <p className="mb-2 text-xs text-red-600">{error}</p> : null}
      <table className="w-full max-w-3xl text-sm">
        <thead><tr className="border-b border-sand-200 text-left text-xs uppercase tracking-wide text-sand-500">
          <th className="py-1.5 pr-4">No</th><th className="py-1.5 pr-4">NIS</th><th className="py-1.5 pr-4">Nama</th>
          <th className="py-1.5 pr-4">Kelas</th><th className="py-1.5 pr-4">Kode Peserta</th><th className="py-1.5"></th>
        </tr></thead>
        <tbody>
          {seats.map((s) => (
            <tr key={s.id} className="border-b border-sand-100 last:border-0">
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
      </table>
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
    const { room, link, credentials, school } = await getExamCards(roomId, linkId);
    const exam = link?.exam ?? room.exam;
    const sessionInfo = link
      ? [link.sessionLabel, fmtDt(link.startsAt), fmtDt(link.endsAt)].filter(Boolean).join(' · ')
      : null;
    // Kode ujian SENGAJA tidak dicetak — diumumkan pengawas di ruang agar
    // ujian tidak bisa dikerjakan dari luar sekolah.
    const examLines = exam
      ? `<tr><td>Ujian</td><td>: ${exam.title}</td></tr>`
      : '<tr><td>Ujian</td><td>: <i>sesi belum ditautkan ke ujian CBT</i></td></tr>';
    const cards = room.seats.map((s) => {
      const pw = credentials?.[s.student.id];
      return `
      <div class="card">
        <div class="kop">${school?.logoUrl ? `<img src="/logo.png" class="logo" onerror="this.style.display='none'"/>` : ''}<div>
          <b>${school?.name ?? 'SMP Muhammadiyah 3 Kota Bandung'}</b>${school?.npsn ? ` · NPSN ${school.npsn}` : ''}<br>
          <span class="sub">Kartu Peserta ${room.period}${sessionInfo ? ` · ${sessionInfo}` : ''} · TA ${room.academicYear?.name ?? ''}</span></div></div>
        <table>
          <tr><td>Nama</td><td>: <b>${s.student.name}</b></td></tr>
          <tr><td>NIS</td><td>: <b class="kode">${s.student.nis ?? '—'}</b></td></tr>
          ${examLines}
          ${pw ? `<tr><td>Password</td><td>: <b class="kode">${pw}</b></td></tr>` : ''}
          <tr><td>Kelas</td><td>: ${s.class?.name ?? '—'}</td></tr>
          <tr><td>Ruang</td><td>: <b>${room.name}</b> · No. ${s.seatNo ?? '—'}</td></tr>
        </table>
        <div class="hint">Login CBT: masukkan <b>NIS</b> &amp; <b>Password</b> di atas. <b>Kode ujian diumumkan pengawas</b> di ruang. Simpan kartu ini.</div>
      </div>`;
    }).join('');
    printHtml(`Kartu ${room.name}${sessionInfo ? ` ${sessionInfo}` : ''}`, `
      <style>
        .card{border:1.5px solid #334155;border-radius:8px;padding:14px;margin:0 0 14px;display:inline-block;width:340px;vertical-align:top}
        .kop{display:flex;gap:10px;align-items:center;border-bottom:2px solid #0f3a63;padding-bottom:8px;margin-bottom:8px}
        .logo{height:40px}.sub{font-size:11px;color:#475569}
        table{font-size:12.5px}td{padding:2px 6px 2px 0}
        .kode{font-family:ui-monospace,monospace;font-size:13px;letter-spacing:.04em}
        .hint{margin-top:8px;font-size:10.5px;color:#64748b;border-top:1px dashed #cbd5e1;padding-top:6px}
        @media print{.card{page-break-inside:avoid}}
      </style>${cards}`);
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
      <table><thead><tr><th>Bangku</th><th>NIS</th><th>Nama</th><th>Kode Peserta</th></tr></thead><tbody>
      ${list.map((s) => `<tr><td class="no">${s.seatNo ?? '—'}</td><td>${s.student.nis ?? '—'}</td><td>${s.student.name}</td><td class="mono">${s.code ?? '—'}</td></tr>`).join('')}
      </tbody></table>`).join('');
    printHtml(`Daftar Duduk ${r.name} — ${l.sessionLabel ?? l.exam.title}`, `
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
      <p class="sub">${l.exam.title}${l.sessionLabel ? ` · ${l.sessionLabel}` : ''}${l.startsAt ? ` · ${fmtDt(l.startsAt)}` : ''} · ${seats.length}/${r.capacity} kursi</p>
      ${rows}`);
  };

  const linksOf = (r: ExamRoomView) => r.links ?? [];
  const looseSeats = (r: ExamRoomView) => r.seats ?? [];

  return (
    <Shell>
      <PageTitle title="Ruang Ujian & Kartu Peserta" subtitle="Satu ruang bisa host beberapa sesi/ujian di waktu berbeda — tautkan ujian CBT per sesi, tempatkan rombel, cetak kartu (NIS + password — kode ujian dari pengawas)."
        actions={<Button size="sm" onClick={() => setRoomModal(true)}>+ Ruang</Button>} />
      {error ? <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {notice ? <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p> : null}

      <div className="mb-4">
        <Field label="Tahun Ajaran" className="max-w-56">
          <Select value={yearId} onChange={(e) => setYearId(e.target.value)}>
            {years.map((y) => <option key={y.id} value={y.id}>{y.name}{y.isActive ? ' (aktif)' : ''}</option>)}
          </Select>
        </Field>
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
                    ? <div className="flex flex-wrap gap-1">{linksOf(r).map((l) => <Badge key={l.id} tone="accent">{l.sessionLabel ?? l.exam.title}</Badge>)}</div>
                    : <span className="text-xs text-sand-400">belum ada sesi</span>}
                </td>
                <td className="px-5 py-3"><Badge tone="primary">{r.capacity}</Badge></td>
                <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                  <div className="flex flex-wrap gap-1.5">
                    <Button size="sm" variant="outline" onClick={() => setLinkModal(r)}>+ Sesi/Ujian</Button>
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
                      <p className="py-1 text-sm text-sand-400">Belum ada sesi — klik <b>+ Sesi/Ujian</b> untuk menjadwalkan ujian di ruang ini.</p>
                    ) : null}
                    {linksOf(r).map((l) => (
                      <div key={l.id} className="rounded-xl border border-sand-200 bg-white p-4">
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                          <Badge tone="accent">{l.exam.title}</Badge>
                          <span className="font-mono text-xs text-sand-500">{l.exam.code}</span>
                          {l.sessionLabel ? <Badge tone="primary">{l.sessionLabel}</Badge> : null}
                          {l.startsAt || l.endsAt ? (
                            <span className="text-xs text-sand-500">
                              {fmtDt(l.startsAt) ?? '…'} — {fmtDt(l.endsAt) ?? '…'}
                            </span>
                          ) : null}
                          <span className="ml-auto flex flex-wrap gap-1.5">
                            <Badge tone={l._count.seats >= r.capacity ? 'danger' : 'primary'}>{l._count.seats}/{r.capacity}</Badge>
                            <Button size="sm" variant="outline" onClick={() => { setAssignModal({ room: r, link: l }); setAssignClassId(''); setAssignCount(''); }}>+ Rombel</Button>
                            <Button size="sm" onClick={() => void printCards(r.id, l.id)} disabled={!l._count.seats}>Cetak Kartu</Button>
                            <Button size="sm" variant="outline" onClick={() => printSeating(r, l)} disabled={!l._count.seats}>Daftar Duduk</Button>
                            <button type="button" className="text-xs font-semibold text-red-500 hover:text-red-700" onClick={async () => {
                              if (!window.confirm(`Lepas sesi "${l.sessionLabel ?? l.exam.title}" dari ${r.name}? ${l._count.seats} peserta ikut terhapus.`)) return;
                              try { await removeRoomLink(l.id); setNotice('Sesi dilepas.'); load(); }
                              catch (err) { setError(err instanceof Error ? err.message : 'Gagal.'); }
                            }}>Lepas</button>
                          </span>
                        </div>
                        {l.seats.length === 0
                          ? <p className="text-sm text-sand-400">Belum ada peserta — klik <b>+ Rombel</b>.</p>
                          : <SeatTable seats={l.seats} roomName={r.name} onChanged={load} />}
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
              ...(String(fd.get('prasaranaId') ?? '') ? { prasaranaId: String(fd.get('prasaranaId')) } : {}),
            });
            setRoomModal(false); load(); setNotice('Ruang dibuat — tambahkan sesi ujian dari tombol + Sesi/Ujian.');
          } catch (err) { setError(err instanceof Error ? err.message : 'Gagal.'); } finally { setBusy(false); }
        }}>
          <Field label="Ruangan (Prasarana)">
            <Select name="prasaranaId" defaultValue="">
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
            <Select name="prasaranaId" defaultValue={editRoom?.prasaranaId ?? ''}>
              <option value="">— tidak ditautkan —</option>
              {prasaranas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <div className="flex justify-end"><Button type="submit" disabled={busy}>Simpan</Button></div>
        </form>
      </Modal>

      <Modal open={!!linkModal} onClose={() => setLinkModal(null)} title={`Jadwalkan sesi/ujian di ${linkModal?.name ?? ''}`}>
        <form className="grid gap-4" onSubmit={async (e) => {
          e.preventDefault();
          if (!linkModal) return;
          const fd = new FormData(e.currentTarget);
          const examId = String(fd.get('examId') ?? '');
          if (!examId) { setError('Pilih ujian dulu.'); return; }
          setBusy(true);
          try {
            await addRoomLink(linkModal.id, {
              examId,
              ...(String(fd.get('sessionLabel') ?? '').trim() ? { sessionLabel: String(fd.get('sessionLabel')).trim() } : {}),
              ...(String(fd.get('startsAt') ?? '') ? { startsAt: String(fd.get('startsAt')) } : {}),
              ...(String(fd.get('endsAt') ?? '') ? { endsAt: String(fd.get('endsAt')) } : {}),
            });
            setLinkModal(null); load(); setNotice('Sesi ditambahkan — tempatkan rombel lalu cetak kartu.');
          } catch (err) { setError(err instanceof Error ? err.message : 'Gagal.'); } finally { setBusy(false); }
        }}>
          <Field label="Ujian CBT">
            <Select name="examId" defaultValue="">
              <option value="">— pilih ujian —</option>
              {exams.map((x) => <option key={x.id} value={x.id}>{x.title} · {x.code}</option>)}
            </Select>
          </Field>
          <Field label="Label sesi (opsional)"><Input name="sessionLabel" placeholder="Sesi 1 / Pagi / Sesi 2" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Mulai (opsional)"><Input name="startsAt" type="datetime-local" /></Field>
            <Field label="Selesai (opsional)"><Input name="endsAt" type="datetime-local" /></Field>
          </div>
          <p className="text-xs text-sand-500">Waktu di sini hanya label di kartu — jadwal resmi tetap dari ujian CBT & sesi rombelnya.</p>
          <div className="flex justify-end"><Button type="submit" disabled={busy}>Tautkan</Button></div>
        </form>
      </Modal>

      <Modal open={!!assignModal} onClose={() => setAssignModal(null)} title={`Masukkan rombel — ${assignModal?.link ? `${assignModal.link.sessionLabel ?? assignModal.link.exam.title}` : assignModal?.room.name ?? ''}`}>
        <div className="grid gap-4">
          <Field label="Kelas">
            <Select value={assignClassId} onChange={(e) => setAssignClassId(e.target.value)}>
              <option value="">— pilih kelas —</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.gradeLevel ?? ''}{c._count?.enrollments != null ? ` · ${c._count.enrollments} siswa` : ''})</option>)}
            </Select>
          </Field>
          <Field label="Jumlah siswa (kosong = semua)" hint="Siswa diurut NIS — diambil sebanyak ini sampai kursi penuh. Ulangi untuk kelas lain (bisa campur jenjang).">
            <Input type="number" min={1} value={assignCount} onChange={(e) => setAssignCount(e.target.value)} placeholder="semua" />
          </Field>
          <Button disabled={!assignClassId || busy} onClick={async () => {
            if (!assignModal || !assignClassId) return;
            setBusy(true);
            try {
              const r = await assignClassToRoom(assignModal.room.id, assignClassId, assignModal.link?.id, assignCount ? Number(assignCount) : undefined);
              setNotice(`${r.added} siswa ditempatkan${r.skipped ? ` · ${r.skipped} dilewati` : ''}.`);
              setAssignClassId(''); setAssignCount('');
              load();
            } catch (err) { setError(err instanceof Error ? err.message : 'Gagal menempatkan.'); } finally { setBusy(false); }
          }}>Tempatkan Rombel</Button>
          <p className="text-xs text-sand-500">Ulangi untuk kelas lain — satu ruang bisa campur beberapa kelas & jenjang; setiap siswa dapat nomor bangku urut.</p>
        </div>
      </Modal>
    </Shell>
  );
}
