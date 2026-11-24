'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Badge, Button, Field, Input, Modal, Select } from '@smpmuh3/ui';
import { Shell } from '@/components/shell';
import { PageTitle, Widget } from '@/components/widgets';
import { ExamPanel } from '@/components/exam-panel';
import { QuestionPreview, type PreviewQuestion } from '@/components/question-preview';
import { MathField } from '@/components/rich-editor';
import {
  ApiError,
  ensureAssessmentExam,
  getAssessment,
  listClasses,
  listSubjects,
  updateAssessment,
  type AssessmentView,
  type ClassView,
} from '@/lib/api';
import { richHtml } from '@/lib/math';
import {
  downloadExamQuestionTemplate,
  downloadExamQuestionTemplateDocx,
  examQuestions,
  getAssessmentPassages,
  previewExamImportQuestions,
  setAssessmentPassages,
  setExamQuestions,
  uploadQuestionMedia,
  type AssessmentPassage,
  type AssessmentQuestion,
  type ExamQuestion,
} from '@/lib/api-ops';

const TYPE_LABEL: Record<string, string> = {
  MCQ: 'Pilihan Ganda', MCQ_COMPLEX: 'PG Kompleks', TRUE_FALSE: 'Benar/Salah',
  TRUE_FALSE_COMPLEX: 'B/S Kompleks', MATCHING: 'Menjodohkan',
};
const LETTERS = 'ABCDE';
const stripHtml = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/** Draft editor — bentuk ramah-UI yang diterjemahkan ke format API. */
type QDraft = {
  number: number;
  type: AssessmentQuestion['type'];
  weight: string; // teks mentah ("2,5"/"2.5") — dinormalkan saat simpan
  prompt: string;
  passageCode: string;
  choices: string[];   // pilihan A–E (PG/PGK), pernyataan (BSK), atau sisi kiri (JODOH)
  rights: string[];    // sisi kanan — hanya JODOH
  keySingle: number | null;
  keyMulti: number[];
  keyBool: boolean | null;
  keyBools: boolean[]; // kunci B/S per pernyataan — BSK
  keyPairs: number[];  // indeks sisi kanan per item kiri — JODOH
};

const blank = (number: number): QDraft => ({
  number, type: 'MCQ', weight: '1', prompt: '', passageCode: '',
  choices: ['', '', '', ''], rights: [],
  keySingle: null, keyMulti: [], keyBool: null, keyBools: [], keyPairs: [],
});

function toDraft(q: AssessmentQuestion | Omit<AssessmentQuestion, 'id'>): QDraft {
  const opts = (q.options ?? {}) as { choices?: string[]; statements?: string[]; pairs?: { left: string; right: string }[]; rights?: string[] };
  const d = blank(q.number);
  d.type = q.type;
  d.weight = String(q.weight ?? 1);
  d.prompt = q.prompt ?? '';
  d.passageCode = q.passageCode ?? '';
  if (q.type === 'MCQ' || q.type === 'MCQ_COMPLEX') {
    const c = opts.choices ?? [];
    d.choices = c.length ? c : ['', '', '', ''];
    if (q.type === 'MCQ') d.keySingle = typeof q.key === 'number' ? q.key : null;
    else d.keyMulti = Array.isArray(q.key) ? (q.key as number[]).map(Number) : [];
  } else if (q.type === 'TRUE_FALSE') {
    d.keyBool = typeof q.key === 'boolean' ? q.key : null;
  } else if (q.type === 'TRUE_FALSE_COMPLEX') {
    const st = opts.statements ?? [];
    d.choices = st.length ? st : ['', ''];
    d.keyBools = Array.isArray(q.key) ? (q.key as boolean[]).map(Boolean) : [];
  } else {
    const pairs = opts.pairs ?? [];
    d.choices = pairs.map((p) => p.left);
    const rights = opts.rights?.length ? opts.rights : [...new Set(pairs.map((p) => p.right))];
    d.rights = rights;
    d.keyPairs = pairs.map((p) => Math.max(0, rights.indexOf(p.right)));
  }
  return d;
}

