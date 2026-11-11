import { PERMISSIONS } from '@smpmuh3/types';

/**
 * Modular navigation model — each item may carry a required permission,
 * a route, submenu children, and a feature `enabled` flag. New modules
 * plug in by appending entries; the sidebar renders them generically.
 */
export interface NavItem {
  key: string;
  label: string;
  icon: string; // emoji glyph — swap for an icon system later
  href?: string;
  permission?: string;
  /** Hanya tampil bila user punya salah satu role ini (menu bidang). */
  roles?: string[];
  /** Sembunyikan bila user punya salah satu role ini (versi ringkas item). */
  hideRoles?: string[];
  enabled: boolean;
  children?: NavItem[];
}

/** Role pengelola tiap bidang — admin & kepsek melihat semua. */
const ADM = ['superadmin', 'ops_admin', 'kepala_sekolah'];
const KESISWAAN_ROLES = [...ADM, 'staff_kesiswaan'];
const TU_ROLES = [...ADM, 'kepala_tu', 'staff_tu'];
const KEUANGAN_ROLES = [...ADM, 'bendahara'];
const KEPEGAWAIAN_ROLES = [...ADM, 'kepala_tu', 'staff_tu'];
const SPMB_ROLES = [...ADM, 'spmb_admin'];
const LAYSUS_ROLES = [...ADM, 'staff_laysus'];

