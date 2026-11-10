'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Field, Input, Modal, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { PageTitle, Widget } from '@/components/widgets';
import { useConfirm } from '@/components/confirm-dialog';
import {
  createScheduleBlock,
  deleteScheduleBlock,
  downloadTimetableXlsx,
  getTimetable,
  listScheduleBlocks,
  type ScheduleBlock,
  type TimetableSlot,
} from '@/lib/api-ops';
import { listAcademicYears, listClasses, type AcademicYear, type ClassView } from '@/lib/api';
import { PERMISSIONS } from '@smpmuh3/types';
import { usePermission } from '@/lib/use-permission';

const DAY_NAMES = ['', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
const mm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}.${String(m % 60).padStart(2, '0')}`;
const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

export default function JadwalKelasPage() {
  const { confirm, dialog } = useConfirm();
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [classes, setClasses] = useState<ClassView[]>([]);
  const [yearId, setYearId] = useState('');
  const [classId, setClassId] = useState('');
  const [tt, setTt] = useState<Record<number, TimetableSlot[]>>({});
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [blockModal, setBlockModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const canManage = usePermission(PERMISSIONS.ACADEMIC_MANAGE);

  useEffect(() => {
    listAcademicYears().then((ys) => {
      setYears(ys);
      const a = ys.find((x) => x.isActive) ?? ys[0];
      if (a) setYearId(a.id);
    });
  }, []);
  useEffect(() => {
    if (!yearId) return;
    listClasses(yearId).then((cs) => {
      setClasses(cs);
      if (!classId && cs[0]) setClassId(cs[0].id);
    });
    listScheduleBlocks(yearId).then(setBlocks).catch(() => {});
  }, [yearId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadTt = useCallback(() => {
    if (!classId) return;
    getTimetable(classId).then((r) => setTt(r.days)).catch(() => setTt({}));
  }, [classId]);
  useEffect(loadTt, [loadTt]);

  const saveBlock = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const b = await createScheduleBlock({
        label: String(fd.get('label')),
        day: fd.get('day') ? Number(fd.get('day')) : undefined,
        date: String(fd.get('date')) || undefined,
        startMinute: toMin(String(fd.get('start'))),
        endMinute: toMin(String(fd.get('end'))),
        academicYearId: yearId,
      });
      setBlocks((bs) => [...bs, b]);
      setBlockModal(false);
      loadTt();
      setNotice(`Blok "${b.label}" ditambahkan.`);
    } catch {
      setError('Gagal menyimpan blok.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <PageTitle
        title="Jadwal Kelas & Blok Rutin"
        subtitle="Jadwal mingguan per kelas (berlaku satu semester) + blok non-mapel: Ishoma, Pembiasaan, Istirahat, Upacara."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => yearId && downloadTimetableXlsx(yearId, classId || undefined)}>
              Export Excel
            </Button>
            <Button variant="outline" size="sm" onClick={() => yearId && window.open(`/kurikulum/jadwal-kelas/cetak?year=${yearId}`, '_blank')}>
              Cetak PDF
            </Button>
          </div>
        }
      />
      {dialog}
      {error ? <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {notice ? <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p> : null}

      <div className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl border border-sand-200 bg-white p-4 shadow-card">
        <Field label="Tahun Ajaran">
          <Select value={yearId} onChange={(e) => { setYearId(e.target.value); setClassId(''); }}>
            {years.map((y) => <option key={y.id} value={y.id}>{y.name}{y.isActive ? ' (aktif)' : ''}</option>)}
          </Select>
        </Field>
        <Field label="Kelas" className="min-w-40">
          <Select value={classId} onChange={(e) => setClassId(e.target.value)}>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
      </div>

      {/* Blok rutin */}
      <Widget
        title="Blok Jadwal Rutin"
        subtitle="Berlaku untuk semua kelas — Ishoma, pembiasaan, istirahat, upacara. Rutin per hari atau tanggal tertentu."
        action={canManage ? <Button size="sm" onClick={() => setBlockModal(true)}>+ Blok</Button> : undefined}
      >
        <div className="divide-y divide-sand-100">
          {blocks.length === 0 ? (
            <p className="px-5 py-4 text-sm text-sand-400">Belum ada blok — tambahkan Ishoma/pembiasaan di sini.</p>
          ) : (
            blocks.map((b) => (
              <div key={b.id} className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-3">
                  <Badge tone="accent">{b.day ? DAY_NAMES[b.day] : (b.date ?? '').slice(0, 10)}</Badge>
                  <div>
                    <p className="text-sm font-bold text-sand-900">{b.label}</p>
                    <p className="text-xs text-sand-500">{mm(b.startMinute)}–{mm(b.endMinute)}{b.day ? ' · tiap minggu' : ''}</p>
                  </div>
                </div>
                {canManage ? (
                  <Button
                    variant="ghost" size="sm"
                    onClick={async () => {
                      if (!(await confirm(`Hapus blok "${b.label}"?`))) return;
                      await deleteScheduleBlock(b.id);
                      setBlocks((bs) => bs.filter((x) => x.id !== b.id));
                      loadTt();
                    }}
                  >
                    Hapus
                  </Button>
                ) : null}
              </div>
            ))
          )}
        </div>
      </Widget>

      {/* Timetable */}
      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((d) => (
          <div key={d} className="rounded-2xl border border-sand-200 bg-white shadow-card">
            <p className="border-b border-sand-100 px-4 py-2.5 text-xs font-extrabold uppercase tracking-wider text-sand-500">
              {DAY_NAMES[d]}
            </p>
            <div className="divide-y divide-sand-50">
              {(tt[d] ?? []).length === 0 ? (
                <p className="px-4 py-3 text-xs text-sand-300">—</p>
              ) : (
                (tt[d] ?? []).map((s, i) => (
                  <div key={i} className="px-4 py-2.5">
                    <div className="flex items-center justify-between">
                      <p className={`text-sm font-bold ${s.type === 'block' ? 'text-accent-700' : 'text-sand-900'}`}>{s.label}</p>
                      <span className="text-xs font-semibold text-sand-500">{mm(s.start)}–{mm(s.end)}</span>
                    </div>
                    {s.type === 'lesson' ? (
                      <p className="text-xs text-sand-500">
                        {s.code} · {s.teacher}{s.room ? ` · ${s.room}` : ''}
                      </p>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>

      <Modal open={blockModal} onClose={() => setBlockModal(false)} title="Tambah Blok Jadwal">
        <form onSubmit={saveBlock} className="grid gap-4">
          <Field label="Nama blok" hint="Ishoma, Pembiasaan, Istirahat, Upacara, dll">
            <Input name="label" required placeholder="Ishoma" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Hari (rutin mingguan)">
              <Select name="day" defaultValue="1">
                <option value="">— tanggal spesifik —</option>
                {[1, 2, 3, 4, 5, 6, 7].map((d) => <option key={d} value={d}>{DAY_NAMES[d]}</option>)}
              </Select>
            </Field>
            <Field label="atau Tanggal">
              <Input name="date" type="date" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Mulai"><Input name="start" type="time" required defaultValue="12:00" /></Field>
            <Field label="Selesai"><Input name="end" type="time" required defaultValue="13:00" /></Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setBlockModal(false)}>Batal</Button>
            <Button type="submit" disabled={busy}>Simpan</Button>
          </div>
        </form>
      </Modal>
    </Shell>
  );
}
