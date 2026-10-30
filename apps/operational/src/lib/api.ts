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

let refreshing: Promise<AuthTokens | null> | null = null;
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
  if (tokens?.accessToken) headers.Authorization = `Bearer ${tokens.accessToken}`;
  let res = await fetch(`${API}${path}`, { ...opts, headers });
  // Access token kedaluwarsa → perbarui via refresh token lalu ulangi sekali.
  if (res.status === 401 && tokens?.refreshToken) {
    tokens = await refreshTokens();
    if (tokens) {
      headers.Authorization = `Bearer ${tokens.accessToken}`;
      res = await fetch(`${API}${path}`, { ...opts, headers });
    }
  }
  const body = (await res.json().catch(() => null)) as {
    data?: T;
    error?: { code?: string; message?: string };
  } | null;
  if (!res.ok) {
    if (res.status === 401) clearTokens();
    throw new ApiError(
      body?.error?.message ?? `Request failed (${res.status})`,
      res.status,
      body?.error?.code,
    );
  }
  return (body?.data ?? body) as T;
}

export const login = (identifier: string, password: string) =>
  req<AuthTokens>('/auth/login', { method: 'POST', json: { identifier, password } });
export const me = () => req<AuthUser>('/auth/me');
export const updateMe = (dto: { name?: string; phone?: string; email?: string }) =>
  req<AuthUser>('/auth/me', { method: 'PATCH', json: dto });
export const changeMyPassword = (currentPassword: string, newPassword: string) =>
  req<void>('/auth/me/password', {
    method: 'POST',
    json: { currentPassword, newPassword },
  });
export interface MyEmployee {
  id: string;
  nip: string | null;
  name: string;
  type: string;
  email: string | null;
  phone: string | null;
  isActive: boolean;
}
export const myEmployee = () => req<MyEmployee | null>('/auth/me/employee');
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
  parent: { id: string; name: string; email?: string | null; phone?: string | null };
  documents?: { type: string; verifiedAt?: string | null }[];
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
export interface PaymentView {
  id: string;
  provider: string;
  method?: string | null;
  amount: number;
  status: string;
  paidAt?: string | null;
  verifyNote?: string | null;
  proofDocumentId?: string | null;
  proofDocument?: AdminDocument | null;
  receipts?: { id: string; number: string; recipient: string; status: string }[];
}
export interface InvoiceView {
  id: string;
  number: string;
  title: string;
  kind: string;
  amount: number;
  baseAmount?: number | null;
  discountPercent: number;
  installmentNo?: number | null;
  status: string;
  dueAt?: string | null;
  paidAt?: string | null;
  note?: string | null;
  payments?: PaymentView[];
}
export interface AdminRegistrationDetail extends AdminRegistration {
  documents: AdminDocument[];
  invoices: InvoiceView[];
  installmentPlans: { id: string; title: string; totalAmount: number; count: number; invoices: InvoiceView[] }[];
  academicYear: AcademicYear;
}

