'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Field, Input, Modal, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { PageTitle, Widget } from '@/components/widgets';
import {
  assignClassToRoom, createExamRoom, getExamCards, listExamRooms, type ExamRoomView,
} from '@/lib/api-ops';
import { listAcademicYears, listClasses, type AcademicYear, type ClassView } from '@/lib/api';

export default function UjianPage() {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [classes, setClasses] = useState<ClassView[]>([]);
  const [yearId, setYearId] = useState('');
  const [rooms, setRooms] = useState<ExamRoomView[]>([]);
  const [roomModal, setRoomModal] = useState(false);
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
  }, [yearId]);
  useEffect(load, [load]);

  const printCards = async (roomId: string) => {
    const { room, school } = await getExamCards(roomId);
    const w = window.open('', '_blank', 'width=800,height=900');
    if (!w) return;
    const cards = room.seats.map((s) => `
      <div class="card">
        <div class="kop">${school?.logoUrl ? `<img src="${school.logoUrl}" class="logo" onerror="this.style.display='none'"/>` : ''}<div>
          <b>${school?.name ?? 'SMP Muhammadiyah 3 Kota Bandung'}</b>${school?.npsn ? ` · NPSN ${school.npsn}` : ''}<br>
          <span class="sub">Kartu Peserta ${room.period} · TA ${room.academicYear?.name ?? ''}</span></div></div>
        <table>
          <tr><td>Nama</td><td>: <b>${s.student.name}</b></td></tr>
          <tr><td>NIS</td><td>: ${s.student.nis ?? '—'}</td></tr>
          <tr><td>Kelas</td><td>: ${s.class?.name ?? '—'}</td></tr>
          <tr><td>Ruang</td><td>: <b>${room.name}</b> · No. ${s.seatNo ?? '—'}</td></tr>
        </table>
      </div>`).join('');
    w.document.write(`<!doctype html><html><head><title>Kartu ${room.name}</title><style>
      body{font-family:Arial,sans-serif;margin:16px;color:#1e293b}
      .card{border:1.5px solid #334155;border-radius:8px;padding:14px;margin:0 0 14px;display:inline-block;width:340px;vertical-align:top}
      .kop{display:flex;gap:10px;align-items:center;border-bottom:2px solid #0f3a63;padding-bottom:8px;margin-bottom:8px}
      .logo{height:40px}.sub{font-size:11px;color:#475569}
      table{font-size:12.5px}td{padding:2px 6px 2px 0}
      @media print{.card{page-break-inside:avoid}}
    </style></head><body>${cards}<script>window.print()</script></body></html>`);
    w.document.close();
  };

  return (
    <Shell>
      <PageTitle title="Ruang Ujian & Kartu Peserta" subtitle="Atur ruang ujian per periode, tempatkan rombel per ruang, cetak kartu peserta per ruang."
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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {rooms.length === 0 ? <p className="text-sm text-sand-400">Belum ada ruang ujian — buat dengan tombol di atas.</p> : rooms.map((r) => (
          <div key={r.id} className="rounded-2xl border border-sand-200 bg-white p-4 shadow-card">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-extrabold text-sand-900">{r.name}</p>
                <p className="text-xs text-sand-500">{r.period}</p>
              </div>
              <Badge tone={r._count.seats >= r.capacity ? 'danger' : 'accent'}>{r._count.seats}/{r.capacity}</Badge>
            </div>
            <ul className="mt-2 max-h-28 space-y-0.5 overflow-y-auto text-xs text-sand-600">
              {r.seats.map((s) => <li key={s.id}>{s.seatNo}. {s.student.name} <span className="text-sand-400">({s.class?.name ?? '—'})</span></li>)}
            </ul>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="outline" onClick={() => { setAssignModal(r); setAssignClassId(''); }}>+ Rombel</Button>
              <Button size="sm" onClick={() => void printCards(r.id)} disabled={!r._count.seats}>Cetak Kartu</Button>
            </div>
          </div>
        ))}
      </div>

      <Modal open={roomModal} onClose={() => setRoomModal(false)} title="Ruang Ujian Baru">
        <form className="grid gap-4" onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          setBusy(true);
          try {
            await createExamRoom({
              name: String(fd.get('name')), period: String(fd.get('period')),
              academicYearId: yearId, capacity: Number(fd.get('capacity')) || 24,
            });
            setRoomModal(false); load(); setNotice('Ruang dibuat.');
          } catch { setError('Gagal.'); } finally { setBusy(false); }
        }}>
          <Field label="Nama ruang"><Input name="name" required placeholder="Ruang 1 / Lab IPA" /></Field>
          <Field label="Periode ujian"><Input name="period" required placeholder="US 2026 / PTS Ganjil" /></Field>
          <Field label="Kapasitas"><Input name="capacity" type="number" min={1} defaultValue={24} /></Field>
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
            } catch { setError('Gagal menempatkan.'); } finally { setBusy(false); }
          }}>Tempatkan Rombel</Button>
        </div>
      </Modal>
    </Shell>
  );
}
