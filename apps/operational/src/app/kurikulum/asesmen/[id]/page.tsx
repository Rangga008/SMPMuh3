'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Badge, Button, Field, Input, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { PageTitle, Widget } from '@/components/widgets';
import { DataTable } from '@/components/data-table';
import { ApiError } from '@/lib/api';
import {
  downloadQuestionTemplate,
  getAnswerMatrix,
  getAssessmentQuestions,
  getQuestionAnalysis,
  importQuestions,
  saveQuestionAnswers,
  setAssessmentQuestions,
  type AssessmentQuestion,
} from '@/lib/api-ops';

const TYPE_LABEL: Record<string, string> = {
  MCQ: 'Pilihan Ganda', MCQ_COMPLEX: 'PG Kompleks', TRUE_FALSE: 'Benar/Salah', MATCHING: 'Menjodohkan',
};
const LETTERS = 'ABCDE';

/** Draft editor — bentuk ramah-UI yang diterjemahkan ke format API. */
type QDraft = {
  number: number;
  type: AssessmentQuestion['type'];
  weight: number;
  prompt: string;
  choices: string[];   // pilihan A–E (PG/PGK) atau sisi kiri (JODOH)
  rights: string[];    // sisi kanan — hanya JODOH
  keySingle: number | null;
  keyMulti: number[];
  keyBool: boolean | null;
  keyPairs: number[];  // indeks sisi kanan per item kiri — JODOH
};

const blank = (number: number): QDraft => ({
  number, type: 'MCQ', weight: 1, prompt: '',
  choices: ['', '', '', ''], rights: [],
  keySingle: null, keyMulti: [], keyBool: null, keyPairs: [],
});

function toDraft(q: AssessmentQuestion): QDraft {
  const opts = (q.options ?? {}) as { choices?: string[]; pairs?: { left: string; right: string }[]; rights?: string[] };
  const d = blank(q.number);
  d.type = q.type;
  d.weight = q.weight ?? 1;
  d.prompt = q.prompt ?? '';
  if (q.type === 'MCQ' || q.type === 'MCQ_COMPLEX') {
    const c = opts.choices ?? [];
    d.choices = c.length ? c : ['', '', '', ''];
    if (q.type === 'MCQ') d.keySingle = typeof q.key === 'number' ? q.key : null;
    else d.keyMulti = Array.isArray(q.key) ? (q.key as number[]).map(Number) : [];
  } else if (q.type === 'TRUE_FALSE') {
    d.keyBool = typeof q.key === 'boolean' ? q.key : null;
  } else {
    const pairs = opts.pairs ?? [];
    d.choices = pairs.map((p) => p.left);
    // rights: pakai daftar tersimpan bila ada, else urutan kemunculan
    const rights = opts.rights?.length
      ? opts.rights
      : [...new Set(pairs.map((p) => p.right))];
    d.rights = rights;
    d.keyPairs = pairs.map((p) => Math.max(0, rights.indexOf(p.right)));
  }
  return d;
}

function toApi(d: QDraft): Partial<AssessmentQuestion> {
  const base: Partial<AssessmentQuestion> = { number: d.number, type: d.type, weight: d.weight || 1 };
  if (d.prompt.trim()) base.prompt = d.prompt.trim();
  if (d.type === 'MCQ') {
    return { ...base, options: { choices: d.choices.filter((c) => c.trim()) }, key: d.keySingle ?? undefined };
  }
  if (d.type === 'MCQ_COMPLEX') {
    return { ...base, options: { choices: d.choices.filter((c) => c.trim()) }, key: [...d.keyMulti].sort((a, b) => a - b) };
  }
  if (d.type === 'TRUE_FALSE') {
    return { ...base, key: d.keyBool ?? undefined };
  }
  const lefts = d.choices.filter((c) => c.trim());
  return {
    ...base,
    options: {
      rights: d.rights.filter((r) => r.trim()),
      pairs: lefts.map((left, i) => ({ left, right: d.rights[d.keyPairs[i] ?? -1] ?? '' })),
    },
    key: d.keyPairs.slice(0, lefts.length),
  };
}

type Matrix = Awaited<ReturnType<typeof getAnswerMatrix>>;

