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
        label: 'Mapel & Kelas',
        icon: '•',
        href: '/kurikulum',
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
    ],
  },
  {
    key: 'kepegawaian',
    label: 'Kepegawaian',
    icon: '👥',
    permission: PERMISSIONS.EMPLOYEE_READ,
    enabled: true,
    children: [
      {
        key: 'pegawai',
        label: 'Data Pegawai',
        icon: '•',
        href: '/kepegawaian',
        permission: PERMISSIONS.EMPLOYEE_READ,
        enabled: true,
      },
      {
        key: 'roles',
        label: 'Role & Akses',
        icon: '•',
        href: '/kepegawaian/roles',
        permission: PERMISSIONS.IDENTITY_ROLE_READ,
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
        key: 'keuangan-transaksi',
        label: 'Transaksi & Anggaran',
        icon: '•',
        href: '/keuangan',
        permission: PERMISSIONS.FINANCE_READ,
        enabled: true,
      },
    ],
  },
  { key: 'operasional', label: 'Operasional', icon: '🛠', enabled: false },
  { key: 'laporan', label: 'Laporan', icon: '📊', enabled: false },
  { key: 'integrasi', label: 'Integrasi', icon: '🔗', enabled: false },
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
