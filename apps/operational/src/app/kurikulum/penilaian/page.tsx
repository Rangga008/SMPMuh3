'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, Field, Input, Modal, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { PageTitle, Widget } from '@/components/widgets';
import {
  createAssessment,
  listAcademicYears,
  listAssessments,
  listClasses,
  listEnrollments,
  listGrades,
  listSubjects,
  setGrades,
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

interface Row {
  studentId: string;
  name: string;
  nis?: string | null;
  score: string;
}

export default function PenilaianPage() {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [yearId, setYearId] = useState('');
  const [classes, setClasses] = useState<ClassView[]>([]);
  const [classId, setClassId] = useState('');
  const [subjects, setSubjects] = useState<SubjectView[]>([]);
  const [assessments, setAssessments] = useState<AssessmentView[]>([]);
  const [active, setActive] = useState<AssessmentView | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showNew, setShowNew] = useState(false);

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
    void listClasses(yearId).then((cls) => {
      setClasses(cls);
      const first = cls[0];
      if (first && !cls.some((c) => c.id === classId)) setClassId(first.id);
    });
  }, [yearId, classId]);

  const refreshAssessments = useCallback(async () => {
    if (!yearId) return;
    setAssessments(await listAssessments(yearId, classId || undefined));
  }, [yearId, classId]);

  useEffect(() => {
    void refreshAssessments();
    setActive(null);
    setRows([]);
  }, [refreshAssessments]);

  async function openAssessment(a: AssessmentView) {
    setActive(a);
    setError(null);
    try {
      const [roster, grades] = await Promise.all([
        a.class?.name && classId ? listEnrollments(classId) : Promise.resolve([]),
        listGrades(a.id),
      ]);
      const byStudent = new Map(grades.map((g) => [g.student.id, String(g.score)]));
      if (roster.length) {
        setRows(
          roster.map((e) => ({
            studentId: e.student.id,
            name: e.student.name,
            nis: e.student.nis ?? null,
            score: byStudent.get(e.student.id) ?? '',
          })),
        );
      } else {
        // Asesmen tanpa rombel — tampilkan siswa yang sudah dinilai saja.
        setRows(
          grades.map((g) => ({
            studentId: g.student.id,
            name: g.student.name,
            nis: g.student.nis ?? null,
            score: String(g.score),
          })),
        );
      }
    } catch {
      setError('Gagal memuat nilai.');
    }
  }

  const filled = useMemo(() => rows.filter((r) => r.score.trim() !== ''), [rows]);

  async function onSave() {
    if (!active) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const res = await setGrades(
        active.id,
        filled.map((r) => ({ studentId: r.studentId, score: Number(r.score) })),
      );
      setNotice(`${res.saved} nilai tersimpan.`);
      await refreshAssessments();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan nilai.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <PageTitle
        title="Penilaian"
        subtitle="Buat asesmen per rombel lalu isi nilai siswa — fondasi rapor"
        actions={
          <Button size="sm" onClick={() => setShowNew(true)} disabled={!classId}>
            + Asesmen Baru
          </Button>
        }
      />
      {error ? (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
      ) : null}
      {notice ? (
        <p role="status" className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{notice}</p>
      ) : null}

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <Field label="Tahun Ajaran" className="w-44">
          <Select value={yearId} onChange={(e) => setYearId(e.target.value)}>
            {years.map((y) => (
              <option key={y.id} value={y.id}>{y.name}{y.isActive ? ' (aktif)' : ''}</option>
            ))}
          </Select>
        </Field>
        <Field label="Rombel" className="w-44">
          <Select value={classId} onChange={(e) => setClassId(e.target.value)}>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
        {/* ---------- Daftar asesmen ---------- */}
        <Widget title={`Asesmen (${assessments.length})`}>
          <ul className="space-y-2">
            {assessments.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => void openAssessment(a)}
                  className={`w-full rounded-xl border px-3.5 py-2.5 text-left transition-colors ${
                    active?.id === a.id
                      ? 'border-primary-600 bg-primary-50'
                      : 'border-sand-200 bg-sand-50 hover:border-primary-300'
                  }`}
                >
                  <p className="flex items-center justify-between text-sm font-bold text-sand-900">
                    {a.name}
                    <Badge tone="accent">{a.type}</Badge>
                  </p>
                  <p className="mt-0.5 text-xs text-sand-500">
                    {a.subject.name} · maks {a.maxScore} · {a._count?.grades ?? 0} nilai
                  </p>
                </button>
              </li>
            ))}
            {assessments.length === 0 ? (
              <li className="py-6 text-center text-sm text-sand-500">
                Belum ada asesmen untuk rombel ini.
              </li>
            ) : null}
          </ul>
        </Widget>

        {/* ---------- Input nilai ---------- */}
        <Widget
          title={active ? `Nilai — ${active.name}` : 'Nilai'}
          action={
            active ? (
              <Button size="sm" onClick={() => void onSave()} disabled={busy || filled.length === 0}>
                {busy ? 'Menyimpan…' : `Simpan ${filled.length} Nilai`}
              </Button>
            ) : undefined
          }
        >
          {!active ? (
            <p className="py-8 text-center text-sm text-sand-500">
              Pilih asesmen di kiri untuk mengisi nilai.
            </p>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-sand-500">
              Tidak ada siswa — pastikan rombel ini sudah punya siswa (enroll).
            </p>
          ) : (
            <ul className="divide-y divide-sand-100">
              {rows.map((r, i) => (
                <li key={r.studentId} className="flex items-center gap-4 py-2.5">
                  <span className="w-6 text-center text-xs font-bold text-sand-400">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-sand-900">{r.name}</span>
                    {r.nis ? <span className="text-xs text-sand-400">NIS {r.nis}</span> : null}
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={active.maxScore}
                    value={r.score}
                    onChange={(e) =>
                      setRows((rs) =>
                        rs.map((x) =>
                          x.studentId === r.studentId ? { ...x, score: e.target.value } : x,
                        ),
                      )
                    }
                    placeholder={`0–${active.maxScore}`}
                    className="h-10 w-24 rounded-xl border border-sand-300 bg-white px-3 text-center text-sm font-semibold text-sand-900 shadow-xs focus:border-primary-600 focus-visible:focus-ring"
                  />
                </li>
              ))}
            </ul>
          )}
        </Widget>
      </div>

      {/* ---------- Modal asesmen baru ---------- */}
      <Modal open={showNew} onClose={() => setShowNew(false)} title="Asesmen Baru">
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setBusy(true);
            setError(null);
            try {
              await createAssessment({
                subjectId: String(f.get('subjectId')),
                classId,
                academicYearId: yearId,
                name: String(f.get('name')),
                type: String(f.get('type')),
                maxScore: Number(f.get('maxScore')) || 100,
              });
              setShowNew(false);
              setNotice('Asesmen dibuat.');
              await refreshAssessments();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Gagal membuat asesmen.');
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Nama Asesmen" className="sm:col-span-2">
            <Input name="name" required minLength={3} placeholder="Sumatif Bab 1 / PTS Ganjil" />
          </Field>
          <Field label="Mata Pelajaran">
            <Select name="subjectId" required>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
              ))}
            </Select>
          </Field>
          <Field label="Jenis">
            <Select name="type" required>
              {TYPES.map((t) => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Nilai Maksimal">
            <Input name="maxScore" type="number" min={1} max={1000} defaultValue={100} />
          </Field>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="ghost" onClick={() => setShowNew(false)}>Batal</Button>
            <Button type="submit" disabled={busy}>Buat</Button>
          </div>
        </form>
      </Modal>
    </Shell>
  );
}
