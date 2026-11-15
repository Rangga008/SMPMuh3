'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { Badge, Button, Field, Input, Modal, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { PageTitle, Widget } from '@/components/widgets';
import { DataTable } from '@/components/data-table';
import {
  assignClassToRoom, createExamRoom, deleteExamRoom, getExamCards, listExamRooms,
  listExams, removeExamSeat, updateExamRoom, type ExamRoomView, type ExamView,
} from '@/lib/api-ops';
import { listAcademicYears, listClasses, type AcademicYear, type ClassView } from '@/lib/api';

export default function UjianPage() {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [classes, setClasses] = useState<ClassView[]>([]);
  const [exams, setExams] = useState<ExamView[]>([]);
  const [yearId, setYearId] = useState('');
  const [rooms, setRooms] = useState<ExamRoomView[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [roomModal, setRoomModal] = useState(false);
  const [editRoom, setEditRoom] = useState<ExamRoomView | null>(null);
  const [assignModal, setAssignModal] = useState<ExamRoomView | null>(null);
  const [assignClassId, setAssignClassId] = useState('');
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
    listClasses(yearId).then(setClasses).catch(() => {});
    listExams(yearId).then(setExams).catch(() => setExams([]));
  }, [yearId]);
  useEffect(load, [load]);

  /** Kartu peserta: NIS + KODE UJIAN (kredensial CBT) + ruang/no kursi. */
  const printCards = async (roomId: string) => {
    const { room, school } = await getExamCards(roomId);
    const w = window.open('', '_blank', 'width=800,height=900');
    if (!w) return;
    const examLine = room.exam
      ? `<tr><td>Ujian</td><td>: ${room.exam.title}</td></tr>
         <tr><td>Kode Ujian</td><td>: <b class="kode">${room.exam.code}</b></td></tr>`
      : '<tr><td>Kode Ujian</td><td>: <i>ruang belum ditautkan ke ujian CBT</i></td></tr>';
    const cards = room.seats.map((s) => `
      <div class="card">
        <div class="kop">${school?.logoUrl ? `<img src="/logo.png" class="logo" onerror="this.style.display='none'"/>` : ''}<div>
          <b>${school?.name ?? 'SMP Muhammadiyah 3 Kota Bandung'}</b>${school?.npsn ? ` · NPSN ${school.npsn}` : ''}<br>
          <span class="sub">Kartu Peserta ${room.period} · TA ${room.academicYear?.name ?? ''}</span></div></div>
        <table>
          <tr><td>Nama</td><td>: <b>${s.student.name}</b></td></tr>
          <tr><td>NIS</td><td>: <b class="kode">${s.student.nis ?? '—'}</b></td></tr>
          ${examLine}
          <tr><td>Kelas</td><td>: ${s.class?.name ?? '—'}</td></tr>
          <tr><td>Ruang</td><td>: <b>${room.name}</b> · No. ${s.seatNo ?? '—'}</td></tr>
        </table>
        <div class="hint">Login CBT: masukkan <b>NIS</b> &amp; <b>Kode Ujian</b> di atas.</div>
      </div>`).join('');
    w.document.write(`<!doctype html><html><head><title>Kartu ${room.name}</title><style>
      body{font-family:Arial,sans-serif;margin:16px;color:#1e293b}
      .card{border:1.5px solid #334155;border-radius:8px;padding:14px;margin:0 0 14px;display:inline-block;width:340px;vertical-align:top}
      .kop{display:flex;gap:10px;align-items:center;border-bottom:2px solid #0f3a63;padding-bottom:8px;margin-bottom:8px}
      .logo{height:40px}.sub{font-size:11px;color:#475569}
      table{font-size:12.5px}td{padding:2px 6px 2px 0}
      .kode{font-family:ui-monospace,monospace;font-size:13px;letter-spacing:.04em}
      .hint{margin-top:8px;font-size:10.5px;color:#64748b;border-top:1px dashed #cbd5e1;padding-top:6px}
      @media print{.card{page-break-inside:avoid}}
    </style></head><body>${cards}<script>window.print()</script></body></html>`);
    w.document.close();
  };

  return (
    <Shell>
      <PageTitle title="Ruang Ujian & Kartu Peserta" subtitle="Atur ruang ujian per periode, tautkan ke ujian CBT, tempatkan rombel, cetak kartu peserta (NIS + kode ujian)."
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

      <Widget title={`Ruang Ujian (${rooms.length})`} subtitle="Klik baris untuk membuka daftar peserta ruang.">
        <DataTable head={['Ruang', 'Periode', 'Ujian CBT', 'Terisi', 'Aksi']} loading={false} empty={rooms.length === 0 ? 'Belum ada ruang ujian.' : undefined}>
          {rooms.map((r) => (
            <Fragment key={r.id}>
              <tr className="cursor-pointer hover:bg-sand-50/60" onClick={() => setOpen(open === r.id ? null : r.id)}>
                <td className="px-5 py-3 font-semibold text-sand-900">{open === r.id ? '▾' : '▸'} {r.name}</td>
                <td className="px-5 py-3 text-sand-600">{r.period}</td>
                <td className="px-5 py-3">
                  {r.exam
                    ? <span><Badge tone="accent">{r.exam.title}</Badge> <span className="font-mono text-xs text-sand-500">{r.exam.code}</span></span>
                    : <span className="text-xs text-sand-400">belum ditautkan</span>}
                </td>
                <td className="px-5 py-3"><Badge tone={r._count.seats >= r.capacity ? 'danger' : 'primary'}>{r._count.seats}/{r.capacity}</Badge></td>
                <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                  <div className="flex flex-wrap gap-1.5">
                    <Button size="sm" variant="outline" onClick={() => { setAssignModal(r); setAssignClassId(''); }}>+ Rombel</Button>
                    <Button size="sm" variant="outline" onClick={() => setEditRoom(r)}>Edit</Button>
                    <Button size="sm" variant="outline" className="text-red-600" onClick={async () => {
                      if (!window.confirm(`Hapus ruang ${r.name}? ${r._count.seats} peserta ikut terhapus.`)) return;
                      try { await deleteExamRoom(r.id); setNotice('Ruang dihapus.'); load(); }
                      catch (err) { setError(err instanceof Error ? err.message : 'Gagal menghapus.'); }
                    }}>Hapus</Button>
                    <Button size="sm" onClick={() => void printCards(r.id)} disabled={!r._count.seats}>Cetak Kartu</Button>
                  </div>
                </td>
              </tr>
              {open === r.id ? (
                <tr>
                  <td colSpan={5} className="bg-sand-50/50 px-5 py-3">
                    {r.seats.length === 0 ? (
                      <p className="py-2 text-sm text-sand-400">Belum ada peserta — klik <b>+ Rombel</b> untuk menempatkan kelas.</p>
                    ) : (
                      <table className="w-full max-w-3xl text-sm">
                        <thead><tr className="border-b border-sand-200 text-left text-xs uppercase tracking-wide text-sand-500">
                          <th className="py-1.5 pr-4">No</th><th className="py-1.5 pr-4">NIS</th><th className="py-1.5 pr-4">Nama</th><th className="py-1.5 pr-4">Kelas</th><th className="py-1.5 pr-4">Kode Peserta</th><th className="py-1.5"></th>
                        </tr></thead>
                        <tbody>
                          {r.seats.map((s) => (
                            <tr key={s.id} className="border-b border-sand-100 last:border-0">
                              <td className="py-1.5 pr-4 font-semibold text-sand-800">{s.seatNo ?? '—'}</td>
                              <td className="py-1.5 pr-4 font-mono text-xs text-sand-600">{s.student.nis ?? '—'}</td>
                              <td className="py-1.5 pr-4 font-medium text-sand-900">{s.student.name}</td>
                              <td className="py-1.5 pr-4 text-sand-600">{s.class?.name ?? '—'}</td>
                              <td className="py-1.5 pr-4 font-mono text-xs text-sand-500">{s.code ?? '—'}</td>
                              <td className="py-1.5 text-right">
                                <button type="button" className="text-xs font-semibold text-red-500 hover:text-red-700" onClick={async () => {
                                  if (!window.confirm(`Keluarkan ${s.student.name} dari ${r.name}?`)) return;
                                  try { await removeExamSeat(s.id); load(); } catch (err) { setError(err instanceof Error ? err.message : 'Gagal.'); }
                                }}>Keluarkan</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
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
              name: String(fd.get('name')), period: String(fd.get('period')),
              academicYearId: yearId, capacity: Number(fd.get('capacity')) || 24,
              ...(fd.get('examId') ? { examId: String(fd.get('examId')) } : {}),
            });
            setRoomModal(false); load(); setNotice('Ruang dibuat.');
          } catch (err) { setError(err instanceof Error ? err.message : 'Gagal.'); } finally { setBusy(false); }
        }}>
          <Field label="Nama ruang"><Input name="name" required placeholder="Ruang 1 / Lab IPA" /></Field>
          <Field label="Periode ujian"><Input name="period" required placeholder="US 2026 / PTS Ganjil" /></Field>
          <Field label="Kapasitas"><Input name="capacity" type="number" min={1} defaultValue={24} /></Field>
          <Field label="Tautkan ujian CBT (kartu cetak kode ujian)">
            <Select name="examId" defaultValue="">
              <option value="">— tidak ditautkan —</option>
              {exams.map((x) => <option key={x.id} value={x.id}>{x.title} · {x.code}</option>)}
            </Select>
          </Field>
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
              examId: fd.get('examId') ? String(fd.get('examId')) : null,
            });
            setEditRoom(null); load(); setNotice('Ruang diperbarui.');
          } catch (err) { setError(err instanceof Error ? err.message : 'Gagal.'); } finally { setBusy(false); }
        }}>
          <Field label="Nama ruang"><Input name="name" required defaultValue={editRoom?.name ?? ''} /></Field>
          <Field label="Periode ujian"><Input name="period" required defaultValue={editRoom?.period ?? ''} /></Field>
          <Field label={`Kapasitas (peserta saat ini: ${editRoom?._count.seats ?? 0})`}>
            <Input name="capacity" type="number" min={editRoom?._count.seats ?? 1} defaultValue={editRoom?.capacity ?? 24} />
          </Field>
          <Field label="Tautkan ujian CBT">
            <Select name="examId" defaultValue={editRoom?.examId ?? ''}>
              <option value="">— tidak ditautkan —</option>
              {exams.map((x) => <option key={x.id} value={x.id}>{x.title} · {x.code}</option>)}
            </Select>
          </Field>
          <div className="flex justify-end"><Button type="submit" disabled={busy}>Simpan</Button></div>
        </form>
      </Modal>

      <Modal open={!!assignModal} onClose={() => setAssignModal(null)} title={`Masukkan rombel ke ${assignModal?.name ?? ''}`}>
        <div className="grid gap-4">
          <Field label="Kelas">
            <Select value={assignClassId} onChange={(e) => setAssignClassId(e.target.value)}>
              <option value="">— pilih kelas —</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Button disabled={!assignClassId || busy} onClick={async () => {
            if (!assignModal || !assignClassId) return;
            setBusy(true);
            try {
              const r = await assignClassToRoom(assignModal.id, assignClassId);
              setNotice(`${r.added} siswa ditempatkan${r.skipped ? ` · ${r.skipped} dilewati` : ''}.`);
              setAssignModal(null); load();
            } catch (err) { setError(err instanceof Error ? err.message : 'Gagal menempatkan.'); } finally { setBusy(false); }
          }}>Tempatkan Rombel</Button>
        </div>
      </Modal>
    </Shell>
  );
}
