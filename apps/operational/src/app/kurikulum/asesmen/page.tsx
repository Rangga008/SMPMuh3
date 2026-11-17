'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, Field, Input, Modal, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { PageTitle, Widget } from '@/components/widgets';
import {
  createAssessment,
  deleteAssessment,
  listAcademicYears,
  listAssessments,
  listClasses,
  listSubjects,
  updateAssessment,
  type AcademicYear,
  type AssessmentView,
  type ClassView,
  type SubjectView,
} from '@/lib/api';

const TYPES = [
  { key: 'SUMATIF', label: 'Sumatif' },
  { key: 'PTS', label: 'PTS' },
  { key: 'PAS', label: 'PAS' },
  { key: 'FORMATIF', label: 'Formatif' },
] as const;

const TYPE_TONE: Record<string, 'primary' | 'accent' | 'neutral'> = {
  FORMATIF: 'accent',
  SUMATIF: 'primary',
  PTS: 'neutral',
  PAS: 'neutral',
};
const STATUS: Record<string, { label: string; tone: 'neutral' | 'primary' | 'danger' }> = {
  DRAFT: { label: 'Draf', tone: 'neutral' },
  OPEN: { label: 'Dibuka', tone: 'primary' },
  CLOSED: { label: 'Ditutup', tone: 'danger' },
};
const dt = (s: string) =>
  new Date(s).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function AsesmenPage() {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [yearId, setYearId] = useState('');
  const [subjects, setSubjects] = useState<SubjectView[]>([]);
  const [classes, setClasses] = useState<ClassView[]>([]);
  const [search, setSearch] = useState('');
  const [fSubject, setFSubject] = useState('');
  const [fJenjang, setFJenjang] = useState('');
  const [items, setItems] = useState<AssessmentView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<AssessmentView | null>(null);
  const [confirmDel, setConfirmDel] = useState<AssessmentView | null>(null);

  // Form state — nama otomatis disarankan dari jenis+mapel+jenjang.
  const [fType, setFType] = useState('SUMATIF');
  const [fMapel, setFMapel] = useState('');
  const [fGrade, setFGrade] = useState(0);
  const [fName, setFName] = useState('');
  const [fNameTouched, setFNameTouched] = useState(false);
  const [fMax, setFMax] = useState(100);
  const [fClasses, setFClasses] = useState<Set<string>>(new Set());

  useEffect(() => {
    listAcademicYears()
      .then((ys) => {
        setYears(ys);
        const active = ys.find((y) => y.isActive) ?? ys[0];
        if (active) setYearId(active.id);
      })
      .catch(() => setError('Gagal memuat data awal.'));
    listSubjects().then(setSubjects).catch(() => {});
  }, []);

  useEffect(() => {
    if (yearId) listClasses(yearId).then(setClasses).catch(() => setClasses([]));
  }, [yearId]);

  const refresh = useCallback(async () => {
    if (!yearId) return;
    setItems(await listAssessments(yearId));
  }, [yearId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const jenjangs = useMemo(
    () => [...new Set(classes.map((c) => c.gradeLevel))].sort(),
    [classes],
  );
  const rombelOf = useMemo(
    () => classes.filter((c) => !fGrade || c.gradeLevel === fGrade),
    [classes, fGrade],
  );

  /** Nama asesmen otomatis: "<JENIS> <MAPEL> KELAS <G>" — bisa ditulis ulang. */
  useEffect(() => {
    if (fNameTouched || editing) return;
    const s = subjects.find((x) => x.id === fMapel)?.name;
    if (!s || !fGrade) return;
    setFName(`${fType} ${s} Kelas ${fGrade}`.toUpperCase());
  }, [fType, fMapel, fGrade, fNameTouched, editing, subjects]);

  const openNew = () => {
    setFType('SUMATIF'); setFMapel(''); setFGrade(0); setFName(''); setFNameTouched(false);
    setFMax(100); setFClasses(new Set()); setError(null);
    setShowNew(true);
  };
  const openEdit = (a: AssessmentView) => {
    const ex = a.exams?.[0];
    setFType(a.type); setFMapel(ex?.subjectId ?? '');
    setFGrade(ex?.gradeLevel ?? a.class?.gradeLevel ?? 0);
    setFName(a.name); setFNameTouched(true);
    setFMax(a.maxScore); setFClasses(new Set(ex?.classIds ?? []));
    setEditing(a);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(
      (a) =>
        (!q || a.name.toLowerCase().includes(q) || (a.subject?.name ?? '').toLowerCase().includes(q)) &&
        (!fSubject || a.subject?.name === fSubject) &&
        (!fJenjang || String(a.exams?.[0]?.gradeLevel ?? a.class?.gradeLevel ?? '') === fJenjang),
    );
  }, [items, search, fSubject, fJenjang]);
  const subjectNames = useMemo(() => [...new Set(items.map((a) => a.subject?.name).filter((s): s is string => !!s))].sort(), [items]);

  async function onSubmitForm(e: React.FormEvent<HTMLFormElement>, target: AssessmentView | null) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const dto: Record<string, unknown> = {
        name: fName.trim(),
        type: fType,
        maxScore: fMax || 100,
        subjectId: fMapel,
        gradeLevel: fGrade,
        classIds: [...fClasses],
      };
      if (!target) {
        await createAssessment({ ...dto, academicYearId: yearId });
        setNotice('Asesmen dibuat — buka untuk mengatur jadwal dan soal.');
      } else {
        await updateAssessment(target.id, dto);
        setNotice('Asesmen diperbarui.');
      }
      setShowNew(false);
      setEditing(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan asesmen.');
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!confirmDel) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAssessment(confirmDel.id);
      setNotice(`Asesmen "${confirmDel.name}" dihapus.`);
      setConfirmDel(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus asesmen.');
      setConfirmDel(null);
    } finally {
      setBusy(false);
    }
  }

  const toggleCls = (cid: string) => {
    setFClasses((s) => {
      const n = new Set(s);
      if (n.has(cid)) n.delete(cid); else n.add(cid);
      return n;
    });
  };

  const formModal = (target: AssessmentView | null) => (
    <Modal
      open={target ? !!editing : showNew}
      onClose={() => (target ? setEditing(null) : setShowNew(false))}
      title={target ? `Ubah — ${target.name}` : 'Asesmen Baru'}
      size="xl"
    >
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => void onSubmitForm(e, target)}>
        <Field label="Jenis">
          <Select value={fType} onChange={(e) => setFType(e.target.value)} required searchable>
            {TYPES.map((t) => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Mata Pelajaran">
          <Select value={fMapel} onChange={(e) => setFMapel(e.target.value)} required searchable>
            <option value="">— pilih —</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
            ))}
          </Select>
        </Field>
        <Field label="Jenjang">
          <Select
            value={fGrade}
            onChange={(e) => {
              const g = Number(e.target.value);
              setFGrade(g);
              // Centang otomatis semua rombel pada jenjang baru.
              setFClasses(new Set(classes.filter((c) => c.gradeLevel === g).map((c) => c.id)));
            }}
            required
          >
            <option value={0}>— pilih —</option>
            {jenjangs.map((g) => (
              <option key={g} value={g}>Kelas {g}</option>
            ))}
          </Select>
        </Field>
        <Field label="Nilai Maksimal" hint="Skala nilai akhir di hasil ujian.">
          <Input type="number" min={1} max={1000} value={fMax} onChange={(e) => setFMax(Number(e.target.value) || 100)} />
        </Field>
        <Field
          label="Nama Asesmen"
          className="sm:col-span-2"
          hint="Tampil ke siswa & kartu ujian — otomatis disarankan dari jenis+mapel+jenjang, boleh ditulis ulang."
        >
          <Input
            value={fName}
            onChange={(e) => { setFName(e.target.value); setFNameTouched(true); }}
            required
            minLength={3}
            placeholder="ASAS BAHASA ARAB KELAS 9"
          />
        </Field>
        <Field label={`Rombel Peserta${fGrade ? ` — Kelas ${fGrade}` : ''}`} className="sm:col-span-2"
          hint="Dikosongkan = semua rombel pada jenjang. Centang ulang untuk membatasi.">
          <div className="flex flex-wrap gap-2 rounded-xl border border-sand-200 p-3">
            {!rombelOf.length ? (
              <span className="text-xs text-sand-400">{fGrade ? 'Tidak ada rombel pada jenjang ini.' : 'Pilih jenjang dulu.'}</span>
            ) : (
              rombelOf.map((c) => (
                <label key={c.id} className="flex items-center gap-1.5 rounded-lg bg-sand-50 px-2.5 py-1.5 text-xs font-medium">
                  <input type="checkbox" checked={fClasses.has(c.id)} onChange={() => toggleCls(c.id)} /> {c.name}
                </label>
              ))
            )}
          </div>
        </Field>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="ghost" onClick={() => (target ? setEditing(null) : setShowNew(false))}>
            Batal
          </Button>
          <Button type="submit" disabled={busy || !fMapel || !fGrade}>{target ? 'Simpan' : 'Buat Asesmen'}</Button>
        </div>
      </form>
    </Modal>
  );

  return (
    <Shell>
      <PageTitle
        title="Asesmen & Ujian"
        subtitle="Satu asesmen = satu ujian per mapel & jenjang — jadwal, kode akses, soal, hasil & analisis dikelola di dalamnya."
        actions={<Button size="sm" onClick={openNew}>+ Asesmen Baru</Button>}
      />
      {error ? (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
      ) : null}
      {notice ? (
        <p role="status" className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{notice}</p>
      ) : null}

      {/* Alur kerja */}
      <div className="mb-5 flex flex-wrap items-center gap-2 text-xs font-semibold text-sand-500">
        {['Asesmen (mapel+jenjang)', 'Soal & Pengaturan Ujian', 'Administrasi Sumatif', 'Siswa Mengerjakan', 'Hasil & Analisis'].map((s, i) => (
          <span key={s} className="flex items-center gap-2">
            {i > 0 ? <span className="text-sand-300">→</span> : null}
            <span className={`rounded-full px-2.5 py-1 ${i === 0 ? 'bg-primary-600 text-white' : 'bg-sand-100 text-sand-600'}`}>
              {s}
            </span>
          </span>
        ))}
      </div>

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <Field label="Tahun Ajaran" className="w-44">
          <Select value={yearId} onChange={(e) => setYearId(e.target.value)} searchable>
            {years.map((y) => (
              <option key={y.id} value={y.id}>{y.name}{y.isActive ? ' (aktif)' : ''}</option>
            ))}
          </Select>
        </Field>
        <Field label="Mapel" className="w-44">
          <Select value={fSubject} onChange={(e) => setFSubject(e.target.value)} searchable>
            <option value="">Semua</option>
            {subjectNames.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label="Jenjang" className="w-32">
          <Select value={fJenjang} onChange={(e) => setFJenjang(e.target.value)} searchable>
            <option value="">Semua</option>
            {jenjangs.map((g) => <option key={g} value={g}>Kelas {g}</option>)}
          </Select>
        </Field>
        <Field label="Cari" className="w-48">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nama asesmen…" />
        </Field>
      </div>

      <Widget title={`Asesmen (${filtered.length})`}>
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-sand-500">
            Belum ada asesmen — klik <b>+ Asesmen Baru</b> untuk mulai.
          </p>
        ) : (
          <ul className="divide-y divide-sand-100">
            {filtered.map((a) => {
              const ex = a.exams?.[0];
              const st = ex ? STATUS[ex.status] : null;
              const nQ = ex?._count?.questions ?? a._count?.questions ?? 0;
              const nA = ex?._count?.attempts ?? 0;
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-sand-900">
                      {a.name}
                      <Badge tone={TYPE_TONE[a.type] ?? 'neutral'}>{a.type}</Badge>
                      {st ? <Badge tone={st.tone}>{st.label}</Badge> : null}
                    </p>
                    <p className="mt-0.5 text-xs text-sand-500">
                      {a.subject?.name ?? '—'}
                      {ex?.gradeLevel ? ` · Kelas ${ex.gradeLevel}` : a.class?.gradeLevel ? ` · Kelas ${a.class.gradeLevel}` : ''}
                      {` · maks ${a.maxScore}`}
                      {` · ${nQ} soal`}
                      {nA ? ` · ${nA} siswa masuk` : ''}
                      {ex ? ` · ${dt(ex.startAt)} → ${dt(ex.endAt)}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5 text-xs font-bold">
                    <Link
                      href={`/kurikulum/asesmen/${a.id}`}
                      className="rounded-lg bg-primary-700 px-2.5 py-1.5 text-white hover:bg-primary-800"
                    >
                      Kelola →
                    </Link>
                    <button
                      type="button"
                      onClick={() => openEdit(a)}
                      className="rounded-lg bg-sand-100 px-2.5 py-1.5 text-sand-700 hover:bg-sand-200"
                    >
                      Ubah
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDel(a)}
                      className="rounded-lg bg-red-50 px-2.5 py-1.5 text-red-600 hover:bg-red-100"
                    >
                      Hapus
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Widget>

      {formModal(null)}
      {editing ? formModal(editing) : null}

      <Modal open={!!confirmDel} onClose={() => setConfirmDel(null)} title="Hapus Asesmen">
        <p className="text-sm text-sand-700">
          Hapus asesmen <b>{confirmDel?.name}</b>? Ujian, butir soal & nilai yang terkait ikut terhapus.
          Asesmen yang sudah dikerjakan siswa tidak bisa dihapus.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmDel(null)}>Batal</Button>
          <Button variant="danger" onClick={() => void onDelete()} disabled={busy}>
            {busy ? 'Menghapus…' : 'Ya, Hapus'}
          </Button>
        </div>
      </Modal>
    </Shell>
  );
}
