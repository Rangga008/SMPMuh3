import { PrismaClient } from '@prisma/client';
import { ALL_PERMISSION_KEYS, PERMISSIONS } from '@smpmuh3/types';
import argon2 from 'argon2';
import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';

loadDotenv({ path: resolve(process.cwd(), '../../.env') });
loadDotenv({ path: resolve(process.cwd(), '.env'), override: true });

const prisma = new PrismaClient();

const PERMISSION_DESCRIPTIONS: Record<string, string> = {
  [PERMISSIONS.IDENTITY_USER_READ]: 'View users',
  [PERMISSIONS.IDENTITY_USER_MANAGE]: 'Create, update and disable users',
  [PERMISSIONS.IDENTITY_ROLE_READ]: 'View roles and permissions',
  [PERMISSIONS.IDENTITY_ROLE_MANAGE]: 'Manage roles and their permissions',
  [PERMISSIONS.SCHOOL_READ]: 'View school profile',
  [PERMISSIONS.SCHOOL_MANAGE]: 'Edit school profile',
  [PERMISSIONS.ACADEMIC_YEAR_READ]: 'View academic years',
  [PERMISSIONS.ACADEMIC_YEAR_MANAGE]: 'Manage academic years',
  [PERMISSIONS.AUDIT_READ]: 'View audit logs',
  [PERMISSIONS.SPMB_REGISTRATION_READ]: 'View SPMB registrations',
  [PERMISSIONS.SPMB_REGISTRATION_MANAGE]: 'Verify and manage SPMB registrations',
  [PERMISSIONS.SPMB_TITIPAN_READ]: 'View SPMB waiting list (titipan)',
  [PERMISSIONS.SPMB_TITIPAN_MANAGE]: 'Manage SPMB waiting list (verify, send codes, cancel)',
  [PERMISSIONS.NOTIFICATION_READ]: 'View notifications',
  [PERMISSIONS.STUDENT_READ]: 'View students',
  [PERMISSIONS.STUDENT_MANAGE]: 'Manage students',
  [PERMISSIONS.EMPLOYEE_READ]: 'View employees',
  [PERMISSIONS.EMPLOYEE_MANAGE]: 'Manage employees',
  [PERMISSIONS.ACADEMIC_READ]: 'View academic data',
  [PERMISSIONS.ACADEMIC_MANAGE]: 'Manage academic data',
  [PERMISSIONS.ATTENDANCE_READ]: 'View attendance',
  [PERMISSIONS.ATTENDANCE_MANAGE]: 'Manage attendance',
  [PERMISSIONS.FINANCE_READ]: 'View finance data',
  [PERMISSIONS.FINANCE_MANAGE]: 'Manage finance records',
  [PERMISSIONS.TATAUSAHA_READ]: 'View tata usaha records (letters, mutations, exams)',
  [PERMISSIONS.TATAUSAHA_MANAGE]: 'Manage tata usaha records',
  [PERMISSIONS.PAYROLL_READ]: 'View payroll data',
  [PERMISSIONS.PAYROLL_MANAGE]: 'Manage payroll (runs, components, loans)',
  [PERMISSIONS.SARPRAS_READ]: 'View sarana & prasarana (facilities)',
  [PERMISSIONS.SARPRAS_MANAGE]: 'Manage sarana & prasarana (facilities)',
};

