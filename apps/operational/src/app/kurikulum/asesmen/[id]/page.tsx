'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Badge, Button, Field, Input, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { PageTitle, Widget } from '@/components/widgets';
import { DataTable } from '@/components/data-table';
import { ApiError } from '@/lib/api';
import {
  getAnswerMatrix,
  getAssessmentQuestions,
  getQuestionAnalysis,
  saveQuestionAnswers,
  setAssessmentQuestions,
  type AssessmentQuestion,
} from '@/lib/api-ops';

const TYPE_LABEL: Record<string, string> = {
  MCQ: 'Pilihan Ganda', MCQ_COMPLEX: 'PG Kompleks', TRUE_FALSE: 'Benar/Salah', MATCHING: 'Menjodohkan',
};

type Matrix = Awaited<ReturnType<typeof getAnswerMatrix>>;

export default function AsesmenDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [questions, setQuestions] = useState<AssessmentQuestion[]>([]);
  const [matrix, setMatrix] = useState<Matrix | null>(null);
  const [analysis, setAnalysis] = useState<Awaited<ReturnType<typeof getQuestionAnalysis>>['questions']>([]);
  const [tab, setTab] = useState<'soal' | 'jawaban' | 'analisis'>('soal');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [numQ, setNumQ] = useState(10);

  const load = useCallback(() => {
    Promise.all([getAssessmentQuestions(id), getAnswerMatrix(id), getQuestionAnalysis(id)])
      .then(([q, m, a]) => { setQuestions(q); setMatrix(m); setAnalysis(a.questions); })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Gagal memuat.'));
  }, [id]);
  useEffect(load, [load]);

  const genQuestions = async () => {
    setBusy(true);
    try {
      await setAssessmentQuestions(
        id,
        Array.from({ length: numQ }, (_, i) => ({
          number: i + 1, type: 'MCQ' as const, weight: 1,
        })),
      );
      setNotice(`${numQ} butir soal dibuat — atur tipe & bobot di bawah lalu Simpan.`);
      load();
    } catch {
      setError('Gagal membuat butir soal.');
    } finally {
      setBusy(false);
    }
  };

  const updateQ = (idx: number, patch: Partial<AssessmentQuestion>) =>
    setQuestions((qs) => qs.map((q, i) => (i === idx ? { ...q, ...patch } : q)));

  const saveQuestions = async () => {
    setBusy(true);
    try {
      await setAssessmentQuestions(id, questions.map((q) => ({ number: q.number, type: q.type, weight: q.weight, ...(q.prompt ? { prompt: q.prompt } : {}) })));
      setNotice('Butir soal tersimpan.');
      load();
    } catch {
      setError('Gagal menyimpan.');
    } finally {
      setBusy(false);
    }
  };

  const setCell = (sId: string, qId: string, correct: boolean | null, weight: number) => {
    if (!matrix) return;
    setMatrix({
      ...matrix,
      students: matrix.students.map((s) =>
        s.id !== sId ? s : {
          ...s,
          cells: s.cells.map((c, i) =>
            matrix.questions[i]?.id === qId
              ? { score: correct === null ? 0 : correct ? weight : 0, isCorrect: correct, answer: c?.answer }
              : c,
          ),
        },
      ),
    });
  };

  const saveAnswers = async () => {
    if (!matrix) return;
    setBusy(true);
    setError(null);
    try {
      for (const [qi, q] of matrix.questions.entries()) {
        const rows = matrix.students
          .map((s) => ({ studentId: s.id, cell: s.cells[qi] }))
          .filter((r) => r.cell)
          .map((r) => ({ studentId: r.studentId, score: r.cell!.score, isCorrect: r.cell!.isCorrect ?? null, answer: r.cell!.answer ?? null }));
        if (rows.length) await saveQuestionAnswers(q.id, rows);
      }
      setNotice('Semua jawaban tersimpan.');
      load();
    } catch {
      setError('Sebagian jawaban gagal disimpan.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <PageTitle
        title={matrix?.assessment.name ?? 'Asesmen'}
        subtitle={matrix ? `${matrix.assessment.subject} · ${matrix.assessment.class ?? 'semua kelas'}` : ''}
      />
      {error ? <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {notice ? <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p> : null}

      <div className="mb-4 flex gap-2">
        {(['soal', 'jawaban', 'analisis'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-xl px-4 py-2 text-sm font-bold transition ${tab === t ? 'bg-primary-700 text-white' : 'bg-white text-sand-600 hover:bg-sand-100'}`}
          >
            {t === 'soal' ? 'Butir Soal & Kunci' : t === 'jawaban' ? 'Input Jawaban Siswa' : 'Analisis Butir'}
          </button>
        ))}
      </div>

      {tab === 'soal' && (
        <Widget
          title={`Butir Soal (${questions.length})`}
          subtitle="Tipe: PG, PG kompleks, benar/salah, menjodohkan. Bobot bisa beda per soal."
          action={
            <div className="flex items-center gap-2">
              <Input type="number" min={1} max={100} value={numQ} onChange={(e) => setNumQ(Number(e.target.value))} className="w-20" aria-label="Jumlah soal" />
              <Button size="sm" variant="outline" onClick={genQuestions} disabled={busy}>Buat {numQ} Soal</Button>
              <Button size="sm" onClick={saveQuestions} disabled={busy || !questions.length}>Simpan Butir</Button>
            </div>
          }
        >
          <DataTable head={['No', 'Tipe', 'Bobot', 'Keterangan']} empty={!questions.length ? 'Belum ada butir — buat dulu di atas.' : undefined}>
            {questions.map((q, i) => (
              <tr key={q.id}>
                <td className="px-5 py-2.5 font-bold text-sand-900">{q.number}</td>
                <td className="px-5 py-2.5">
                  <Select value={q.type} onChange={(e) => updateQ(i, { type: e.target.value as AssessmentQuestion['type'] })}>
                    {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </Select>
                </td>
                <td className="px-5 py-2.5">
                  <Input type="number" min={1} value={q.weight} onChange={(e) => updateQ(i, { weight: Number(e.target.value) || 1 })} className="w-20" aria-label={`Bobot soal ${q.number}`} />
                </td>
                <td className="px-5 py-2.5">
                  <Input value={q.prompt ?? ''} onChange={(e) => updateQ(i, { prompt: e.target.value })} placeholder="Catatan soal (opsional)" />
                </td>
              </tr>
            ))}
          </DataTable>
        </Widget>
      )}

      {tab === 'jawaban' && matrix && (
        <Widget
          title="Rekap Jawaban per Siswa"
          subtitle="Klik sel untuk tandai Benar / Salah / kosong. Simpan untuk merekap."
          action={<Button size="sm" onClick={saveAnswers} disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan Semua Jawaban'}</Button>}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-sand-200 text-sand-500">
                  <th className="px-3 py-2 font-bold">Siswa</th>
                  {matrix.questions.map((q) => (
                    <th key={q.id} className="px-1 py-2 text-center font-bold" title={`${TYPE_LABEL[q.type]} · bobot ${q.weight}`}>
                      {q.number}<span className="block text-[9px] font-normal text-sand-400">b{q.weight}</span>
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right font-bold">Total</th>
                </tr>
              </thead>
              <tbody>
                {matrix.students.map((s) => (
                  <tr key={s.id} className="border-b border-sand-50 hover:bg-sand-50">
                    <td className="whitespace-nowrap px-3 py-2 font-medium text-sand-900">
                      {s.name}
                      <span className="ml-1 text-[10px] text-sand-400">{s.nis ?? ''}</span>
                    </td>
                    {matrix.questions.map((q, qi) => {
                      const c = s.cells[qi];
                      return (
                        <td key={q.id} className="px-0.5 py-1 text-center">
                          <button
                            type="button"
                            onClick={() =>
                              setCell(
                                s.id, q.id,
                                c?.isCorrect === true ? false : c?.isCorrect === false ? null : true,
                                q.weight,
                              )
                            }
                            className={`mx-auto block size-6 rounded text-[10px] font-bold ${
                              c?.isCorrect === true
                                ? 'bg-emerald-600 text-white'
                                : c?.isCorrect === false
                                  ? 'bg-red-500 text-white'
                                  : 'bg-sand-100 text-sand-400 hover:bg-sand-200'
                            }`}
                          >
                            {c?.isCorrect === true ? '✓' : c?.isCorrect === false ? '✗' : '·'}
                          </button>
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-right font-bold text-sand-900">
                      {s.cells.reduce((a, c) => a + (c?.score ?? 0), 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Widget>
      )}

      {tab === 'analisis' && (
        <Widget title="Analisis Butir Soal" subtitle="Ketepatan & tingkat kesukaran per nomor.">
          <DataTable head={['No', 'Tipe', 'Bobot', 'Terjawab', 'Benar', '% Benar', 'Rata-rata Skor', 'Kategori']}
            empty={!analysis.length ? 'Belum ada butir/jawaban.' : undefined}>
            {analysis.map((a) => (
              <tr key={a.id}>
                <td className="px-5 py-2.5 font-bold text-sand-900">{a.number}</td>
                <td className="px-5 py-2.5 text-sand-600">{TYPE_LABEL[a.type]}</td>
                <td className="px-5 py-2.5 text-sand-600">{a.weight}</td>
                <td className="px-5 py-2.5 text-sand-600">{a.answered}</td>
                <td className="px-5 py-2.5 text-sand-600">{a.correct}</td>
                <td className="px-5 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-sand-100">
                      <div className="h-full bg-primary-600" style={{ width: `${a.correctPct ?? 0}%` }} />
                    </div>
                    <span className="text-xs font-bold">{a.correctPct ?? '—'}%</span>
                  </div>
                </td>
                <td className="px-5 py-2.5 text-sand-600">{a.avgScore}</td>
                <td className="px-5 py-2.5">
                  <Badge tone={a.difficulty === 'Mudah' ? 'primary' : a.difficulty === 'Sedang' ? 'accent' : 'danger'}>
                    {a.difficulty ?? '—'}
                  </Badge>
                </td>
              </tr>
            ))}
          </DataTable>
        </Widget>
      )}
    </Shell>
  );
}
