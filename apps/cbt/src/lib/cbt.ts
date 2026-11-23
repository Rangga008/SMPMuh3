'use client';

import katex from 'katex';
import { API, ApiError } from './api';

/** Endpoint CBT bersifat publik — kredensialnya NIS + kode + token sesi. */
async function pub<T>(path: string, opts: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { ...(opts.headers as Record<string, string>) };
  if (opts.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.json);
  }
  const res = await fetch(`${API}/cbt${path}`, { ...opts, headers });
  const body = (await res.json().catch(() => null)) as {
    data?: T;
    error?: { code?: string; message?: string; details?: unknown };
  } | null;
  if (!res.ok) {
    throw new ApiError(body?.error?.message ?? `Permintaan gagal (${res.status})`, res.status, body?.error?.code);
  }
  return (body?.data ?? body) as T;
}

export interface CbtSession {
  token: string;
  exam: {
    title: string; subject: string; instructions: string | null;
    durationMin: number; startAt: string; endAt: string; totalQuestions: number;
  };
  student: { name: string; nis: string | null; className: string };
  attempt: {
    status: string; startedAt: string; deadline: string; remainingSec: number;
    violations?: number; warnAfter?: number; blockAfter?: number;
  };
}

export interface CbtQuestion {
  id: string; number: number;
  type: 'MCQ' | 'MCQ_COMPLEX' | 'TRUE_FALSE' | 'TRUE_FALSE_COMPLEX' | 'MATCHING';
  weight: number; prompt: string | null;
  options?: { choices?: string[]; statements?: string[]; rights?: string[]; pairs?: { left: string; right: string }[] } | null;
  passageCode?: string | null;
  media?: { key: string; name: string }[] | null;
}
export interface CbtPassage { code: string; content: string; media?: { key: string; name: string }[] | null }

export interface CbtPaper {
  questions: CbtQuestion[];
  passages?: CbtPassage[];
  answers: Record<string, unknown>;
  deadline: string;
  serverNow: string;
  remainingSec: number;
  violations?: number;
  warnAfter?: number;
  blockAfter?: number;
}

/** HTML dari impor Word — path gambar relatif API diprefiks base URL penuh. */
export const mediaUrl = (src: string) => (src.startsWith('http') ? src : `${API}${src.startsWith('/') ? '' : '/'}${src}`);
export const fixMediaHtml = (html: string) =>
  html.replace(/src="(\/cbt\/media\/[^"]+)"/g, (_, s: string) => `src="${API}${s}"`);

/**
 * Matematika telanjang (tanpa "$…$") yang umum diketik guru — konversi ke LaTeX
 * lalu ikut dirender: pangkat `x^2`/`x^{2n}`/`x^(a+b)`, subskrip `x_1`/`x_{ij}`,
 * dan `sqrt(…)`/`akar(…)`/`sqrt16`. Mirror lib/math.ts operational — hanya
 * segmen teks biasa; tag HTML dan rumus "$…$" yang ada tidak diubah.
 */
const bareMathSeg = (seg: string) =>
  seg
    .replace(/\\sqrt\{([^}]*)\}/g, '$$\\sqrt{$1}$$')
    .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '$$\\frac{$1}{$2}$$')
    .replace(/\b(?:sqrt|akar)\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)/gi, '$$\\sqrt{$1}$$')
    .replace(/\bsqrt\s+(\d+)/gi, '$$\\sqrt{$1}$$')
    .replace(/([a-zA-Z0-9.,)\]}])\^\{([^}]*)\}/g, '$$$1^{$2}$$')
    .replace(/([a-zA-Z0-9.,)\]}])\^\(([^()]*)\)/g, '$$$1^{$2}$$')
    .replace(/([a-zA-Z0-9.,])\^([a-zA-Z0-9.]+)/g, '$$$1^{$2}$$')
    .replace(/\b([a-zA-Z])_\{([^}]*)\}/g, '$$$1_{$2}$$')
    .replace(/\b([a-zA-Z])_(\d+)/g, '$$$1_{$2}$$');

const autoMath = (html: string) =>
  html
    .split(/(<[^>]+>|\$\$[^$]+?\$\$|\$[^$\n]+?\$)/g)
    .map((seg) => (seg.startsWith('<') || seg.startsWith('$') ? seg : bareMathSeg(seg)))
    .join('');

