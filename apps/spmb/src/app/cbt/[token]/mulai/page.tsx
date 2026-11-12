'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@smpmuh3/ui';
import { ApiError } from '@/lib/api';
import {
  getPaper,
  getSession,
  saveAnswer,
  submitExam,
  type CbtPaper,
  type CbtQuestion,
  type CbtSession,
} from '@/lib/cbt';

const LETTERS = 'ABCDE';
const fmt = (sec: number) =>
  `${String(Math.floor(sec / 3600)).padStart(2, '0')}:${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;

type Ans = Record<string, unknown>;

export default function CbtRunnerPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [session, setSession] = useState<CbtSession | null>(null);
  const [paper, setPaper] = useState<CbtPaper | null>(null);
  const [answers, setAnswers] = useState<Ans>({});
  const [cur, setCur] = useState(0);
  const [left, setLeft] = useState(0);
  const [saving, setSaving] = useState<'idle' | 'saving' | 'ok'>('idle');
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitted = useRef(false);

  const finish = useCallback(
    async (auto: boolean) => {
      if (submitted.current) return;
      submitted.current = true;
      try {
        await submitExam(token);
      } catch {
        /* sesi mungkin sudah dinilai server — lanjut ke hasil */
      }
      router.replace(`/cbt/${token}/hasil${auto ? '?auto=1' : ''}`);
    },
    [token, router],
  );

  useEffect(() => {
    Promise.all([getSession(token), getPaper(token)])
      .then(([s, p]) => {
        if (s.attempt.status === 'SUBMITTED') {
          router.replace(`/cbt/${token}/hasil`);
          return;
        }
        setSession(s);
        setPaper(p);
        setAnswers(p.answers);
        // Sinkronkan dengan jam server — hindari jam klien yang salah.
        setLeft(Math.max(0, Math.floor((new Date(p.deadline).getTime() - new Date(p.serverNow).getTime()) / 1000)));
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 409) {
          router.replace(`/cbt/${token}/hasil?auto=1`);
          return;
        }
        setError(e instanceof ApiError ? e.message : 'Gagal memuat soal.');
      });
  }, [token, router]);

  // Timer — deadline server adalah sumber kebenaran.
  useEffect(() => {
    if (!paper) return;
    const t = setInterval(() => {
      setLeft((v) => {
        if (v <= 1) {
          clearInterval(t);
          void finish(true);
          return 0;
        }
        return v - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [paper, finish]);

  // Cegah tutup/reload tak sengaja.
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (!submitted.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, []);

  const pick = (q: CbtQuestion, value: unknown) => {
    setAnswers((a) => ({ ...a, [q.id]: value }));
    setSaving('saving');
    saveAnswer(token, q.id, value)
      .then(() => setSaving('ok'))
      .catch((e) => {
        setSaving('idle');
        if (e instanceof ApiError && e.status === 409) void finish(true);
        else setError(e instanceof ApiError ? e.message : 'Jawaban gagal tersimpan.');
      });
  };

  const answered = (q: CbtQuestion) => {
    const a = answers[q.id];
    if (a === undefined || a === null) return false;
    if (Array.isArray(a)) return a.length > 0 && a.some((x) => x !== -1 && x !== null);
    return true;
  };

  const q = paper?.questions[cur];
  const total = paper?.questions.length ?? 0;
  const doneCount = paper ? paper.questions.filter(answered).length : 0;

  /** Isi jawaban sesuai tipe soal. */
  const body = (q: CbtQuestion) => {
    const opts = q.options ?? {};
    if (q.type === 'MCQ') {
      const choices = opts.choices ?? [];
      const sel = typeof answers[q.id] === 'number' ? (answers[q.id] as number) : -1;
      return (
        <div className="space-y-2.5">
          {choices.map((c, i) => (
            <button
              key={i}
              type="button"
              onClick={() => pick(q, i)}
              className={`flex w-full items-start gap-3 rounded-2xl border-2 px-4 py-3.5 text-left text-sm transition ${
                sel === i ? 'border-primary-600 bg-primary-50' : 'border-sand-200 bg-white hover:border-sand-300'
              }`}
            >
              <span className={`grid size-7 shrink-0 place-items-center rounded-lg text-xs font-black ${sel === i ? 'bg-primary-600 text-white' : 'bg-sand-100 text-sand-500'}`}>
                {LETTERS[i]}
              </span>
              <span className="pt-1">{c}</span>
            </button>
          ))}
        </div>
      );
    }
    if (q.type === 'MCQ_COMPLEX') {
      const choices = opts.choices ?? [];
      const sel = new Set(Array.isArray(answers[q.id]) ? (answers[q.id] as number[]) : []);
      return (
        <div className="space-y-2.5">
          <p className="text-xs font-bold text-sand-500">Pilih SEMUA jawaban yang benar:</p>
          {choices.map((c, i) => {
            const on = sel.has(i);
            return (
              <button
                key={i}
                type="button"
                onClick={() => {
                  const next = new Set(sel);
                  if (on) next.delete(i); else next.add(i);
                  pick(q, [...next].sort((a, b) => a - b));
                }}
                className={`flex w-full items-start gap-3 rounded-2xl border-2 px-4 py-3.5 text-left text-sm transition ${
                  on ? 'border-primary-600 bg-primary-50' : 'border-sand-200 bg-white hover:border-sand-300'
                }`}
              >
                <span className={`grid size-7 shrink-0 place-items-center rounded-lg text-xs font-black ${on ? 'bg-primary-600 text-white' : 'bg-sand-100 text-sand-500'}`}>
                  {on ? '✓' : LETTERS[i]}
                </span>
                <span className="pt-1">{c}</span>
              </button>
            );
          })}
        </div>
      );
    }
    if (q.type === 'TRUE_FALSE') {
      const sel = typeof answers[q.id] === 'boolean' ? (answers[q.id] as boolean) : null;
      return (
        <div className="grid grid-cols-2 gap-3">
          {([['BENAR', true], ['SALAH', false]] as const).map(([lbl, v]) => (
            <button
              key={lbl}
              type="button"
              onClick={() => pick(q, v)}
              className={`rounded-2xl border-2 py-5 text-center text-sm font-black transition ${
                sel === v ? 'border-primary-600 bg-primary-600 text-white' : 'border-sand-200 bg-white text-sand-600 hover:border-sand-300'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>
      );
    }
    // MATCHING — tiap item kiri pilih pasangan kanan.
    const pairs = opts.pairs ?? [];
    const rights = opts.rights?.length ? opts.rights : [...new Set(pairs.map((p) => p.right))];
    const sel = Array.isArray(answers[q.id]) ? (answers[q.id] as number[]) : [];
    return (
      <div className="space-y-2.5">
        <p className="text-xs font-bold text-sand-500">Pilih pasangan untuk tiap pernyataan:</p>
        {pairs.map((p, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-2xl border border-sand-200 bg-white p-3.5 sm:flex-row sm:items-center">
            <span className="flex-1 text-sm font-medium">
              <span className="mr-1.5 inline-grid size-6 place-items-center rounded-lg bg-sand-100 text-[11px] font-black text-sand-500">{i + 1}</span>
              {p.left}
            </span>
            <select
              value={sel[i] ?? ''}
              onChange={(e) => {
                const next = pairs.map((_, k) => (k === i ? Number(e.target.value) : (sel[k] ?? -1)));
                pick(q, next);
              }}
              className={`rounded-xl border-2 px-3 py-2 text-sm font-medium outline-none ${sel[i] !== undefined && sel[i] >= 0 ? 'border-primary-500 bg-primary-50' : 'border-sand-200'}`}
            >
              <option value="">— pilih pasangan —</option>
              {rights.map((r, k) => <option key={k} value={k}>{r}</option>)}
            </select>
          </div>
        ))}
      </div>
    );
  };

  if (error) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-sand-50 px-4">
        <div className="max-w-sm rounded-3xl bg-white p-8 text-center shadow-card">
          <p className="mb-4 text-sm text-red-600">{error}</p>
          <Button variant="outline" onClick={() => router.push('/cbt')}>← Kembali</Button>
        </div>
      </main>
    );
  }
  if (!paper || !q || !session) {
    return <main className="flex min-h-dvh items-center justify-center bg-sand-50 text-sm text-sand-500">Memuat soal…</main>;
  }

  return (
    <main className="flex min-h-dvh flex-col bg-sand-50">
      {/* ---------- Top bar ---------- */}
      <header className="sticky top-0 z-10 border-b border-sand-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black text-sand-900">{session.exam.title}</p>
            <p className="truncate text-[11px] text-sand-500">{session.student.name} · {session.exam.subject}</p>
          </div>
          <p className={`rounded-xl px-3 py-1.5 font-mono text-base font-black ${left < 300 ? 'animate-pulse bg-red-50 text-red-600' : 'bg-sand-100 text-sand-800'}`}>
            ⏱ {fmt(left)}
          </p>
          <Button size="sm" onClick={() => setConfirmSubmit(true)}>Kumpulkan</Button>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-4 lg:flex-row">
        {/* ---------- Soal ---------- */}
        <section className="flex-1 rounded-3xl border border-sand-200 bg-white p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-xs font-black uppercase tracking-wide text-sand-400">
              Soal {cur + 1} dari {total} · bobot {q.weight}
            </p>
            <p className="text-[11px] text-sand-400">
              {saving === 'saving' ? 'menyimpan…' : saving === 'ok' ? '✓ tersimpan' : ''}
            </p>
          </div>
          <p className="mb-5 whitespace-pre-line text-[15px] font-medium leading-relaxed text-sand-900">{q.prompt}</p>
          {body(q)}
          <div className="mt-6 flex justify-between">
            <Button variant="outline" disabled={cur === 0} onClick={() => setCur((c) => c - 1)}>← Sebelumnya</Button>
            {cur < total - 1 ? (
              <Button variant="outline" onClick={() => setCur((c) => c + 1)}>Berikutnya →</Button>
            ) : (
              <Button onClick={() => setConfirmSubmit(true)}>Kumpulkan ✓</Button>
            )}
          </div>
        </section>

        {/* ---------- Navigasi nomor ---------- */}
        <aside className="w-full shrink-0 lg:w-64">
          <div className="rounded-3xl border border-sand-200 bg-white p-4">
            <p className="mb-3 text-xs font-black uppercase tracking-wide text-sand-400">
              Navigasi — {doneCount}/{total} terjawab
            </p>
            <div className="grid grid-cols-6 gap-1.5 lg:grid-cols-5">
              {paper.questions.map((qq, i) => (
                <button
                  key={qq.id}
                  type="button"
                  onClick={() => setCur(i)}
                  className={`grid aspect-square place-items-center rounded-lg text-xs font-black transition ${
                    i === cur
                      ? 'bg-primary-700 text-white'
                      : answered(qq)
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-sand-100 text-sand-400 hover:bg-sand-200'
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-3 text-[10px] text-sand-400">
              <span><span className="mr-1 inline-block size-2.5 rounded bg-emerald-100 align-middle" /> terjawab</span>
              <span><span className="mr-1 inline-block size-2.5 rounded bg-sand-100 align-middle" /> kosong</span>
            </div>
          </div>
        </aside>
      </div>

      {/* ---------- Konfirmasi kumpul ---------- */}
      {confirmSubmit ? (
        <div className="fixed inset-0 z-20 grid place-items-center bg-sand-950/50 p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-card">
            <h2 className="text-lg font-black text-sand-900">Kumpulkan jawaban?</h2>
            <p className="mt-2 text-sm text-sand-600">
              Terjawab {doneCount} dari {total} soal.
              {doneCount < total ? ` ${total - doneCount} soal masih kosong.` : ''} Jawaban yang dikumpulkan dinilai otomatis dan tidak bisa diubah.
            </p>
            <div className="mt-5 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setConfirmSubmit(false)}>Periksa Lagi</Button>
              <Button
                className="flex-1"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await finish(false);
                }}
              >
                {busy ? 'Menilai…' : 'Ya, Kumpulkan'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