function toApi(d: QDraft): Partial<AssessmentQuestion> {
  // Bobot desimal — terima koma ("2,5") maupun titik ("2.5").
  const w = Number(String(d.weight).replace(',', '.'));
  const base: Partial<AssessmentQuestion> = {
    number: d.number, type: d.type, weight: Number.isFinite(w) && w > 0 ? w : 1,
  };
  if (d.prompt.trim()) base.prompt = d.prompt.trim();
  if (d.passageCode) base.passageCode = d.passageCode;
  if (d.type === 'MCQ') {
    return { ...base, options: { choices: d.choices.filter((c) => c.trim()) }, key: d.keySingle ?? undefined };
  }
  if (d.type === 'MCQ_COMPLEX') {
    return { ...base, options: { choices: d.choices.filter((c) => c.trim()) }, key: [...d.keyMulti].sort((a, b) => a - b) };
  }
  if (d.type === 'TRUE_FALSE') {
    return { ...base, key: d.keyBool ?? undefined };
  }
  if (d.type === 'TRUE_FALSE_COMPLEX') {
    const st = d.choices.map((c, j) => ({ c, k: d.keyBools[j] ?? false })).filter((x) => x.c.trim());
    return { ...base, options: { statements: st.map((x) => x.c) }, key: st.map((x) => x.k) };
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

type PassageDraft = { code: string; content: string; media?: { key: string; name: string }[] | null };

export default function AsesmenDetailPage() {
  return (
    <Suspense fallback={null}>
      <AsesmenDetailInner />
    </Suspense>
  );
}

function AsesmenDetailInner() {
  const { id } = useParams<{ id: string }>();
  /** Asesmen = ujian: tab utama Ujian & Monitor memakai ExamPanel pada ujian
   *  pendamping; tab Soal mengedit butir milik ujian itu (bacaan tetap di asesmen). */
  const params = useSearchParams();
  const [assessment, setAssessment] = useState<AssessmentView | null>(null);
  const [examId, setExamId] = useState<string | null>(null);
  const [mainTab, setMainTab] = useState<'ujian' | 'soal'>(params.get('tab') === 'soal' ? 'soal' : 'ujian');
  const [drafts, setDrafts] = useState<QDraft[]>([]);
  const [tab, setTab] = useState<'soal' | 'bacaan'>('soal');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [numQ, setNumQ] = useState(10);
  const fileRef = useRef<HTMLInputElement>(null);

  // ---- Cari & paginasi ----
  const [search, setSearch] = useState('');
  const [perPage, setPerPage] = useState<number | 'all'>(10);
  const [page, setPage] = useState(0);

  // ---- Bacaan ----
  const [passages, setPassages] = useState<PassageDraft[]>([]);
  const [passagesDirty, setPassagesDirty] = useState(false);

  // ---- Pratinjau tampilan siswa (modal) per kartu soal ----
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);

  // ---- Modal import (preview) ----
  const [importModal, setImportModal] = useState(false);
  const [preview, setPreview] = useState<{ questions: (Omit<AssessmentQuestion, 'id'> & { id?: string })[]; passages: Omit<AssessmentPassage, 'id'>[] } | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [tplCount, setTplCount] = useState({ pg: 10, pgk: 0, bs: 0, bsk: 0 });

  // ---- Modal edit asesmen ----
  const [editAsm, setEditAsm] = useState(false);
  const [subjects, setSubjects] = useState<{ id: string; name: string; code: string }[]>([]);
  const [classes, setClasses] = useState<ClassView[]>([]);
  const [modalErr, setModalErr] = useState<string | null>(null);

  const load = useCallback(() => {
    getAssessment(id)
      .then(async (a) => {
        setAssessment(a);
        let exId = a.exams?.[0]?.id ?? null;
        if (!exId) exId = (await ensureAssessmentExam(id)).examId;
        setExamId(exId);
        const [q, p] = await Promise.all([examQuestions(exId), getAssessmentPassages(id)]);
        setDrafts(q.map(toDraft));
        setPassages(p.map((x) => ({ code: x.code, content: x.content, media: x.media ?? null })));
        setDirty(false);
        setPassagesDirty(false);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Gagal memuat.'));
  }, [id]);
  useEffect(load, [load]);

  const flash = (msg: string) => { setNotice(msg); setTimeout(() => setNotice(null), 4000); };

  const addBlank = () => {
    setDrafts((d) => [...d, blank(d.length ? Math.max(...d.map((x) => x.number)) + 1 : 1)]);
    setDirty(true);
    setPage(Math.ceil((drafts.length + 1) / (perPage === 'all' ? drafts.length + 1 : perPage)) - 1);
  };

  const genQuestions = () => {
    setDrafts(Array.from({ length: numQ }, (_, i) => blank(i + 1)));
    setDirty(true);
    setPage(0);
    setNotice(`${numQ} butir kosong dibuat — isi teks, pilihan & kunci lalu Simpan.`);
  };

  const updateD = (idx: number, patch: Partial<QDraft>) => {
    setDrafts((qs) => qs.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
    setDirty(true);
  };

  const renumber = (qs: QDraft[]) => qs.map((q, i) => ({ ...q, number: i + 1 }));

  // ---- Filter + paginasi ----
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return drafts.map((d, i) => ({ d, i }));
    return drafts
      .map((d, i) => ({ d, i }))
      .filter(({ d }) =>
        String(d.number).includes(s) ||
        stripHtml(d.prompt).toLowerCase().includes(s) ||
        d.choices.some((c) => stripHtml(c).toLowerCase().includes(s)) ||
        (TYPE_LABEL[d.type] ?? '').toLowerCase().includes(s));
  }, [drafts, search]);
  const pageCount = perPage === 'all' ? 1 : Math.max(1, Math.ceil(filtered.length / perPage));
  const pageSafe = Math.min(page, pageCount - 1);
  const paged = perPage === 'all' ? filtered : filtered.slice(pageSafe * perPage, (pageSafe + 1) * perPage);

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
      } else if (d.type === 'TRUE_FALSE_COMPLEX') {
        const st = d.choices.filter((x) => x.trim());
        if (st.length < 2) return `Soal No.${d.number}: BSK minimal 2 pernyataan.`;
        if (d.choices.some((c, j) => c.trim() && d.keyBools[j] === undefined))
          return `Soal No.${d.number}: pilih B/S untuk tiap pernyataan.`;
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
      await setExamQuestions(examId!, drafts.map(toApi) as Omit<ExamQuestion, 'id'>[]);
      flash('Butir soal tersimpan.');
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal menyimpan.');
    } finally {
      setBusy(false);
    }
  };

  // ---------- Import (modal + preview) ----------
  const openImport = () => { setImportModal(true); setPreview(null); setModalErr(null); };
  const doPreview = async (f: File) => {
    setPreviewBusy(true);
    setModalErr(null);
    try {
      setPreview(await previewExamImportQuestions(examId!, f));
    } catch (e) {
      setPreview(null);
      setModalErr(e instanceof ApiError ? e.message : 'Gagal membaca file.');
    } finally {
      setPreviewBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };
  const confirmImport = async () => {
    if (!preview) return;
    setBusy(true);
    setModalErr(null);
    try {
      await setExamQuestions(examId!, preview.questions as Omit<ExamQuestion, 'id'>[]);
      if (preview.passages.length) {
        await setAssessmentPassages(id, preview.passages.map((p) => ({
          code: p.code, content: p.content, ...(p.media?.length ? { media: p.media } : {}),
        })));
      }
      setImportModal(false);
      flash(`${preview.questions.length} soal${preview.passages.length ? ` + ${preview.passages.length} bacaan` : ''} berhasil diimpor.`);
      load();
    } catch (e) {
      setModalErr(e instanceof ApiError ? e.message : 'Gagal menyimpan impor.');
    } finally {
      setBusy(false);
    }
  };
  // ---------- Bacaan ----------
  const updateP = (i: number, patch: Partial<PassageDraft>) => {
    setPassages((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));
    setPassagesDirty(true);
  };
  const savePassages = async () => {
    const codes = new Set<string>();
    for (const p of passages) {
      if (!p.code.trim()) { setError('Semua bacaan wajib punya kode (mis. B1).'); return; }
      const c = p.code.trim().toUpperCase();
      if (codes.has(c)) { setError(`Kode bacaan ${c} ganda.`); return; }
      codes.add(c);
      if (!p.content.trim()) { setError(`Bacaan ${c}: isi kosong.`); return; }
    }
    setBusy(true);
    setError(null);
    try {
      await setAssessmentPassages(id, passages.map((p) => ({ code: p.code.trim().toUpperCase(), content: p.content, ...(p.media?.length ? { media: p.media } : {}) })));
      flash('Bacaan tersimpan.');
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal menyimpan bacaan.');
    } finally {
      setBusy(false);
    }
  };
  /** Soal yang memakai kode bacaan ini. */
  const usedBy = (code: string) => drafts.filter((d) => d.passageCode === code).map((d) => d.number);

  // ---------- Modal edit asesmen ----------
  const openEditAsm = async () => {
    setModalErr(null);
    setEditAsm(true);
    try {
      const [s, c] = await Promise.all([listSubjects(), listClasses()]);
      setSubjects(s as { id: string; name: string; code: string }[]);
      setClasses(c);
    } catch { /* biarkan kosong */ }
  };
  const saveAsm = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setModalErr(null);
    try {
      await updateAssessment(id, {
        name: String(f.get('name') ?? '').trim(),
        subjectId: String(f.get('subjectId') ?? '') || undefined,
        classId: String(f.get('classId') ?? '') || null,
      });
      setEditAsm(false);
      flash('Asesmen diperbarui.');
      load();
    } catch (err) {
      setModalErr(err instanceof ApiError ? err.message : 'Gagal menyimpan.');
    } finally {
      setBusy(false);
    }
  };

  // ---------- Gambar ----------
  const imgInputRef = useRef<HTMLInputElement>(null);
  const imgTargetRef = useRef<((url: string) => void) | null>(null);
  const pickImage = (apply: (url: string) => void) => {
    imgTargetRef.current = apply;
    imgInputRef.current?.click();
  };
  const onImgPicked = async (f: File) => {
    try {
      const r = await uploadQuestionMedia(f);
      imgTargetRef.current?.(r.url);
      setDirty(true);
      setPassagesDirty(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal mengunggah gambar.');
    } finally {
      if (imgInputRef.current) imgInputRef.current.value = '';
      imgTargetRef.current = null;
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
        if (d.keyBools.length) patch.keyBools = d.keyBools.filter((_, k) => k !== j);
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
              <div key={j}>
                <div className="flex items-center gap-2">
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
                  <MathField
                    singleLine
                    value={c}
                    onChange={(v) => setChoice(j, v)}
                    pickImage={pickImage}
                    placeholder={`Pilihan ${LETTERS[j]} — teks, rumus ƒx, atau gambar 🖼`}
                  />
                  {d.choices.length > 2 ? (
                    <button type="button" onClick={() => delChoice(j)} className="shrink-0 text-xs font-bold text-red-500 hover:text-red-700">✕</button>
                  ) : null}
                </div>
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
    if (d.type === 'TRUE_FALSE_COMPLEX') {
      return (
        <div className="space-y-1.5">
          <p className="text-[11px] font-bold uppercase tracking-wide text-sand-400">
            Pernyataan — klik B/S untuk jadikan kunci tiap pernyataan
          </p>
          {d.choices.map((c, j) => {
            const kb = d.keyBools[j];
            return (
              <div key={j}>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    title="Kunci pernyataan ini"
                    onClick={() => {
                      const next = [...d.keyBools];
                      next[j] = kb !== true;
                      updateD(i, { keyBools: next });
                    }}
                    className={`grid size-8 shrink-0 place-items-center rounded-lg text-[10px] font-black transition ${
                      kb === true ? 'bg-emerald-600 text-white' : kb === false ? 'bg-red-500 text-white' : 'bg-sand-100 text-sand-400 hover:bg-sand-200'
                    }`}
                  >
                    {kb === true ? 'B' : kb === false ? 'S' : '·'}
                  </button>
                  <MathField
                    singleLine
                    value={c}
                    onChange={(v) => setChoice(j, v)}
                    pickImage={pickImage}
                    placeholder={`Pernyataan ${j + 1} — teks, rumus ƒx, atau gambar 🖼`}
                  />
                  {d.choices.length > 2 ? (
                    <button type="button" onClick={() => delChoice(j)} className="shrink-0 text-xs font-bold text-red-500 hover:text-red-700">✕</button>
                  ) : null}
                </div>
              </div>
            );
          })}
          {d.choices.length < 5 ? (
            <button type="button" onClick={() => addChoice()} className="text-xs font-bold text-primary-700 hover:underline">+ Tambah Pernyataan</button>
          ) : null}
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
              <MathField
                singleLine
                value={c}
                onChange={(v) => setChoice(j, v)}
                pickImage={pickImage}
                placeholder={`Pernyataan ${j + 1}`}
              />
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
              <MathField
                singleLine
                value={c}
                onChange={(v) => setChoice(j, v, 'rights')}
                pickImage={pickImage}
                placeholder={`Pasangan ${j + 1}`}
              />
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
                     searchable>
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

  const ex = assessment?.exams?.[0];
  return (
    <Shell>
      <PageTitle
        title={assessment?.name ?? 'Asesmen'}
        subtitle={assessment ? `${assessment.subject?.name ?? '—'}${ex?.gradeLevel ? ` · Kelas ${ex.gradeLevel}` : ''} · ${assessment.type} · maks ${assessment.maxScore}` : ''}
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => void openEditAsm()}>✏️ Edit Asesmen</Button>
            <Link href="/kurikulum/asesmen" className="text-sm font-bold text-primary-700 hover:underline">← Semua Asesmen</Link>
          </div>
        }
      />
      {error ? <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {notice ? <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p> : null}

      {/* ---------- Tab utama: Ujian & Monitor | Soal ---------- */}
      <div className="mb-4 flex gap-1 rounded-2xl border border-sand-200 bg-white p-1 shadow-card">
        {([['ujian', '⚙️ Ujian & Monitor'], ['soal', `📝 Soal & Bacaan${drafts.length ? ` (${drafts.length})` : ''}`]] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setMainTab(k)}
            className={`flex-1 rounded-xl px-3 py-2 text-sm font-bold transition ${mainTab === k ? 'bg-primary-700 text-white' : 'text-sand-600 hover:bg-sand-50'}`}>
            {l}
          </button>
        ))}
      </div>

      {mainTab === 'ujian' ? (
        examId ? <ExamPanel id={examId} embedded /> : <p className="py-10 text-center text-sm text-sand-400">Menyiapkan ujian…</p>
      ) : null}

      {mainTab === 'soal' ? (
      <>
      <div className="mb-4 flex gap-2 overflow-x-auto">
        {(['soal', 'bacaan'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold transition ${tab === t ? 'bg-primary-700 text-white' : 'bg-white text-sand-600 hover:bg-sand-100'}`}
          >
            {t === 'soal' ? `Butir Soal (${drafts.length})` : `Bacaan (${passages.length})`}
          </button>
        ))}
      </div>

      {!examId ? <p className="py-10 text-center text-sm text-sand-400">Menyiapkan ujian…</p> : null}
      {examId && tab === 'soal' && (
        <Widget
          title={`Kelola Butir Soal`}
          subtitle="Teks, pilihan, kunci, bobot & bacaan — boleh bergambar (🖼) & rumus $…$. Simpan setelah selesai."
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Input type="number" min={1} max={100} value={numQ} onChange={(e) => setNumQ(Number(e.target.value))} className="w-16" aria-label="Jumlah soal" />
              <Button size="sm" variant="outline" onClick={genQuestions} disabled={busy}>Buat {numQ} Kosong</Button>
              <Button size="sm" variant="outline" onClick={addBlank} disabled={busy}>+ 1 Soal</Button>
              <Button size="sm" variant="outline" onClick={openImport} disabled={busy}>Impor / Template</Button>
              <Button size="sm" onClick={saveQuestions} disabled={busy || !drafts.length}>
                {busy ? 'Menyimpan…' : dirty ? 'Simpan Butir *' : 'Simpan Butir'}
              </Button>
            </div>
          }
        >
          <div className="flex flex-wrap items-center gap-2 border-b border-sand-100 px-4 py-3">
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              placeholder="Cari no / teks soal…"
              className="w-56"
            />
            <Select value={String(perPage)} onChange={(e) => { setPerPage(e.target.value === 'all' ? 'all' : Number(e.target.value)); setPage(0); }} className="w-32">
              <option value="5">5 / halaman</option>
              <option value="10">10 / halaman</option>
              <option value="20">20 / halaman</option>
              <option value="30">30 / halaman</option>
              <option value="all">Semua</option>
            </Select>
            <p className="ml-auto text-xs text-sand-500">{filtered.length} soal{search ? ` (dari ${drafts.length})` : ''}</p>
          </div>

          {!filtered.length ? (
            <p className="px-5 py-8 text-center text-sm text-sand-400">
              {search ? 'Tidak ada soal yang cocok.' : 'Belum ada butir — buat kosong di atas atau impor file (template Excel/Word ada di menu Impor).'}
            </p>
          ) : (
            <div className="space-y-3 p-4">
              {paged.map(({ d, i }) => (
                <div key={i} className="rounded-2xl border border-sand-200 bg-white p-4">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="grid size-8 place-items-center rounded-xl bg-primary-700 text-sm font-black text-white">{d.number}</span>
                    <Select
                      value={d.type}
                      onChange={(e) => {
                        const t = e.target.value as QDraft['type'];
                        updateD(i, {
                          type: t,
                          ...(t === 'MATCHING' && d.rights.length < 3 ? { rights: ['', '', ''] } : {}),
                          ...(t === 'TRUE_FALSE_COMPLEX' && !d.keyBools.length ? { keyBools: d.choices.map(() => true) } : {}),
                        });
                      }}
                      className="w-44"
                     searchable>
                      {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </Select>
                    <Select
                      value={d.passageCode}
                      onChange={(e) => updateD(i, { passageCode: e.target.value })}
                      className="w-36"
                      title="Bacaan untuk soal ini"
                     searchable>
                      <option value="">Tanpa bacaan</option>
                      {passages.map((p) => <option key={p.code} value={p.code}>{p.code}</option>)}
                    </Select>
                    <Field label="Bobot" className="!mb-0 flex items-center gap-1 text-xs">
                      <Input type="text" inputMode="decimal" value={d.weight} onChange={(e) => updateD(i, { weight: e.target.value })} className="w-16" title="Boleh desimal: 1,5 atau 2.25" />
                    </Field>
                    <button
                      type="button"
                      onClick={() => setPreviewIdx(i)}
                      className="ml-auto rounded-lg bg-sand-100 px-2.5 py-1 text-xs font-bold text-sand-500 transition hover:bg-sand-200"
                      title="Lihat soal seperti yang dilihat siswa"
                    >
                      👁 Siswa
                    </button>
                    <button
                      type="button"
                      onClick={() => setDrafts((qs) => renumber(qs.filter((_, k) => k !== i)))}
                      className="text-xs font-bold text-red-500 hover:text-red-700"
                    >
                      Hapus Soal
                    </button>
                  </div>
                  <Field label="Teks Pertanyaan" className="!mb-3" asDiv>
                    <MathField
                      value={d.prompt}
                      onChange={(v) => updateD(i, { prompt: v })}
                      pickImage={pickImage}
                      placeholder="Tulis pertanyaan… tombol ƒx untuk rumus (akar, pangkat, pecahan) dan 🖼 untuk gambar"
                    />
                  </Field>
                  {body(d, i)}
                </div>
              ))}
            </div>
          )}

          {pageCount > 1 ? (
            <div className="flex items-center justify-center gap-1 border-t border-sand-100 px-4 py-3">
              <button type="button" disabled={pageSafe === 0} onClick={() => setPage(pageSafe - 1)} className="rounded-lg px-3 py-1.5 text-xs font-bold text-sand-600 hover:bg-sand-100 disabled:opacity-40">‹</button>
              {Array.from({ length: pageCount }, (_, p) => (
                <button key={p} type="button" onClick={() => setPage(p)}
                  className={`size-8 rounded-lg text-xs font-bold transition ${p === pageSafe ? 'bg-primary-700 text-white' : 'text-sand-600 hover:bg-sand-100'}`}>
                  {p + 1}
                </button>
              ))}
              <button type="button" disabled={pageSafe >= pageCount - 1} onClick={() => setPage(pageSafe + 1)} className="rounded-lg px-3 py-1.5 text-xs font-bold text-sand-600 hover:bg-sand-100 disabled:opacity-40">›</button>
            </div>
          ) : null}
        </Widget>
      )}

      {examId && tab === 'bacaan' && (
        <Widget
          title="Kelola Bacaan"
          subtitle="Teks bacaan yang dirujuk soal (kolom BACAAN). Soal memilih bacaan lewat dropdown di kartu soal."
          action={
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => { setPassages((p) => [...p, { code: `B${p.length + 1}`, content: '', media: null }]); setPassagesDirty(true); }} disabled={busy}>+ Bacaan</Button>
              <Button size="sm" onClick={() => void savePassages()} disabled={busy || !passagesDirty}>{busy ? 'Menyimpan…' : 'Simpan Bacaan'}</Button>
            </div>
          }
        >
          {!passages.length ? (
            <p className="px-5 py-8 text-center text-sm text-sand-400">Belum ada bacaan — tambah di atas atau impor Word berisi tabel/barisan BACAAN.</p>
          ) : (
            <div className="space-y-3 p-4">
              {passages.map((p, i) => (
                <div key={i} className="rounded-2xl border border-sand-200 bg-white p-4">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Input value={p.code} onChange={(e) => updateP(i, { code: e.target.value.toUpperCase() })} className="w-20 font-black" placeholder="B1" />
                    <p className="text-xs text-sand-500">
                      {usedBy(p.code).length ? `Dipakai soal No.${usedBy(p.code).join(', ')}` : 'Belum dipakai soal mana pun'}
                    </p>
                    <button type="button" onClick={() => { setPassages((ps) => ps.filter((_, k) => k !== i)); setPassagesDirty(true); }} className="ml-auto text-xs font-bold text-red-500 hover:text-red-700">
                      Hapus Bacaan
                    </button>
                  </div>
                  <MathField
                    value={p.content}
                    onChange={(v) => updateP(i, { content: v })}
                    pickImage={pickImage}
                    placeholder="Teks bacaan — tombol ƒx untuk rumus, 🖼 untuk gambar…"
                  />
                </div>
              ))}
            </div>
          )}
        </Widget>
      )}
      </>
      ) : null}

      {/* ---------- Modal pratinjau tampilan siswa ---------- */}
      <Modal
        open={previewIdx !== null}
        onClose={() => setPreviewIdx(null)}
        title={`Tampilan Siswa — Soal No.${previewIdx !== null ? (drafts[previewIdx]?.number ?? '') : ''}`}
        description="Persis seperti di layar ujian siswa. Kunci ditandai hijau — hanya untuk guru, siswa tidak melihatnya."
        size="xl"
      >
        {(() => {
          const d = previewIdx !== null ? drafts[previewIdx] : undefined;
          return d ? (
            <QuestionPreview
              q={toApi(d) as PreviewQuestion}
              passageContent={d.passageCode ? (passages.find((p) => p.code === d.passageCode)?.content ?? null) : null}
            />
          ) : null;
        })()}
      </Modal>

      {/* ---------- Modal Import + Preview ---------- */}
      <Modal open={importModal} onClose={() => setImportModal(false)} title="Impor Soal dari File" size="xl">
        <div className="space-y-4">
          {modalErr ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{modalErr}</p> : null}
          {!preview ? (
            <div className="space-y-4">
              <div className="rounded-2xl border-2 border-dashed border-sand-200 p-8 text-center">
                <p className="text-sm font-bold text-sand-700">Pilih file Excel (.xlsx) atau Word (.docx)</p>
                <p className="mt-1 text-xs text-sand-500">Rumus Word & gambar ikut terbawa · BS multi-pernyataan otomatis jadi BSK · hasil ditinjau dulu sebelum disimpan</p>
                <Button size="sm" className="mt-4" onClick={() => fileRef.current?.click()} disabled={previewBusy}>
                  {previewBusy ? 'Membaca…' : 'Pilih File'}
                </Button>
              </div>
              <div className="rounded-2xl border border-sand-200 p-4">
                <p className="text-xs font-black uppercase tracking-wide text-sand-500">Buat template sesuai kebutuhan</p>
                <p className="mt-0.5 text-[11px] text-sand-400">Isi jumlah soal per tipe — template berisi baris kosong bernomor siap diisi. Tersedia format Excel &amp; Word.</p>
                <div className="mt-2.5 flex flex-wrap items-end gap-2">
                  {([['pg', 'Pilihan Ganda'], ['pgk', 'PG Kompleks'], ['bs', 'Benar/Salah'], ['bsk', 'B-S Kompleks']] as const).map(([k, label]) => (
                    <Field key={k} label={label} className="!mb-0">
                      <Input
                        type="number" min={0} max={200}
                        value={tplCount[k]}
                        onChange={(e) => setTplCount({ ...tplCount, [k]: Number(e.target.value) || 0 })}
                        className="w-20"
                      />
                    </Field>
                  ))}
                  <Button
                    size="sm" variant="outline"
                    disabled={!tplCount.pg && !tplCount.pgk && !tplCount.bs && !tplCount.bsk}
                    onClick={() => void downloadExamQuestionTemplate(examId!, tplCount).then(() => flash('Template diunduh.')).catch((e) => setModalErr(e instanceof ApiError ? e.message : 'Gagal unduh template.'))}
                  >
                    ⬇ Template Excel
                  </Button>
                  <Button
                    size="sm" variant="outline"
                    onClick={() => void downloadExamQuestionTemplateDocx(examId!).then(() => flash('Template Word diunduh.')).catch((e) => setModalErr(e instanceof ApiError ? e.message : 'Gagal unduh template.'))}
                  >
                    ⬇ Template Word
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm">
                <Badge tone="primary">{preview.questions.length} soal</Badge>
                <Badge tone="neutral">{preview.passages.length} bacaan</Badge>
                {[...new Set(preview.questions.map((q) => q.type))].map((t) => (
                  <Badge key={t} tone="accent">{TYPE_LABEL[t] ?? t}: {preview.questions.filter((q) => q.type === t).length}</Badge>
                ))}
                <button type="button" className="ml-auto text-xs font-bold text-primary-700 hover:underline" onClick={() => { setPreview(null); }}>← pilih file lain</button>
              </div>
              <p className="rounded-xl bg-amber-50 px-4 py-2.5 text-xs font-medium text-amber-800">
                Mengimpor akan <b>menggantikan {drafts.length} soal</b> yang ada saat ini{drafts.length ? ' (yang lama dihapus)' : ''}.
              </p>
              <div className="max-h-[28rem] space-y-3 overflow-y-auto pr-1">
                {preview.passages.map((p) => (
                  <div key={p.code} className="rounded-xl border border-sky-200 bg-sky-50 p-3">
                    <p className="text-xs font-black text-sky-800">Bacaan {p.code}</p>
                    <div className="rich-html mt-1 text-xs text-sand-600 [&_img]:max-h-24" dangerouslySetInnerHTML={{ __html: richHtml(p.content) }} />
                  </div>
                ))}
                {preview.questions.map((q) => (
                  <div key={q.number} className="rounded-xl border border-sand-200 p-3.5">
                    <div className="mb-2 flex items-center gap-2">
                      <Badge tone="neutral">{TYPE_LABEL[q.type] ?? q.type}</Badge>
                      <span className="text-[11px] text-sand-400">bobot {q.weight}{q.passageCode ? ` · bacaan ${q.passageCode}` : ''} · tampilan siswa</span>
                    </div>
                    <QuestionPreview
                      q={q as PreviewQuestion}
                      passageContent={q.passageCode ? (preview.passages.find((p) => p.code === q.passageCode)?.content ?? null) : null}
                    />
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setImportModal(false)}>Batal</Button>
                <Button onClick={() => void confirmImport()} disabled={busy}>{busy ? 'Mengimpor…' : `Impor ${preview.questions.length} Soal`}</Button>
              </div>
            </>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv,.docx"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void doPreview(f); }}
          />
        </div>
      </Modal>

      {/* ---------- Modal Edit Asesmen ---------- */}
      <Modal open={editAsm} onClose={() => setEditAsm(false)} title="Edit Asesmen">
        <form onSubmit={saveAsm} className="space-y-4">
          {modalErr ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{modalErr}</p> : null}
          <Field label="Nama Asesmen"><Input name="name" defaultValue={assessment?.name ?? ''} required /></Field>
          <Field label="Mata Pelajaran">
            <Select name="subjectId" defaultValue="" searchable>
              <option value="">— tidak diubah —</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
            <p className="mt-1 text-[11px] text-sand-400">Saat ini: {assessment?.subject?.name ?? '—'}</p>
          </Field>
          <Field label="Kelas (opsional)">
            <Select name="classId" defaultValue="" searchable>
              <option value="">Semua kelas</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setEditAsm(false)}>Batal</Button>
            <Button type="submit" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</Button>
          </div>
        </form>
      </Modal>

      <input
        ref={imgInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void onImgPicked(f); }}
      />
    </Shell>
  );
}
