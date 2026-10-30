'use client';

import type {
  AuthTokens,
  AuthUser,
  CandidateDto,
  DiscountRuleDto,
  DocumentDto,
  FeeDto,
  FormQuestionDto,
  InvoiceDto,
  NotificationDto,
  PaymentDto,
  RegistrationDto,
  StatusLookupResult,
  WaveDto,
} from '@smpmuh3/types';

const API =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

const TOKEN_KEY = 'spmb.tokens';

export function getTokens(): AuthTokens | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    return raw ? (JSON.parse(raw) as AuthTokens) : null;
  } catch {
    return null;
  }
}
export function setTokens(t: AuthTokens) {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(t));
}
export function clearTokens() {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

let refreshing: Promise<AuthTokens | null> | null = null;

/** Exchange the refresh token for a fresh pair — dedupes concurrent calls. */
function refreshTokens(): Promise<AuthTokens | null> {
  if (!refreshing) {
    const t = getTokens();
    if (!t?.refreshToken) return Promise.resolve(null);
    refreshing = fetch(`${API}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: t.refreshToken }),
    })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as {
          data?: AuthTokens;
        } | null;
        const tokens = (body?.data ?? null) as AuthTokens | null;
        if (res.ok && tokens?.accessToken) {
          setTokens(tokens);
          return tokens;
        }
        return null;
      })
      .catch(() => null)
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

async function req<T>(
  path: string,
  opts: RequestInit & { json?: unknown } = {},
): Promise<T> {
  let tokens = getTokens();
  const headers: Record<string, string> = {
    ...(opts.headers as Record<string, string>),
  };
  if (opts.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.json);
  }
  if (tokens?.accessToken) {
    headers.Authorization = `Bearer ${tokens.accessToken}`;
  }
  let res = await fetch(`${API}${path}`, { ...opts, headers });
  // Access token expired → renew via refresh token, then retry once.
  if (res.status === 401 && tokens?.refreshToken) {
    tokens = await refreshTokens();
    if (tokens) {
      headers.Authorization = `Bearer ${tokens.accessToken}`;
      res = await fetch(`${API}${path}`, { ...opts, headers });
    }
  }
  const body = (await res.json().catch(() => null)) as {
    data?: T;
    error?: { code?: string; message?: string; details?: unknown };
  } | null;
  if (!res.ok) {
    // Session is definitively dead — drop stored tokens so the header
    // falls back to Masuk/Daftar instead of a stale "Akun Saya".
    if (res.status === 401) clearTokens();
    throw new ApiError(
      body?.error?.message ?? `Request failed (${res.status})`,
      res.status,
      body?.error?.code,
    );
  }
  return (body?.data ?? body) as T;
}

// ---- auth ----
export const login = (identifier: string, password: string) =>
  req<AuthTokens>('/auth/login', {
    method: 'POST',
    json: { identifier, password },
  });
export const registerParent = (input: {
  name: string;
  phone: string;
  email?: string;
  password: string;
}) =>
  req<AuthTokens>('/auth/register', {
    method: 'POST',
    json: input,
  });
export const forgotPassword = (identifier: string) =>
  req<void>('/auth/forgot-password', {
    method: 'POST',
    json: { identifier },
  });
export const resetPassword = (token: string, password: string) =>
  req<void>('/auth/reset-password', {
    method: 'POST',
    json: { token, password },
  });
export const me = () => req<AuthUser>('/auth/me');
export async function logout() {
  const t = getTokens();
  if (t) {
    await req('/auth/logout', {
      method: 'POST',
      json: { refreshToken: t.refreshToken },
    }).catch(() => undefined);
  }
  clearTokens();
}

// ---- spmb info ----
export const listWaves = () => req<WaveDto[]>('/waves');
export const listQuestions = () => req<FormQuestionDto[]>('/form-questions');
export const listDiscounts = () => req<DiscountRuleDto[]>('/discounts');
export const listFees = () => req<FeeDto[]>('/fees');

// ---- candidates ----
export const listCandidates = () => req<CandidateDto[]>('/candidates');
export const createCandidate = (dto: Partial<CandidateDto>) =>
  req<CandidateDto>('/candidates', { method: 'POST', json: dto });
export const updateCandidate = (id: string, dto: Partial<CandidateDto>) =>
  req<CandidateDto>(`/candidates/${id}`, { method: 'PATCH', json: dto });

/** Buka dokumen milik sendiri di tab baru — fetch pakai token lalu blob URL. */
export async function viewDocument(id: string) {
  const tokens = getTokens();
  const res = await fetch(`${API}/documents/${id}/download`, {
    headers: tokens?.accessToken
      ? { Authorization: `Bearer ${tokens.accessToken}` }
      : {},
  });
  if (!res.ok) throw new ApiError('Dokumen tidak bisa dibuka', res.status);
  const url = URL.createObjectURL(await res.blob());
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// ---- registrations ----
export const listRegistrations = () => req<RegistrationDto[]>('/registrations');
export const createRegistration = (candidateId: string, waveId: string) =>
  req<RegistrationDto>('/registrations', {
    method: 'POST',
    json: { candidateId, waveId },
  });
export const getRegistration = (id: string) =>
  req<RegistrationDto>(`/registrations/${id}`);
export const updateRegistration = (
  id: string,
  dto: {
    pathway?: string;
    pathwayDetail?: string;
    formAnswers?: Record<string, string>;
  },
) =>
  req<RegistrationDto>(`/registrations/${id}`, {
    method: 'PATCH',
    json: dto,
  });
export const submitRegistration = (id: string) =>
  req<RegistrationDto>(`/registrations/${id}/submit`, { method: 'POST' });

// ---- documents ----
export const listDocuments = (registrationId: string) =>
  req<DocumentDto[]>(`/registrations/${registrationId}/documents`);
export function uploadDocument(
  registrationId: string,
  type: string,
  file: File,
) {
  const form = new FormData();
  form.append('type', type);
  form.append('file', file);
  return req<DocumentDto>(`/registrations/${registrationId}/documents`, {
    method: 'POST',
    body: form,
  });
}

export const listNotifications = () =>
  req<NotificationDto[]>('/notifications');

// ---- payments (parent) ----
export type { InvoiceDto, PaymentDto };
export const listInvoices = (registrationId: string) =>
  req<InvoiceDto[]>(`/registrations/${registrationId}/invoices`);
export const payInvoice = (
  invoiceId: string,
  dto: { method: 'transfer' | 'cash'; proofDocumentId?: string },
) =>
  req<{ invoice: InvoiceDto; payment: PaymentDto }>(
    `/invoices/${invoiceId}/pay`,
    { method: 'POST', json: dto },
  );
export const checkoutInvoice = (invoiceId: string) =>
  req<{ invoice: InvoiceDto; payment: PaymentDto }>(
    `/invoices/${invoiceId}/checkout`,
    { method: 'POST' },
  );

// ---- cek status publik ----
export type { StatusLookupResult };
export async function lookupStatus(
  number: string,
): Promise<StatusLookupResult | null> {
  try {
    return await req<StatusLookupResult | null>(
      `/registrations/lookup?number=${encodeURIComponent(number)}`,
    );
  } catch {
    return null;
  }
}
