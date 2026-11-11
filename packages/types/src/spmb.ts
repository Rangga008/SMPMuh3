/** SPMB (admission) domain contracts shared by API and frontends. */

export const REGISTRATION_STATUSES = [
  'DRAFT',
  'AWAITING_PAYMENT',
  'PAYMENT_REVIEW',
  'FORM_FILLING',
  'SUBMITTED',
  'DOCUMENT_REVIEW',
  'NEEDS_REVISION',
  'VERIFIED',
  'AWAITING_FINAL_PAYMENT',
  'FINAL_PAYMENT_REVIEW',
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
  AWAITING_PAYMENT: 'Menunggu Pembayaran',
  PAYMENT_REVIEW: 'Verifikasi Pembayaran',
  FORM_FILLING: 'Mengisi Formulir',
  SUBMITTED: 'Terkirim',
  DOCUMENT_REVIEW: 'Review Berkas',
  NEEDS_REVISION: 'Perlu Perbaikan',
  VERIFIED: 'Berkas Terverifikasi',
  AWAITING_FINAL_PAYMENT: 'Menunggu Pembayaran DSP',
  FINAL_PAYMENT_REVIEW: 'Verifikasi Pembayaran DSP',
  SELECTION: 'Psikotes',
  ACCEPTED: 'Diterima',
  REJECTED: 'Tidak Diterima',
  RE_REGISTRATION: 'Daftar Ulang',
  COMPLETED: 'Selesai',
};

/** Statuses where the applicant may still edit data/documents. */
export const REGISTRATION_EDITABLE: readonly RegistrationStatus[] = [
  'DRAFT',
  'FORM_FILLING',
  'NEEDS_REVISION',
];

// ---------- Jalur pendaftaran ----------

export const PATHWAYS = ['reguler', 'afirmasi', 'prestasi'] as const;
export type Pathway = (typeof PATHWAYS)[number];

export const PATHWAY_LABELS: Record<Pathway, string> = {
  reguler: 'Jalur Reguler',
  afirmasi: 'Jalur Afirmasi',
  prestasi: 'Jalur Prestasi',
};

/** Sub-jalur untuk jalur prestasi. */
export const PRESTASI_SUBTYPES = [
  'akademik',
  'tahfidz_2',
  'tahfidz_3plus',
  'non_akademik',
  'alumni_sdm',
] as const;
export type PrestasiSubtype = (typeof PRESTASI_SUBTYPES)[number];

export const PRESTASI_SUBTYPE_LABELS: Record<PrestasiSubtype, string> = {
  akademik: 'Prestasi Akademik (nilai rapor)',
  tahfidz_2: 'Tahfidz 2 Juz',
  tahfidz_3plus: 'Tahfidz 3 Juz atau Lebih',
  non_akademik: 'Kejuaraan / Lomba Lainnya',
  alumni_sdm: 'Alumni SD Muhammadiyah Kota Bandung',
};

/** Grup jalur prestasi untuk UI — tahfidz berada di dalam non-akademik. */
export const PRESTASI_GROUPS = [
  {
    key: 'akademik',
    label: 'Prestasi Akademik (nilai rapor)',
    subTypes: ['akademik'] as PrestasiSubtype[],
  },
  {
    key: 'non_akademik',
    label: 'Prestasi Non-Akademik',
    subTypes: ['tahfidz_2', 'tahfidz_3plus', 'non_akademik'] as PrestasiSubtype[],
  },
  {
    key: 'alumni_sdm',
    label: 'Alumni SD Muhammadiyah Kota Bandung',
    subTypes: ['alumni_sdm'] as PrestasiSubtype[],
  },
] as const;

/** Cari grup dari subtype tersimpan. */
export function prestasiGroupOf(subType?: string | null): string {
  if (!subType) return '';
  return PRESTASI_GROUPS.find((g) => g.subTypes.includes(subType as PrestasiSubtype))?.key ?? '';
}

// ---------- Dokumen ----------

export const REGISTRATION_DOC_TYPES = [
  'form',
  'kk',
  'akta',
  'ijazah',
  'sk_sekolah',
  'ktp_ortu',
  'surat_pernyataan',
  'sertifikat',
  'nilai_tka',
  'foto',
  'bukti_bayar',
  'lainnya',
] as const;
export type RegistrationDocType = (typeof REGISTRATION_DOC_TYPES)[number];

export const DOC_TYPE_LABELS: Record<RegistrationDocType, string> = {
  form: 'Formulir Pendaftaran',
  kk: 'Kartu Keluarga',
  akta: 'Akta Kelahiran',
  ijazah: 'Ijazah / SK Lulus',
  sk_sekolah: 'SK Pernah Sekolah',
  ktp_ortu: 'Fotokopi KTP Orang Tua',
  surat_pernyataan: 'Surat Pernyataan',
  sertifikat: 'Sertifikat / Bukti Prestasi',
  nilai_tka: 'Nilai TKA (Opsional)',
  foto: 'Pas Foto',
  bukti_bayar: 'Bukti Pembayaran',
  lainnya: 'Dokumen Lainnya',
};

