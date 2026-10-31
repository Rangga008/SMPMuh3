/**
 * Canonical permission keys. The API seeds these into the `permissions`
 * table; guards check them on incoming requests. Frontends use the same
 * constants for conditional UI. Never hard-code role names — check
 * permissions instead.
 *
 * Convention: `<domain>.<entity-or-area>.<action>`
 */
export const PERMISSIONS = {
  IDENTITY_USER_READ: 'identity.user.read',
  IDENTITY_USER_MANAGE: 'identity.user.manage',
  IDENTITY_ROLE_READ: 'identity.role.read',
  IDENTITY_ROLE_MANAGE: 'identity.role.manage',
  SCHOOL_READ: 'school.school.read',
  SCHOOL_MANAGE: 'school.school.manage',
  ACADEMIC_YEAR_READ: 'school.academic-year.read',
  ACADEMIC_YEAR_MANAGE: 'school.academic-year.manage',
  AUDIT_READ: 'audit.read',
  SPMB_REGISTRATION_READ: 'spmb.registration.read',
  SPMB_REGISTRATION_MANAGE: 'spmb.registration.manage',
  NOTIFICATION_READ: 'notification.read',
  STUDENT_READ: 'student.read',
  STUDENT_MANAGE: 'student.manage',
  EMPLOYEE_READ: 'employee.read',
  EMPLOYEE_MANAGE: 'employee.manage',
  ACADEMIC_READ: 'academic.read',
  ACADEMIC_MANAGE: 'academic.manage',
  ATTENDANCE_READ: 'attendance.read',
  ATTENDANCE_MANAGE: 'attendance.manage',
  FINANCE_READ: 'finance.read',
  FINANCE_MANAGE: 'finance.manage',
  TATAUSAHA_READ: 'tatausaha.read',
  TATAUSAHA_MANAGE: 'tatausaha.manage',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSION_KEYS: readonly string[] = Object.values(PERMISSIONS);