const ROLES: Record<string, { name: string; description: string; permissionKeys: string[] | 'all' }> = {
  superadmin: {
    name: 'Super Administrator',
    description: 'Full access to all modules',
    permissionKeys: 'all',
  },
  spmb_admin: {
    name: 'Admin SPMB',
    description: 'SPMB staff — verify and manage registrations',
    permissionKeys: [
      PERMISSIONS.SPMB_REGISTRATION_READ,
      PERMISSIONS.SPMB_REGISTRATION_MANAGE,
      PERMISSIONS.SPMB_TITIPAN_READ,
      PERMISSIONS.SPMB_TITIPAN_MANAGE,
      PERMISSIONS.ACADEMIC_YEAR_READ,
      PERMISSIONS.AUDIT_READ,
      PERMISSIONS.STUDENT_READ,
      PERMISSIONS.NOTIFICATION_READ,
    ],
  },
  spmb_parent: {
    name: 'Orang Tua / Wali',
    description: 'Parent/guardian managing their own applications',
    permissionKeys: [PERMISSIONS.NOTIFICATION_READ],
  },
  kepala_sekolah: {
    name: 'Kepala Sekolah',
    description: 'Headmaster — approves submissions, oversees all departments',
    permissionKeys: [
      PERMISSIONS.STUDENT_READ,
      PERMISSIONS.EMPLOYEE_READ,
      PERMISSIONS.ACADEMIC_READ,
      PERMISSIONS.ACADEMIC_MANAGE,
      PERMISSIONS.ACADEMIC_YEAR_READ,
      PERMISSIONS.ATTENDANCE_READ,
      PERMISSIONS.TATAUSAHA_READ,
      PERMISSIONS.FINANCE_READ,
      PERMISSIONS.PAYROLL_READ,
      PERMISSIONS.SPMB_REGISTRATION_READ,
      PERMISSIONS.SPMB_TITIPAN_READ,
      PERMISSIONS.SCHOOL_READ,
      PERMISSIONS.NOTIFICATION_READ,
    ],
  },
  staff_kurikulum: {
    name: 'Staf Kurikulum / Wakasek',
    description: 'Curriculum staff — schedules, shifts, assessments, employee attendance',
    permissionKeys: [
      PERMISSIONS.STUDENT_READ,
      PERMISSIONS.EMPLOYEE_READ,
      PERMISSIONS.ACADEMIC_READ,
      PERMISSIONS.ACADEMIC_MANAGE,
      PERMISSIONS.ACADEMIC_YEAR_READ,
      PERMISSIONS.ATTENDANCE_READ,
      PERMISSIONS.ATTENDANCE_MANAGE,
      PERMISSIONS.TATAUSAHA_READ,
      PERMISSIONS.TATAUSAHA_MANAGE,
      PERMISSIONS.NOTIFICATION_READ,
    ],
  },
  staff_kesiswaan: {
    name: 'Staf Kesiswaan / Wakasek',
    description: 'Student affairs — students, attendance recap, achievements & violations',
    permissionKeys: [
      PERMISSIONS.STUDENT_READ,
      PERMISSIONS.STUDENT_MANAGE,
      PERMISSIONS.EMPLOYEE_READ,
      PERMISSIONS.ACADEMIC_READ,
      PERMISSIONS.ACADEMIC_YEAR_READ,
      PERMISSIONS.ATTENDANCE_READ,
      PERMISSIONS.ATTENDANCE_MANAGE,
      PERMISSIONS.NOTIFICATION_READ,
    ],
  },
  kepala_tu: {
    name: 'Kepala Tata Usaha',
    description: 'Head of administration — letters, mutations, archives, dept members',
    permissionKeys: [
      PERMISSIONS.SPMB_REGISTRATION_READ,
      PERMISSIONS.SPMB_REGISTRATION_MANAGE,
      PERMISSIONS.SPMB_TITIPAN_READ,
      PERMISSIONS.SPMB_TITIPAN_MANAGE,
      PERMISSIONS.STUDENT_READ,
      PERMISSIONS.STUDENT_MANAGE,
      PERMISSIONS.EMPLOYEE_READ,
      PERMISSIONS.EMPLOYEE_MANAGE,
      PERMISSIONS.TATAUSAHA_READ,
      PERMISSIONS.TATAUSAHA_MANAGE,
      PERMISSIONS.SARPRAS_READ,
      PERMISSIONS.SARPRAS_MANAGE,
      PERMISSIONS.ACADEMIC_READ,
      PERMISSIONS.ACADEMIC_YEAR_READ,
      PERMISSIONS.ATTENDANCE_READ,
      PERMISSIONS.ATTENDANCE_MANAGE,
      PERMISSIONS.NOTIFICATION_READ,
    ],
  },
  guru_mapel: {
    name: 'Guru Mata Pelajaran',
    description: 'Subject teacher — academic & attendance access',
    permissionKeys: [
      PERMISSIONS.ACADEMIC_READ,
      PERMISSIONS.ACADEMIC_YEAR_READ,
      PERMISSIONS.ATTENDANCE_READ,
      PERMISSIONS.ATTENDANCE_MANAGE,
      PERMISSIONS.EMPLOYEE_READ,
      PERMISSIONS.STUDENT_READ,
      PERMISSIONS.NOTIFICATION_READ,
    ],
  },
  staff_tu: {
    name: 'Staf TU',
    description: 'Administration staff — surat, mutasi, US; also assists SPMB work',
    permissionKeys: [
      PERMISSIONS.SPMB_REGISTRATION_READ,
      PERMISSIONS.SPMB_REGISTRATION_MANAGE,
      PERMISSIONS.SPMB_TITIPAN_READ,
      PERMISSIONS.SPMB_TITIPAN_MANAGE,
      PERMISSIONS.STUDENT_READ,
      PERMISSIONS.STUDENT_MANAGE,
      PERMISSIONS.EMPLOYEE_READ,
      PERMISSIONS.EMPLOYEE_MANAGE,
      PERMISSIONS.TATAUSAHA_READ,
      PERMISSIONS.TATAUSAHA_MANAGE,
      PERMISSIONS.SARPRAS_READ,
      PERMISSIONS.SARPRAS_MANAGE,
      PERMISSIONS.ACADEMIC_READ,
      PERMISSIONS.ACADEMIC_YEAR_READ,
      PERMISSIONS.ATTENDANCE_READ,
      PERMISSIONS.ATTENDANCE_MANAGE,
      PERMISSIONS.NOTIFICATION_READ,
    ],
  },
  staff_sarpras: {
    name: 'Staf Sarpras',
    description: 'Sarana & prasarana — inventaris fasilitas, ruang, dan aset sekolah',
    permissionKeys: [
      PERMISSIONS.SARPRAS_READ,
      PERMISSIONS.SARPRAS_MANAGE,
      PERMISSIONS.ACADEMIC_READ,
      PERMISSIONS.ACADEMIC_YEAR_READ,
      PERMISSIONS.NOTIFICATION_READ,
    ],
  },
  staff_laysus: {
    name: 'Staf Laysus',
    description: 'Layanan khusus — kebersihan, keamanan/satpam; absen mandiri via Absen Saya',
    permissionKeys: [PERMISSIONS.NOTIFICATION_READ],
  },
  bendahara: {
    name: 'Bendahara',
    description: 'Finance staff — payments & fees',
    permissionKeys: [
      PERMISSIONS.SPMB_REGISTRATION_READ,
      PERMISSIONS.FINANCE_READ,
      PERMISSIONS.FINANCE_MANAGE,
      PERMISSIONS.PAYROLL_READ,
      PERMISSIONS.PAYROLL_MANAGE,
      PERMISSIONS.EMPLOYEE_READ,
      PERMISSIONS.STUDENT_READ,
      PERMISSIONS.ACADEMIC_READ,
      PERMISSIONS.ACADEMIC_YEAR_READ,
      PERMISSIONS.NOTIFICATION_READ,
    ],
  },
  ops_admin: {
    name: 'Admin Operasional',
    description: 'School operational staff (students, academic, attendance)',
    permissionKeys: [
      PERMISSIONS.STUDENT_READ,
      PERMISSIONS.STUDENT_MANAGE,
      PERMISSIONS.EMPLOYEE_READ,
      PERMISSIONS.EMPLOYEE_MANAGE,
      PERMISSIONS.ACADEMIC_READ,
      PERMISSIONS.ACADEMIC_MANAGE,
      PERMISSIONS.ATTENDANCE_READ,
      PERMISSIONS.ATTENDANCE_MANAGE,
      PERMISSIONS.TATAUSAHA_READ,
      PERMISSIONS.TATAUSAHA_MANAGE,
      PERMISSIONS.ACADEMIC_YEAR_READ,
      PERMISSIONS.NOTIFICATION_READ,
      PERMISSIONS.SPMB_REGISTRATION_READ,
      PERMISSIONS.SPMB_TITIPAN_READ,
      PERMISSIONS.FINANCE_READ,
    ],
  },
};