// ---- admin spmb ----
export const listAdminRegistrations = (q: {
  status?: string | undefined;
  waveId?: string | undefined;
  academicYearId?: string | undefined;
  search?: string | undefined;
}) => {
  const p = new URLSearchParams();
  if (q.status) p.set('status', q.status);
  if (q.waveId) p.set('waveId', q.waveId);
  if (q.academicYearId) p.set('academicYearId', q.academicYearId);
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
export const bulkTransition = (
  ids: string[],
  status: RegistrationStatus,
  note?: string,
) =>
  req<{ id: string; ok: boolean; error?: string }[]>(
    '/admin/registrations/transition',
    { method: 'POST', json: note ? { ids, status, note } : { ids, status } },
  );
export const bulkPromote = (ids: string[]) =>
  req<{ id: string; ok: boolean; studentId?: string; error?: string }[]>(
    '/admin/registrations/promote',
    { method: 'POST', json: { ids } },
  );
export const recordCash = (invoiceId: string, note?: string) =>
  req('/admin/payments/record-cash', {
    method: 'POST',
    json: note ? { invoiceId, note } : { invoiceId },
  });
/** Unduh file ber-otorisasi sebagai blob lalu simpan. */
async function downloadFile(path: string, filename: string) {
  const tokens = getTokens();
  const res = await fetch(`${API}${path}`, {
    headers: tokens?.accessToken
      ? { Authorization: `Bearer ${tokens.accessToken}` }
      : {},
  });
  if (!res.ok) throw new ApiError('Gagal mengunduh file', res.status);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
export const exportRegistrationsXlsx = (q: {
  waveId?: string;
  academicYearId?: string;
}) => {
  const p = new URLSearchParams();
  if (q.waveId) p.set('waveId', q.waveId);
  if (q.academicYearId) p.set('academicYearId', q.academicYearId);
  const s = p.toString();
  return downloadFile(
    `/admin/spmb/export.xlsx${s ? `?${s}` : ''}`,
    'pendaftar-spmb.xlsx',
  );
};
export const exportDocumentsZip = (waveId: string) =>
  downloadFile(`/admin/spmb/export-documents?waveId=${waveId}`, 'berkas-diterima.zip');
export const verifyDocument = (
  id: string,
  action: 'verified' | 'rejected',
  note?: string,
) =>
  req(`/admin/documents/${id}/verify`, {
    method: 'PATCH',
    json: note ? { action, note } : { action },
  });
export const createInvoice = (
  id: string,
  dto: {
    title: string;
    amount: number;
    kind?: string;
    applyDiscount?: boolean;
    dueAt?: string;
    note?: string;
  },
) =>
  req(`/admin/registrations/${id}/invoice`, {
    method: 'POST',
    json: dto,
  });
export const createInstallmentPlan = (
  id: string,
  dto: { title: string; totalAmount: number; count: number; applyDiscount?: boolean },
) =>
  req(`/admin/registrations/${id}/installment-plan`, {
    method: 'POST',
    json: dto,
  });
export const verifyPayment = (
  id: string,
  action: 'confirm' | 'reject',
  note?: string,
) =>
  req(`/admin/payments/${id}/verify`, {
    method: 'PATCH',
    json: note ? { action, note } : { action },
  });
export const setPsikotes = (id: string, dto: { psikotesAt?: string; note?: string }) =>
  req(`/admin/registrations/${id}/psikotes`, { method: 'PATCH', json: dto });
export const setDiscount = (id: string, percent: number) =>
  req(`/admin/registrations/${id}/discount`, {
    method: 'PATCH',
    json: { percent },
  });
export const spmbSummary = () => req<SpmbSummary>('/admin/spmb/summary');

// ---- pengaturan spmb ----
import type {
  DiscountRuleDto,
  FeeDto,
  FormQuestionDto,
  WaveDto,
} from '@smpmuh3/types';
export const listAdminWaves = () => req<WaveDto[]>('/admin/spmb/waves');
export const saveWave = (dto: Record<string, unknown>, id?: string) =>
  req<WaveDto>(`/admin/spmb/waves${id ? `/${id}` : ''}`, {
    method: id ? 'PATCH' : 'POST',
    json: dto,
  });
export const deleteWave = (id: string) =>
  req(`/admin/spmb/waves/${id}`, { method: 'DELETE' });
export const listAdminFees = () => req<FeeDto[]>('/admin/spmb/fees');
export const updateFee = (key: string, amount: number) =>
  req(`/admin/spmb/fees/${key}`, { method: 'PATCH', json: { amount } });
export const listAdminDiscounts = () =>
  req<DiscountRuleDto[]>('/admin/spmb/discounts');
export const saveDiscount = (subType: string, dto: Record<string, unknown>) =>
  req(`/admin/spmb/discounts/${subType}`, { method: 'PUT', json: dto });
export const listAdminQuestions = () =>
  req<FormQuestionDto[]>('/admin/spmb/questions');
export const saveQuestion = (dto: Record<string, unknown>, id?: string) =>
  req<FormQuestionDto>(`/admin/spmb/questions${id ? `/${id}` : ''}`, {
    method: id ? 'PATCH' : 'POST',
    json: dto,
  });
export const deleteQuestion = (id: string) =>
  req(`/admin/spmb/questions/${id}`, { method: 'DELETE' });

// ---- import/export ----
export function importRegistrations(file: File) {
  const form = new FormData();
  form.append('file', file);
  return req<{ created: number; skipped: number; errors: string[] }>(
    '/admin/spmb/import',
    { method: 'POST', body: form },
  );
}
export const exportRegistrationPdf = (id: string) =>
  `${API}/admin/registrations/${id}/export.pdf`;
// ---------- Akun Orang Tua ----------

export interface ParentAccount {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  status: string;
  lastLoginAt: string | null;
  createdAt: string;
  _count: { registrations: number; candidates: number };
}

export interface ParentAccountDetail extends Omit<ParentAccount, '_count'> {
  candidates: { id: string; name: string; birthDate: string | null; gender: string | null }[];
  registrations: {
    id: string;
    number: string;
    status: string;
    pathway: string;
    createdAt: string;
    candidate: { name: string } | null;
    wave: { name: string } | null;
  }[];
}

export const listParents = () => req<ParentAccount[]>('/admin/parents');
export const getParent = (id: string) =>
  req<ParentAccountDetail>(`/admin/parents/${id}`);
export const updateParent = (
  id: string,
  data: { name?: string; phone?: string; email?: string; status?: 'ACTIVE' | 'DISABLED' },
) => req(`/admin/parents/${id}`, { method: 'PATCH', json: data });
export const deleteParent = (id: string) =>
  req(`/admin/parents/${id}`, { method: 'DELETE' });

// ---------- Biaya per gelombang ----------
export interface WaveFeeRow {
  key: string;
  label: string;
  global: number;
  amount: number;
  overridden: boolean;
}
export const listWaveFees = (waveId: string) =>
  req<WaveFeeRow[]>(`/admin/spmb/waves/${waveId}/fees`);
export const saveWaveFee = (waveId: string, key: string, amount: number) =>
  req(`/admin/spmb/waves/${waveId}/fees/${key}`, {
    method: 'PUT',
    json: { amount },
  });
export const deleteWaveFee = (waveId: string, key: string) =>
  req(`/admin/spmb/waves/${waveId}/fees/${key}`, { method: 'DELETE' });

/** Buka dokumen (bukti/dokumen ortu) di tab baru — fetch pakai token lalu blob URL. */
export async function viewDocument(id: string) {
  const tokens = getTokens();
  const res = await fetch(`${API}/documents/${id}/download`, {
    headers: tokens?.accessToken
      ? { Authorization: `Bearer ${tokens.accessToken}` }
      : {},
  });
  if (!res.ok) throw new ApiError('Gagal membuka dokumen', res.status);
  const url = URL.createObjectURL(await res.blob());
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function uploadSuratTemplate(file: File) {
  const form = new FormData();
  form.append('file', file);
  return req<{ id: string; fileName: string }>(
    '/admin/spmb/surat-pernyataan-template',
    { method: 'POST', body: form },
  );
}

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
  documents: {
    id: string;
    type: string;
    fileName: string;
    sizeBytes: number;
    verifiedAt: string | null;
    createdAt: string;
  }[];
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
  userId?: string | null;
}
export const listEmployees = (type?: string) =>
  req<EmployeeDto[]>(`/employees${type ? `?type=${type}` : ''}`);
export const createEmployee = (dto: Record<string, unknown>) =>
  req<EmployeeDto>('/employees', { method: 'POST', json: dto });

// ---- roles ----
export interface RoleOption {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  _count?: { users: number };
  permissions?: { permission: { key: string } }[];
}
export const listRoles = () => req<RoleOption[]>('/roles');
export const listPermissions = () =>
  req<{ key: string; description?: string | null }[]>('/roles/permissions');
export const createRole = (dto: {
  key: string;
  name: string;
  description?: string;
  permissionKeys: string[];
}) => req<RoleOption>('/roles', { method: 'POST', json: dto });
export const updateRole = (
  id: string,
  dto: { name?: string; description?: string; permissionKeys?: string[] },
) => req(`/roles/${id}`, { method: 'PUT', json: dto });
export const deleteRole = (id: string) =>
  req(`/roles/${id}`, { method: 'DELETE' });

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

// ---------- Keuangan ----------
export interface FinanceCategory {
  id: string;
  key: string;
  name: string;
  type: 'INCOME' | 'EXPENSE';
}
export interface FinanceTransaction {
  id: string;
  type: 'INCOME' | 'EXPENSE';
  categoryId: string;
  amount: number;
  occurredAt: string;
  description?: string | null;
  source: 'manual' | 'spmb';
  paymentId?: string | null;
  academicYearId?: string | null;
  createdAt: string;
  category?: FinanceCategory;
  recordedBy?: { name: string } | null;
}
export interface FinanceSummary {
  income: number;
  expense: number;
  balance: number;
  byCategory: { categoryId: string; name: string; type: 'INCOME' | 'EXPENSE'; total: number }[];
  monthly: { month: string; income: number; expense: number }[];
}
export interface FinanceBudget {
  id: string;
  academicYearId: string;
  categoryId: string;
  amount: number;
  note?: string | null;
  realized: number;
  category?: FinanceCategory;
}

const qs = (o: Record<string, string | undefined>) => {
  const p = Object.entries(o).filter(([, v]) => v);
  return p.length ? `?${new URLSearchParams(p as [string, string][]).toString()}` : '';
};

export const getFinanceSummary = (q: { academicYearId?: string; from?: string; to?: string }) =>
  req<FinanceSummary>(`/admin/finance/summary${qs(q)}`);
export const listFinanceTransactions = (q: {
  type?: string; categoryId?: string; academicYearId?: string;
  from?: string; to?: string; search?: string; take?: string; skip?: string;
}) =>
  req<{ items: FinanceTransaction[]; total: number }>(`/admin/finance/transactions${qs(q)}`);
export const createFinanceTransaction = (dto: Record<string, unknown>) =>
  req<FinanceTransaction>('/admin/finance/transactions', { method: 'POST', json: dto });
export const updateFinanceTransaction = (id: string, dto: Record<string, unknown>) =>
  req<FinanceTransaction>(`/admin/finance/transactions/${id}`, { method: 'PATCH', json: dto });
export const deleteFinanceTransaction = (id: string) =>
  req<{ ok: boolean }>(`/admin/finance/transactions/${id}`, { method: 'DELETE' });
export const listFinanceCategories = () =>
  req<FinanceCategory[]>('/admin/finance/categories');
export const createFinanceCategory = (dto: { name: string; type: 'INCOME' | 'EXPENSE' }) =>
  req<FinanceCategory>('/admin/finance/categories', { method: 'POST', json: dto });
export const listFinanceBudgets = (academicYearId: string) =>
  req<FinanceBudget[]>(`/admin/finance/budgets?academicYearId=${academicYearId}`);
export const upsertFinanceBudget = (dto: { academicYearId: string; categoryId: string; amount: number; note?: string }) =>
  req<FinanceBudget>('/admin/finance/budgets', { method: 'PUT', json: dto });

// ---------- Pengaturan: akun staf & profil sekolah ----------

export interface StaffUser {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  status: 'ACTIVE' | 'DISABLED';
  lastLoginAt: string | null;
  createdAt: string;
  roles: { role: { id: string; key: string; name: string } }[];
  employee: { id: string; name: string; type: string } | null;
}

export interface School {
  id: string;
  name: string;
  code: string | null;
  tagline: string | null;
  address: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  logoUrl: string | null;
}

export const listStaffUsers = () => req<StaffUser[]>('/admin/users');
export const createStaffUser = (dto: {
  name: string; email?: string | undefined; phone?: string | undefined;
  password: string; roleIds: string[];
}) => req<StaffUser>('/admin/users', { method: 'POST', json: dto });
export const updateStaffUser = (id: string, dto: Record<string, unknown>) =>
  req<StaffUser>(`/admin/users/${id}`, { method: 'PATCH', json: dto });
export const resetStaffPassword = (id: string, password: string) =>
  req<{ ok: boolean }>(`/admin/users/${id}/password`, { method: 'POST', json: { password } });
export const deleteStaffUser = (id: string) =>
  req<{ ok: boolean }>(`/admin/users/${id}`, { method: 'DELETE' });

export const getSchool = () => req<School>('/school');
export const updateSchool = (dto: Record<string, unknown>) =>
  req<School>('/school', { method: 'PATCH', json: dto });

export async function uploadSchoolLogo(file: File): Promise<School> {
  const t = getTokens();
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${API}/school/logo`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t?.accessToken ?? ''}` },
    body: fd,
  });
  if (!res.ok) throw new Error('Upload logo gagal');
  const data = (await res.json()) as { data?: School } | School;
  return ('data' in data && data.data ? data.data : data) as School;
}
