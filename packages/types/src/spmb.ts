/** SPMB (admission) domain contracts shared by API and frontends. */

export const REGISTRATION_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'DOCUMENT_REVIEW',
  'NEEDS_REVISION',
  'VERIFIED',
  'SELECTION',
  'ACCEPTED',
  'REJECTED',
  'RE_REGISTRATION',
  'COMPLETED',
] as const;

export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

/** id_ID labels for each status. */
export const REGISTRATION_STATUS_LABELS: Record<RegistrationStatus, string> = {
  DRAFT: 'Draf',
  SUBMITTED: 'Terkirim',
  DOCUMENT_REVIEW: 'Review Dokumen',
  NEEDS_REVISION: 'Perlu Perbaikan',
  VERIFIED: 'Terverifikasi',
  SELECTION: 'Seleksi',
  ACCEPTED: 'Diterima',
  REJECTED: 'Ditolak',
  RE_REGISTRATION: 'Daftar Ulang',
  COMPLETED: 'Selesai',
};

/** Statuses where the applicant may still edit data/documents. */
export const REGISTRATION_EDITABLE: readonly RegistrationStatus[] = [
  'DRAFT',
  'NEEDS_REVISION',
];

export type Gender = 'MALE' | 'FEMALE';

export interface CandidateDto {
  id: string;
  name: string;
  gender?: Gender | undefined;
  birthPlace?: string | undefined;
  birthDate?: string | undefined;
  nisn?: string | undefined;
  previousSchool?: string | undefined;
  address?: string | undefined;
}

export interface RegistrationDto {
  id: string;
  number: string;
  status: RegistrationStatus;
  pathway: string;
  academicYearId: string;
  candidate: CandidateDto;
  submittedAt?: string | undefined;
  revisionNote?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentDto {
  id: string;
  type: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface NotificationDto {
  id: string;
  title: string;
  body: string;
  readAt?: string | undefined;
  createdAt: string;
}