/** Kategori keuangan default — pemasukan SPMB otomatis memetakan ke ini. */
const FINANCE_CATEGORIES: {
  key: string;
  name: string;
  type: 'INCOME' | 'EXPENSE';
  standardGroup?: string;
}[] = [
  { key: 'spmb_pendaftaran', name: 'Uang Pendaftaran SPMB', type: 'INCOME' },
  { key: 'spmb_dsp', name: 'DSP (Dana Sumbangan Pendidikan)', type: 'INCOME' },
  { key: 'spmb_spp', name: 'SPP Bulanan', type: 'INCOME' },
  { key: 'spmb_seragam', name: 'Seragam', type: 'INCOME' },
  { key: 'spmb_angsuran', name: 'Angsuran SPMB', type: 'INCOME' },
  { key: 'spmb_lainnya', name: 'Pemasukan SPMB Lainnya', type: 'INCOME' },
  { key: 'kat', name: 'KAT (Kegiatan Akhir Tahun)', type: 'INCOME' },
  { key: 'daftar_ulang', name: 'Daftar Ulang', type: 'INCOME' },
  { key: 'income_lainnya', name: 'Pemasukan Lainnya', type: 'INCOME' },
  {
    key: 'ops_gaji',
    name: 'Gaji & Honor',
    type: 'EXPENSE',
    standardGroup: 'TENAGA',
  },
  {
    key: 'ops_operasional',
    name: 'Operasional Sekolah',
    type: 'EXPENSE',
    standardGroup: 'PENGELOLAAN',
  },
  {
    key: 'ops_atk',
    name: 'Alat Tulis Kantor (ATK)',
    type: 'EXPENSE',
    standardGroup: 'PENGELOLAAN',
  },
  {
    key: 'ops_listrik',
    name: 'Listrik, Air & Internet',
    type: 'EXPENSE',
    standardGroup: 'PENGELOLAAN',
  },
  {
    key: 'ops_sarana',
    name: 'Sarana & Prasarana',
    type: 'EXPENSE',
    standardGroup: 'SARANA',
  },
  {
    key: 'ops_kegiatan',
    name: 'Kegiatan Sekolah',
    type: 'EXPENSE',
    standardGroup: 'PROSES',
  },
  {
    key: 'ops_perpisahan',
    name: 'Perpisahan & Kelulusan',
    type: 'EXPENSE',
    standardGroup: 'KELULUSAN',
  },
  {
    key: 'ops_kurikulum',
    name: 'Pengembangan Kurikulum',
    type: 'EXPENSE',
    standardGroup: 'ISI',
  },
  {
    key: 'ops_pelatihan',
    name: 'Pelatihan & Pengembangan Guru',
    type: 'EXPENSE',
    standardGroup: 'TENAGA',
  },
  {
    key: 'ops_ujian',
    name: 'Ujian & Penilaian',
    type: 'EXPENSE',
    standardGroup: 'PENILAIAN',
  },
  {
    key: 'ops_honor_bos',
    name: 'Honor BOS (Non-Sertifikasi)',
    type: 'EXPENSE',
    standardGroup: 'PEMBIAYAAN',
  },
  {
    key: 'ops_panitia',
    name: 'Honor Panitia Kegiatan',
    type: 'EXPENSE',
    standardGroup: 'TENAGA',
  },
  {
    key: 'ops_lainnya',
    name: 'Pengeluaran Lainnya',
    type: 'EXPENSE',
    standardGroup: 'PEMBIAYAAN',
  },
];

