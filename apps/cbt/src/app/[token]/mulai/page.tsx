'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@smpmuh3/ui';
import { ApiError } from '@/lib/api';
import {
  richHtml,
  getPaper,
  getSession,
  saveAnswer,
  submitExam,
  reportViolation,
  beaconAnswers,
  type CbtPaper,
  type CbtQuestion,
  type CbtSession,
} from '@/lib/cbt';
import { API } from '@/lib/api';
import {
  acquireWakeLock,
  exitFullscreen,
  isFullscreen,
  releaseWakeLock,
  requestFullscreen,
  type ScreenLock,
} from '@/lib/exam-guard';

const LETTERS = 'ABCDE';
const fmt = (sec: number) =>
  `${String(Math.floor(sec / 3600)).padStart(2, '0')}:${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;

/** Teks opsional-HTML (impor Word) — plain text dirender apa adanya, HTML lewat sanitize sisi server. */
function Rich({ text, className }: { text: string; className?: string }) {
  if (!/<[a-zA-Z]/.test(text) && !/\$[^$\n]+\$/.test(text)) {
    return <span className={className}>{text}</span>;
  }
  return (
    <span
      className={`rich-html block [&_img]:my-2 [&_img]:max-w-full [&_img]:rounded-lg [&_p]:my-1 [&_table]:my-2 [&_table]:w-full [&_td]:border [&_td]:border-sand-200 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-sand-200 [&_th]:bg-sand-50 [&_th]:px-2 [&_th]:py-1 ${className ?? ''}`}
      dangerouslySetInnerHTML={{ __html: richHtml(text) }}
    />
  );
}
/** Gambar lampiran soal/bacaan dari impor Word. */
function MediaImgs({ media }: { media?: { key: string; name: string }[] | null | undefined }) {
  if (!media?.length) return null;
  return (
    <div className="my-3 space-y-2">
      {media.map((m) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={m.key} src={`${API}/cbt/media/${m.key}`} alt={m.name} className="max-w-full rounded-xl border border-sand-200" />
      ))}
    </div>
  );
}

type Ans = Record<string, unknown>;
type QueueEntry = { value: unknown; busy: boolean; tries: number };
const CUR_KEY = (token: string) => `cbt-cur-${token}`;

export default function CbtRunnerPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [session, setSession] = useState<CbtSession | null>(null);
  const [paper, setPaper] = useState<CbtPaper | null>(null);
  const [answers, setAnswers] = useState<Ans>({});
  const [cur, setCur] = useState(0);
  const [left, setLeft] = useState(0);
  const [saving, setSaving] = useState<'idle' | 'saving' | 'ok' | 'err'>('idle');
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitted = useRef(false);
  // ---- Proteksi ujian ----
  const [violations, setViolations] = useState(0);
  const [warnInfo, setWarnInfo] = useState<{ violations: number; blockAfter: number; kind: string } | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false); // sesi sudah dibuka pengawas
  const [busyBlocked, setBusyBlocked] = useState(false);
  const [confirmForce, setConfirmForce] = useState(false);
  const [fsLost, setFsLost] = useState(false);
  const armed = useRef({ hidden: true, blur: true, fs: false, mw: true });
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const baseDim = useRef<{ w: number; h: number } | null>(null);
  const [matchOpen, setMatchOpen] = useState<{ qid: string; index: number } | null>(null);
  const wakeLock = useRef<ScreenLock>(null);
  // ---- Antrean autosave per-soal + jangkar waktu ----
  const queueRef = useRef(new Map<string, QueueEntry>());
  const answersRef = useRef<Ans>({});
  const pumpRef = useRef<(qid: string) => void>(() => {});
  const endAtRef = useRef(0); // epoch ms — timer dihitung ulang tiap pulsa

  const finish = useCallback(
    async (auto: boolean) => {
      if (submitted.current) return;
      submitted.current = true;
      void releaseWakeLock(wakeLock.current);
      wakeLock.current = null;
      void exitFullscreen();
      try { localStorage.removeItem(CUR_KEY(token)); } catch { /* abaikan */ }
      try {
        // Tiriskan antrean autosave ≤6 detik — lalu tetap kirim payload penuh
        // agar jawaban yang belum mendarat tetap dinilai server.
        const until = Date.now() + 6000;
        while (queueRef.current.size && Date.now() < until) {
          for (const qid of queueRef.current.keys()) pumpRef.current(qid);
          await new Promise((r) => setTimeout(r, 250));
        }
      } catch { /* abaikan */ }
      try {
        await submitExam(token, answersRef.current);
      } catch {
        /* sesi mungkin sudah dinilai server — lanjut ke hasil */
      }
      router.replace(`/${token}/hasil${auto ? '?auto=1' : ''}`);
    },
    [token, router],
  );

  /** Terapkan paket soal ke state — dipakai saat muat awal & lanjut setelah
   *  blokir dibuka. Antrean jawaban lokal yang belum terkirim menang atas
   *  jawaban server (keadaan terakhir di perangkat siswa). */
  const applyPaper = useCallback(
    (p: CbtPaper) => {
      const merged: Ans = { ...p.answers };
      for (const [qid, e] of queueRef.current) merged[qid] = e.value;
      answersRef.current = merged;
      setAnswers(merged);
      setPaper(p);
      setViolations(p.violations ?? 0);
      const rem = Math.max(0, Math.floor(p.remainingSec ?? 0));
      endAtRef.current = Date.now() + rem * 1000;
      setLeft(rem);
      // Lanjut dari posisi soal terakhir yang disimpan per-token.
      try {
        const saved = Number(localStorage.getItem(CUR_KEY(token)) ?? '0');
        setCur(
          Number.isFinite(saved)
            ? Math.min(Math.max(0, saved), Math.max(0, p.questions.length - 1))
            : 0,
        );
      } catch {
        setCur(0);
      }
    },
    [token],
  );

  /** Pompa satu butir antrean — serial per soal (nilai baru menunggu yang
   *  sedang terkirim), retry backoff untuk kegagalan sementara; kode fatal
   *  (409=dinilai, 403=diblokir) menghentikan pompa untuk butir itu. */
  const pump = useCallback(
    (qid: string) => {
      const e = queueRef.current.get(qid);
      if (!e || e.busy) return;
      e.busy = true;
      const v = e.value;
      setSaving('saving');
      saveAnswer(token, qid, v)
        .then(() => {
          e.busy = false;
          if (e.value !== v) {
            pumpRef.current(qid);
            return;
          }
          queueRef.current.delete(qid);
          if (!queueRef.current.size) setSaving('ok');
        })
        .catch((err: unknown) => {
          e.busy = false;
          if (err instanceof ApiError && err.status === 409) {
            queueRef.current.delete(qid);
            void finish(true);
            return;
          }
          if (err instanceof ApiError && err.status === 403 && /diblokir/i.test(err.message)) {
            setBlocked(true); // tetap di antrean — dipompa lagi setelah dibuka
            return;
          }
          e.tries += 1;
          setSaving('err');
          if (e.tries < 6) {
            setTimeout(() => pumpRef.current(qid), Math.min(1500 * e.tries, 8000));
          }
        });
    },
    [token, finish],
  );
  useEffect(() => {
    pumpRef.current = pump;
  });

  // Muat awal — sesi & soal diambil terpisah agar layar blokir tetap mendapat
  // identitas siswa walau paper menolak (403 diblokir).
  useEffect(() => {
    let dead = false;
    getSession(token)
      .then((s) => {
        if (dead) return;
        if (s.attempt.status === 'SUBMITTED') {
          router.replace(`/${token}/hasil`);
          return;
        }
        setSession(s);
      })
      .catch(() => { /* identitas sekunder — layar blokir tetap berjalan */ });
    getPaper(token)
      .then((p) => { if (!dead) applyPaper(p); })
      .catch((e) => {
        if (dead) return;
        if (e instanceof ApiError && e.status === 409) {
          router.replace(`/${token}/hasil?auto=1`);
          return;
        }
        if (e instanceof ApiError && e.status === 403 && /diblokir/i.test(e.message)) {
          setBlocked(true);
          return;
        }
        setError(e instanceof ApiError ? e.message : 'Gagal memuat soal.');
      });
    return () => { dead = true; };
  }, [token, router, applyPaper]);

  // Timer — dihitung dari jangkar epoch deadline: koreksi otomatis setelah
  // tab di-throttle/perangkat tidur (interval dihentikan sistem).
  useEffect(() => {
    if (!paper) return;
    const t = setInterval(() => {
      const rem = Math.max(0, Math.ceil((endAtRef.current - Date.now()) / 1000));
      setLeft(rem);
      if (rem <= 0) {
        clearInterval(t);
        void finish(true);
      }
    }, 500);
    return () => clearInterval(t);
  }, [paper, finish]);

  // Ingat posisi soal — dilanjutkan setelah reload/blokir-dibuka.
  useEffect(() => {
    try { localStorage.setItem(CUR_KEY(token), String(cur)); } catch { /* abaikan */ }
  }, [cur, token]);

  // Halaman hasil restore bfcache menampilkan state basi — paksa muat ulang.
  useEffect(() => {
    const h = (e: PageTransitionEvent) => { if (e.persisted) window.location.reload(); };
    window.addEventListener('pageshow', h);
    return () => window.removeEventListener('pageshow', h);
  }, []);

  // Flush jawaban ke server saat halaman ditutup (sendBeacon bertahan saat unload).
  useEffect(() => {
    const h = () => {
      if (submitted.current || !queueRef.current.size) return;
      beaconAnswers(token, answersRef.current);
    };
    window.addEventListener('pagehide', h);
    return () => window.removeEventListener('pagehide', h);
  }, [token]);

  // Penyapu antrean — coba ulang butir yang gagal disimpan tiap 20 detik.
  useEffect(() => {
    if (!paper || blocked) return;
    const t = setInterval(() => {
      for (const qid of queueRef.current.keys()) pumpRef.current(qid);
    }, 20_000);
    return () => clearInterval(t);
  }, [paper, blocked]);

  // Cegah tutup/reload tak sengaja.
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (!submitted.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, []);

  // ---- Deteksi pelanggaran proteksi: keluar tab/aplikasi/layar penuh ----
  // Satu laporan per kejadian (re-arm saat kembali fokus) — server menentukan
  // ambang warn/blokir per ujian; pelanggaran kecil pertama tidak ditampilkan.
  useEffect(() => {
    if (!paper || blocked) return;
    const report = (kind: 'tab-hidden' | 'blur' | 'fullscreen-exit' | 'multi-window', arm: 'hidden' | 'blur' | 'fs' | 'mw') => {
      if (!armed.current[arm] || submitted.current) return;
      armed.current[arm] = false;
      reportViolation(token, kind)
        .then((r) => {
          setViolations(r.violations);
          if (r.level === 'blocked') setBlocked(true);
          else if (r.level === 'warn') setWarnInfo({ violations: r.violations, blockAfter: r.blockAfter ?? 0, kind });
          else if (r.level === 'expired') void finish(true);
        })
        .catch((e) => {
          if (e instanceof ApiError && e.status === 403 && /diblokir/i.test(e.message)) setBlocked(true);
        });
    };
    const onVis = () => {
      if (document.visibilityState === 'hidden') report('tab-hidden', 'hidden');
      else armed.current.hidden = true;
    };
    const onBlur = () => {
      if (blurTimer.current) clearTimeout(blurTimer.current);
      blurTimer.current = setTimeout(() => report('blur', 'blur'), 1200);
    };
    const onFocus = () => {
      if (blurTimer.current) { clearTimeout(blurTimer.current); blurTimer.current = null; }
      armed.current.blur = true;
    };
    // Split-screen mengecilkan viewport drastis — terdeteksi walau fokus tak
    // berpindah. Baseline direset saat rotasi/perluasan agar tak salah tembak.
    if (!baseDim.current) baseDim.current = { w: window.innerWidth, h: window.innerHeight };
    const onResize = () => {
      const w = window.innerWidth, h = window.innerHeight;
      const b = baseDim.current!;
      if (w > b.w * 1.1) {
        baseDim.current = { w, h };
        armed.current.mw = true;
        return;
      }
      if (w < b.w * 0.82 || h < b.h * 0.6) report('multi-window', 'mw');
      else armed.current.mw = true;
    };
    const onFs = () => {
      // Keluar layar penuh = upaya membuka aplikasi lain di desktop.
      if (isFullscreen()) {
        armed.current.fs = true;
        setFsLost(false);
      } else if (armed.current.fs && !submitted.current) {
        setFsLost(true);
        report('fullscreen-exit', 'fs');
      }
    };
    document.addEventListener('visibilitychange', onVis);
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('webkitfullscreenchange', onFs);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    window.addEventListener('resize', onResize);
    // Catat status awal layar penuh (bila aktif sejak halaman persiapan).
    armed.current.fs = isFullscreen();
    setFsLost(false);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      document.removeEventListener('fullscreenchange', onFs);
      document.removeEventListener('webkitfullscreenchange', onFs);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('resize', onResize);
      if (blurTimer.current) { clearTimeout(blurTimer.current); blurTimer.current = null; }
    };
  }, [paper, blocked, token, finish]);

  // ---- Penahan layar menyala (Wake Lock) — re-akuisisi saat kembali visible ----
  useEffect(() => {
    if (!paper || blocked) return;
    let cancelled = false;
    const acquire = () => {
      void acquireWakeLock().then((l) => {
        if (cancelled) void releaseWakeLock(l);
        else wakeLock.current = l;
      });
    };
    acquire();
    const onVis = () => {
      if (document.visibilityState === 'visible' && !submitted.current) acquire();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      void releaseWakeLock(wakeLock.current);
      wakeLock.current = null;
    };
  }, [paper, blocked]);

  // Lepas layar penuh saat keluar halaman tanpa lewat `finish` (mis. redirect hasil).
  useEffect(() => () => void exitFullscreen(), []);

  // ---- Anti-salin & menu konteks di area ujian + cegah pull-to-refresh ----
  useEffect(() => {
    if (!paper) return;
    const prevent = (e: Event) => e.preventDefault();
    const prevOverscroll = document.documentElement.style.overscrollBehavior;
    document.documentElement.style.overscrollBehavior = 'contain';
    for (const ev of ['copy', 'cut', 'contextmenu', 'selectstart'] as const) {
      document.addEventListener(ev, prevent);
    }
    return () => {
      document.documentElement.style.overscrollBehavior = prevOverscroll;
      for (const ev of ['copy', 'cut', 'contextmenu', 'selectstart'] as const) {
        document.removeEventListener(ev, prevent);
      }
    };
  }, [paper]);

  // ---- Layar diblokir: pantau status sesi — tombol lanjut menyala otomatis
  // begitu pengawas membuka blokir, dan hilang bila ujian sudah dinilai. ----
  useEffect(() => {
    if (!blocked) {
      setBlockOpen(false);
      return;
    }
    let dead = false;
    const check = () => {
      getSession(token)
        .then((s) => {
          if (dead) return;
          if (s.attempt.status === 'SUBMITTED') router.replace(`/${token}/hasil`);
          else if (s.attempt.status === 'STARTED') {
            setSession(s);
            setBlockOpen(true);
          } else setBlockOpen(false);
        })
        .catch(() => { /* jaringan — coba lagi siklus berikut */ });
    };
    check();
    const t = setInterval(check, 8000);
    return () => {
      dead = true;
      clearInterval(t);
    };
  }, [blocked, token, router]);

  /** Lanjut mengerjakan setelah pengawas membuka blokir — muat ulang soal &
   *  jawaban tersimpan, kembali ke posisi soal terakhir + layar penuh. */
  const resume = useCallback(async () => {
    setBusyBlocked(true);
    try {
      const s = await getSession(token);
      if (s.attempt.status === 'SUBMITTED') {
        router.replace(`/${token}/hasil`);
        return;
      }
      if (s.attempt.status !== 'STARTED') {
        setBlockOpen(false);
        return;
      }
      const p = await getPaper(token);
      // Gesture pengguna — penuhi syarat requestFullscreen sebelum lanjut.
      await requestFullscreen();
      setSession(s);
      applyPaper(p);
      setWarnInfo(null);
      setFsLost(false);
      armed.current = { hidden: true, blur: true, fs: isFullscreen(), mw: true };
      setBlocked(false);
      setBlockOpen(false);
      // Pompa jawaban lokal yang tertahan selama diblokir.
      for (const qid of queueRef.current.keys()) pumpRef.current(qid);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) router.replace(`/${token}/hasil?auto=1`);
      else if (e instanceof ApiError && e.status === 403 && /diblokir/i.test(e.message)) setBlockOpen(false);
      else setError(e instanceof ApiError ? e.message : 'Gagal melanjutkan sesi.');
    } finally {
      setBusyBlocked(false);
    }
  }, [token, router, applyPaper]);

  /** Kumpulkan jawaban apa adanya dari layar blokir — server menilai semua
   *  yang sudah terisi (payload penuh ikut dikirim). */
  const forceSubmit = useCallback(async () => {
    if (submitted.current) return;
    submitted.current = true;
    setBusyBlocked(true);
    void releaseWakeLock(wakeLock.current);
    wakeLock.current = null;
    void exitFullscreen();
    try { localStorage.removeItem(CUR_KEY(token)); } catch { /* abaikan */ }
    try {
      await submitExam(token, answersRef.current);
    } catch {
      /* sesi mungkin sudah dinilai — tetap ke hasil */
    }
    router.replace(`/${token}/hasil`);
  }, [token, router]);

  const pick = (q: CbtQuestion, value: unknown) => {
    if (submitted.current || blocked) return;
    // Dedupe — ketukan ganda pada pilihan sama tak perlu disimpan ulang.
    try {
      if (JSON.stringify(answersRef.current[q.id]) === JSON.stringify(value)) return;
    } catch { /* abaikan */ }
    answersRef.current = { ...answersRef.current, [q.id]: value };
    setAnswers(answersRef.current);
    const e = queueRef.current.get(q.id) ?? { value, busy: false, tries: 0 };
    e.value = value;
    e.tries = 0; // aksi baru — segarkan backoff
    queueRef.current.set(q.id, e);
    pump(q.id);
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
              <span className="pt-1"><Rich text={c} /></span>
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
                <span className="pt-1"><Rich text={c} /></span>
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
    if (q.type === 'TRUE_FALSE_COMPLEX') {
      const statements = opts.statements ?? [];
      const sel = Array.isArray(answers[q.id]) ? (answers[q.id] as boolean[]) : [];
      return (
        <div className="space-y-2.5">
          <p className="text-xs font-bold text-sand-500">Tentukan BENAR/SALAH untuk tiap pernyataan:</p>
          {statements.map((st, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-2xl border border-sand-200 bg-white p-3.5 sm:flex-row sm:items-center">
              <span className="flex-1 text-sm font-medium">
                <span className="mr-1.5 inline-grid size-6 place-items-center rounded-lg bg-sand-100 text-[11px] font-black text-sand-500">{i + 1}</span>
                <Rich text={st} />
              </span>
              <div className="flex shrink-0 gap-2">
                {([['B', true], ['S', false]] as const).map(([lbl, v]) => (
                  <button
                    key={lbl}
                    type="button"
                    onClick={() => {
                      const next = statements.map((_, k) => (k === i ? v : (sel[k] ?? null)));
                      pick(q, next);
                    }}
                    className={`w-12 rounded-xl border-2 py-2.5 text-sm font-black transition ${
                      sel[i] === v ? 'border-primary-600 bg-primary-600 text-white' : 'border-sand-200 bg-white text-sand-600 hover:border-sand-300'
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
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
            <button
              type="button"
              onClick={() => setMatchOpen({ qid: q.id, index: i })}
              className={`flex items-center justify-between gap-2 rounded-xl border-2 px-3 py-2 text-left text-sm font-medium outline-none sm:min-w-52 ${sel[i] !== undefined && sel[i] >= 0 ? 'border-primary-500 bg-primary-50' : 'border-sand-200'}`}
            >
              <span className="flex-1">{sel[i] !== undefined && sel[i] >= 0 ? rights[sel[i]] : '— pilih pasangan —'}</span>
              <span aria-hidden className="text-sand-400">▾</span>
            </button>
          </div>
        ))}
      </div>
    );
  };

  if (blocked) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-sand-50 px-4">
        <div className="w-full max-w-sm rounded-3xl bg-white p-8 text-center shadow-card">
          <span className="mx-auto mb-4 grid size-16 place-items-center rounded-full bg-red-100 text-3xl">⛔</span>
          <h1 className="text-lg font-black text-sand-900">Sesi Diblokir</h1>
          <p className="mt-2 text-sm leading-relaxed text-sand-600">
            Kamu keluar dari halaman ujian terlalu sering. Semua jawaban yang sudah diisi
            <b> tersimpan aman</b> — panggil <b>pengawas</b> untuk membuka sesimu kembali.
          </p>
          {session ? (
            <p className="mt-3 rounded-xl bg-sand-50 px-3 py-2 text-xs text-sand-500">
              {session.student.name} · {session.exam.title}
            </p>
          ) : null}
          {blockOpen ? (
            <Button className="mt-4 w-full" disabled={busyBlocked} onClick={() => void resume()}>
              {busyBlocked ? 'Memeriksa…' : '▶ Sesi dibuka — Lanjut Mengerjakan'}
            </Button>
          ) : (
            <Button variant="outline" className="mt-4 w-full" disabled={busyBlocked} onClick={() => void resume()}>
              {busyBlocked ? 'Memeriksa…' : '↻ Cek status sesi'}
            </Button>
          )}
          <Button variant="outline" className="mt-2 w-full text-red-600" onClick={() => setConfirmForce(true)}>
            Kumpulkan jawaban apa adanya
          </Button>
          <p className="mt-3 text-[11px] leading-snug text-sand-400">
            Status dicek otomatis tiap beberapa detik — tombol lanjut menyala saat pengawas membuka sesimu.
          </p>
        </div>
        {/* Konfirmasi kumpulkan paksa dari layar blokir */}
        {confirmForce ? (
          <div className="fixed inset-0 z-20 grid place-items-center bg-sand-950/50 p-4">
            <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-card">
              <h2 className="text-lg font-black text-sand-900">Kumpulkan sekarang?</h2>
              <p className="mt-2 text-sm leading-relaxed text-sand-600">
                Jawaban yang sudah kamu isi akan dinilai apa adanya dan tidak bisa diubah lagi.
              </p>
              <div className="mt-5 flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setConfirmForce(false)}>Batal</Button>
                <Button className="flex-1" disabled={busyBlocked} onClick={() => void forceSubmit()}>
                  {busyBlocked ? 'Menilai…' : 'Ya, Kumpulkan'}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    );
  }
  if (error) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-sand-50 px-4">
        <div className="max-w-sm rounded-3xl bg-white p-8 text-center shadow-card">
          <p className="mb-4 text-sm text-red-600">{error}</p>
          <Button variant="outline" onClick={() => router.push('/')}>← Kembali</Button>
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
          {violations > 0 ? (
            <span title="Pelanggaran tercatat" className="rounded-xl bg-amber-100 px-2.5 py-1.5 text-xs font-black text-amber-700">
              ⚠ {violations}
            </span>
          ) : null}
          <Button size="sm" onClick={() => setConfirmSubmit(true)}>Kumpulkan</Button>
        </div>
      </header>

      {/* Banner layar penuh hilang — ketuk untuk kembali (gesture syarat API). */}
      {fsLost ? (
        <button
          type="button"
          onClick={() => {
            void requestFullscreen().then((ok) => {
              if (ok) {
                setFsLost(false);
                armed.current.fs = true;
              }
            });
          }}
          className="sticky top-[57px] z-10 w-full bg-amber-100 px-4 py-2 text-center text-xs font-bold text-amber-800 transition hover:bg-amber-200"
        >
          ⚠ Layar penuh keluar — ketuk di sini untuk kembali (pelanggaran tercatat)
        </button>
      ) : null}

      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-4 lg:flex-row">
        {/* ---------- Soal ---------- */}
        <section className="flex-1 rounded-3xl border border-sand-200 bg-white p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-xs font-black uppercase tracking-wide text-sand-400">
              Soal {cur + 1} dari {total} · bobot {q.weight}
            </p>
            <p className={`text-[11px] ${saving === 'err' ? 'font-bold text-amber-600' : 'text-sand-400'}`}>
              {saving === 'saving' ? 'menyimpan…' : saving === 'err' ? '⚠ menyimpan ulang…' : saving === 'ok' ? '✓ tersimpan' : ''}
            </p>
          </div>
          {q.passageCode ? (() => {
            const pg = paper.passages?.find((x) => x.code === q.passageCode);
            return pg ? (
              <div className="mb-5 rounded-2xl border-l-4 border-primary-400 bg-primary-50/50 p-4">
                <p className="mb-1 text-[10px] font-black uppercase tracking-wider text-primary-600">Bacaan {pg.code}</p>
                <Rich text={pg.content} className="text-sm leading-relaxed text-sand-800" />
                <MediaImgs media={pg.media} />
              </div>
            ) : null;
          })() : null}
          <Rich text={q.prompt ?? ''} className="mb-5 whitespace-pre-line text-[15px] font-medium leading-relaxed text-sand-900" />
          <MediaImgs media={q.media} />
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

      {/* ---------- Pilih pasangan menjodohkan — dropdown custom, tanpa
          <select> native (pickernya mencuri fokus jendela & menyulitkan
          deteksi overlay asisten/panel samping di HP) ---------- */}
      {matchOpen ? (() => {
        const mq = paper.questions.find((x) => x.id === matchOpen.qid);
        if (!mq) return null;
        const mopts = (mq.options ?? {}) as { pairs?: { left: string; right: string }[]; rights?: string[] };
        const mpairs = mopts.pairs ?? [];
        const mrights = mopts.rights?.length ? mopts.rights : [...new Set(mpairs.map((x) => x.right))];
        const msel = Array.isArray(answers[mq.id]) ? (answers[mq.id] as number[]) : [];
        const pair = mpairs[matchOpen.index];
        if (!pair) return null;
        return (
          <div className="fixed inset-0 z-30 flex items-end justify-center bg-sand-950/50 sm:items-center sm:p-4" onClick={() => setMatchOpen(null)}>
            <div className="w-full max-w-sm rounded-t-3xl bg-white p-5 shadow-card sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
              <p className="text-xs font-black uppercase tracking-wide text-sand-400">Pasangan untuk</p>
              <p className="mt-1 text-sm font-bold text-sand-900">{pair.left}</p>
              <div className="mt-4 max-h-[50vh] space-y-2 overflow-y-auto">
                {mrights.map((r, k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      const next = mpairs.map((_, kk) => (kk === matchOpen.index ? k : (msel[kk] ?? -1)));
                      pick(mq, next);
                      setMatchOpen(null);
                    }}
                    className={`w-full rounded-xl border-2 px-3 py-2.5 text-left text-sm font-medium transition ${
                      msel[matchOpen.index] === k
                        ? 'border-primary-500 bg-primary-50 text-primary-900'
                        : 'border-sand-200 hover:border-primary-300'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <Button variant="outline" className="mt-4 w-full" onClick={() => setMatchOpen(null)}>Batal</Button>
            </div>
          </div>
        );
      })() : null}

      {/* ---------- Peringatan pelanggaran ---------- */}
      {warnInfo ? (
        <div className="fixed inset-0 z-30 grid place-items-center bg-sand-950/60 p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-card">
            <span className="mx-auto mb-3 grid size-14 place-items-center rounded-full bg-amber-100 text-3xl">⚠️</span>
            <h2 className="text-lg font-black text-sand-900">Peringatan Proteksi</h2>
            <p className="mt-2 text-sm leading-relaxed text-sand-600">
              {warnInfo.kind === 'multi-window' ? (
                <>Kamu terdeteksi <b>membuka aplikasi lain di samping layar ujian</b> (split-screen/layar terbagi) — ini pelanggaran ke-{warnInfo.violations}.</>
              ) : warnInfo.kind === 'blur' ? (
                <>Kamu terdeteksi <b>membuka aplikasi/layanan lain di atas halaman ujian</b> (asisten AI, jendela mengambang, atau panel samping) — ini pelanggaran ke-{warnInfo.violations}.</>
              ) : warnInfo.kind === 'fullscreen-exit' ? (
                <>Kamu terdeteksi <b>keluar dari mode layar penuh</b> — ini pelanggaran ke-{warnInfo.violations}.</>
              ) : (
                <>Kamu terdeteksi <b>keluar dari halaman ujian</b> (berpindah aplikasi/tab) — ini pelanggaran ke-{warnInfo.violations}.</>
              )}
              {warnInfo.blockAfter > 0
                ? ` Jika mencapai ${warnInfo.blockAfter}×, sesimu diblokir dan hanya bisa dibuka pengawas.`
                : ''}
            </p>
            <p className="mt-2 text-xs text-sand-500">Tetap di halaman ini sampai ujian selesai.</p>
            <Button className="mt-5 w-full" onClick={() => setWarnInfo(null)}>Saya Mengerti</Button>
          </div>
        </div>
      ) : null}

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
