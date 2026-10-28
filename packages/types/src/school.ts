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

export const EMPLOYEE_TYPES = ['TEACHER', 'STAFF'] as const;
export type EmployeeType = (typeof EMPLOYEE_TYPES)[number];

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
