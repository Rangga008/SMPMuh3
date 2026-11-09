'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Field, Input, Modal, Select } from '@smpmuh3/ui';
import { PERMISSIONS } from '@smpmuh3/types';
import { Shell } from '@/components/shell';
import { useConfirm } from '@/components/confirm-dialog';
import { DataTable } from '@/components/data-table';
import { RowBtn } from '@/components/row-btn';
import { PageTitle, Widget } from '@/components/widgets';
import {
  createCalendarEvent,
  deleteCalendarEvent,
  getAcademicCalendar,
  listAcademicYears,
  listCalendarEvents,
  me,
  updateCalendarEvent,
  type AcademicCalendar,
  type AcademicYear,
  type CalendarDay,
  type CalendarEventRow,
} from '@/lib/api';

const DOW = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
const EVENT_TYPES = ['LIBUR', 'KEGIATAN', 'UJIAN', 'LAINNYA'] as const;
const EVENT_TONE: Record<string, 'danger' | 'accent' | 'primary' | 'neutral'> = {
  LIBUR: 'danger',
  KEGIATAN: 'primary',
  UJIAN: 'accent',
  LAINNYA: 'neutral',
};
const minToHHMM = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const thisMonth = () => new Date().toISOString().slice(0, 7);

export default function KalenderAkademikPage() {
  const { confirm, dialog } = useConfirm();
  const [canManage, setCanManage] = useState(false);
  const [month, setMonth] = useState(thisMonth());
  const [cal, setCal] = useState<AcademicCalendar | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [events, setEvents] = useState<CalendarEventRow[]>([]);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [dayDetail, setDayDetail] = useState<CalendarDay | null>(null);
  const [daySearch, setDaySearch] = useState('');
  const [evModal, setEvModal] = useState<CalendarEventRow | 'new' | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      getAcademicCalendar(month),
      listCalendarEvents(`${month}-01`, `${month}-31`),
    ])
      .then(([c, ev]) => {
        setCal(c);
        setEvents(ev);
        setError(null);
      })
      .catch(() => setError('Gagal memuat kalender.'))
      .finally(() => setLoading(false));
  }, [month]);

  useEffect(() => load(), [load]);
  useEffect(() => {
    me().then((u) => setCanManage(u.permissions.includes(PERMISSIONS.EMPLOYEE_MANAGE))).catch(() => undefined);
    listAcademicYears().then(setYears).catch(() => undefined);
  }, []);

  async function onSaveEvent(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const dto = {
      date: String(f.get('date')),
      title: String(f.get('title')),
      type: String(f.get('type')),
      ...(String(f.get('note') ?? '').trim() ? { note: String(f.get('note')) } : {}),
      ...(String(f.get('academicYearId') ?? '') ? { academicYearId: String(f.get('academicYearId')) } : {}),
    };
    setBusy(true);
    setError(null);
    try {
      if (evModal === 'new') await createCalendarEvent(dto);
      else await updateCalendarEvent((evModal as CalendarEventRow).id, dto);
      setNotice('Event kalender disimpan.');
      setEvModal(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan event.');
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteEvent(ev: CalendarEventRow) {
    if (!(await confirm({ title: `Hapus event "${ev.title}"?` }))) return;
    setBusy(true);
    try {
      await deleteCalendarEvent(ev.id);
      setNotice('Event dihapus.');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus.');
    } finally {
      setBusy(false);
    }
  }

  const [y, mo] = month.split('-').map(Number);
  const daysInMonth = new Date(y!, mo!, 0).getDate();
  const firstDow = new Date(Date.UTC(y!, mo! - 1, 1)).getUTCDay();
  const offset = (firstDow + 6) % 7;
  const cells: (number | null)[] = [
    ...Array<null>(offset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const dayMap = new Map(cal?.days.map((d) => [d.date, d]) ?? []);

  return (
    <Shell>
      <PageTitle
        title="Kalender Akademik"
        subtitle="Siapa mengajar apa & di kelas mana per tanggal + event sekolah — jadwal diatur di Kurikulum → Jadwal & Penugasan"
        actions={
          <span className="flex items-end gap-2">
            <div className="w-36">
              <Field label="Bulan">
                <input
                  type="month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className="h-9 w-full rounded-xl border border-sand-300 bg-white px-3 text-sm font-medium text-sand-800"
                  aria-label="Bulan kalender"
                />
              </Field>
            </div>
            {canManage ? (
              <Button size="sm" onClick={() => setEvModal('new')}>+ Event</Button>
            ) : null}
          </span>
        }
      />
      {error ? <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p> : null}
      {notice ? <p role="status" className="mb-4 rounded-xl bg-primary-50 px-4 py-3 text-sm font-medium text-primary-800">{notice}</p> : null}

      <Widget title={loading ? 'Memuat…' : `Kalender ${month}`}>
        <div className="grid grid-cols-7 gap-1.5 text-xs">
          {DOW.map((d) => (
            <p key={d} className="pb-1 text-center font-bold uppercase tracking-wider text-sand-400">{d}</p>
          ))}
          {cells.map((d, i) => {
            if (d === null) return <span key={`e${i}`} />;
            const iso = `${month}-${String(d).padStart(2, '0')}`;
            const day = dayMap.get(iso);
            const today = new Date().toISOString().slice(0, 10) === iso;
            return (
              <button
                key={iso}
                type="button"
                onClick={() => { if (day) { setDayDetail(day); setDaySearch(''); } }}
                className={`flex min-h-28 flex-col rounded-xl border px-2 py-1.5 text-left align-top transition hover:border-primary-400 hover:shadow-sm ${
                  today ? 'border-primary-400 bg-primary-50' : 'border-sand-200 bg-white'
                } ${day?.isHoliday ? 'bg-red-50/60' : ''}`}
              >
                <p className={`text-xs font-bold ${today ? 'text-primary-700' : 'text-sand-500'}`}>{d}</p>
                {day?.events.map((ev) => (
                  <p
                    key={ev.id}
                    className={`mt-1 truncate rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                      ev.type === 'LIBUR' ? 'bg-red-100 text-red-700' : ev.type === 'UJIAN' ? 'bg-amber-100 text-amber-800' : 'bg-primary-100 text-primary-700'
                    }`}
                    title={ev.title}
                  >
                    {ev.title}
                  </p>
                ))}
                {day && day.lessons.length > 0 ? (
                  <div className="mt-1 space-y-0.5">
                    {day.lessons.slice(0, 3).map((l, li) => (
                      <p key={li} className="truncate text-[10px] font-medium text-sand-600">
                        {minToHHMM(l.startMinute)} {l.employeeName} · {l.className}
                      </p>
                    ))}
                    {day.lessons.length > 3 ? (
                      <p className="text-[10px] font-semibold text-primary-600">+{day.lessons.length - 3} jadwal lagi…</p>
                    ) : null}
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
      </Widget>

      <div className="mt-5">
        <Widget title={`Event Bulan Ini (${events.length})`}>
          <DataTable
            head={['Tanggal', 'Event', 'Jenis', 'Tahun Ajaran', canManage ? 'Aksi' : '']}
            loading={loading}
            error={null}
            empty={events.length === 0 ? 'Belum ada event bulan ini.' : undefined}
          >
            {events.map((ev) => (
              <tr key={ev.id}>
                <td className="whitespace-nowrap px-5 py-2.5 font-medium text-sand-900">
                  {new Date(`${String(ev.date).slice(0, 10)}T12:00:00`).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' })}
                </td>
                <td className="px-5 py-2.5 text-sand-800">
                  {ev.title}
                  {ev.note ? <p className="text-xs text-sand-400">{ev.note}</p> : null}
                </td>
                <td className="px-5 py-2.5">
                  <Badge tone={EVENT_TONE[ev.type] ?? 'neutral'}>{ev.type}</Badge>
                </td>
                <td className="px-5 py-2.5 text-xs text-sand-500">{ev.academicYear?.name ?? 'Semua'}</td>
                {canManage ? (
                  <td className="px-5 py-2.5">
                    <span className="flex gap-1.5">
                      <RowBtn tone="neutral" type="button" onClick={() => setEvModal(ev)}>Edit</RowBtn>
                      <RowBtn tone="danger" type="button" onClick={() => void onDeleteEvent(ev)}>Hapus</RowBtn>
                    </span>
                  </td>
                ) : null}
              </tr>
            ))}
          </DataTable>
        </Widget>
      </div>

      {/* Detail tanggal — siapa mengajar */}
      <Modal
        open={dayDetail !== null}
        onClose={() => setDayDetail(null)}
        title={dayDetail ? new Date(`${dayDetail.date}T12:00:00`).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : ''}
        size="xl"
      >
        {dayDetail ? (
          <div className="space-y-4">
            {dayDetail.events.length ? (
              <div className="flex flex-wrap gap-2">
                {dayDetail.events.map((ev) => (
                  <Badge key={ev.id} tone={EVENT_TONE[ev.type] ?? 'neutral'}>
                    {ev.title}
                  </Badge>
                ))}
              </div>
            ) : null}
            {dayDetail.lessons.length ? (
              <>
                <div className="w-64">
                  <Field label="Cari jadwal">
                    <Input
                      type="search"
                      value={daySearch}
                      onChange={(e) => setDaySearch(e.target.value)}
                      placeholder="Guru / mapel / kelas…"
                    />
                  </Field>
                </div>
                <ul className="divide-y divide-sand-100 rounded-xl border border-sand-200">
                  {dayDetail.lessons
                    .slice()
                    .sort((a, b) => a.startMinute - b.startMinute)
                    .filter((l) => {
                      const q = daySearch.trim().toLowerCase();
                      return !q || `${l.employeeName} ${l.subjectName} ${l.className} ${l.room ?? ''}`.toLowerCase().includes(q);
                    })
                    .map((l, i) => (
                      <li key={i} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
                        <span className="w-24 font-mono font-semibold text-sand-700">
                          {minToHHMM(l.startMinute)}–{minToHHMM(l.endMinute)}
                        </span>
                        <span className="font-medium text-sand-900">{l.employeeName}</span>
                        <span className="text-sand-600">{l.subjectName}</span>
                        <Badge tone="primary">{l.className}</Badge>
                        {l.room ? <span className="text-xs text-sand-400">@{l.room}</span> : null}
                      </li>
                    ))}
                </ul>
                {dayDetail.lessons.filter((l) => {
                  const q = daySearch.trim().toLowerCase();
                  return !q || `${l.employeeName} ${l.subjectName} ${l.className} ${l.room ?? ''}`.toLowerCase().includes(q);
                }).length === 0 ? (
                  <p className="text-sm text-sand-500">Tidak ada jadwal cocok dengan pencarian.</p>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-sand-500">Tidak ada jadwal mengajar tanggal ini.</p>
            )}
            {canManage ? (
              <div className="flex justify-end">
                <Button size="sm" variant="secondary" onClick={() => setEvModal('new')}>+ Event di tanggal ini</Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

      {/* Modal event */}
      <Modal
        open={evModal !== null}
        onClose={() => setEvModal(null)}
        title={evModal === 'new' ? 'Tambah Event' : 'Edit Event'}
      >
        <form className="grid gap-4" onSubmit={onSaveEvent}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tanggal">
              <Input
                type="date"
                name="date"
                required
                defaultValue={
                  evModal === 'new'
                    ? dayDetail?.date ?? `${month}-01`
                    : String((evModal as CalendarEventRow)?.date).slice(0, 10)
                }
              />
            </Field>
            <Field label="Jenis">
              <Select name="type" required defaultValue={(evModal as CalendarEventRow)?.type ?? 'KEGIATAN'}>
                {EVENT_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Nama event">
            <Input
              name="title"
              required
              defaultValue={evModal === 'new' ? '' : (evModal as CalendarEventRow)?.title}
              placeholder="Mis. Libur Semester, Ujian Tengah Semester"
            />
          </Field>
          <Field label="Tahun Ajaran" hint="Kosongkan bila berlaku umum">
            <Select name="academicYearId" defaultValue={(evModal as CalendarEventRow)?.academicYearId ?? ''}>
              <option value="">Semua tahun ajaran</option>
              {years.map((yr) => (
                <option key={yr.id} value={yr.id}>{yr.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Catatan">
            <Input
              name="note"
              defaultValue={(evModal as CalendarEventRow)?.note ?? ''}
              placeholder="opsional"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setEvModal(null)}>Batal</Button>
            <Button type="submit" disabled={busy}>Simpan</Button>
          </div>
        </form>
      </Modal>

      {dialog}
    </Shell>
  );
}