/** Dokumen wajib saat submit (ijazah ATAU sk_sekolah memenuhi syarat). */
export const REQUIRED_DOC_TYPES: readonly RegistrationDocType[] = [
  'kk',
  'akta',
  'ktp_ortu',
  'surat_pernyataan',
];

// ---------- Daftar titipan / waiting list ----------

export const TITIPAN_STATUSES = [
  'PENDING',
  'WAITING',
  'CODE_SENT',
  'REGISTERED',
  'CANCELLED',
] as const;
export type TitipanStatus = (typeof TITIPAN_STATUSES)[number];

export const TITIPAN_STATUS_LABELS: Record<TitipanStatus, string> = {
  PENDING: 'Menunggu Verifikasi',
  WAITING: 'Dalam Antrean',
  CODE_SENT: 'Kode Terkirim',
  REGISTERED: 'Sudah Daftar',
  CANCELLED: 'Batal',
};

/** Status yang masih menempati antrean (belum batal/terdaftar). */
export const TITIPAN_ACTIVE_STATUSES: readonly TitipanStatus[] = [
  'WAITING',
  'CODE_SENT',
];

/** Sumber informasi pendaftar — pilihan pada form titipan. */
export const INFO_SOURCES = [
  'google',
  'instagram',
  'tiktok',
  'facebook',
  'website',
  'spanduk',
  'saudara',
  'tetangga',
  'teman_kerja',
  'guru_karyawan',
  'alumni',
  'open_house',
  'lainnya',
] as const;
export type InfoSource = (typeof INFO_SOURCES)[number];

export const INFO_SOURCE_LABELS: Record<InfoSource, string> = {
  google: 'Google',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  website: 'Website Sekolah',
  spanduk: 'Spanduk',
  saudara: 'Saudara',
  tetangga: 'Tetangga',
  teman_kerja: 'Teman Kerja',
  guru_karyawan: 'Guru/Karyawan Sekolah',
  alumni: 'Alumni',
  open_house: 'Open House Sekolah',
  lainnya: 'Lainnya',
};

export interface TitipanEntryDto {
  id: string;
  academicYearId: string;
  academicYearName?: string | undefined;
  /** Gelombang tujuan titipan — opsional, di-assign admin. */
  waveId?: string | null | undefined;
  waveName?: string | null | undefined;
  candidateId?: string | null | undefined;
  candidateName: string;
  birthPlace?: string | null | undefined;
  birthDate?: string | null | undefined;
  address?: string | null | undefined;
  previousSchool?: string | null | undefined;
  /** Satu nomor HP orang tua/wali — hanya tampil di view admin/pemilik. */
  guardianPhone?: string | null | undefined;
  infoSource?: string | null | undefined;
  queueNo: number;
  /** Posisi antrean aktif (1 = paling depan) — null bila bukan antrean aktif. */
  position?: number | null | undefined;
  status: TitipanStatus;
  /** Kode formulir hanya dikirim ke pemilik/admin, tidak ke publik. */
  formCode?: string | null | undefined;
  codeSentAt?: string | null | undefined;
  codeUsedAt?: string | null | undefined;
  note?: string | null | undefined;
  /** Info akun ortu — hanya view admin. */
  parentName?: string | null | undefined;
  parentEmail?: string | null | undefined;
  parentPhone?: string | null | undefined;
  createdAt: string;
}

/** Ringkasan titipan per tahun ajaran untuk papan publik & admin. */
export interface TitipanYearSummaryDto {
  academicYearId: string;
  name: string;
  quota?: number | null | undefined;
  /** Pendaftaran resmi yang menempati kuota. */
  occupied?: number | undefined;
  waitingCount: number;
  codeSentCount: number;
  registeredCount: number;
}

// ---------- Biaya ----------

export const FEE_KEYS = ['registration', 'dsp', 'spp', 'seragam'] as const;
export type FeeKey = (typeof FEE_KEYS)[number];

export const FEE_LABELS: Record<FeeKey, string> = {
  registration: 'Uang Pendaftaran',
  dsp: 'DSP (Dana Sumbangan Pendidikan)',
  spp: 'SPP Bulanan',
  seragam: 'Seragam',
};

export const PAYMENT_METHODS = ['transfer', 'cash'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  transfer: 'Transfer Bank',
  cash: 'Tunai di Sekolah',
};

// ---------- DTO ----------

export type Gender = 'MALE' | 'FEMALE';

export interface CandidateDto {
  id: string;
  name: string;
  gender?: Gender | undefined;
  birthPlace?: string | undefined;
  birthDate?: string | undefined;
  nisn?: string | undefined;
  /** NIK calon murid — ikut ke data siswa saat diterima. */
  nik?: string | undefined;
  previousSchool?: string | undefined;
  address?: string | undefined;
  tkaScore?: number | undefined;
  /** Terisi bila kandidat sudah dijadikan murid (promote). */
  student?: { id: string; name: string; nis?: string | null } | undefined;
}