export const NAV: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: '⌂', href: '/', enabled: true },
  {
    key: 'absen-saya',
    label: 'Absen Saya',
    icon: '📸',
    href: '/absen',
    enabled: true,
  },
  {
    key: 'absen-kelas',
    label: 'Absen Kelas',
    icon: '✅',
    href: '/absen-kelas',
    enabled: true,
  },
  {
    key: 'pengajuan',
    label: 'Pengajuan',
    icon: '📮',
    href: '/pengajuan',
    enabled: true,
  },
  {
    key: 'bidang-saya',
    label: 'Bidang Saya',
    icon: '👥',
    href: '/bidang',
    enabled: true,
  },
  {
    key: 'kalender',
    label: 'Kalender Akademik',
    icon: '📅',
    href: '/kalender',
    enabled: true,
  },
  {
    key: 'gtk',
    label: 'GTK',
    icon: '👤',
    permission: PERMISSIONS.EMPLOYEE_READ,
    roles: KEPEGAWAIAN_ROLES,
    enabled: true,
    children: [
      {
        key: 'gtk-guru',
        label: 'Guru',
        icon: '•',
        href: '/kepegawaian/guru',
        permission: PERMISSIONS.EMPLOYEE_READ,
        enabled: true,
      },
      {
        key: 'gtk-tendik',
        label: 'Tendik',
        icon: '•',
        href: '/kepegawaian/tendik',
        permission: PERMISSIONS.EMPLOYEE_READ,
        enabled: true,
      },
    ],
  },
  {
    key: 'kurikulum',
    label: 'Kurikulum',
    icon: '📚',
    permission: PERMISSIONS.ACADEMIC_READ,
    enabled: true,
    children: [
      {
        key: 'mapel-kelas',
        label: 'Rombel / Kelas',
        icon: '•',
        href: '/kurikulum',
        permission: PERMISSIONS.ACADEMIC_READ,
        enabled: true,
      },
      {
        key: 'jadwal',
        label: 'Penugasan Guru & Entri Jadwal',
        icon: '•',
        href: '/kurikulum/jadwal',
        permission: PERMISSIONS.ACADEMIC_READ,
        enabled: true,
      },
      {
        key: 'jadwal-kelas',
        label: 'Jadwal Kelas, Blok & Cetak',
        icon: '•',
        href: '/kurikulum/jadwal-kelas',
        permission: PERMISSIONS.ACADEMIC_READ,
        enabled: true,
      },
      {
        key: 'penilaian',
        label: 'Penilaian',
        icon: '•',
        href: '/kurikulum/penilaian',
        permission: PERMISSIONS.ACADEMIC_READ,
        enabled: true,
      },
      {
        key: 'ledger',
        label: 'Ledger & Rekap',
        icon: '•',
        href: '/kurikulum/ledger',
        permission: PERMISSIONS.ACADEMIC_READ,
        enabled: true,
      },
      {
        key: 'dokumen',
        label: 'Dokumen & Pengumpulan',
        icon: '•',
        href: '/kurikulum/dokumen',
        permission: PERMISSIONS.ACADEMIC_READ,
        enabled: true,
      },
      {
        key: 'jadwal-kerja',
        label: 'Jadwal Kerja & Shift',
        icon: '•',
        href: '/kurikulum/jadwal-kerja',
        permission: PERMISSIONS.ACADEMIC_READ,
        enabled: true,
      },
    ],
  },
  {
    key: 'data-siswa',
    label: 'Data Siswa',
    icon: '🎓',
    href: '/kesiswaan',
    permission: PERMISSIONS.STUDENT_READ,
    hideRoles: KESISWAAN_ROLES,
    enabled: true,
  },
  {
    key: 'kesiswaan',
    label: 'Kesiswaan',
    icon: '🎓',
    permission: PERMISSIONS.STUDENT_READ,
    roles: KESISWAAN_ROLES,
    enabled: true,
    children: [
      {
        key: 'siswa',
        label: 'Data Siswa',
        icon: '•',
        href: '/kesiswaan',
        permission: PERMISSIONS.STUDENT_READ,
        enabled: true,
      },
      {
        key: 'absensi',
        label: 'Absensi',
        icon: '•',
        href: '/kesiswaan/absensi',
        permission: PERMISSIONS.ATTENDANCE_READ,
        enabled: true,
      },
      {
        key: 'prestasi',
        label: 'Prestasi',
        icon: '•',
        href: '/kesiswaan/prestasi',
        permission: PERMISSIONS.STUDENT_READ,
        enabled: true,
      },
      {
        key: 'ekskul',
        label: 'Ekstrakurikuler',
        icon: '•',
        href: '/kesiswaan/ekskul',
        permission: PERMISSIONS.STUDENT_READ,
        enabled: true,
      },
    ],
  },
  {
    key: 'tata-usaha',
    label: 'Tata Usaha',
    icon: '📁',
    roles: TU_ROLES,
    enabled: true,
    children: [
      {
        key: 'tu-absensi',
        label: 'Absensi Pegawai',
        icon: '•',
        href: '/tata-usaha/absensi',
        permission: PERMISSIONS.TATAUSAHA_READ,
        enabled: true,
      },
      {
        key: 'surat',
        label: 'Surat Menyurat',
        icon: '•',
        href: '/tata-usaha/surat',
        permission: PERMISSIONS.TATAUSAHA_READ,
        enabled: true,
      },
      {
        key: 'mutasi',
        label: 'Mutasi Siswa',
        icon: '•',
        href: '/tata-usaha/mutasi',
        permission: PERMISSIONS.TATAUSAHA_READ,
        enabled: true,
      },
      {
        key: 'us',
        label: 'US 1 & 2',
        icon: '•',
        href: '/tata-usaha/us',
        permission: PERMISSIONS.TATAUSAHA_READ,
        enabled: true,
      },
      {
        key: 'ujian',
        label: 'Ruang & Kartu Ujian',
        icon: '•',
        href: '/tata-usaha/ujian',
        permission: PERMISSIONS.TATAUSAHA_READ,
        enabled: true,
      },
      {
        key: 'arsip',
        label: 'Arsip',
        icon: '•',
        href: '/tata-usaha/arsip',
        permission: PERMISSIONS.TATAUSAHA_READ,
        enabled: true,
      },
    ],
  },
  {
    key: 'laysus',
    label: 'Laysus',
    icon: '🧹',
    roles: LAYSUS_ROLES,
    enabled: true,
    children: [
      {
        key: 'laysus-absensi',
        label: 'Absensi Pegawai',
        icon: '•',
        href: '/tata-usaha/absensi',
        permission: PERMISSIONS.TATAUSAHA_READ,
        enabled: true,
      },
      {
        key: 'laysus-jadwal',
        label: 'Jadwal Kerja & Shift',
        icon: '•',
        href: '/kurikulum/jadwal-kerja',
        permission: PERMISSIONS.ACADEMIC_READ,
        enabled: true,
      },
      {
        key: 'laysus-gtk',
        label: 'GTK',
        icon: '•',
        href: '/kepegawaian/tendik',
        permission: PERMISSIONS.EMPLOYEE_READ,
        enabled: true,
      },
    ],
  },
  {
    key: 'spmb',
    label: 'SPMB',
    icon: '📋',
    permission: PERMISSIONS.SPMB_REGISTRATION_READ,
    roles: SPMB_ROLES,
    children: [
      {
        key: 'spmb-pendaftar',
        label: 'Pendaftar',
        icon: '•',
        href: '/spmb',
        permission: PERMISSIONS.SPMB_REGISTRATION_READ,
        enabled: true,
      },
      {
        key: 'spmb-titipan',
        label: 'Titipan',
        icon: '•',
        href: '/spmb/titipan',
        permission: PERMISSIONS.SPMB_TITIPAN_READ,
        enabled: true,
      },
      {
        key: 'spmb-akun',
        label: 'Akun Orang Tua',
        icon: '•',
        href: '/spmb/akun',
        permission: PERMISSIONS.SPMB_REGISTRATION_READ,
        enabled: true,
      },
      {
        key: 'spmb-pengaturan',
        label: 'Pengaturan SPMB',
        icon: '•',
        href: '/spmb/pengaturan',
        permission: PERMISSIONS.SPMB_REGISTRATION_MANAGE,
        enabled: true,
      },
    ],
    enabled: true,
  },
  { key: 'sarpras', label: 'Sarpras', icon: '🏫', enabled: false },
  { key: 'cbt', label: 'CBT', icon: '🖥', enabled: false },
  {
    key: 'keuangan',
    label: 'Keuangan',
    icon: '💰',
    permission: PERMISSIONS.FINANCE_READ,
    roles: KEUANGAN_ROLES,
    enabled: true,
    children: [
      {
        key: 'keuangan-dashboard',
        label: 'Dashboard',
        icon: '•',
        href: '/keuangan',
        permission: PERMISSIONS.FINANCE_READ,
        enabled: true,
      },
      {
        key: 'keuangan-kas',
        label: 'Kas & Bank',
        icon: '•',
        href: '/keuangan/kas',
        permission: PERMISSIONS.FINANCE_READ,
        enabled: true,
      },
      {
        key: 'keuangan-harian',
        label: 'Transaksi Harian',
        icon: '•',
        href: '/keuangan/harian',
        permission: PERMISSIONS.FINANCE_READ,
        enabled: true,
      },
      {
        key: 'keuangan-tagihan',
        label: 'Tagihan Siswa',
        icon: '•',
        href: '/keuangan/tagihan',
        permission: PERMISSIONS.FINANCE_READ,
        enabled: true,
      },
      {
        key: 'keuangan-tabungan',
        label: 'Tabungan Siswa',
        icon: '•',
        href: '/keuangan/tabungan',
        permission: PERMISSIONS.FINANCE_READ,
        enabled: true,
      },
      {
        key: 'keuangan-pengeluaran',
        label: 'Pengeluaran',
        icon: '•',
        href: '/keuangan/pengeluaran',
        permission: PERMISSIONS.FINANCE_READ,
        enabled: true,
      },
      {
        key: 'keuangan-payroll',
        label: 'Gaji & Honor',
        icon: '•',
        href: '/keuangan/payroll',
        permission: PERMISSIONS.PAYROLL_READ,
        enabled: true,
      },
      {
        key: 'keuangan-payroll-absensi',
        label: 'Data Absensi Pegawai',
        icon: '•',
        href: '/keuangan/payroll/absensi',
        permission: PERMISSIONS.PAYROLL_READ,
        enabled: true,
      },
      {
        key: 'keuangan-payroll-pengaturan',
        label: 'Pengaturan Gaji',
        icon: '•',
        href: '/keuangan/payroll/pengaturan',
        permission: PERMISSIONS.PAYROLL_READ,
        enabled: true,
      },
      {
        key: 'keuangan-anggaran',
        label: 'Anggaran',
        icon: '•',
        href: '/keuangan/anggaran',
        permission: PERMISSIONS.FINANCE_READ,
        enabled: true,
      },
      {
        key: 'keuangan-kwitansi',
        label: 'Galeri Kwitansi',
        icon: '•',
        href: '/keuangan/kwitansi',
        permission: PERMISSIONS.FINANCE_READ,
        enabled: true,
      },
      {
        key: 'keuangan-laporan',
        label: 'Laporan',
        icon: '•',
        href: '/keuangan/laporan',
        permission: PERMISSIONS.FINANCE_READ,
        enabled: true,
      },
      {
        key: 'keuangan-laporan-siswa',
        label: 'Laporan Siswa',
        icon: '•',
        href: '/keuangan/laporan-siswa',
        permission: PERMISSIONS.FINANCE_READ,
        enabled: true,
      },
    ],
  },
  { key: 'operasional', label: 'Operasional', icon: '🛠', enabled: false },
  { key: 'laporan', label: 'Laporan', icon: '📊', enabled: false },
  { key: 'integrasi', label: 'Integrasi', icon: '🔗', enabled: false },
  {
    key: 'master-data',
    label: 'Master Data',
    icon: '🗃',
    enabled: true,
    children: [
      {
        key: 'md-tahun-ajaran',
        label: 'Tahun Ajaran',
        icon: '•',
        href: '/master-data/tahun-ajaran',
        permission: PERMISSIONS.ACADEMIC_YEAR_READ,
        enabled: true,
      },
      {
        key: 'md-semester',
        label: 'Semester',
        icon: '•',
        href: '/master-data/semester',
        permission: PERMISSIONS.ACADEMIC_READ,
        enabled: true,
      },
      {
        key: 'md-mapel',
        label: 'Mata Pelajaran',
        icon: '•',
        href: '/master-data/mapel',
        permission: PERMISSIONS.ACADEMIC_READ,
        enabled: true,
      },
      {
        key: 'md-kurikulum',
        label: 'Data Kurikulum',
        icon: '•',
        href: '/master-data/kurikulum',
        permission: PERMISSIONS.ACADEMIC_READ,
        enabled: true,
      },
    ],
  },
  {
    key: 'pengaturan',
    label: 'Pengaturan',
    icon: '⚙',
    enabled: true,
    children: [
      {
        key: 'akun-staf',
        label: 'Manajemen Akun',
        icon: '•',
        href: '/pengaturan/akun',
        permission: PERMISSIONS.IDENTITY_USER_READ,
        enabled: true,
      },
      {
        key: 'profil-sekolah',
        label: 'Profil & Kontak',
        icon: '•',
        href: '/pengaturan/profil',
        permission: PERMISSIONS.SCHOOL_READ,
        enabled: true,
      },
      {
        key: 'roles',
        label: 'Role & Akses',
        icon: '•',
        href: '/pengaturan/roles',
        permission: PERMISSIONS.IDENTITY_ROLE_READ,
        enabled: true,
      },
      {
        key: 'whatsapp',
        label: 'WhatsApp Gateway',
        icon: '•',
        href: '/pengaturan/whatsapp',
        permission: PERMISSIONS.SCHOOL_MANAGE,
        enabled: true,
      },
    ],
  },
];

/** Filter the nav tree by the user's permission set + role (menu bidang). */
export function navFor(
  permissions: readonly string[],
  roles: readonly string[] = [],
): NavItem[] {
  const has = (p?: string) => !p || permissions.includes(p);
  const roleOk = (item: NavItem) =>
    (!item.roles || item.roles.some((r) => roles.includes(r))) &&
    !(item.hideRoles?.some((r) => roles.includes(r)));
  return NAV.filter((item) => has(item.permission) && roleOk(item))
    .map((item) =>
      item.children
        ? { ...item, children: item.children.filter((c) => has(c.permission)) }
        : item,
    )
    .filter((item) => item.enabled && (!item.children || item.children.length > 0 || item.href));
}
