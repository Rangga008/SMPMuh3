'use client';

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
  type: 'MCQ' | 'MCQ_COMPLEX' | 'TRUE_FALSE' | 'MATCHING';
  weight: number; prompt: string | null;
  options?: { choices?: string[]; rights?: string[]; pairs?: { left: string; right: string }[] } | null;
}

export interface CbtPaper {
  questions: CbtQuestion[];
  answers: Record<string, unknown>;
  deadline: string;
  serverNow: string;
  remainingSec: number;
}

export interface CbtResult {
  status: string; submittedAt: string | null;
  examTitle: string; subject: string;
  score: number | null; maxScore: number | null;
}

export const enterExam = (nis: string, code: string) =>
  pub<CbtSession>('/enter', { method: 'POST', json: { nis, code } });

export const getSession = (token: string) => pub<CbtSession>(`/session/${token}`);
export const getPaper = (token: string) => pub<CbtPaper>(`/paper/${token}`);
export const saveAnswer = (token: string, questionId: string, answer: unknown) =>
  pub<{ saved: boolean }>(`/paper/${token}/answer`, { method: 'POST', json: { questionId, answer } });
export const submitExam = (token: string) =>
  pub<{ submitted: boolean; score: number | null; maxScore: number | null }>(`/paper/${token}/submit`, { method: 'POST' });
export const getResult = (token: string) => pub<CbtResult>(`/result/${token}`);
