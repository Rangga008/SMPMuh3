'use client';

import type {
  AuthTokens,
  AuthUser,
  CandidateDto,
  DocumentDto,
  NotificationDto,
  RegistrationDto,
  RegistrationStatus,
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

async function req<T>(
  path: string,
  opts: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const tokens = getTokens();
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
  const res = await fetch(`${API}${path}`, { ...opts, headers });
  const body = (await res.json().catch(() => null)) as {
    data?: T;
    error?: { code?: string; message?: string; details?: unknown };
  } | null;
  if (!res.ok) {
    throw new ApiError(
      body?.error?.message ?? `Request failed (${res.status})`,
      res.status,
      body?.error?.code,
    );
  }
  return (body?.data ?? body) as T;
}

// ---- auth ----
export const login = (email: string, password: string) =>
  req<AuthTokens>('/auth/login', { method: 'POST', json: { email, password } });
export const registerParent = (name: string, email: string, password: string) =>
  req<AuthTokens>('/auth/register', {
    method: 'POST',
    json: { name, email, password },
  });
export const forgotPassword = (email: string) =>
  req<void>('/auth/forgot-password', { method: 'POST', json: { email } });
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

// ---- spmb ----
export const listCandidates = () => req<CandidateDto[]>('/candidates');
export const createCandidate = (dto: Partial<CandidateDto>) =>
  req<CandidateDto>('/candidates', { method: 'POST', json: dto });
export const updateCandidate = (id: string, dto: Partial<CandidateDto>) =>
  req<CandidateDto>(`/candidates/${id}`, { method: 'PATCH', json: dto });

export const listRegistrations = () => req<RegistrationDto[]>('/registrations');
export const createRegistration = (candidateId: string) =>
  req<RegistrationDto>('/registrations', { method: 'POST', json: { candidateId } });
export const getRegistration = (id: string) =>
  req<RegistrationDto>(`/registrations/${id}`);
export const updateRegistration = (id: string, pathway: string) =>
  req<RegistrationDto>(`/registrations/${id}`, {
    method: 'PATCH',
    json: { pathway },
  });
export const submitRegistration = (id: string) =>
  req<RegistrationDto>(`/registrations/${id}/submit`, { method: 'POST' });

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
export interface PaymentView {
  id: string;
  provider: string;
  method?: string | null;
  amount: number;
  status: string;
  paidAt?: string | null;
}
export interface InvoiceView {
  id: string;
  number: string;
  title: string;
  amount: number;
  status: string;
  dueAt?: string | null;
  paidAt?: string | null;
  payments: PaymentView[];
}
export const listInvoices = (registrationId: string) =>
  req<InvoiceView[]>(`/registrations/${registrationId}/invoices`);
export const checkoutInvoice = (invoiceId: string) =>
  req<{ invoice: InvoiceView; payment: PaymentView }>(
    `/invoices/${invoiceId}/checkout`,
    { method: 'POST' },
  );

export interface StatusLookupResult {
  number: string;
  status: RegistrationStatus;
  updatedAt: string;
}
export async function lookupStatus(
  number: string,
  email: string,
): Promise<StatusLookupResult | null> {
  try {
    const res = await req<StatusLookupResult | null>(
      `/registrations/lookup?number=${encodeURIComponent(number)}&email=${encodeURIComponent(email)}`,
    );
    return res;
  } catch {
    return null;
  }
}