export default function AsesmenDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [drafts, setDrafts] = useState<QDraft[]>([]);
  const [matrix, setMatrix] = useState<Matrix | null>(null);
  const [analysis, setAnalysis] = useState<Awaited<ReturnType<typeof getQuestionAnalysis>>['questions']>([]);
  const [tab, setTab] = useState<'soal' | 'jawaban' | 'analisis'>('soal');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [numQ, setNumQ] = useState(10);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    Promise.all([getAssessmentQuestions(id), getAnswerMatrix(id), getQuestionAnalysis(id)])
      .then(([q, m, a]) => {
        setDrafts(q.map(toDraft));
        setMatrix(m);
        setAnalysis(a.questions);
        setDirty(false);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Gagal memuat.'));
  }, [id]);
  useEffect(load, [load]);

  const addBlank = () => {
    setDrafts((d) => [...d, blank(d.length ? Math.max(...d.map((x) => x.number)) + 1 : 1)]);
    setDirty(true);
  };

  const genQuestions = () => {
    setDrafts(Array.from({ length: numQ }, (_, i) => blank(i + 1)));
    setDirty(true);
    setNotice(`${numQ} butir kosong dibuat — isi teks, pilihan & kunci lalu Simpan.`);
  };

  const updateD = (idx: number, patch: Partial<QDraft>) => {
    setDrafts((qs) => qs.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
    setDirty(true);
  };

  const renumber = (qs: QDraft[]) => qs.map((q, i) => ({ ...q, number: i + 1 }));

  const validate = (): string | null => {
    for (const d of drafts) {
      if (!d.prompt.trim()) return `Soal No.${d.number}: teks pertanyaan masih kosong.`;
      if (d.type === 'MCQ') {
        const c = d.choices.filter((x) => x.trim());
        if (c.length < 2) return `Soal No.${d.number}: minimal 2 pilihan.`;
        if (d.keySingle === null || !c[d.keySingle]) return `Soal No.${d.number}: pilih kunci jawaban (klik huruf di pilihan).`;
      } else if (d.type === 'MCQ_COMPLEX') {
        const c = d.choices.filter((x) => x.trim());
        if (c.length < 2) return `Soal No.${d.number}: minimal 2 pilihan.`;
        if (!d.keyMulti.length) return `Soal No.${d.number}: centang minimal 1 kunci.`;
      } else if (d.type === 'TRUE_FALSE') {
        if (d.keyBool === null) return `Soal No.${d.number}: pilih kunci Benar atau Salah.`;
      } else {
        const l = d.choices.filter((x) => x.trim());
        const r = d.rights.filter((x) => x.trim());
        if (!l.length || !r.length) return `Soal No.${d.number}: isi item kiri dan pasangan kanan.`;
        if (d.keyPairs.slice(0, l.length).some((k) => !r[k]?.trim())) {
          return `Soal No.${d.number}: tiap item kiri harus dipilih pasangannya.`;
        }
      }
    }
    return null;
  };

  const saveQuestions = async () => {
    const bad = validate();
    if (bad) { setError(bad); return; }
    setBusy(true);
    setError(null);
    try {
      await setAssessmentQuestions(id, drafts.map(toApi));
      setNotice('Butir soal tersimpan.');
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal menyimpan.');
    } finally {
      setBusy(false);
    }
  };

  const doImport = async (f: File) => {
    setBusy(true);
    setError(null);
    try {
      const r = await importQuestions(id, f);
      setNotice(`${r.count} soal berhasil diimpor.`);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal mengimpor.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
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

  /** Editor isi per tipe soal. */
  const body = (d: QDraft, i: number) => {
    const setChoice = (j: number, v: string, side: 'choices' | 'rights' = 'choices') =>
      updateD(i, { [side]: (side === 'choices' ? d.choices : d.rights).map((c, k) => (k === j ? v : c)) } as Partial<QDraft>);
    const addChoice = (side: 'choices' | 'rights' = 'choices') => {
      const arr = side === 'choices' ? d.choices : d.rights;
      if (arr.length >= (side === 'choices' ? 5 : 8)) return;
      updateD(i, { [side]: [...arr, ''] } as Partial<QDraft>);
    };
    const delChoice = (j: number, side: 'choices' | 'rights' = 'choices') => {
      const arr = side === 'choices' ? d.choices : d.rights;
      if (arr.length <= 2) return;
      const next = arr.filter((_, k) => k !== j);
      if (side === 'choices') {
        const patch: Partial<QDraft> = { choices: next };
        if (d.keySingle !== null && d.keySingle >= next.length) patch.keySingle = null;
        if (d.keyMulti.some((k) => k >= next.length)) patch.keyMulti = d.keyMulti.filter((k) => k < next.length);
        if (d.type === 'MATCHING') patch.keyPairs = d.keyPairs.filter((_, k) => k !== j);
        updateD(i, patch);
      } else {
        updateD(i, {
          rights: next,
          keyPairs: d.keyPairs.map((k) => (k === j ? -1 : k > j ? k - 1 : k)),
        });
      }
    };

    if (d.type === 'MCQ' || d.type === 'MCQ_COMPLEX') {
      return (
        <div className="space-y-1.5">
          <p className="text-[11px] font-bold uppercase tracking-wide text-sand-400">
            Pilihan jawaban — {d.type === 'MCQ' ? 'klik huruf untuk jadikan kunci' : 'centang semua kunci yang benar'}
          </p>
          {d.choices.map((c, j) => {
            const isKey = d.type === 'MCQ' ? d.keySingle === j : d.keyMulti.includes(j);
            return (
              <div key={j} className="flex items-center gap-2">
                <button
                  type="button"
                  title={isKey ? 'Kunci' : 'Jadikan kunci'}
                  onClick={() =>
                    updateD(i,
                      d.type === 'MCQ'
                        ? { keySingle: d.keySingle === j ? null : j }
                        : { keyMulti: isKey ? d.keyMulti.filter((k) => k !== j) : [...d.keyMulti, j] },
                    )
                  }
                  className={`grid size-8 shrink-0 place-items-center rounded-lg text-xs font-black transition ${
                    isKey ? 'bg-emerald-600 text-white' : 'bg-sand-100 text-sand-500 hover:bg-sand-200'
                  }`}
                >
                  {LETTERS[j]}
                </button>
                <Input value={c} onChange={(e) => setChoice(j, e.target.value)} placeholder={`Pilihan ${LETTERS[j]}`} />
                {d.choices.length > 2 ? (
                  <button type="button" onClick={() => delChoice(j)} className="shrink-0 text-xs font-bold text-red-500 hover:text-red-700">✕</button>
                ) : null}
              </div>
            );
          })}
          {d.choices.length < 5 ? (
            <button type="button" onClick={() => addChoice()} className="text-xs font-bold text-primary-700 hover:underline">+ Tambah Pilihan</button>
          ) : null}
        </div>
      );
    }
    if (d.type === 'TRUE_FALSE') {
      return (
        <div className="flex gap-2">
          {[['BENAR', true], ['SALAH', false]].map(([lbl, v]) => (
            <button
              key={lbl as string}
              type="button"
              onClick={() => updateD(i, { keyBool: v as boolean })}
              className={`rounded-lg px-4 py-2 text-xs font-black transition ${
                d.keyBool === v ? 'bg-emerald-600 text-white' : 'bg-sand-100 text-sand-500 hover:bg-sand-200'
              }`}
            >
              {d.keyBool === v ? '✓ ' : ''}{lbl as string}
            </button>
          ))}
          <span className="self-center text-[11px] text-sand-400">— klik untuk jadikan kunci</span>
        </div>
      );
    }
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <p className="text-[11px] font-bold uppercase tracking-wide text-sand-400">Sisi kiri (pernyataan)</p>
          {d.choices.map((c, j) => (
            <div key={j} className="flex items-center gap-2">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-sand-100 text-xs font-black text-sand-500">{j + 1}</span>
              <Input value={c} onChange={(e) => setChoice(j, e.target.value)} placeholder={`Pernyataan ${j + 1}`} />
              {d.choices.length > 2 ? (
                <button type="button" onClick={() => delChoice(j)} className="shrink-0 text-xs font-bold text-red-500 hover:text-red-700">✕</button>
              ) : null}
            </div>
          ))}
          {d.choices.length < 5 ? (
            <button type="button" onClick={() => addChoice()} className="text-xs font-bold text-primary-700 hover:underline">+ Tambah Item</button>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <p className="text-[11px] font-bold uppercase tracking-wide text-sand-400">Sisi kanan (pasangan) + kunci per item kiri</p>
          {d.rights.map((c, j) => (
            <div key={j} className="flex items-center gap-2">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary-100 text-xs font-black text-primary-700">{j + 1}</span>
              <Input value={c} onChange={(e) => setChoice(j, e.target.value, 'rights')} placeholder={`Pasangan ${j + 1}`} />
              {d.rights.length > 2 ? (
                <button type="button" onClick={() => delChoice(j, 'rights')} className="shrink-0 text-xs font-bold text-red-500 hover:text-red-700">✕</button>
              ) : null}
            </div>
          ))}
          {d.rights.length < 8 ? (
            <button type="button" onClick={() => addChoice('rights')} className="text-xs font-bold text-primary-700 hover:underline">+ Tambah Pasangan</button>
          ) : null}
          {d.choices.filter((c) => c.trim()).length && d.rights.filter((r) => r.trim()).length ? (
            <div className="mt-2 space-y-1 rounded-xl bg-sand-50 p-2.5">
              <p className="text-[11px] font-bold uppercase tracking-wide text-sand-400">Kunci: item kiri → pasangan</p>
              {d.choices.map((c, j) =>
                !c.trim() ? null : (
                  <div key={j} className="flex items-center gap-2 text-xs">
                    <span className="w-32 truncate font-medium">{c || `Item ${j + 1}`}</span>
                    <Select
                      value={d.keyPairs[j] ?? ''}
                      onChange={(e) => {
                        const kp = [...d.keyPairs];
                        kp[j] = Number(e.target.value);
                        updateD(i, { keyPairs: kp });
                      }}
                      className="w-48"
                    >
                      <option value="">— pilih —</option>
                      {d.rights.map((r, k) =>
                        !r.trim() ? null : <option key={k} value={k}>{`${k + 1} · ${r}`}</option>,
                      )}
                    </Select>
                  </div>
                ),
              )}
            </div>
          ) : null}
        </div>
      </div>
    );
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
          title={`Butir Soal (${drafts.length})`}
          subtitle="Soal lengkap untuk CBT — isi teks, pilihan, kunci & bobot. Atau impor dari Excel."
          action={
            <div className="flex items-center gap-2">
              <Input type="number" min={1} max={100} value={numQ} onChange={(e) => setNumQ(Number(e.target.value))} className="w-20" aria-label="Jumlah soal" />
              <Button size="sm" variant="outline" onClick={genQuestions} disabled={busy}>Buat {numQ} Kosong</Button>
              <Button size="sm" variant="outline" onClick={addBlank} disabled={busy}>+ 1 Soal</Button>
              <Button size="sm" variant="outline" onClick={() => void downloadQuestionTemplate(id)}>Template</Button>
              <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>Impor Excel</Button>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void doImport(f); }}
              />
              <Button size="sm" onClick={saveQuestions} disabled={busy || !drafts.length}>
                {busy ? 'Menyimpan…' : dirty ? 'Simpan Butir *' : 'Simpan Butir'}
              </Button>
            </div>
          }
        >
          {!drafts.length ? (
            <p className="px-5 py-8 text-center text-sm text-sand-400">
              Belum ada butir — buat kosong di atas atau impor dari Excel (pakai Template).
            </p>
          ) : (
            <div className="space-y-3 p-4">
              {drafts.map((d, i) => (
                <div key={i} className="rounded-2xl border border-sand-200 bg-white p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="grid size-8 place-items-center rounded-xl bg-primary-700 text-sm font-black text-white">{d.number}</span>
                    <Select
                      value={d.type}
                      onChange={(e) => {
                        const t = e.target.value as QDraft['type'];
                        updateD(i, { type: t, ...(t === 'MATCHING' && d.rights.length < 3 ? { rights: ['', '', ''] } : {}) });
                      }}
                      className="w-44"
                    >
                      {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </Select>
                    <Field label="Bobot" className="!mb-0 flex items-center gap-1 text-xs">
                      <Input type="number" min={1} value={d.weight} onChange={(e) => updateD(i, { weight: Number(e.target.value) || 1 })} className="w-16" />
                    </Field>
                    <button
                      type="button"
                      onClick={() => setDrafts((qs) => renumber(qs.filter((_, k) => k !== i)))}
                      className="ml-auto text-xs font-bold text-red-500 hover:text-red-700"
                    >
                      Hapus Soal
                    </button>
                  </div>
                  <Field label="Teks Pertanyaan" className="!mb-3">
                    <textarea
                      value={d.prompt}
                      onChange={(e) => updateD(i, { prompt: e.target.value })}
                      rows={2}
                      className="w-full rounded-xl border border-sand-200 px-3 py-2 text-sm outline-none focus:border-primary-400"
                      placeholder="Tulis pertanyaan…"
                    />
                  </Field>
                  {body(d, i)}
                </div>
              ))}
            </div>
          )}
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
