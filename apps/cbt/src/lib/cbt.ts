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
  attempt: { status: string; startedAt: string; deadline: string; remainingSec: number };
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
}

/** HTML dari impor Word — path gambar relatif API diprefiks base URL penuh. */
export const mediaUrl = (src: string) => (src.startsWith('http') ? src : `${API}${src.startsWith('/') ? '' : '/'}${src}`);
export const fixMediaHtml = (html: string) =>
  html.replace(/src="(\/cbt\/media\/[^"]+)"/g, (_, s: string) => `src="${API}${s}"`);

/** Render "$…$"/"$$…$$" di HTML menjadi rumus KaTeX — dari persamaan Word hasil impor. */
export const renderMathHtml = (html: string) =>
  html.replace(/\$\$([^$<]+?)\$\$|\$([^$<\n]+?)\$/g, (whole, disp: string, inl: string) => {
    const tex = disp ?? inl;
    try {
      return katex.renderToString(tex, { throwOnError: false, displayMode: disp !== undefined });
    } catch {
      return whole;
    }
  });

/** HTML soal siap tampil — media + rumus sekaligus. */
export const richHtml = (html: string) => renderMathHtml(fixMediaHtml(html));

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