async function main() {
  // Permissions
  const permissions = await Promise.all(
    ALL_PERMISSION_KEYS.map((key) =>
      prisma.permission.upsert({
        where: { key },
        update: { description: PERMISSION_DESCRIPTIONS[key] ?? null },
        create: { key, description: PERMISSION_DESCRIPTIONS[key] ?? null },
      }),
    ),
  );

  // Roles with their permission sets
  const byKey = new Map(permissions.map((p) => [p.key, p]));
  const roles: Record<string, { id: string }> = {};
  for (const [key, def] of Object.entries(ROLES)) {
    const role = await prisma.role.upsert({
      where: { key },
      update: { name: def.name, description: def.description },
      create: { key, name: def.name, description: def.description },
    });
    const wanted = def.permissionKeys === 'all' ? ALL_PERMISSION_KEYS : def.permissionKeys;
    await prisma.rolePermission.createMany({
      data: wanted
        .map((k) => byKey.get(k))
        .filter((p): p is NonNullable<typeof p> => p !== undefined)
        .map((p) => ({ roleId: role.id, permissionId: p.id })),
      skipDuplicates: true,
    });
    roles[key] = role;
  }
  const superadmin = roles['superadmin']!;

  // Initial admin user — credentials come from env, never hard-coded
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.warn(
      'ADMIN_EMAIL/ADMIN_PASSWORD not set — skipping initial admin user.',
    );
    return;
  }

  const passwordHash = await argon2.hash(password);
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name: 'Administrator', passwordHash },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: superadmin.id } },
    update: {},
    create: { userId: user.id, roleId: superadmin.id },
  });
  console.log(`Admin user ensured: ${email}`);

  // Akun per bidang — satu akun operasional per departemen.
  // Password diambil dari STAFF_PASSWORD (default dev: staff123).
  const staffPassword = process.env.STAFF_PASSWORD ?? 'staff123';
  const staffHash = await argon2.hash(staffPassword);
  const deptAccounts: {
    email: string; name: string; role: string; dept: string; isHead: boolean;
    gtk: { type: 'TEACHER' | 'TENDIK'; staffKind?: string; additionalDuty?: string };
  }[] = [
    { email: 'kepsek@smpmuh3.sch.id', name: 'Kepala Sekolah', role: 'kepala_sekolah', dept: 'LAINNYA', isHead: true,
      gtk: { type: 'TENDIK', staffKind: 'KEPALA_SEKOLAH' } },
    { email: 'kurikulum@smpmuh3.sch.id', name: 'Wakasek Kurikulum', role: 'staff_kurikulum', dept: 'KURIKULUM', isHead: true,
      gtk: { type: 'TEACHER', additionalDuty: 'WAKASEK_KURIKULUM' } },
    { email: 'kesiswaan@smpmuh3.sch.id', name: 'Wakasek Kesiswaan', role: 'staff_kesiswaan', dept: 'KESISWAAN', isHead: true,
      gtk: { type: 'TEACHER', additionalDuty: 'WAKASEK_KESISWAAN' } },
    { email: 'tu@smpmuh3.sch.id', name: 'Kepala Tata Usaha', role: 'kepala_tu', dept: 'TATA_USAHA', isHead: true,
      gtk: { type: 'TENDIK', staffKind: 'TU', additionalDuty: 'KEPALA_TU' } },
    { email: 'laysus@smpmuh3.sch.id', name: 'Kepala Laysus', role: 'staff_laysus', dept: 'LAYSUS', isHead: true,
      gtk: { type: 'TENDIK', staffKind: 'LAYSUS' } },
    { email: 'sarpras@smpmuh3.sch.id', name: 'Kepala Sarpras', role: 'staff_sarpras', dept: 'SARPRAS', isHead: true,
      gtk: { type: 'TENDIK', staffKind: 'SARPRAS' } },
    { email: 'bendahara@smpmuh3.sch.id', name: 'Bendahara', role: 'bendahara', dept: 'KEUANGAN', isHead: true,
      gtk: { type: 'TENDIK', staffKind: 'TU', additionalDuty: 'BENDAHARA_BOS' } },
  ];
  for (const acc of deptAccounts) {
    const role = roles[acc.role];
    if (!role) continue;
    const u = await prisma.user.upsert({
      where: { email: acc.email },
      update: {},
      create: { email: acc.email, name: acc.name, passwordHash: staffHash },
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: u.id, roleId: role.id } },
      update: {},
      create: { userId: u.id, roleId: role.id },
    });
    // Pastikan ada pegawai tertaut agar fitur personal (absen, bidang) jalan.
    const emp = await prisma.employee.findFirst({ where: { userId: u.id } });
    if (!emp) {
      await prisma.employee.create({
        data: {
          name: acc.name,
          type: acc.gtk.type,
          staffKind: acc.gtk.staffKind ?? null,
          additionalDuty: acc.gtk.additionalDuty ?? null,
          department: acc.dept,
          isDeptHead: acc.isHead,
          email: acc.email,
          userId: u.id,
        },
      });
    }
    console.log(`Dept account ensured: ${acc.email} (${acc.role})`);
  }

  // Jenis sarana bawaan — dikelola Sarpras via menu Sarpras → Jenis Sarana.
  const saranaTypes = [
    'Meja Siswa', 'Kursi Siswa', 'Meja Guru', 'Kursi Guru',
    'Papan Tulis', 'Lemari', 'Komputer', 'Proyektor', 'Sound System',
  ];
  for (const [i, label] of saranaTypes.entries()) {
    const code = label.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    await prisma.saranaType.upsert({
      where: { code },
      update: {},
      create: { code, label, sortOrder: i + 1 },
    });
  }
  console.log('Sarana types ensured.');

  // Profil sekolah — satu baris, dikelola admin via Pengaturan → Profil & Kontak.
  const school = await prisma.school.findFirst();
  if (!school) {
    await prisma.school.create({
      data: {
        name: 'SMP Muhammadiyah 3 Kota Bandung',
        code: 'SMPM3',
        tagline: 'Sekolah Muhammadiyah — Inisiatif, Kreatif, Religius, Optimis',
        address: 'Kota Bandung, Jawa Barat',
      },
    });
    console.log('School profile created.');
  }

  await seedSpmb();
}

