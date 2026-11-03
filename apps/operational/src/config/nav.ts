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
  enabled: boolean;
  children?: NavItem[];
}

export const NAV: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: '⌂', href: '/', enabled: true },
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
        label: 'Jadwal & Penugasan',
        icon: '•',
        href: '/kurikulum/jadwal',
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
    ],
  },
  {
    key: 'kesiswaan',
    label: 'Kesiswaan',
    icon: '🎓',
    permission: PERMISSIONS.STUDENT_READ,
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
    ],
  },
  {
    key: 'tata-usaha',
    label: 'Tata Usaha',
    icon: '📁',
    enabled: true,
    children: [
      {
        key: 'pegawai',
        label: 'Kepegawaian',
        icon: '•',
        href: '/kepegawaian',
        permission: PERMISSIONS.EMPLOYEE_READ,
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
        key: 'mutasi-masuk',
        label: 'Mutasi Masuk',
        icon: '•',
        href: '/tata-usaha/mutasi-masuk',
        permission: PERMISSIONS.TATAUSAHA_READ,
        enabled: true,
      },
      {
        key: 'mutasi-keluar',
        label: 'Mutasi Keluar',
        icon: '•',
        href: '/tata-usaha/mutasi-keluar',
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
    ],
  },
  {
    key: 'spmb',
    label: 'SPMB',
    icon: '📋',
    permission: PERMISSIONS.SPMB_REGISTRATION_READ,
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
        key: 'keuangan-pengeluaran',
        label: 'Pengeluaran',
        icon: '•',
        href: '/keuangan/pengeluaran',
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
        key: 'keuangan-tabungan',
        label: 'Tabungan Siswa',
        icon: '•',
        href: '/keuangan/tabungan',
        permission: PERMISSIONS.FINANCE_READ,
        enabled: true,
      },
      {
        key: 'keuangan-payroll',
        label: 'Payroll',
        icon: '•',
        href: '/keuangan/payroll',
        permission: PERMISSIONS.PAYROLL_READ,
        enabled: true,
      },
      {
        key: 'keuangan-payroll-absensi',
        label: 'Absensi Pegawai',
        icon: '•',
        href: '/keuangan/payroll/absensi',
        permission: PERMISSIONS.PAYROLL_READ,
        enabled: true,
      },
      {
        key: 'keuangan-payroll-pengaturan',
        label: 'Pengaturan Payroll',
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
        key: 'keuangan-laporan',
        label: 'Laporan',
        icon: '•',
        href: '/keuangan/laporan',
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

/** Filter the nav tree by the user's permission set. */
export function navFor(permissions: readonly string[]): NavItem[] {
  const has = (p?: string) => !p || permissions.includes(p);
  return NAV.filter((item) => has(item.permission))
    .map((item) =>
      item.children
        ? { ...item, children: item.children.filter((c) => has(c.permission)) }
        : item,
    )
    .filter((item) => !item.children || item.children.length > 0 || item.href || !item.enabled);
}