export interface WaveDto {
  id: string;
  academicYearId?: string | undefined;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  order: number;
  psikotesAt?: string | undefined;
  psikotesNote?: string | undefined;
}

export interface RegistrationDto {
  id: string;
  number: string;
  status: RegistrationStatus;
  pathway: string;
  pathwayDetail?: string | undefined;
  academicYearId: string;
  waveId?: string | undefined;
  wave?: WaveDto | undefined;
  discountPercent: number;
  decisionNote?: string | undefined;
  psikotesAt?: string | undefined;
  psikotesNote?: string | undefined;
  formAnswers?: Record<string, string> | undefined;
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

export interface FeeDto {
  id: string;
  key: FeeKey;
  label: string;
  amount: number;
  isActive: boolean;
}

export interface DiscountRuleDto {
  id: string;
  subType: string;
  label: string;
  percent: number;
  minScore?: number | undefined;
  isActive: boolean;
}

export type FormFieldType =
  | 'text'
  | 'textarea'
  | 'date'
  | 'number'
  | 'select';

export interface FormQuestionDto {
  id: string;
  label: string;
  helpText?: string | undefined;
  fieldType: FormFieldType;
  options?: string[] | undefined;
  required: boolean;
  order: number;
  isActive: boolean;
}

export interface InvoiceDto {
  id: string;
  number: string;
  title: string;
  kind: string;
  amount: number;
  baseAmount?: number | undefined;
  discountPercent: number;
  status: 'OPEN' | 'PAID' | 'EXPIRED' | 'CANCELLED';
  installmentNo?: number | undefined;
  dueAt?: string | undefined;
  paidAt?: string | undefined;
  note?: string | undefined;
  createdAt: string;
  payments?: PaymentDto[] | undefined;
}

export interface PaymentDto {
  id: string;
  method?: string | undefined;
  amount: number;
  status: 'PENDING' | 'SETTLED' | 'FAILED' | 'EXPIRED' | 'REFUNDED';
  proofDocumentId?: string | undefined;
  paidAt?: string | undefined;
  createdAt: string;
}

/** Hasil cek status publik — by nomor pendaftaran + email/no HP. */
export interface StatusLookupResult {
  number: string;
  status: RegistrationStatus;
  statusLabel: string;
  wave?: string | undefined;
  pathway?: string | undefined;
  candidateName?: string | undefined;
  submittedAt?: string | undefined;
  psikotesAt?: string | undefined;
  psikotesNote?: string | undefined;
  note?: string | undefined;
  updatedAt: string;
}

export interface NotificationDto {
  id: string;
  title: string;
  body: string;
  readAt?: string | undefined;
  createdAt: string;
}

// ---------- WhatsApp gateway & antrean ----------

export const WA_MESSAGE_STATUSES = [
  'QUEUED',
  'SENDING',
  'SENT',
  'FAILED',
  'CANCELLED',
] as const;
export type WaMessageStatus = (typeof WA_MESSAGE_STATUSES)[number];

export const WA_MESSAGE_STATUS_LABELS: Record<WaMessageStatus, string> = {
  QUEUED: 'Mengantre',
  SENDING: 'Mengirim…',
  SENT: 'Terkirim',
  FAILED: 'Gagal',
  CANCELLED: 'Dibatalkan',
};

/** Tipe antrean WA — dipakai sebagai filter & audit. */
export const WA_MESSAGE_TYPES = [
  'titipan_code',
  'payment_reminder',
  'announcement',
  'other',
] as const;
export type WaMessageType = (typeof WA_MESSAGE_TYPES)[number];

export const WA_MESSAGE_TYPE_LABELS: Record<string, string> = {
  titipan_code: 'Kode Formulir Titipan',
  payment_reminder: 'Pengingat Pembayaran',
  announcement: 'Pengumuman',
  other: 'Lainnya',
};

export interface WhatsappMessageDto {
  id: string;
  type: string;
  phone: string;
  message: string;
  status: WaMessageStatus;
  attempts: number;
  lastError?: string | null | undefined;
  sentAt?: string | null | undefined;
  refType?: string | null | undefined;
  refId?: string | null | undefined;
  /** Tautan wa.me siap klik — jalur manual bila gateway nonaktif. */
  waUrl: string;
  createdAt: string;
}

export interface WaMessagesResponse {
  messages: WhatsappMessageDto[];
  counts: Partial<Record<WaMessageStatus, number>>;
  /** Tipe antrean yang pernah dipakai — untuk opsi filter. */
  types: string[];
}

export interface WhatsappSettingsDto {
  enabled: boolean;
  gatewayUrl: string;
  hasToken: boolean;
  /** Token tidak pernah dikembalikan penuh — hanya 4 digit terakhir. */
  tokenPreview?: string | null | undefined;
  /** Jeda minimal antar pesan (detik) — anti-spam. */
  intervalSeconds: number;
  /** Batas pesan terkirim per hari. */
  dailyLimit: number;
  source: 'db' | 'env';
}
