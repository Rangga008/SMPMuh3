/** School domain contracts — students, employees, academics. */
import type { Gender } from './spmb';

export const STUDENT_STATUSES = [
  'ACTIVE',
  'GRADUATED',
  'TRANSFERRED',
  'DROPPED',
] as const;
export type StudentStatus = (typeof STUDENT_STATUSES)[number];

export const STUDENT_STATUS_LABELS: Record<StudentStatus, string> = {
  ACTIVE: 'Aktif',
  GRADUATED: 'Lulus',
  TRANSFERRED: 'Pindah',
  DROPPED: 'Keluar',
};

export const EMPLOYEE_TYPES = [
  'TEACHER',
  'TENDIK',
  'STAFF',
  'TU',
  'KESISWAAN',
  'KURIKULUM',
  'KEUANGAN',
  'SARPRAS',
  'LAYSUS',
  'PRINCIPAL',
] as const;
export type EmployeeType = (typeof EMPLOYEE_TYPES)[number];

export const EMPLOYEE_TYPE_LABELS: Record<EmployeeType, string> = {
  TEACHER: 'Guru',
  TENDIK: 'Tendik',
  STAFF: 'Tendik',
  TU: 'Tendik · TU',
  KESISWAAN: 'Kesiswaan',
  KURIKULUM: 'Kurikulum',
  KEUANGAN: 'Tendik · TU',
  SARPRAS: 'Sarpras',
  LAYSUS: 'Tendik · Laysus',
  PRINCIPAL: 'Kepala Sekolah',
};

// ---------- Model GTK ala Dapodik ----------
/** Jenis pokok — Guru atau Tenaga Kependidikan. */
export const GTK_TYPES = ['TEACHER', 'TENDIK'] as const;
export type GtkType = (typeof GTK_TYPES)[number];
export const GTK_TYPE_LABELS: Record<GtkType, string> = {
  TEACHER: 'Guru',
  TENDIK: 'Tendik',
};

/** Jabatan pokok tendik (staffKind). */
export const STAFF_KINDS = [
  'TU',
  'LAYSUS',
  'SATPAM',
  'KEPALA_SEKOLAH',
] as const;
export type StaffKind = (typeof STAFF_KINDS)[number];
export const STAFF_KIND_LABELS: Record<StaffKind, string> = {
  TU: 'Tata Usaha (TU)',
  LAYSUS: 'Layanan Khusus (Laysus)',
  SATPAM: 'Satpam / Keamanan',
  KEPALA_SEKOLAH: 'Kepala Sekolah',
};

/** Tugas tambahan — untuk guru maupun tendik. */
export const ADDITIONAL_DUTIES = [
  'WAKASEK_KURIKULUM',
  'WAKASEK_KESISWAAN',
  'WAKASEK_SARPRAS',
  'KEPALA_TU',
  'BENDAHARA_SEKOLAH',
  'BENDAHARA_BOS',
  'BENDAHARA_RMP',
  'OPERATOR_DAPODIK',
  'KONTEN_KREATOR',
  'KEPALA_PERPUSTAKAAN',
  'STAF_PERPUSTAKAAN',
  'PETUGAS_KEBERSIHAN_L1',
  'PETUGAS_KEBERSIHAN_L2',
  'PETUGAS_KEBERSIHAN_L3',
  'PETUGAS_KEBERSIHAN_L4',
  'SATPAM',
] as const;
export type AdditionalDuty = (typeof ADDITIONAL_DUTIES)[number];
export const ADDITIONAL_DUTY_LABELS: Record<AdditionalDuty, string> = {
  WAKASEK_KURIKULUM: 'Wakasek Kurikulum',
  WAKASEK_KESISWAAN: 'Wakasek Kesiswaan',
  WAKASEK_SARPRAS: 'Wakasek Sarpras',
  KEPALA_TU: 'Kepala Tata Usaha',
  BENDAHARA_SEKOLAH: 'Bendahara Sekolah',
  BENDAHARA_BOS: 'Bendahara BOS',
  BENDAHARA_RMP: 'Bendahara RMP',
  OPERATOR_DAPODIK: 'Operator Dapodik',
  KONTEN_KREATOR: 'Konten Kreator',
  KEPALA_PERPUSTAKAAN: 'Kepala Perpustakaan',
  STAF_PERPUSTAKAAN: 'Staf Perpustakaan',
  PETUGAS_KEBERSIHAN_L1: 'Petugas Kebersihan Lantai 1',
  PETUGAS_KEBERSIHAN_L2: 'Petugas Kebersihan Lantai 2',
  PETUGAS_KEBERSIHAN_L3: 'Petugas Kebersihan Lantai 3',
  PETUGAS_KEBERSIHAN_L4: 'Petugas Kebersihan Lantai 4',
  SATPAM: 'Satpam',
};

/** Kelompok GTK — nilai type lama dipetakan ke Guru/Tendik untuk tampilan. */
export const GTK_GROUP: Record<string, GtkType> = {
  TEACHER: 'TEACHER',
  KURIKULUM: 'TEACHER',
  KESISWAAN: 'TEACHER',
  TENDIK: 'TENDIK',
  TU: 'TENDIK',
  STAFF: 'TENDIK',
  KEUANGAN: 'TENDIK',
  SARPRAS: 'TENDIK',
  LAYSUS: 'TENDIK',
  PRINCIPAL: 'TENDIK',
};

export const ATTENDANCE_STATUSES = [
  'PRESENT',
  'SICK',
  'PERMITTED',
  'ABSENT',
] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  PRESENT: 'Hadir',
  SICK: 'Sakit',
  PERMITTED: 'Izin',
  ABSENT: 'Alpha',
};

export interface StudentDto {
  id: string;
  nis?: string | undefined;
  nisn?: string | undefined;
  name: string;
  gender?: Gender | undefined;
  birthPlace?: string | undefined;
  birthDate?: string | undefined;
  address?: string | undefined;
  status: StudentStatus;
  candidateId?: string | undefined;
  parentId?: string | undefined;
  createdAt: string;
}
