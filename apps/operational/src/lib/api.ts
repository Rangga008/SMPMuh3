'use client';

import type {
  AuthTokens,
  AuthUser,
  NotificationDto,
  RegistrationDto,
  RegistrationStatus,
} from '@smpmuh3/types';

const API =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
const TOKEN_KEY = 'ops.tokens';

export const getTokens = (): AuthTokens | null => {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    return raw ? (JSON.parse(raw) as AuthTokens) : null;
  } catch {
    return null;
  }
};
export const setTokens = (t: AuthTokens) =>
  localStorage.setItem(TOKEN_KEY, JSON.stringify(t));
export const clearTokens = () => localStorage.removeItem(TOKEN_KEY);

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
  if (tokens?.accessToken) headers.Authorization = `Bearer ${tokens.accessToken}`;
  const res = await fetch(`${API}${path}`, { ...opts, headers });
  const body = (await res.json().catch(() => null)) as {
    data?: T;
    error?: { code?: string; message?: string };
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

export const login = (email: string, password: string) =>
  req<AuthTokens>('/auth/login', { method: 'POST', json: { email, password } });
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

// ---- domain types (admin responses) ----
export interface AdminRegistration extends RegistrationDto {
  parent: { id: string; name: string; email: string };
}
export interface SpmbSummary {
  total: number;
  byStatus: Partial<Record<RegistrationStatus, number>>;
}
export interface AcademicYear {
  id: string;
  name: string;
  isActive: boolean;
  startDate?: string;
  endDate?: string;
}
export interface AdminDocument {
  id: string;
  type: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  verifiedAt?: string | null;
  verifiedBy?: string | null;
  verificationNote?: string | null;
  createdAt: string;
}
export interface InvoiceView {
  id: string;
  number: string;
  title: string;
  amount: number;
  status: string;
  paidAt?: string | null;
}
export interface AdminRegistrationDetail extends AdminRegistration {
  documents: AdminDocument[];
  invoices: InvoiceView[];
  academicYear: AcademicYear;
}

// ---- admin spmb ----
export const listAdminRegistrations = (q: {
  status?: string | undefined;
  search?: string | undefined;
}) => {
  const p = new URLSearchParams();
  if (q.status) p.set('status', q.status);
  if (q.search) p.set('search', q.search);
  const s = p.toString();
  return req<AdminRegistration[]>(`/admin/registrations${s ? `?${s}` : ''}`);
};
export const getAdminRegistration = (id: string) =>
  req<AdminRegistrationDetail>(`/admin/registrations/${id}`);
export const transitionRegistration = (
  id: string,
  status: RegistrationStatus,
  note?: string,
) =>
  req<AdminRegistration>(`/admin/registrations/${id}/transition`, {
    method: 'POST',
    json: note ? { status, note } : { status },
  });
export const verifyDocument = (
  id: string,
  action: 'verified' | 'rejected',
  note?: string,
) =>
  req(`/admin/documents/${id}/verify`, {
    method: 'PATCH',
    json: note ? { action, note } : { action },
  });
export const createInvoice = (id: string, title: string, amount: number) =>
  req(`/admin/registrations/${id}/invoice`, {
    method: 'POST',
    json: { title, amount },
  });
export const spmbSummary = () => req<SpmbSummary>('/admin/spmb/summary');

// ---- shared ----
export const listAcademicYears = () =>
  req<AcademicYear[]>('/academic-years');
export const listNotifications = () =>
  req<NotificationDto[]>('/notifications');

// ---- kesiswaan ----
import type { StudentDto } from '@smpmuh3/types';
export interface StudentDetail extends StudentDto {
  enrollments: {
    id: string;
    class: { name: string; gradeLevel: number };
    academicYear: { name: string };
  }[];
  achievements: { id: string; title: string; level?: string | null; year?: number | null; description?: string | null }[];
  violations: { id: string; type: string; description?: string | null; points: number; date: string }[];
  parent?: { id: string; name: string; email: string } | null;
}
export const listStudents = (q: {
  search?: string | undefined;
  status?: string | undefined;
  classId?: string | undefined;
}) => {
  const p = new URLSearchParams();
  if (q.search) p.set('search', q.search);
  if (q.status) p.set('status', q.status);
  if (q.classId) p.set('classId', q.classId);
  const s = p.toString();
  return req<StudentDto[]>(`/students${s ? `?${s}` : ''}`);
};
export const getStudent = (id: string) =>
  req<StudentDetail>(`/students/${id}`);
export const createStudent = (dto: Record<string, unknown>) =>
  req<StudentDto>('/students', { method: 'POST', json: dto });
export const updateStudent = (id: string, dto: Record<string, unknown>) =>
  req<StudentDto>(`/students/${id}`, { method: 'PATCH', json: dto });
export const addAchievement = (id: string, dto: Record<string, unknown>) =>
  req(`/students/${id}/achievements`, { method: 'POST', json: dto });
export const addViolation = (id: string, dto: Record<string, unknown>) =>
  req(`/students/${id}/violations`, { method: 'POST', json: dto });

// ---- kepegawaian ----
export interface EmployeeDto {
  id: string;
  nip?: string | null;
  name: string;
  type: 'TEACHER' | 'STAFF';
  email?: string | null;
  phone?: string | null;
  isActive: boolean;
}
export const listEmployees = (type?: string) =>
  req<EmployeeDto[]>(`/employees${type ? `?type=${type}` : ''}`);
export const createEmployee = (dto: Record<string, unknown>) =>
  req<EmployeeDto>('/employees', { method: 'POST', json: dto });

// ---- akademik ----
export interface SubjectView {
  id: string;
  code: string;
  name: string;
  gradeLevel?: number | null;
  curriculum?: { name: string } | null;
}
export interface ClassView {
  id: string;
  name: string;
  gradeLevel: number;
  capacity?: number | null;
  homeroom?: { name: string } | null;
  _count?: { enrollments: number };
}
export const listSubjects = () => req<SubjectView[]>('/subjects');
export const createSubject = (dto: Record<string, unknown>) =>
  req<SubjectView>('/subjects', { method: 'POST', json: dto });
export const listClasses = (academicYearId?: string) =>
  req<ClassView[]>(`/classes${academicYearId ? `?academicYearId=${academicYearId}` : ''}`);
export const createClass = (dto: Record<string, unknown>) =>
  req<ClassView>('/classes', { method: 'POST', json: dto });
export const enrollStudent = (dto: Record<string, unknown>) =>
  req('/enrollments', { method: 'POST', json: dto });
export const listEnrollments = (classId: string) =>
  req<{ id: string; student: { id: string; name: string; nis?: string | null } }[]>(
    `/classes/${classId}/students`,
  );