/** Render "$…$"/"$$…$$" di HTML menjadi rumus KaTeX — dari persamaan Word hasil impor,
    plus pola matematika telanjang yang lazim diketik (x^2, sqrt(…), x_1). */
export const renderMathHtml = (html: string) =>
  autoMath(html).replace(/\$\$([^$<]+?)\$\$|\$([^$<\n]+?)\$/g, (whole, disp: string, inl: string) => {
    const tex = disp ?? inl;
    try {
      return katex.renderToString(tex, { throwOnError: false, displayMode: disp !== undefined });
    } catch {
      return whole;
    }
  });

/**
 * Sanitasi HTML soal/bacaan sebelum dangerouslySetInnerHTML — whitelist tag
 * aman; script/style/event-handler/atribut lain dibuang. Mirror sanitizer
 * server — pertahanan untuk konten lama yang tersimpan sebelum sanitasi-tulis.
 */
export const sanitizeRichHtml = (html: string) => {
  let out = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  out = out.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  out = out.replace(/\sstyle\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  const keep = /^(p|b|i|u|em|strong|ul|ol|li|br|img|sup|sub|span|div|table|thead|tbody|tr|td|th|h[1-6]|hr|blockquote)$/i;
  out = out.replace(/<\/?([a-zA-Z0-9]+)((?:\s[^<>]*)?)>/g, (m, tag: string, attrs: string) => {
    const t = tag.toLowerCase();
    if (!keep.test(t)) return '';
    if (t === 'img') {
      const src = /\ssrc\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] ?? '';
      return src ? `<img src="${src}">` : '';
    }
    return m.startsWith('</') ? `</${t}>` : `<${t}>`;
  });
  return out;
};

/** HTML soal siap tampil — sanitasi + media + rumus sekaligus. */
export const richHtml = (html: string) => renderMathHtml(fixMediaHtml(sanitizeRichHtml(html)));

export interface CbtResult {
  status: string; submittedAt: string | null;
  examTitle: string; subject: string;
  score: number | null; maxScore: number | null;
}

/** Satu ujian aktif yang bisa diikuti siswa. */
export interface CbtLoginExam {
  title: string;
  subject: string;
  startAt: string;
  endAt: string;
  attemptStatus: string | null;
}

/** Entri jadwal — termasuk ujian mendatang & selesai. */
export interface CbtScheduleItem extends CbtLoginExam {
  status: string;
}

/** Riwayat pengerjaan — nilai tampil sesuai pengaturan showScore ujian. */
export interface CbtHistoryItem {
  title: string;
  subject: string;
  submittedAt: string;
  score: number | null;
  maxScore: number | null;
}

/** Hasil login NIS + password — identitas & daftar ujian aktif (tanpa kode). */
export interface CbtLogin {
  student: { name: string; nis: string | null; className: string };
  exams: CbtLoginExam[];
  schedule?: CbtScheduleItem[];
  history?: CbtHistoryItem[];
}

export const loginCbt = (nis: string, password: string) =>
  pub<CbtLogin>('/login', { method: 'POST', json: { nis, password } });

export const enterExam = (nis: string, code: string, password: string) =>
  pub<CbtSession>('/enter', { method: 'POST', json: { nis, code, password } });

export const getSession = (token: string) => pub<CbtSession>(`/session/${token}`);
export const getPaper = (token: string) => pub<CbtPaper>(`/paper/${token}`);
export const saveAnswer = (token: string, questionId: string, answer: unknown) =>
  pub<{ saved: boolean }>(`/paper/${token}/answer`, { method: 'POST', json: { questionId, answer } });
export const submitExam = (token: string) =>
  pub<{ submitted: boolean; score: number | null; maxScore: number | null }>(`/paper/${token}/submit`, { method: 'POST' });
export const getResult = (token: string) => pub<CbtResult>(`/result/${token}`);

/** Lapor pelanggaran proteksi — level: log | warn | blocked | expired | done. */
export interface ViolationResult {
  level: 'log' | 'warn' | 'blocked' | 'expired' | 'done';
  violations: number; warnAfter?: number; blockAfter?: number;
}
export const reportViolation = (token: string, kind: string) =>
  pub<ViolationResult>(`/paper/${token}/violation`, { method: 'POST', json: { kind } });
