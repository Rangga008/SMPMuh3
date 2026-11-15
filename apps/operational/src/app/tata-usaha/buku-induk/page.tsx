'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { STUDENT_STATUS_LABELS, type StudentDto } from '@smpmuh3/types';
import { Badge, Button, Field, Input, Modal, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { DataTable } from '@/components/data-table';
import { PageTitle } from '@/components/widgets';
import { rowActionClasses } from '@/components/row-btn';
import {
  ApiError, downloadFile, listAcademicYears, listClasses, listStudents,
  type AcademicYear, type ClassView,
} from '@/lib/api';

const tone = (s: string) => (s === 'ACTIVE' ? 'primary' : 'neutral');
type StudentRow = StudentDto & { enrollments?: { class?: { id?: string; name: string; gradeLevel: number } | null }[] };

type Scope = 'selected' | 'class' | 'grade' | 'all';

/** Daftar siswa untuk Tata Usaha — berbeda dengan Data Siswa kesiswaan:
    baris langsung menuju Lembar Buku Induk, bukan detail siswa. */
export default function BukuIndukListPage() {
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [classId, setClassId] = useState('');
  const [grade, setGrade] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [yearId, setYearId] = useState('');
  const [classes, setClasses] = useState<ClassView[]>([]);
  const [expModal, setExpModal] = useState<Scope | null>(null);
  const [expClass, setExpClass] = useState('');
  const [expGrade, setExpGrade] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    listAcademicYears().then((ys) => {
      setYears(ys);
      const a = ys.find((x) => x.isActive) ?? ys[0];
      if (a) setYearId(a.id);
    }).catch(() => {});
  }, []);
  useEffect(() => {
    if (!yearId) return;
    listClasses(yearId).then(setClasses).catch(() => {});
  }, [yearId]);

  const load = useCallback((q: { search?: string; status?: string; classId?: string }) => {
    setLoading(true);
    listStudents(q)
      .then((r) => { setRows(r); setPicked(new Set()); })
      .catch(() => setError('Gagal memuat data siswa.'))
      .finally(() => setLoading(false));
  }, []);

  const firstRun = useRef(true);
  useEffect(() => {
    const t = setTimeout(() => load({ search, status, classId }), firstRun.current ? 0 : 350);
    firstRun.current = false;
    return () => clearTimeout(t);
  }, [search, status, classId, load]);

  const gradeLevels = useMemo(() => [...new Set(classes.map((c) => c.gradeLevel))].sort(), [classes]);
  const shown = useMemo(
    () => grade ? rows.filter((s) => s.enrollments?.[0]?.class?.gradeLevel === Number(grade)) : rows,
    [rows, grade],
  );

  const toggle = (id: string) => setPicked((p) => {
    const n = new Set(p);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const toggleAll = () => setPicked((p) => p.size === shown.length ? new Set() : new Set(shown.map((s) => s.id)));

  async function doExport(scope: Scope) {
    const p = new URLSearchParams();
    if (yearId) p.set('academicYearId', yearId);
    let fname = 'buku-induk.zip';
    if (scope === 'selected') {
      if (!picked.size) { setError('Pilih dulu siswa yang akan diekspor.'); return; }
      p.set('studentIds', [...picked].join(','));
      if (picked.size === 1) fname = 'buku-induk.pdf';
    } else if (scope === 'class') {
      if (!expClass) { setError('Pilih kelas.'); return; }
      p.set('classId', expClass);
      fname = `buku-induk-${classes.find((c) => c.id === expClass)?.name ?? 'kelas'}.zip`;
    } else if (scope === 'grade') {
      if (!expGrade) { setError('Pilih jenjang.'); return; }
      p.set('gradeLevel', expGrade);
      fname = `buku-induk-kelas-${expGrade}.zip`;
    } else {
      p.set('all', '1');
    }
    setBusy(true); setError(null);
    try {
      await downloadFile(`/ops/buku-induk/export?${p}`, fname);
      setExpModal(null);
      setNotice('Ekspor berhasil diunduh.');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal mengekspor.');
    } finally { setBusy(false); }
  }

  const SCOPE_LABEL: Record<Scope, string> = {
    selected: 'Siswa Terpilih', class: 'Per Kelas', grade: 'Per Jenjang', all: 'Semua Siswa',
  };

  return (
    <Shell>
      <PageTitle
        title="Buku Induk"
        subtitle="Lembar buku induk peserta didik — pilih siswa untuk membuka & mengisi bukunya."
        actions={<Button size="sm" onClick={() => setExpModal(picked.size ? 'selected' : 'all')}>Ekspor PDF</Button>}
      />

      {error ? (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
      ) : null}
      {notice ? (
        <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{notice}</p>
      ) : null}

      <div className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl border border-sand-200 bg-white p-4 shadow-card">
        <label className="flex min-w-40 flex-[2] flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-sand-500">Pencarian</span>
          <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nama / NIS / NISN…" />
        </label>
        <label className="flex min-w-36 flex-1 flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-sand-500">Tahun Ajaran</span>
          <Select value={yearId} onChange={(e) => setYearId(e.target.value)}>
            {years.map((y) => <option key={y.id} value={y.id}>{y.name}{y.isActive ? ' (aktif)' : ''}</option>)}
          </Select>
        </label>
        <label className="flex min-w-32 flex-1 flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-sand-500">Kelas</span>
          <Select value={classId} onChange={(e) => { setClassId(e.target.value); setGrade(''); }}>
            <option value="">Semua</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </label>
        <label className="flex min-w-28 flex-1 flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-sand-500">Jenjang</span>
          <Select value={grade} onChange={(e) => { setGrade(e.target.value); setClassId(''); }}>
            <option value="">Semua</option>
            {gradeLevels.map((gl) => <option key={gl} value={gl}>Kelas {gl}</option>)}
          </Select>
        </label>
        <label className="flex min-w-28 flex-1 flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-sand-500">Status</span>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Semua</option>
            {Object.entries(STUDENT_STATUS_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
        </label>
      </div>

      {picked.size > 0 && (
        <div className="mb-3 flex items-center justify-between rounded-xl border border-primary-200 bg-primary-50 px-4 py-2.5 text-sm">
          <span className="font-semibold text-primary-800">{picked.size} siswa dipilih</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setPicked(new Set())}>Bersihkan</Button>
            <Button size="sm" onClick={() => setExpModal('selected')}>Ekspor Terpilih</Button>
          </div>
        </div>
      )}

      <DataTable
        head={[
          <input key="cb" type="checkbox" className="size-4 accent-primary-600"
            checked={shown.length > 0 && picked.size === shown.length}
            onChange={toggleAll} aria-label="Pilih semua" />,
          'Nama', 'NIS', 'NISN', 'L/P', 'Kelas', 'Status', '',
        ]}
        loading={loading}
        error={error}
        empty={shown.length === 0 ? 'Tidak ada siswa.' : undefined}
      >
        {shown.map((s) => (
          <tr key={s.id} className={picked.has(s.id) ? 'bg-primary-50/50' : undefined}>
            <td className="px-5 py-3.5">
              <input type="checkbox" className="size-4 accent-primary-600" checked={picked.has(s.id)} onChange={() => toggle(s.id)} />
            </td>
            <td className="px-5 py-3.5 font-semibold text-sand-900">{s.name}</td>
            <td className="px-5 py-3.5 text-sand-600">{s.nis ?? '—'}</td>
            <td className="px-5 py-3.5 text-sand-600">{s.nisn ?? '—'}</td>
            <td className="px-5 py-3.5 text-sand-600">
              {s.gender === 'MALE' ? 'L' : s.gender === 'FEMALE' ? 'P' : '—'}
            </td>
            <td className="px-5 py-3.5 text-sand-600">{s.enrollments?.[0]?.class?.name ?? '—'}</td>
            <td className="px-5 py-3.5">
              <Badge tone={tone(s.status)}>{STUDENT_STATUS_LABELS[s.status]}</Badge>
            </td>
            <td className="px-5 py-3.5 text-right">
              <Link href={`/kesiswaan/${s.id}/induk`} className={rowActionClasses('primary')}>
                Buku Induk →
              </Link>
            </td>
          </tr>
        ))}
      </DataTable>

      <Modal open={!!expModal} onClose={() => setExpModal(null)} title="Ekspor Buku Induk (PDF)">
        <div className="grid gap-4">
          <Field label="Cakupan">
            <Select value={expModal ?? 'all'} onChange={(e) => setExpModal(e.target.value as Scope)}>
              <option value="selected" disabled={!picked.size}>Siswa terpilih ({picked.size})</option>
              <option value="class">Per kelas</option>
              <option value="grade">Per jenjang</option>
              <option value="all">Semua siswa</option>
            </Select>
          </Field>
          {expModal === 'class' && (
            <Field label="Kelas">
              <Select value={expClass} onChange={(e) => setExpClass(e.target.value)}>
                <option value="">— pilih kelas —</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
          )}
          {expModal === 'grade' && (
            <Field label="Jenjang">
              <Select value={expGrade} onChange={(e) => setExpGrade(e.target.value)}>
                <option value="">— pilih jenjang —</option>
                {gradeLevels.map((gl) => <option key={gl} value={gl}>Kelas {gl}</option>)}
              </Select>
            </Field>
          )}
          <p className="rounded-xl bg-sand-50 px-3 py-2 text-xs leading-relaxed text-sand-500">
            {expModal === 'selected' && picked.size === 1
              ? 'Satu PDF akan diunduh langsung.'
              : 'Hasil: ZIP — folder per jenjang → folder per kelas → PDF per siswa. Contoh: Kelas 9/9A/1234 - Nama.pdf'}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setExpModal(null)}>Batal</Button>
            <Button disabled={busy} onClick={() => expModal && void doExport(expModal)}>
              {busy ? 'Membuat…' : `Unduh ${SCOPE_LABEL[expModal ?? 'all']}`}
            </Button>
          </div>
        </div>
      </Modal>
    </Shell>
  );
}
