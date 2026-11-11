'use client';

import type {
  AuthTokens,
  AuthUser,
  NotificationDto,
  RegistrationDto,
  RegistrationStatus,
} from '@smpmuh3/types';

export const API =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
const TOKEN_KEY = 'ops.tokens';

/** No HP disimpan dinormalisasi internasional (62…) untuk WhatsApp & login —
    tampilkan kembali format lokal 08… agar sama dengan yang diinput pengguna. */
export const phoneLocal = (p?: string | null): string =>
  p ? p.replace(/^62(?=\d)/, '0') : '';

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

export async function req<T>(
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
    error?: { code?: string; message?: string; details?: unknown };
  } | null;
  if (!res.ok) {
    if (res.status === 401) clearTokens();
    const fields = (
      body?.error?.details as { fields?: unknown } | undefined
    )?.fields;
    throw new ApiError(
      Array.isArray(fields) && fields.length > 0
        ? fields.map(String).join(' · ')
        : (body?.error?.message ?? `Request failed (${res.status})`),
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
  address: string | null;
  photoUrl: string | null;
  department: string | null;
  isDeptHead: boolean;
  isActive: boolean;
}
export const myEmployee = () => req<MyEmployee | null>('/auth/me/employee');
export const updateMyEmployee = (dto: { email?: string; phone?: string; address?: string }) =>
  req('/auth/me/employee', { method: 'PATCH', json: dto });
export const uploadMyEmployeePhoto = (file: File) => {
  const fd = new FormData();
  fd.set('file', file);
  return req<{ photoUrl: string }>('/auth/me/employee/photo', { method: 'POST', body: fd });
};
export const employeePhotoUrl = (id: string) => `${API}/auth/employees/${id}/photo`;
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
  titipanOpen?: boolean;
  quota?: number | null;
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
export async function downloadFile(path: string, filename: string) {
  const tokens = getTokens();
  const res = await fetch(`${API}${path}`, {
    headers: tokens?.accessToken
      ? { Authorization: `Bearer ${tokens.accessToken}` }
      : {},
  });
  if (!res.ok) {
    let msg = 'Gagal mengunduh file';
    try {
      const j = await res.json();
      msg = j?.error?.message ?? j?.message ?? msg;
    } catch {
      /* body bukan JSON */
    }
    throw new ApiError(msg, res.status);
  }
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
export const createFee = (dto: { label: string; amount: number; key?: string }) =>
  req<FeeDto>('/admin/spmb/fees', { method: 'POST', json: dto });
export const updateFee = (key: string, amount: number) =>
  req(`/admin/spmb/fees/${key}`, { method: 'PATCH', json: { amount } });
export const deleteFee = (key: string) =>
  req(`/admin/spmb/fees/${key}`, { method: 'DELETE' });
export const listAdminDiscounts = () =>
  req<DiscountRuleDto[]>('/admin/spmb/discounts');
export const saveDiscount = (subType: string, dto: Record<string, unknown>) =>
  req(`/admin/spmb/discounts/${subType}`, { method: 'PUT', json: dto });
export const deleteDiscount = (subType: string) =>
  req(`/admin/spmb/discounts/${subType}`, { method: 'DELETE' });
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
export interface SpmbImportRow {
  row: number;
  sheet: string;
  nama: string;
  noHp: string;
  status: 'BARU' | 'LEWATI';
  msg: string;
}
export function importRegistrations(file: File, dry = false) {
  const form = new FormData();
  form.append('file', file);
  return req<{
    created: number;
    skipped: number;
    errors: string[];
    rows: SpmbImportRow[];
  }>(`/admin/spmb/import${dry ? '?dry=1' : ''}`, { method: 'POST', body: form });
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

export const listParents = (q: { waveId?: string | undefined; academicYearId?: string | undefined } = {}) => {
  const s = new URLSearchParams();
  if (q.waveId) s.set('waveId', q.waveId);
  if (q.academicYearId) s.set('academicYearId', q.academicYearId);
  const qs = s.toString();
  return req<ParentAccount[]>(`/admin/parents${qs ? `?${qs}` : ''}`);
};
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
  achievements: {
    id: string; title: string; level?: string | null; year?: number | null; description?: string | null;
    evidenceDocument?: { id: string; fileName: string; mimeType: string } | null;
  }[];
  violations: {
    id: string; type: string; description?: string | null; points: number; date: string;
    evidenceDocument?: { id: string; fileName: string; mimeType: string } | null;
  }[];
  ekskulMemberships?: {
    id: string; role?: string | null; joinedAt: string;
    extracurricular: {
      id: string; name: string; schedule?: string | null; isActive: boolean;
      coach?: { name: string } | null;
    };
  }[];
  parent?: { id: string; name: string; email: string; phone?: string | null } | null;
  /** Nomor registrasi SPMB asal — ada bila siswa hasil konversi pendaftar baru. */
  spmbNumber?: string | null;
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
export interface StudentDoc {
  id: string; type: string; fileName: string; mimeType: string; sizeBytes: number; createdAt: string;
}
export const uploadStudentDocument = (id: string, file: File, type = 'lainnya') => {
  const fd = new FormData();
  fd.set('file', file);
  return req<StudentDoc>(`/students/${id}/documents?type=${encodeURIComponent(type)}`, {
    method: 'POST',
    body: fd,
  });
};
/** Buka dokumen siswa di tab baru — fetch ber-auth → blob → object URL. */
export async function openStudentDocument(docId: string) {
  const tokens = getTokens();
  const res = await fetch(`${API}/students/documents/${docId}`, {
    headers: tokens?.accessToken ? { Authorization: `Bearer ${tokens.accessToken}` } : {},
  });
  if (!res.ok) throw new ApiError(`Gagal membuka dokumen (${res.status})`, res.status);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

// ---- prestasi & ekstrakurikuler (kesiswaan) ----
export interface AchievementRow {
  id: string;
  title: string;
  level?: string | null;
  year?: number | null;
  description?: string | null;
  createdAt: string;
  student: {
    id: string; name: string; nis?: string | null;
    enrollments: { class: { name: string } }[];
  };
  evidenceDocument?: { id: string; fileName: string } | null;
}
export const listAchievements = (q: { search?: string | undefined; year?: number | undefined } = {}) => {
  const p = new URLSearchParams();
  if (q.search) p.set('search', q.search);
  if (q.year) p.set('year', String(q.year));
  const s = p.toString();
  return req<AchievementRow[]>(`/achievements${s ? `?${s}` : ''}`);
};
export const updateAchievement = (id: string, dto: Record<string, unknown>) =>
  req(`/achievements/${id}`, { method: 'PATCH', json: dto });
export const deleteAchievement = (id: string) =>
  req(`/achievements/${id}`, { method: 'DELETE' });

export interface EkskulDto {
  id: string;
  name: string;
  description?: string | null;
  schedule?: string | null;
  isActive: boolean;
  coach?: { id: string; name: string } | null;
  _count: { members: number };
}
export interface EkskulMember {
  id: string;
  role?: string | null;
  joinedAt: string;
  student: {
    id: string; name: string; nis?: string | null;
    enrollments: { class: { name: string } }[];
  };
}
export const listEkskul = (search?: string) =>
  req<EkskulDto[]>(`/extracurriculars${search ? `?search=${encodeURIComponent(search)}` : ''}`);
export const createEkskul = (dto: Record<string, unknown>) =>
  req<EkskulDto>('/extracurriculars', { method: 'POST', json: dto });
export const updateEkskul = (id: string, dto: Record<string, unknown>) =>
  req<EkskulDto>(`/extracurriculars/${id}`, { method: 'PATCH', json: dto });
export const deleteEkskul = (id: string) =>
  req(`/extracurriculars/${id}`, { method: 'DELETE' });
export const listEkskulMembers = (id: string) =>
  req<EkskulMember[]>(`/extracurriculars/${id}/members`);
export const addEkskulMember = (id: string, studentId: string, role?: string) =>
  req(`/extracurriculars/${id}/members`, { method: 'POST', json: { studentId, role } });
export const removeEkskulMember = (memberId: string) =>
  req(`/extracurriculars/members/${memberId}`, { method: 'DELETE' });

// ---- kepegawaian ----
export interface EmployeeDto {
  id: string;
  nip?: string | null;
  name: string;
  type: string;
  staffKind?: string | null;
  additionalDuty?: string | null;
  email?: string | null;
  phone?: string | null;
  isActive: boolean;
  userId?: string | null;
  department?: string | null;
  isDeptHead?: boolean;
}
export const listEmployees = (
  type?: string,
  search?: string,
  department?: string,
  kind?: string,
  duty?: string,
  unlinked?: boolean,
) => {
  const p = new URLSearchParams();
  if (type) p.set('type', type);
  if (search) p.set('search', search);
  if (department) p.set('department', department);
  if (kind) p.set('kind', kind);
  if (duty) p.set('duty', duty);
  if (unlinked) p.set('unlinked', '1');
  return req<EmployeeDto[]>(`/employees?${p}`);
};
export const createEmployee = (dto: Record<string, unknown>) =>
  req<EmployeeDto>('/employees', { method: 'POST', json: dto });
/** Kaitkan akun login yatim ke pegawai yang sudah ada — isi kolom kosong dari akun. */
export const linkEmployeeAccount = (employeeId: string, userId: string) =>
  req<EmployeeDto>(`/employees/${employeeId}/link-account`, { method: 'POST', json: { userId } });
/** Lepas tautan akun — akun kembali jadi yatim. */
export const unlinkEmployeeAccount = (employeeId: string) =>
  req<EmployeeDto>(`/employees/${employeeId}/link-account`, { method: 'DELETE' });

/** Akun login non-orang-tua tanpa data pegawai — audit data yatim. */
export interface OrphanAccount {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  roles: string[];
}
export const listOrphanAccounts = () =>
  req<OrphanAccount[]>('/employees/orphan-accounts');

/** Opsi GTK yang dikelola admin — jabatan tendik & tugas tambahan. */
export interface GtkOption {
  id: string;
  group: 'STAFF_KIND' | 'DUTY' | string;
  code: string;
  label: string;
  department?: string | null;
  isHead: boolean;
  roleKey?: string | null;
  sortOrder: number;
  isActive: boolean;
}
export const listGtkOptions = (group?: string) =>
  req<GtkOption[]>(`/employees/gtk-options${group ? `?group=${group}` : ''}`);
export const createGtkOption = (dto: Record<string, unknown>) =>
  req<GtkOption>('/employees/gtk-options', { method: 'POST', json: dto });
export const updateGtkOption = (id: string, dto: Record<string, unknown>) =>
  req<GtkOption>(`/employees/gtk-options/${id}`, { method: 'PATCH', json: dto });
export const deleteGtkOption = (id: string) =>
  req<{ deleted: boolean }>(`/employees/gtk-options/${id}`, { method: 'DELETE' });

// ---- absensi pegawai (Tata Usaha — mesin fingerprint) ----
export type DeviceMode = 'ICLOCK' | 'PULL' | 'MANUAL';
export interface AttendanceDevice {
  id: string;
  name: string;
  serial: string;
  mode: DeviceMode;
  host?: string | null;
  port: number;
  commKey?: string | null;
  location?: string | null;
  isActive: boolean;
  lastSeenAt?: string | null;
  createdAt: string;
  _count?: { logs: number };
}
export interface AttendanceLog {
  id: string;
  deviceKey: string;
  pin: string;
  punchedAt: string;
  inOut: number;
  source: 'DEVICE' | 'IMPORT' | 'MANUAL';
  employee?: { id: string; name: string; nip?: string | null } | null;
  device?: { id: string; name: string; serial: string } | null;
}
export interface DailyRow {
  employee: { id: string; name: string; nip?: string | null; fingerPin?: string | null };
  status: 'HADIR' | 'TELAT' | 'IZIN' | 'SAKIT' | 'ALPHA' | null;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  lateMinutes?: number | null;
  source?: 'DEVICE' | 'IMPORT' | 'MANUAL' | 'SELFIE' | null;
  note?: string | null;
}
export interface AttendanceSettings {
  workStart: string;
  lateAfter: number;
  checkOutFrom: string;
  autoDerive: boolean;
  schoolLat?: number | null;
  schoolLng?: number | null;
  radiusM: number;
}
export interface PinRow {
  id: string;
  nip?: string | null;
  name: string;
  type: string;
  fingerPin?: string | null;
}
export interface AttendanceDeviceInput {
  name?: string;
  serial?: string;
  mode?: DeviceMode;
  host?: string | undefined;
  port?: number;
  commKey?: string | undefined;
  location?: string | undefined;
  isActive?: boolean;
}
export const listAttendanceDevices = () =>
  req<AttendanceDevice[]>('/admin/attendance/devices');
export const createAttendanceDevice = (dto: AttendanceDeviceInput) =>
  req<AttendanceDevice>('/admin/attendance/devices', { method: 'POST', json: dto });
export const updateAttendanceDevice = (id: string, dto: AttendanceDeviceInput) =>
  req<AttendanceDevice>(`/admin/attendance/devices/${id}`, { method: 'PATCH', json: dto });
export const deleteAttendanceDevice = (id: string) =>
  req(`/admin/attendance/devices/${id}`, { method: 'DELETE' });
export const pullAttendanceDevice = (id: string) =>
  req<{ pulled: number; inserted: number; skipped: number }>(
    `/admin/attendance/devices/${id}/pull`,
    { method: 'POST' },
  );
export const getAttendanceSettings = () =>
  req<AttendanceSettings>('/admin/attendance/settings');
export const updateAttendanceSettings = (dto: Partial<AttendanceSettings>) =>
  req<AttendanceSettings>('/admin/attendance/settings', { method: 'PATCH', json: dto });
export const listAttendancePins = () => req<PinRow[]>('/admin/attendance/pins');
export const setAttendancePin = (employeeId: string, pin?: string) =>
  req<PinRow>('/admin/attendance/pins', {
    method: 'POST',
    json: { employeeId, ...(pin ? { pin } : {}) },
  });
export const listAttendanceLogs = (q: { date?: string; employeeId?: string; deviceKey?: string } = {}) => {
  const p = new URLSearchParams();
  if (q.date) p.set('date', q.date);
  if (q.employeeId) p.set('employeeId', q.employeeId);
  if (q.deviceKey) p.set('deviceKey', q.deviceKey);
  return req<AttendanceLog[]>(`/admin/attendance/logs?${p}`);
};
export const listAttendanceDaily = (
  date: string,
  q: { employeeId?: string; status?: string } = {},
) => {
  const p = new URLSearchParams({ date });
  if (q.employeeId) p.set('employeeId', q.employeeId);
  if (q.status) p.set('status', q.status);
  return req<DailyRow[]>(`/admin/attendance/daily?${p}`);
};
export const manualPunch = (dto: { employeeId: string; punchedAt: string; inOut?: 0 | 1 }) =>
  req<{ inserted: number }>('/admin/attendance/manual', { method: 'POST', json: dto });
export const rederiveAttendance = () =>
  req<{ derived: number }>('/admin/attendance/rederive', { method: 'POST' });
export const importAttendanceFile = (deviceKey: string, file: File) => {
  const fd = new FormData();
  fd.set('deviceKey', deviceKey);
  fd.set('file', file);
  return req<{ inserted: number; skipped: number; badLines: number }>(
    '/admin/attendance/import',
    { method: 'POST', body: fd },
  );
};

// ---- shift kerja & kalender absensi pegawai ----
export interface WorkShift {
  id: string;
  name: string;
  startMinute: number;
  endMinute: number;
  lateAfter: number;
  checkOutFrom: number;
  isActive: boolean;
  _count?: { assignments: number };
}
export interface EmployeeShift {
  id: string;
  employeeId: string;
  shiftId: string;
  dayOfWeek: number; // -1=semua hari; 0=Minggu…6=Sabtu
  employee?: { id: string; name: string; nip?: string | null };
  shift: WorkShift;
}
export interface AttendanceDayRow {
  date: string;
  status: 'HADIR' | 'TELAT' | 'IZIN' | 'SAKIT' | 'ALPHA';
  checkInAt?: string | null;
  checkOutAt?: string | null;
  lateMinutes: number;
  teachingMinutes: number;
  source: 'DEVICE' | 'IMPORT' | 'MANUAL' | 'SELFIE';
  note?: string | null;
}
export interface EmployeeMonthly {
  employee: {
    id: string; name: string; nip?: string | null; type: string;
    phone?: string | null; email?: string | null; isActive: boolean;
    fingerPin?: string | null;
  };
  month: string;
  days: AttendanceDayRow[];
  shifts: { id: string; dayOfWeek: number; shift: WorkShift }[];
}
export const listWorkShifts = () => req<WorkShift[]>('/admin/attendance/shifts');
export const createWorkShift = (dto: {
  name: string; startTime: string; endTime: string; checkOutFrom: string; lateAfter?: number;
}) => req<WorkShift>('/admin/attendance/shifts', { method: 'POST', json: dto });
export const updateWorkShift = (id: string, dto: Record<string, unknown>) =>
  req<WorkShift>(`/admin/attendance/shifts/${id}`, { method: 'PATCH', json: dto });
export const deleteWorkShift = (id: string) =>
  req(`/admin/attendance/shifts/${id}`, { method: 'DELETE' });
export const listEmployeeShifts = (employeeId?: string) =>
  req<EmployeeShift[]>(
    `/admin/attendance/employee-shifts${employeeId ? `?employeeId=${employeeId}` : ''}`,
  );
export const assignEmployeeShift = (dto: {
  employeeId: string; shiftId: string; dayOfWeek: number;
}) => req<EmployeeShift>('/admin/attendance/employee-shifts', { method: 'POST', json: dto });
export const removeEmployeeShift = (id: string) =>
  req(`/admin/attendance/employee-shifts/${id}`, { method: 'DELETE' });
export const getAttendanceMonthly = (employeeId: string, month: string) =>
  req<EmployeeMonthly>(
    `/admin/attendance/monthly?employeeId=${employeeId}&month=${month}`,
  );

// ---- kalender akademik ----
export interface CalendarLesson {
  employeeId: string;
  employeeName: string;
  subjectName: string;
  className: string;
  startMinute: number;
  endMinute: number;
  room?: string | null;
}
export interface CalendarEvent {
  id: string;
  title: string;
  type: 'LIBUR' | 'KEGIATAN' | 'UJIAN' | 'LAINNYA';
  note?: string | null;
}
export interface CalendarDay {
  date: string;
  dayOfWeek: number;
  lessons: CalendarLesson[];
  events: CalendarEvent[];
  isHoliday: boolean;
}
export interface AcademicCalendar {
  month: string;
  days: CalendarDay[];
}
export interface CalendarEventRow extends CalendarEvent {
  date: string;
  note?: string | null;
  academicYearId?: string | null;
  academicYear?: { name: string } | null;
}
export const getAcademicCalendar = (month: string) =>
  req<AcademicCalendar>(`/academic-calendar?month=${month}`);
export const listCalendarEvents = (from?: string, to?: string) => {
  const p = new URLSearchParams();
  if (from) p.set('from', from);
  if (to) p.set('to', to);
  const s = p.toString();
  return req<CalendarEventRow[]>(`/academic-calendar/events${s ? `?${s}` : ''}`);
};
export const createCalendarEvent = (dto: {
  date: string; title: string; type: string; note?: string; academicYearId?: string;
}) => req<CalendarEventRow>('/academic-calendar/events', { method: 'POST', json: dto });
export const updateCalendarEvent = (id: string, dto: Record<string, unknown>) =>
  req<CalendarEventRow>(`/academic-calendar/events/${id}`, { method: 'PATCH', json: dto });
export const deleteCalendarEvent = (id: string) =>
  req(`/academic-calendar/events/${id}`, { method: 'DELETE' });

// ---- detail pegawai & pengaturan payroll ----
export interface EmployeeDetail extends EmployeeDto {
  user?: { id: string; name: string; email?: string | null; phone?: string | null } | null;
  payScale?: { name: string; hourlyRate: number; transportRate: number } | null;
  homeroomFor?: { id: string; name: string; academicYear: { name: string } }[];
  assignments?: {
    id: string;
    subject: { id: string; code?: string | null; name: string };
    class: { id: string; name: string; gradeLevel: number };
    academicYear: { id: string; name: string; isActive: boolean };
    schedules: { id: string; day: number; startMinute: number; endMinute: number; room?: string | null }[];
  }[];
}
export const getEmployee = (id: string) => req<EmployeeDetail>(`/employees/${id}`);
export interface PayrollSettings {
  id: string;
  lateDeductionPerDay: number;
  lateDeductionPerMin: number;
}
export const getPayrollSettings = () =>
  req<PayrollSettings>('/admin/payroll/settings');
export const updatePayrollSettings = (dto: Partial<PayrollSettings>) =>
  req<PayrollSettings>('/admin/payroll/settings', { method: 'PATCH', json: dto });

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
  curriculumId?: string | null;
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
export const updateSubject = (id: string, dto: Record<string, unknown>) =>
  req<SubjectView>(`/subjects/${id}`, { method: 'PATCH', json: dto });
export const deleteSubject = (id: string) =>
  req<{ ok: boolean }>(`/subjects/${id}`, { method: 'DELETE' });
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

// ---- master data ----
export interface CurriculumView {
  id: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  _count?: { subjects: number };
}
export const listCurricula = () => req<CurriculumView[]>('/curricula');
export const createCurriculum = (dto: Record<string, unknown>) =>
  req<CurriculumView>('/curricula', { method: 'POST', json: dto });
export const updateCurriculum = (id: string, dto: Record<string, unknown>) =>
  req<CurriculumView>(`/curricula/${id}`, { method: 'PATCH', json: dto });
export const deleteCurriculum = (id: string) =>
  req<{ ok: boolean }>(`/curricula/${id}`, { method: 'DELETE' });
export interface SemesterView {
  id: string;
  academicYearId: string;
  name: string;
  startDate?: string | null;
  endDate?: string | null;
  isActive: boolean;
  academicYear?: { name: string };
}
export const listSemesters = (academicYearId?: string) =>
  req<SemesterView[]>(
    `/semesters${academicYearId ? `?academicYearId=${academicYearId}` : ''}`,
  );
export const createSemester = (dto: Record<string, unknown>) =>
  req<SemesterView>('/semesters', { method: 'POST', json: dto });
export const updateSemester = (id: string, dto: Record<string, unknown>) =>
  req<SemesterView>(`/semesters/${id}`, { method: 'PATCH', json: dto });
export const deleteSemester = (id: string) =>
  req<{ ok: boolean }>(`/semesters/${id}`, { method: 'DELETE' });

// ---------- Keuangan ----------
export interface FinanceCategory {
  id: string;
  key: string;
  name: string;
  type: 'INCOME' | 'EXPENSE';
  standardGroup?: string | null;
  isActive?: boolean;
}
export interface FinanceTransaction {
  id: string;
  type: 'INCOME' | 'EXPENSE';
  categoryId: string;
  amount: number;
  occurredAt: string;
  description?: string | null;
  source: string;
  paymentId?: string | null;
  cashAccountId?: string | null;
  academicYearId?: string | null;
  createdAt: string;
  category?: FinanceCategory;
  cashAccount?: { id: string; name: string; type: 'CASH' | 'BANK' } | null;
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
  type?: string; categoryId?: string; cashAccountId?: string; academicYearId?: string;
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
export const createFinanceCategory = (dto: { name: string; type: 'INCOME' | 'EXPENSE'; standardGroup?: string }) =>
  req<FinanceCategory>('/admin/finance/categories', { method: 'POST', json: dto });
export const listFinanceBudgets = (academicYearId: string) =>
  req<FinanceBudget[]>(`/admin/finance/budgets?academicYearId=${academicYearId}`);
export const upsertFinanceBudget = (dto: { academicYearId: string; categoryId: string; amount: number; note?: string }) =>
  req<FinanceBudget>('/admin/finance/budgets', { method: 'PUT', json: dto });

// ---- laporan ----
export interface FinanceReport {
  range: { from: string | null; to: string | null; semesterName: string | null };
  income: number;
  expense: number;
  balance: number;
  monthly: { month: string; income: number; expense: number }[];
  incomeByCategory: { categoryId: string; name: string; total: number }[];
  expenseByCategory: { categoryId: string; name: string; total: number }[];
  expenseByStandard: { group: string; total: number }[];
  incomeBySource: { source: string; total: number }[];
  expenseBySource: { source: string; total: number }[];
  byCashAccount: { accountId: string; name: string; key: string; income: number; expense: number; net: number }[];
  budgets: { categoryId: string; name: string; type: string; planned: number; actual: number; diff: number; pct: number }[];
  paymentsByStudentMonth: {
    studentId: string;
    studentName: string;
    classId: string;
    className: string;
    gradeLevel: number;
    month: string;
    total: number;
  }[];
  savings: { in: number; out: number; monthly: { month: string; in: number; out: number }[] };
  loans: { disbursedCount: number; disbursedAmount: number; repaidAmount: number; outstanding: number };
}
export const getFinanceReport = (f: {
  academicYearId?: string; semesterId?: string; from?: string; to?: string; cashAccountId?: string;
}) => req<FinanceReport>(`/admin/finance/reports${qs(f)}`);

// ---- kas & buku bank ----
export interface CashAccountView {
  id: string;
  key: string;
  name: string;
  type: 'CASH' | 'BANK';
  openingBalance: number;
  isActive: boolean;
  balance?: number;
}
export const listCashAccounts = () => req<CashAccountView[]>('/admin/finance/accounts');
export const createCashAccount = (dto: Record<string, unknown>) =>
  req<CashAccountView>('/admin/finance/accounts', { method: 'POST', json: dto });
export const updateCashAccount = (id: string, dto: Record<string, unknown>) =>
  req<CashAccountView>(`/admin/finance/accounts/${id}`, { method: 'PATCH', json: dto });
export interface CashMovementView {
  id: string;
  direction: 'IN' | 'OUT';
  amount: number;
  refType: string;
  description?: string | null;
  occurredAt: string;
  balance: number;
}
export interface AccountLedger {
  account: CashAccountView;
  opening: number;
  items: CashMovementView[];
  closing: number;
}
export const getAccountLedger = (id: string, q: { from?: string; to?: string }) => {
  const p = new URLSearchParams();
  if (q.from) p.set('from', q.from);
  if (q.to) p.set('to', q.to);
  const s = p.toString();
  return req<AccountLedger>(`/admin/finance/accounts/${id}/ledger${s ? `?${s}` : ''}`);
};
export interface BankIncomeView {
  id: string;
  cashAccountId: string;
  senderName: string;
  purpose?: string | null;
  amount: number;
  receivedAt: string;
  account?: { id: string; name: string };
  category?: { id: string; name: string };
}
export const listBankIncome = (q: { cashAccountId?: string; from?: string; to?: string }) => {
  const p = new URLSearchParams();
  if (q.cashAccountId) p.set('cashAccountId', q.cashAccountId);
  if (q.from) p.set('from', q.from);
  if (q.to) p.set('to', q.to);
  const s = p.toString();
  return req<BankIncomeView[]>(`/admin/finance/bank-income${s ? `?${s}` : ''}`);
};
export const createBankIncome = (dto: Record<string, unknown>) =>
  req<BankIncomeView>('/admin/finance/bank-income', { method: 'POST', json: dto });

// ---- pengeluaran ----
export interface ExpenseAllocationView {
  id: string;
  cashAccountId: string;
  amount: number;
  cashAccount?: { name: string; type?: 'CASH' | 'BANK' };
}
export interface ExpenseView {
  id: string;
  number: string;
  occurredAt: string;
  vendor?: string | null;
  description: string;
  categoryId: string;
  academicYearId?: string | null;
  totalAmount: number;
  note?: string | null;
  documentId?: string | null;
  status: 'POSTED' | 'VOID';
  category?: { name: string; standardGroup?: string | null };
  academicYear?: { name: string };
  allocations?: ExpenseAllocationView[];
  creator?: { name: string } | null;
}
export const STANDARDS = [
  'ISI', 'PROSES', 'KELULUSAN', 'TENAGA',
  'SARANA', 'PENGELOLAAN', 'PEMBIAYAAN', 'PENILAIAN',
] as const;
export const listExpenses = (q: {
  categoryId?: string; standardGroup?: string; cashAccountId?: string;
  academicYearId?: string; from?: string; to?: string; search?: string;
  take?: string; skip?: string;
}) =>
  req<{ items: ExpenseView[]; total: number }>(`/admin/finance/expenses${qs(q)}`);
export const getExpense = (id: string) =>
  req<ExpenseView>(`/admin/finance/expenses/${id}`);
export const createExpense = (dto: Record<string, unknown>) =>
  req<ExpenseView>('/admin/finance/expenses', { method: 'POST', json: dto });
export const updateExpense = (id: string, dto: Record<string, unknown>) =>
  req<ExpenseView>(`/admin/finance/expenses/${id}`, { method: 'PATCH', json: dto });
export const voidExpense = (id: string) =>
  req<{ voided: boolean }>(`/admin/finance/expenses/${id}`, { method: 'DELETE' });
export interface FundUsageRow {
  account: { id: string; key: string; name: string; type: 'CASH' | 'BANK' };
  total: number;
  byCategory: { name: string; amount: number }[];
  byStandard: { name: string; amount: number }[];
}
export const getFundUsage = (q: { academicYearId?: string; cashAccountId?: string; from?: string; to?: string }) =>
  req<FundUsageRow[]>(`/admin/finance/expenses/fund-usage${qs(q)}`);
export const updateFinanceCategory = (
  id: string,
  dto: { name?: string; standardGroup?: string; isActive?: boolean },
) =>
  req<FinanceCategory>(`/admin/finance/categories/${id}`, { method: 'PATCH', json: dto });

// ---- tagihan siswa ----
export interface InvoiceItemView {
  id: string;
  kind: string;
  label: string;
  amount: number;
  paidAmount?: number;
  remaining?: number;
}
export interface StudentInvoice {
  id: string;
  number: string;
  studentId: string;
  title: string;
  kind: string;
  amount: number;
  status: 'OPEN' | 'PARTIAL' | 'PAID' | 'EXPIRED' | 'CANCELLED';
  dueAt?: string | null;
  issuedAt: string;
  paidAt?: string | null;
  note?: string | null;
  payerLabel?: string | null;
  paidAmount: number;
  remaining: number;
  student?: {
    id: string;
    name: string;
    nis?: string | null;
    status?: string | null;
    parent?: { name: string; phone?: string | null } | null;
  } | null;
  class?: { id: string; name: string; gradeLevel: number } | null;
  items?: InvoiceItemView[];
}
export interface PaymentReceipt {
  id: string;
  amount: number;
  method?: string | null;
  paidAt?: string | null;
  invoice: {
    number: string;
    student?: { name: string; nis?: string | null; parent?: { name: string; phone?: string | null } | null } | null;
  };
  cashAccount?: { name: string } | null;
  receipts?: { id: string; number: string; createdAt: string }[];
  cashierName?: string | null;
  school?: {
    name: string;
    address?: string | null;
    phone?: string | null;
    whatsapp?: string | null;
    headmaster?: string | null;
    headmasterNip?: string | null;
    headmasterSignatureUrl?: string | null;
    logoUrl?: string | null;
  } | null;
  allocations: {
    id: string;
    amount: number;
    invoice: { number: string; title: string };
    item?: { label: string } | null;
  }[];
}
export interface StudentPaymentRow {
  id: string;
  amount: number;
  method?: string | null;
  paidAt?: string | null;
  receipts?: { number: string }[];
  cashAccount?: { name: string } | null;
  allocations: {
    id: string;
    amount: number;
    invoice: { number: string; title: string };
    item?: { label: string } | null;
  }[];
}
export interface BillingBatchView {
  id: string;
  kind: string;
  title: string;
  amount: number;
  generatedCount: number;
  skippedCount: number;
  createdAt: string;
}

export const listStudentInvoices = (q: {
  studentId?: string; classId?: string; gradeLevel?: string; academicYearId?: string;
  semesterId?: string; kind?: string; status?: string; studentStatus?: string; search?: string; take?: string; skip?: string;
}) => {
  const p = qs({ ...q });
  return req<{ items: StudentInvoice[]; total: number }>(`/admin/finance/invoices${p}`);
};
export const createStudentInvoice = (dto: Record<string, unknown>) =>
  req<StudentInvoice>('/admin/finance/invoices', { method: 'POST', json: dto });
export const getStudentInvoice = (id: string) =>
  req<StudentInvoice & {
    allocations?: {
      id: string;
      amount: number;
      createdAt: string;
      item?: { label: string } | null;
      payment?: { id: string; method?: string | null; paidAt?: string | null } | null;
    }[];
    academicYear?: { id: string; name: string } | null;
    semester?: { id: string; name: string } | null;
  }>(`/admin/finance/invoices/${id}`);
export const updateStudentInvoice = (id: string, dto: Record<string, unknown>) =>
  req<StudentInvoice>(`/admin/finance/invoices/${id}`, { method: 'PATCH', json: dto });
export const generateBilling = (dto: Record<string, unknown>) =>
  req<BillingBatchView>('/admin/finance/billing/generate', { method: 'POST', json: dto });
export const listBillingBatches = (academicYearId?: string) =>
  req<BillingBatchView[]>(`/admin/finance/billing/batches${academicYearId ? `?academicYearId=${academicYearId}` : ''}`);
export const voidBillingBatch = (id: string) =>
  req<{ cancelled: number; kept: number }>(`/admin/finance/billing/batches/${id}`, { method: 'DELETE' });
export const recordBillingPayment = (dto: Record<string, unknown>) =>
  req<PaymentReceipt>('/admin/finance/billing/payments', { method: 'POST', json: dto });
export const getBillingReceipt = (id: string) =>
  req<PaymentReceipt>(`/admin/finance/payments/${id}/receipt`);

export interface StudentBillsView {
  student: {
    id: string; name: string; nis?: string | null;
    parent?: { name: string; phone?: string | null } | null;
    enrollments?: { class?: { name: string; gradeLevel: number } | null; academicYear?: { name: string } | null }[];
  };
  bills: StudentInvoice[];
  payments: StudentPaymentRow[];
  savings: number;
}
export const getStudentBills = (studentId: string) =>
  req<StudentBillsView>(`/admin/finance/students/${studentId}/bills`);
export const notifyInvoice = (id: string) =>
  req<{ sent: boolean; queued: boolean; waUrl: string; phone: string; messageId?: string }>(
    `/admin/finance/invoices/${id}/notify`,
    { method: 'POST' },
  );

// ---- tabungan siswa ----
export interface SavingsEntryView {
  id: string;
  direction: 'IN' | 'OUT';
  amount: number;
  note?: string | null;
  occurredAt: string;
  balance: number;
  cashAccount?: { name: string } | null;
  recordedBy?: { name: string } | null;
}
export const getStudentSavings = (studentId: string) =>
  req<{
    student?: {
      id: string;
      name: string;
      nis?: string | null;
      enrollments?: { class?: { name: string } | null }[];
    } | null;
    balance: number;
    items: SavingsEntryView[];
  }>(`/admin/finance/savings/${studentId}`);
export const listSavingsSummary = (q?: { search?: string; classId?: string; gradeLevel?: string }) => {
  const p = q ? qs({ ...q }) : '';
  return req<{ id: string; name: string; nis?: string | null; className?: string | null; gradeLevel?: number | null; balance: number }[]>(
    `/admin/finance/savings/summary${p}`,
  );
};
export const createSavingsEntry = (dto: Record<string, unknown>) =>
  req<SavingsEntryView>('/admin/finance/savings', { method: 'POST', json: dto });

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
  headmaster?: string | null;
  headmasterNip?: string | null;
  npsn?: string | null;
  headmasterSignatureUrl?: string | null;
  logoUrl: string | null;
  updatedAt: string;
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

async function uploadSchoolImage(path: string, file: File): Promise<School> {
  const t = getTokens();
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t?.accessToken ?? ''}` },
    body: fd,
  });
  if (!res.ok) {
    let msg = 'Upload gambar gagal';
    try {
      const j = await res.json();
      msg = j?.error?.message ?? j?.message ?? msg;
    } catch { /* body bukan JSON */ }
    throw new ApiError(msg, res.status);
  }
  const data = (await res.json()) as { data?: School } | School;
  return ('data' in data && data.data ? data.data : data) as School;
}
export const uploadSchoolLogo = (file: File) => uploadSchoolImage('/school/logo', file);
export const uploadSchoolSignature = (file: File) =>
  uploadSchoolImage('/school/signature', file);

// ---------- Akademik lanjutan (fase 6) ----------
export const updateClass = (id: string, dto: Record<string, unknown>) =>
  req<ClassView>(`/classes/${id}`, { method: 'PATCH', json: dto });
export const createAcademicYear = (dto: {
  name: string; startDate: string; endDate: string; isActive?: boolean;
}) => req<AcademicYear>('/academic-years', { method: 'POST', json: dto });
export const activateAcademicYear = (id: string) =>
  req<AcademicYear>(`/academic-years/${id}/activate`, { method: 'PATCH' });
export const updateAcademicYear = (
  id: string,
  dto: {
    name?: string;
    startDate?: string;
    endDate?: string;
    titipanOpen?: boolean;
    quota?: number | null;
  },
) => req<AcademicYear>(`/academic-years/${id}`, { method: 'PATCH', json: dto });
export const deleteAcademicYear = (id: string) =>
  req<{ ok: boolean }>(`/academic-years/${id}`, { method: 'DELETE' });

// ---------- Daftar titipan / waiting list ----------
import type { TitipanEntryDto, TitipanStatus } from '@smpmuh3/types';

export interface TitipanAdmin extends TitipanEntryDto {
  waveId?: string | null;
  waveName?: string | null;
  parentName?: string | null;
  parentEmail?: string | null;
  parentPhone?: string | null;
}
export interface TitipanSummary {
  academicYearId: string;
  name: string;
  titipanOpen: boolean;
  isActive: boolean;
  quota?: number | null;
  occupied: number;
  waitingCount: number;
  codeSentCount: number;
  registeredCount: number;
}
export const titipanSummary = () => req<TitipanSummary[]>('/admin/titipan/summary');
export const listTitipan = (q: {
  academicYearId?: string | undefined;
  waveId?: string | undefined;
  status?: TitipanStatus | undefined;
  q?: string | undefined;
}) => req<TitipanAdmin[]>(`/admin/titipan${qs(q)}`);
export const approveTitipan = (id: string) =>
  req<TitipanAdmin>(`/admin/titipan/${id}/approve`, { method: 'POST' });
export const sendTitipanCode = (id: string) =>
  req<{ entry: TitipanAdmin; sent: boolean; queued: boolean; waUrl: string }>(
    `/admin/titipan/${id}/send-code`,
    { method: 'POST' },
  );
export const cancelTitipan = (id: string, note?: string) =>
  req<TitipanAdmin>(`/admin/titipan/${id}/cancel`, { method: 'POST', json: { note } });
export const noteTitipan = (id: string, note?: string) =>
  req<TitipanAdmin>(`/admin/titipan/${id}`, { method: 'PATCH', json: { note } });
/** Ubah status titipan manual (PENDING/WAITING/CODE_SENT/CANCELLED). */
export const setTitipanStatus = (
  id: string,
  status: Exclude<TitipanStatus, 'REGISTERED'>,
) => req<TitipanAdmin>(`/admin/titipan/${id}`, { method: 'PATCH', json: { status } });
/** Tugaskan gelombang ke entri titipan — null untuk melepas. */
export const setTitipanWave = (id: string, waveId: string | null) =>
  req<TitipanAdmin>(`/admin/titipan/${id}`, { method: 'PATCH', json: { waveId } });
export interface BulkTitipanResult {
  id: string;
  candidateName: string;
  ok: boolean;
  message: string;
}
/** Aksi massal — verifikasi / kirim kode / status / batalkan / hapus. */
export const bulkTitipan = (
  ids: string[],
  action: 'approve' | 'send_code' | 'status' | 'cancel' | 'delete',
  options?: { status?: 'PENDING' | 'WAITING' | 'CANCELLED'; note?: string },
) =>
  req<BulkTitipanResult[]>('/admin/titipan/bulk', {
    method: 'POST',
    json: { ids, action, ...options },
  });
export const deleteTitipan = (id: string) =>
  req<unknown>(`/admin/titipan/${id}`, { method: 'DELETE' });

// ---------- Orang tua / wali (Kesiswaan) ----------
export interface ParentListItem {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  studentCount: number;
  openInvoiceTotal: number;
  students: { id: string; name: string; nis: string | null }[];
}
export interface ParentDetail {
  parent: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    createdAt: string;
  };
  students: ({
    enrollments: {
      academicYear: { name: string; isActive: boolean };
      class: { name: string; gradeLevel: number };
    }[];
    candidate?: { registrations: { number: string; status: string }[] } | null;
  } & StudentDetail)[];
  invoices: {
    id: string;
    number: string;
    title: string;
    kind: string;
    amount: number;
    status: string;
    dueAt: string | null;
    studentId: string;
    student: { name: string };
    paidAmount: number;
    remaining: number;
  }[];
  titipan: {
    id: string;
    formCode: string | null;
    status: string;
    candidateName: string;
    codeSentAt: string | null;
    codeUsedAt: string | null;
    academicYear: { name: string };
  }[];
}
export const listStudentParents = (search?: string) =>
  req<ParentListItem[]>(`/students/parents${search ? `?search=${encodeURIComponent(search)}` : ''}`);
export const getStudentParent = (id: string) =>
  req<ParentDetail>(`/students/parents/${id}`);
export const remindStudentParent = (id: string) =>
  req<{ queued: boolean; sent: boolean; waUrl: string; messageId?: string; message: string }>(
    `/students/parents/${id}/remind`,
    { method: 'POST' },
  );

// ---------- WhatsApp gateway & antrean ----------
import type {
  WaMessageStatus,
  WaMessagesResponse,
  WhatsappSettingsDto,
} from '@smpmuh3/types';

export const getWaSettings = () => req<WhatsappSettingsDto>('/admin/wa/settings');
export const updateWaSettings = (dto: {
  enabled?: boolean | undefined;
  gatewayUrl?: string | undefined;
  gatewayToken?: string | undefined;
  intervalSeconds?: number | undefined;
  dailyLimit?: number | undefined;
}) => req<WhatsappSettingsDto>('/admin/wa/settings', { method: 'PATCH', json: dto });
export const listWaMessages = (q: {
  type?: string | undefined;
  status?: WaMessageStatus | undefined;
  take?: number | undefined;
}) =>
  req<WaMessagesResponse>(
    `/admin/wa/messages${qs({ ...q, take: q.take ? String(q.take) : undefined })}`,
  );
export const retryWaMessage = (id: string) =>
  req<WaMessagesResponse['messages'][number]>(`/admin/wa/messages/${id}/retry`, {
    method: 'POST',
  });
export const cancelWaMessage = (id: string) =>
  req<WaMessagesResponse['messages'][number]>(`/admin/wa/messages/${id}/cancel`, {
    method: 'POST',
  });

export interface AssignmentView {
  id: string;
  employee: { id: string; name: string };
  subject: { code: string; name: string };
  class: { id: string; name: string };
  schedules?: ScheduleView[];
}
export const listAssignments = (academicYearId?: string) =>
  req<AssignmentView[]>(`/assignments${academicYearId ? `?academicYearId=${academicYearId}` : ''}`);
export const createAssignment = (dto: Record<string, unknown>) =>
  req<AssignmentView>('/assignments', { method: 'POST', json: dto });

export interface ScheduleView {
  id: string;
  day: number;
  startMinute: number;
  endMinute: number;
  room?: string | null;
  assignment: {
    id: string;
    employee: { name: string };
    subject: { code: string; name: string };
    class: { id: string; name: string };
  };
}
export const listSchedules = (classId?: string, academicYearId?: string) => {
  const p = new URLSearchParams();
  if (classId) p.set('classId', classId);
  if (academicYearId) p.set('academicYearId', academicYearId);
  const s = p.toString();
  return req<ScheduleView[]>(`/schedules${s ? `?${s}` : ''}`);
};
export const createSchedule = (dto: Record<string, unknown>) =>
  req<ScheduleView>('/schedules', { method: 'POST', json: dto });
export const deleteSchedule = (id: string) =>
  req(`/schedules/${id}`, { method: 'DELETE' });

export interface AssessmentView {
  id: string;
  name: string;
  type: 'FORMATIF' | 'SUMATIF' | 'PTS' | 'PAS';
  maxScore: number;
  subject: { code: string; name: string };
  class?: { name: string } | null;
  _count?: { grades: number };
}
export const listAssessments = (academicYearId?: string, classId?: string) => {
  const p = new URLSearchParams();
  if (academicYearId) p.set('academicYearId', academicYearId);
  if (classId) p.set('classId', classId);
  const s = p.toString();
  return req<AssessmentView[]>(`/assessments${s ? `?${s}` : ''}`);
};
export const createAssessment = (dto: Record<string, unknown>) =>
  req<AssessmentView>('/assessments', { method: 'POST', json: dto });
export const listGrades = (assessmentId: string) =>
  req<{ id: string; score: number; student: { id: string; name: string; nis?: string | null } }[]>(
    `/assessments/${assessmentId}/grades`,
  );
export const setGrades = (assessmentId: string, grades: { studentId: string; score: number }[]) =>
  req<{ saved: number }>(`/assessments/${assessmentId}/grades`, {
    method: 'POST', json: { grades },
  });

// ---------- Absensi ----------
export const markAttendance = (dto: {
  classId: string;
  date: string;
  records: { studentId: string; status: string; note?: string }[];
}) => req('/attendance', { method: 'POST', json: dto });
export const listAttendance = (classId: string, date: string) =>
  req<{ id: string; studentId: string; status: string; note?: string | null }[]>(
    `/attendance?classId=${classId}&date=${date}`,
  );

// ---------- Tata Usaha ----------
export interface Letter {
  id: string;
  direction: 'IN' | 'OUT';
  number: string;
  date: string;
  subject: string;
  party?: string | null;
  description?: string | null;
  categoryId?: string | null;
  category?: { id: string; name: string } | null;
  fileName?: string | null;
  mimeType?: string | null;
  createdAt: string;
}
export interface LetterCategory {
  id: string;
  kind: string;
  name: string;
  _count?: { letters: number; mutations: number };
}
export const listLetterCategories = (kind?: string) =>
  req<LetterCategory[]>(`/tu/categories${kind ? `?kind=${kind}` : ''}`);
export const createLetterCategory = (kind: string, name: string) =>
  req<LetterCategory>('/tu/categories', { method: 'POST', json: { kind, name } });
export const deleteLetterCategory = (id: string) =>
  req(`/tu/categories/${id}`, { method: 'DELETE' });
export const listLetters = (direction?: string, search?: string, categoryId?: string) => {
  const p = new URLSearchParams();
  if (direction) p.set('direction', direction);
  if (search) p.set('search', search);
  if (categoryId) p.set('categoryId', categoryId);
  const s = p.toString();
  return req<Letter[]>(`/tu/letters${s ? `?${s}` : ''}`);
};
export const createLetter = (dto: Record<string, unknown>) =>
  req<Letter>('/tu/letters', { method: 'POST', json: dto });
export const updateLetter = (id: string, dto: Record<string, unknown>) =>
  req<Letter>(`/tu/letters/${id}`, { method: 'PATCH', json: dto });
export const deleteLetter = (id: string) =>
  req(`/tu/letters/${id}`, { method: 'DELETE' });
export async function uploadLetterFile(id: string, file: File): Promise<Letter> {
  const t = getTokens();
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${API}/tu/letters/${id}/file`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t?.accessToken ?? ''}` },
    body: fd,
  });
  if (!res.ok) throw new Error('Unggah lampiran gagal');
  const data = (await res.json()) as { data?: Letter } | Letter;
  return ('data' in data && data.data ? data.data : data) as Letter;
}
export async function downloadLetterFile(id: string) {
  const t = getTokens();
  const res = await fetch(`${API}/tu/letters/${id}/file`, {
    headers: { Authorization: `Bearer ${t?.accessToken ?? ''}` },
  });
  if (!res.ok) throw new Error('Gagal mengunduh lampiran');
  return res.blob();
}

export interface StudentMutation {
  id: string;
  direction: 'IN' | 'OUT';
  studentName: string;
  nisn?: string | null;
  date: string;
  school?: string | null;
  letterNumber?: string | null;
  categoryId?: string | null;
  category?: { id: string; name: string } | null;
  fileName?: string | null;
  status: 'PROCESS' | 'DONE' | 'CANCELLED';
  notes?: string | null;
  createdAt: string;
}
export const listMutations = (direction?: string, search?: string, categoryId?: string) => {
  const p = new URLSearchParams();
  if (direction) p.set('direction', direction);
  if (search) p.set('search', search);
  if (categoryId) p.set('categoryId', categoryId);
  const s = p.toString();
  return req<StudentMutation[]>(`/tu/mutations${s ? `?${s}` : ''}`);
};
export const createMutation = (dto: Record<string, unknown>) =>
  req<StudentMutation>('/tu/mutations', { method: 'POST', json: dto });
export const updateMutation = (id: string, dto: Record<string, unknown>) =>
  req<StudentMutation>(`/tu/mutations/${id}`, { method: 'PATCH', json: dto });
export const deleteMutation = (id: string) =>
  req(`/tu/mutations/${id}`, { method: 'DELETE' });

export interface ExamRecord {
  id: string;
  period: 'US1' | 'US2';
  studentName: string;
  nisn?: string | null;
  score?: number | null;
  result: 'PENDING' | 'PASSED' | 'FAILED';
  notes?: string | null;
  academicYear: { name: string };
}
export const listExamRecords = (period?: string, academicYearId?: string, search?: string) => {
  const p = new URLSearchParams();
  if (period) p.set('period', period);
  if (academicYearId) p.set('academicYearId', academicYearId);
  if (search) p.set('search', search);
  const s = p.toString();
  return req<ExamRecord[]>(`/tu/exam-records${s ? `?${s}` : ''}`);
};
export const createExamRecord = (dto: Record<string, unknown>) =>
  req<ExamRecord>('/tu/exam-records', { method: 'POST', json: dto });
export const updateExamRecord = (id: string, dto: Record<string, unknown>) =>
  req<ExamRecord>(`/tu/exam-records/${id}`, { method: 'PATCH', json: dto });
export const deleteExamRecord = (id: string) =>
  req(`/tu/exam-records/${id}`, { method: 'DELETE' });

// ---- payroll ----
export interface PayScaleView {
  id: string;
  name: string;
  minYears: number;
  maxYears?: number | null;
  hourlyRate: number;
  transportRate: number;
  isActive: boolean;
  _count?: { employees: number };
}
export interface EmployeePayroll extends EmployeeDto {
  payScaleId?: string | null;
  workStartDate?: string | null;
  weeklyRequiredMinutes: number;
  hourlyRate?: number | null;
  transportRate?: number | null;
  isCertified: boolean;
  serviceYears?: number | null;
  payScale?: PayScaleView | null;
}
export interface EmpAttendance {
  id: string;
  employeeId: string;
  date: string;
  status: 'HADIR' | 'TELAT' | 'IZIN' | 'SAKIT' | 'ALPHA';
  teachingMinutes: number;
  lateMinutes?: number;
  note?: string | null;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  source?: 'DEVICE' | 'IMPORT' | 'MANUAL' | null;
  employee?: { name: string; nip?: string | null };
}
export interface HonorTypeView {
  id: string;
  key: string;
  name: string;
  period: 'MONTHLY' | 'PER_SESSION' | 'ONE_TIME';
  defaultAmount: number;
  isActive: boolean;
  _count?: { honors: number };
}
export interface EmployeeHonorView {
  id: string;
  employeeId: string;
  honorTypeId: string;
  amount?: number | null;
  sessions: number;
  eventName?: string | null;
  eventMonth?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
  isActive: boolean;
  employee?: { name: string };
  honorType?: { name: string; period: string };
}
export interface DeductionTypeView {
  id: string;
  key: string;
  name: string;
  defaultAmount: number;
  isRecurring: boolean;
  isActive: boolean;
}
export interface EmployeeDeductionView {
  id: string;
  employeeId: string;
  deductionTypeId: string;
  amount?: number | null;
  month?: string | null;
  isActive: boolean;
  employee?: { name: string };
  deductionType?: { name: string; key: string; isRecurring: boolean };
}
export interface LoanView {
  id: string;
  employeeId: string;
  source: 'KASBON' | 'KOOPERASI' | 'EKSTERNAL';
  principal: number;
  fee: number;
  installments: number;
  monthlyAmount: number;
  remaining: number;
  startMonth: string;
  status: 'ACTIVE' | 'PAID_OFF' | 'CANCELLED';
  note?: string | null;
  employee?: { name: string; nip?: string | null };
  cashAccount?: { name: string } | null;
}
export interface BosHonorView {
  id: string;
  employeeId: string;
  month: string;
  amount: number;
  certified: boolean;
  note?: string | null;
  employee?: { name: string; nip?: string | null; isCertified: boolean };
}
export interface PayrollLineView {
  id: string;
  kind: 'BASE' | 'TRANSPORT' | 'HONOR' | 'DEDUCTION' | 'LOAN' | 'PENSION' | 'BOS_HONOR';
  label: string;
  amount: number;
}
export interface PayrollItemView {
  id: string;
  employeeId: string;
  workedMinutes: number;
  requiredMinutes: number;
  basePay: number;
  transportPay: number;
  grossAmount: number;
  deductionAmount: number;
  netAmount: number;
  employee?: { name: string; nip?: string | null; type?: string; payScale?: { name: string } | null };
  lines?: PayrollLineView[];
}
export interface PayrollRunView {
  id: string;
  month: string;
  weeks: number;
  status: 'DRAFT' | 'FINALIZED' | 'PAID' | 'VOID';
  note?: string | null;
  academicYearId?: string | null;
  cashAccountId?: string | null;
  paidAt?: string | null;
  academicYear?: { name: string } | null;
  cashAccount?: { name: string } | null;
  items?: PayrollItemView[];
  totalNet?: number;
  _count?: { items: number };
}
export interface PensionSummaryRow {
  employee: { id: string; name: string; nip?: string | null };
  total: number;
}
export interface PensionLedger {
  employee: { id: string; name: string; nip?: string | null };
  entries: { id: string; month: string; amount: number; note?: string | null }[];
  total: number;
}

const py = '/admin/payroll';
export const listPayScales = () => req<PayScaleView[]>(`${py}/pay-scales`);
export const createPayScale = (dto: Record<string, unknown>) =>
  req<PayScaleView>(`${py}/pay-scales`, { method: 'POST', json: dto });
export const updatePayScale = (id: string, dto: Record<string, unknown>) =>
  req<PayScaleView>(`${py}/pay-scales/${id}`, { method: 'PATCH', json: dto });
export const deletePayScale = (id: string) =>
  req<{ deleted: boolean }>(`${py}/pay-scales/${id}`, { method: 'DELETE' });
export const listPayrollEmployees = () => req<EmployeePayroll[]>(`${py}/employees`);
export const updateEmployeePayrollSettings = (id: string, dto: Record<string, unknown>) =>
  req<EmployeePayroll>(`${py}/employees/${id}/settings`, { method: 'PATCH', json: dto });
export const listEmpAttendance = (month: string, employeeId?: string) => {
  const p = new URLSearchParams({ month });
  if (employeeId) p.set('employeeId', employeeId);
  return req<EmpAttendance[]>(`${py}/attendance?${p}`);
};
export const saveEmpAttendance = (dto: { date: string; entries: Record<string, unknown>[] }) =>
  req<{ saved: number }>(`${py}/attendance`, { method: 'POST', json: dto });
export const listHonorTypes = () => req<HonorTypeView[]>(`${py}/honor-types`);
export const createHonorType = (dto: Record<string, unknown>) =>
  req<HonorTypeView>(`${py}/honor-types`, { method: 'POST', json: dto });
export const updateHonorType = (id: string, dto: Record<string, unknown>) =>
  req<HonorTypeView>(`${py}/honor-types/${id}`, { method: 'PATCH', json: dto });
export const deleteHonorType = (id: string) =>
  req<{ deleted: boolean }>(`${py}/honor-types/${id}`, { method: 'DELETE' });
export const listEmployeeHonors = (employeeId?: string) =>
  req<EmployeeHonorView[]>(`${py}/employee-honors${employeeId ? `?employeeId=${employeeId}` : ''}`);
export const createEmployeeHonor = (dto: Record<string, unknown>) =>
  req<EmployeeHonorView>(`${py}/employee-honors`, { method: 'POST', json: dto });
export const updateEmployeeHonor = (id: string, dto: Record<string, unknown>) =>
  req<EmployeeHonorView>(`${py}/employee-honors/${id}`, { method: 'PATCH', json: dto });
export const deleteEmployeeHonor = (id: string) =>
  req<{ deleted: boolean }>(`${py}/employee-honors/${id}`, { method: 'DELETE' });
export const listDeductionTypes = () => req<DeductionTypeView[]>(`${py}/deduction-types`);
export const createDeductionType = (dto: Record<string, unknown>) =>
  req<DeductionTypeView>(`${py}/deduction-types`, { method: 'POST', json: dto });
export const updateDeductionType = (id: string, dto: Record<string, unknown>) =>
  req<DeductionTypeView>(`${py}/deduction-types/${id}`, { method: 'PATCH', json: dto });
export const listEmployeeDeductions = (employeeId?: string) =>
  req<EmployeeDeductionView[]>(`${py}/employee-deductions${employeeId ? `?employeeId=${employeeId}` : ''}`);
export const createEmployeeDeduction = (dto: Record<string, unknown>) =>
  req<EmployeeDeductionView>(`${py}/employee-deductions`, { method: 'POST', json: dto });
export const updateEmployeeDeduction = (id: string, dto: Record<string, unknown>) =>
  req<EmployeeDeductionView>(`${py}/employee-deductions/${id}`, { method: 'PATCH', json: dto });
export const deleteEmployeeDeduction = (id: string) =>
  req<{ deleted: boolean }>(`${py}/employee-deductions/${id}`, { method: 'DELETE' });
export const listLoans = (q: { employeeId?: string; status?: string }) =>
  req<LoanView[]>(`${py}/loans${qs({ employeeId: q.employeeId, status: q.status })}`);
export const createLoan = (dto: Record<string, unknown>) =>
  req<LoanView>(`${py}/loans`, { method: 'POST', json: dto });
export const updateLoan = (id: string, dto: Record<string, unknown>) =>
  req<LoanView>(`${py}/loans/${id}`, { method: 'PATCH', json: dto });
export const getPensionSummary = () => req<PensionSummaryRow[]>(`${py}/pension`);
export const getPensionLedger = (employeeId: string) =>
  req<PensionLedger>(`${py}/pension/${employeeId}`);
export const listBosHonors = (q: { month?: string; employeeId?: string }) =>
  req<BosHonorView[]>(`${py}/bos-honors${qs({ month: q.month, employeeId: q.employeeId })}`);
export const upsertBosHonor = (dto: Record<string, unknown>) =>
  req<BosHonorView>(`${py}/bos-honors`, { method: 'POST', json: dto });
export const deleteBosHonor = (id: string) =>
  req<{ deleted: boolean }>(`${py}/bos-honors/${id}`, { method: 'DELETE' });
export const listPayrollRuns = () => req<PayrollRunView[]>(`${py}/runs`);
export const getPayrollRun = (id: string) => req<PayrollRunView>(`${py}/runs/${id}`);
export const createPayrollRun = (dto: Record<string, unknown>) =>
  req<PayrollRunView>(`${py}/runs`, { method: 'POST', json: dto });
export const recomputePayrollRun = (id: string) =>
  req<PayrollRunView>(`${py}/runs/${id}/recompute`, { method: 'POST' });
export const finalizePayrollRun = (id: string) =>
  req<PayrollRunView>(`${py}/runs/${id}/finalize`, { method: 'POST' });
export const payPayrollRun = (id: string, cashAccountId: string) =>
  req<PayrollRunView>(`${py}/runs/${id}/pay`, { method: 'POST', json: { cashAccountId } });
export const voidPayrollRun = (id: string) =>
  req<{ voided: boolean }>(`${py}/runs/${id}/void`, { method: 'POST' });
export const deletePayrollRun = (id: string) =>
  req<{ deleted: boolean }>(`${py}/runs/${id}`, { method: 'DELETE' });

// ---- absen selfie (semua pegawai) ----
export interface MyAttendance {
  employee: { id: string; name: string; nip?: string | null };
  geo: { schoolLat: number | null; schoolLng: number | null; radiusM: number; configured: boolean };
  today: { status: string; checkInAt?: string | null; checkOutAt?: string | null; lateMinutes: number } | null;
  todayLogs: { id: string; punchedAt: string; inOut: number }[];
  rows: AttendanceDayRow[];
  shifts?: MyShift[];
}
export const getMyAttendance = (month?: string) =>
  req<MyAttendance>(`/admin/attendance/my${month ? `?month=${month}` : ''}`);
export interface MyShift {
  dayOfWeek: number; // -1 = tiap hari
  shift: { name: string; startMinute: number; endMinute: number; checkOutFrom: number; lateAfter: number };
}
export const selfiePunch = (inOut: 0 | 1, latitude: number, longitude: number, photo: Blob) => {
  const fd = new FormData();
  fd.set('inOut', String(inOut));
  fd.set('latitude', String(latitude));
  fd.set('longitude', String(longitude));
  fd.set('photo', photo, `selfie-${Date.now()}.jpg`);
  return req<{ punchedAt: string; inOut: number; distanceM: number; attendance: { status: string; checkInAt?: string | null; checkOutAt?: string | null; lateMinutes: number } | null }>(
    '/admin/attendance/selfie', { method: 'POST', body: fd });
};
export const attendanceLogPhotoUrl = (id: string) => `${API}/admin/attendance/logs/${id}/photo`;

// ---- bidang (kepala bidang) ----
export const getMyDepartment = () =>
  req<{ department: string | null; isHead: boolean; members: EmployeeDto[] }>('/employees/my-department');

// ---- keuangan: batch delete, kategori delete, kwitansi, laporan ----
export const deleteBillingBatch = (id: string) =>
  req<{ deleted: number }>(`/admin/finance/billing/batches/${id}/delete`, { method: 'POST' });
export const deleteFinanceCategory = (id: string) =>
  req<{ deleted: boolean }>(`/admin/finance/categories/${id}`, { method: 'DELETE' });
export interface ReceiptRow {
  id: string; number: string; refType?: string | null; refId?: string | null;
  channel: string; recipient: string; body: string; status: string;
  sentAt?: string | null; createdAt: string;
  payment?: { amount: number; method?: string | null; paidAt?: string | null; invoice?: { number: string; title: string } | null } | null;
}
export const issueReceipt = (refType: 'payment' | 'expense' | 'transaction', refId: string) =>
  req<{ receipt: ReceiptRow; fresh: boolean }>('/admin/finance/receipts', { method: 'POST', json: { refType, refId } });
export const listReceipts = (q: { refType?: string; search?: string } = {}) => {
  const p = new URLSearchParams();
  if (q.refType) p.set('refType', q.refType);
  if (q.search) p.set('search', q.search);
  return req<ReceiptRow[]>(`/admin/finance/receipts?${p}`);
};
export interface IncomeStudentRow {
  student: { id: string; name: string; nisn?: string | null };
  className?: string | null;
  total: number;
  months: Record<string, Record<string, number>>;
}
export const incomeByStudent = (q: { from: string; to: string; classId?: string; search?: string }) => {
  const p = new URLSearchParams({ from: q.from, to: q.to });
  if (q.classId) p.set('classId', q.classId);
  if (q.search) p.set('search', q.search);
  return req<{ months: string[]; kinds: string[]; rows: IncomeStudentRow[] }>(
    `/admin/finance/reports/income-by-student?${p}`);
};
export const savingsReport = (q: { from: string; to: string; studentId?: string; classId?: string }) => {
  const p = new URLSearchParams({ from: q.from, to: q.to });
  if (q.studentId) p.set('studentId', q.studentId);
  if (q.classId) p.set('classId', q.classId);
  return req<{ student: { id: string; name: string }; days: { date: string; in: number; out: number }[]; months: { month: string; in: number; out: number }[] }[]>(
    `/admin/finance/reports/savings?${p}`);
};

// ---- kepegawaian: update, import, export SPMB ----
export const updateEmployee = (id: string, dto: Record<string, unknown>) =>
  req<EmployeeDto>(`/employees/${id}`, { method: 'PATCH', json: dto });
export interface EmployeeImportPreviewRow {
  row: number; name: string; nip: string | null; email: string | null;
  phone: string | null; department: string | null;
  type?: string | null; staffKind?: string | null; additionalDuty?: string | null;
  action: 'BARU' | 'UPDATE' | 'LEWATI'; error?: string;
}
export interface EmployeeImportResult {
  created: number; updated: number; skipped: number;
  errors: { row: number; name: string; error: string }[];
  accounts: { name: string; login: string; password: string }[];
}
export const importEmployees = (file: File, opts: { dry?: boolean; accounts?: boolean } = {}) => {
  const fd = new FormData();
  fd.set('file', file);
  const q = new URLSearchParams();
  if (opts.dry) q.set('dry', '1');
  if (opts.accounts) q.set('accounts', '1');
  const s = q.toString();
  return req<EmployeeImportResult & { preview?: EmployeeImportPreviewRow[]; total?: number }>(
    `/employees/import${s ? `?${s}` : ''}`, { method: 'POST', body: fd });
};
export const previewEmployeeImport = (file: File) => importEmployees(file, { dry: true });
export const deleteEmployee = (id: string) =>
  req<{ deleted: boolean; deactivated?: boolean; reason?: string }>(`/employees/${id}`, { method: 'DELETE' });
export const downloadEmployeeTemplate = () =>
  downloadFile('/employees/import-template', 'template-pegawai.xlsx');
export const exportTitipanXlsx = (q: { academicYearId?: string; waveId?: string }) => {
  const p = new URLSearchParams();
  if (q.academicYearId) p.set('academicYearId', q.academicYearId);
  if (q.waveId) p.set('waveId', q.waveId);
  const s = p.toString();
  return downloadFile(`/admin/titipan/export.xlsx${s ? `?${s}` : ''}`, 'titipan-spmb.xlsx');
};
export const exportParentsXlsx = (q: { academicYearId?: string; waveId?: string }) => {
  const p = new URLSearchParams();
  if (q.academicYearId) p.set('academicYearId', q.academicYearId);
  if (q.waveId) p.set('waveId', q.waveId);
  const s = p.toString();
  return downloadFile(`/admin/parents/export.xlsx${s ? `?${s}` : ''}`, 'akun-orang-tua.xlsx');
};