/** SPMB 2027/2028 — Gelombang 1, biaya, diskon prestasi, pertanyaan formulir. */
async function seedSpmb() {
  const year = await prisma.academicYear.findFirst({
    where: { isActive: true },
  });
  if (!year) {
    console.warn('No active academic year — skipping SPMB seed.');
    return;
  }

  // Gelombang 1: 1 November – 31 Desember 2026
  await prisma.registrationWave.upsert({
    where: {
      academicYearId_name: { academicYearId: year.id, name: 'Gelombang 1' },
    },
    update: {
      startDate: new Date('2026-11-01'),
      endDate: new Date('2026-12-31'),
      isActive: true,
      order: 1,
    },
    create: {
      academicYearId: year.id,
      name: 'Gelombang 1',
      startDate: new Date('2026-11-01'),
      endDate: new Date('2026-12-31'),
      isActive: true,
      order: 1,
    },
  });

  // Biaya resmi
  const fees: { key: string; label: string; amount: number }[] = [
    { key: 'registration', label: 'Uang Pendaftaran', amount: 250_000 },
    {
      key: 'dsp',
      label: 'DSP (Dana Sumbangan Pendidikan)',
      amount: 2_800_000,
    },
    { key: 'spp', label: 'SPP Bulanan', amount: 250_000 },
    { key: 'seragam', label: 'Seragam', amount: 1_700_000 },
    {
      key: 'dsp_dp',
      label: 'Uang Muka DSP (DP) sebelum psikotes',
      amount: 1_400_000,
    },
  ];
  for (const fee of fees) {
    await prisma.spmbFee.upsert({
      where: { key: fee.key },
      update: { label: fee.label },
      create: fee,
    });
  }

  // Diskon jalur prestasi
  const discounts: { subType: string; label: string; percent: number; minScore?: number }[] = [
    {
      subType: 'akademik',
      label: 'Prestasi Akademik (nilai rapor)',
      percent: 10,
      minScore: 85,
    },
    { subType: 'tahfidz_2', label: 'Tahfidz 2 Juz', percent: 25 },
    { subType: 'tahfidz_3plus', label: 'Tahfidz 3+ Juz', percent: 50 },
    { subType: 'non_akademik', label: 'Prestasi Non-Akademik', percent: 10 },
    {
      subType: 'alumni_sdm',
      label: 'Alumni SD Muhammadiyah Kota Bandung',
      percent: 10,
    },
  ];
  for (const d of discounts) {
    await prisma.discountRule.upsert({
      where: { subType: d.subType },
      update: { label: d.label },
      create: { ...d, minScore: d.minScore ?? null },
    });
  }

  // Pertanyaan formulir default
  const questions: {
    label: string;
    fieldType: string;
    required: boolean;
    order: number;
    helpText?: string;
    options?: string[];
  }[] = [
    {
      label: 'Nama lengkap ayah',
      fieldType: 'text',
      required: true,
      order: 1,
    },
    {
      label: 'Nama lengkap ibu',
      fieldType: 'text',
      required: true,
      order: 2,
    },
    {
      label: 'Pekerjaan orang tua/wali',
      fieldType: 'text',
      required: true,
      order: 3,
    },
    {
      label: 'Alamat tempat tinggal',
      fieldType: 'textarea',
      required: true,
      order: 4,
    },
    {
      label: 'Anak ke berapa dari berapa bersaudara?',
      fieldType: 'text',
      required: false,
      order: 5,
    },
    {
      label: 'Hobi atau kegiatan yang disukai anak',
      fieldType: 'text',
      required: false,
      order: 6,
    },
    {
      label: 'Apakah anak memiliki kebutuhan khusus?',
      fieldType: 'select',
      options: ['Tidak ada', 'Ada (jelaskan di kolom lainnya)'],
      required: true,
      order: 7,
    },
    {
      label: 'Dari mana Bapak/Ibu mengetahui SPMB ini?',
      fieldType: 'select',
      options: [
        'Media sosial',
        'Brosur/banner',
        'Tetangga/saudara',
        'Alumni',
        'Lainnya',
      ],
      required: false,
      order: 8,
    },
  ];
  for (const q of questions) {
    const existing = await prisma.formQuestion.findFirst({
      where: { label: q.label, academicYearId: null },
    });
    if (!existing) {
      await prisma.formQuestion.create({
        data: { ...q, ...(q.options ? { options: q.options } : {}) },
      });
    }
  }
  console.log('SPMB seed done (wave, fees, discounts, questions).');

  for (const c of FINANCE_CATEGORIES) {
    await prisma.financeCategory.upsert({
      where: { key: c.key },
      update: {
        name: c.name,
        type: c.type,
        standardGroup: c.standardGroup ?? null,
      },
      create: c,
    });
  }

  // Akun kas default — tempat semua arus uang bermuara
  for (const a of [
    { key: 'tunai', name: 'Kas Tunai', type: 'CASH' as const },
    { key: 'bos', name: 'Kas BOS', type: 'CASH' as const },
    { key: 'rmp', name: 'Kas RMP', type: 'CASH' as const },
    { key: 'bank', name: 'Rekening Bank', type: 'BANK' as const },
  ]) {
    await prisma.cashAccount.upsert({
      where: { key: a.key },
      update: { name: a.name, type: a.type },
      create: a,
    });
  }
  console.log(`Finance categories ensured: ${FINANCE_CATEGORIES.length}`);

  // ---------- Payroll defaults ----------

  for (const s of [
    { name: '0–4 tahun', minYears: 0, maxYears: 4, hourlyRate: 25_000, transportRate: 10_000 },
    { name: '5–9 tahun', minYears: 5, maxYears: 9, hourlyRate: 30_000, transportRate: 12_000 },
    { name: '10+ tahun', minYears: 10, maxYears: null, hourlyRate: 35_000, transportRate: 15_000 },
  ]) {
    const existing = await prisma.payScale.findFirst({ where: { minYears: s.minYears } });
    if (existing) {
      await prisma.payScale.update({ where: { id: existing.id }, data: s });
    } else {
      await prisma.payScale.create({ data: s });
    }
  }

  for (const h of [
    { key: 'jabatan', name: 'Tunjangan Jabatan', period: 'MONTHLY' as const, defaultAmount: 0 },
    { key: 'wali_kelas', name: 'Wali Kelas', period: 'MONTHLY' as const, defaultAmount: 0 },
    { key: 'piket', name: 'Piket', period: 'PER_SESSION' as const, defaultAmount: 0 },
    { key: 'eskul', name: 'Pembina Ekstrakurikuler', period: 'PER_SESSION' as const, defaultAmount: 0 },
    { key: 'mamin', name: 'Tunjangan Mamin', period: 'MONTHLY' as const, defaultAmount: 0 },
    { key: 'panitia', name: 'Honor Panitia Kegiatan', period: 'ONE_TIME' as const, defaultAmount: 0 },
  ]) {
    await prisma.honorType.upsert({
      where: { key: h.key },
      update: { name: h.name, period: h.period },
      create: h,
    });
  }

  for (const d of [
    { key: 'infak', name: 'Infak', defaultAmount: 0 },
    { key: 'pdm', name: 'PDM', defaultAmount: 0 },
    { key: 'tabungan', name: 'Tabungan Pegawai', defaultAmount: 0 },
    { key: 'pensiun', name: 'Dana Pensiun', defaultAmount: 0 },
    { key: 'lainnya', name: 'Potongan Lainnya', defaultAmount: 0, isRecurring: false },
  ]) {
    await prisma.deductionType.upsert({
      where: { key: d.key },
      update: { name: d.name, isRecurring: d.isRecurring ?? true },
      create: d,
    });
  }
  console.log('Payroll defaults ensured (pay scales, honor & deduction types).');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
