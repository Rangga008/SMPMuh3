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
  { key: 'FORMATIF', label: 'Formatif' },
  { key: 'SUMATIF', label: 'Sumatif' },
  { key: 'PTS', label: 'PTS' },
  { key: 'PAS', label: 'PAS' },
] as const;

const TYPE_TONE: Record<string, 'primary' | 'accent' | 'neutral'> = {
  FORMATIF: 'accent',
  SUMATIF: 'primary',
  PTS: 'neutral',
  PAS: 'neutral',
};

export default function AsesmenPage() {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [yearId, setYearId] = useState('');
  const [classes, setClasses] = useState<ClassView[]>([]);
  const [classId, setClassId] = useState('');
  const [subjects, setSubjects] = useState<SubjectView[]>([]);
  const [subjectId, setSubjectId] = useState('');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<AssessmentView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<AssessmentView | null>(null);
  const [confirmDel, setConfirmDel] = useState<AssessmentView | null>(null);

  useEffect(() => {
    Promise.all([listAcademicYears(), listSubjects()])
      .then(([ys, subs]) => {
        setYears(ys);
        setSubjects(subs);
        const active = ys.find((y) => y.isActive) ?? ys[0];
        if (active) setYearId(active.id);
      })
      .catch(() => setError('Gagal memuat data awal.'));
  }, []);

  useEffect(() => {
    if (!yearId) return;
    void listClasses(yearId).then(setClasses);
  }, [yearId]);

  const refresh = useCallback(async () => {
    if (!yearId) return;
    setItems(await listAssessments(yearId, classId || undefined));
  }, [yearId, classId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const code = subjects.find((s) => s.id === subjectId)?.code;
    return items.filter(
      (a) =>
        (!code || a.subject.code === code) &&
        (!q || a.name.toLowerCase().includes(q) || a.subject.name.toLowerCase().includes(q)),
    );
  }, [items, search, subjectId, subjects]);

  async function onSubmitForm(e: React.FormEvent<HTMLFormElement>, target: AssessmentView | null) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const dto: Record<string, unknown> = {
        name: String(f.get('name')),
        type: String(f.get('type')),
        maxScore: Number(f.get('maxScore')) || 100,
      };
      if (!target) {
        dto.subjectId = String(f.get('subjectId'));
        dto.classId = String(f.get('classId')) || undefined;
        dto.academicYearId = yearId;
        await createAssessment(dto);
        setNotice('Asesmen dibuat — lanjut isi soal lewat "Butir & Analisis", lalu buat ujiannya di Ujian CBT.');
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

  const formModal = (target: AssessmentView | null) => (
    <Modal
      open={target ? !!editing : showNew}
      onClose={() => (target ? setEditing(null) : setShowNew(false))}
      title={target ? `Ubah — ${target.name}` : 'Asesmen Baru'}
    >
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => void onSubmitForm(e, target)}>
        <Field label="Nama Asesmen" className="sm:col-span-2">
          <Input
            name="name"
            required
            minLength={3}
            defaultValue={target?.name}
            placeholder="Sumatif Bab 1 / PTS Ganjil"
          />
        </Field>
        {!target ? (
          <>
            <Field label="Mata Pelajaran">
              <Select name="subjectId" required searchable>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                ))}
              </Select>
            </Field>
            <Field label="Rombel" hint="Kosongkan bila untuk semua rombel">
              <Select name="classId" defaultValue="" searchable>
                <option value="">— Semua rombel —</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Field>
          </>
        ) : null}
        <Field label="Jenis">
          <Select name="type" required defaultValue={target?.type ?? 'FORMATIF'} searchable>
            {TYPES.map((t) => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Nilai Maksimal">
          <Input name="maxScore" type="number" min={1} max={1000} defaultValue={target?.maxScore ?? 100} />
        </Field>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="ghost" onClick={() => (target ? setEditing(null) : setShowNew(false))}>
            Batal
          </Button>
          <Button type="submit" disabled={busy}>{target ? 'Simpan' : 'Buat'}</Button>
        </div>
      </form>
    </Modal>
  );

  return (
    <Shell>
      <PageTitle
        title="Bank Asesmen"
        subtitle="Langkah 1 alur ujian — buat asesmen di sini, isi soalnya, lalu jadwalkan lewat Ujian CBT"
        actions={<Button size="sm" onClick={() => setShowNew(true)}>+ Asesmen Baru</Button>}
      />
      {error ? (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
      ) : null}
      {notice ? (
        <p role="status" className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{notice}</p>
      ) : null}

      {/* Alur kerja */}
      <div className="mb-5 flex flex-wrap items-center gap-2 text-xs font-semibold text-sand-500">
        {['Asesmen', 'Isi Soal', 'Ujian CBT', 'Kartu & Ruang', 'Siswa Mengerjakan', 'Penilaian'].map((s, i) => (
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
        <Field label="Rombel" className="w-44">
          <Select value={classId} onChange={(e) => setClassId(e.target.value)} searchable>
            <option value="">Semua</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Mata Pelajaran" className="w-52">
          <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} searchable>
            <option value="">Semua</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
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
              const exams = a.exams ?? [];
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-sand-900">
                      {a.name}
                      <Badge tone={TYPE_TONE[a.type] ?? 'neutral'}>{a.type}</Badge>
                      {exams.length > 0 ? (
                        <Badge tone="primary" title={exams.map((x) => x.title).join(', ')}>
                          Dipakai {exams.length} ujian
                        </Badge>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-xs text-sand-500">
                      {a.subject.name}
                      {a.class?.name ? ` · ${a.class.name}` : ' · semua rombel'}
                      {` · maks ${a.maxScore}`}
                      {` · ${a._count?.questions ?? 0} soal · ${a._count?.grades ?? 0} nilai`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5 text-xs font-bold">
                    <Link
                      href={`/kurikulum/asesmen/${a.id}`}
                      className="rounded-lg bg-primary-50 px-2.5 py-1.5 text-primary-700 hover:bg-primary-100"
                    >
                      Butir & Analisis →
                    </Link>
                    <Link
                      href="/kurikulum/ujian"
                      className="rounded-lg bg-sand-100 px-2.5 py-1.5 text-sand-700 hover:bg-sand-200"
                    >
                      Ujian CBT →
                    </Link>
                    <button
                      type="button"
                      onClick={() => setEditing(a)}
                      className="rounded-lg bg-sand-100 px-2.5 py-1.5 text-sand-700 hover:bg-sand-200"
                    >
                      Ubah
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDel(a)}
                      disabled={exams.length > 0}
                      title={exams.length > 0 ? 'Asesmen dipakai ujian — tidak bisa dihapus' : 'Hapus asesmen'}
                      className="rounded-lg bg-red-50 px-2.5 py-1.5 text-red-600 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
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
          Hapus asesmen <b>{confirmDel?.name}</b>? Seluruh butir soal dan nilai yang sudah diisi ikut terhapus.
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
