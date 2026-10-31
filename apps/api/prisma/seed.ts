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
      PERMISSIONS.ACADEMIC_YEAR_READ,
      PERMISSIONS.AUDIT_READ,
    ],
  },
  spmb_parent: {
    name: 'Orang Tua / Wali',
    description: 'Parent/guardian managing their own applications',
    permissionKeys: [PERMISSIONS.NOTIFICATION_READ],
  },
  guru_mapel: {
    name: 'Guru Mata Pelajaran',
    description: 'Subject teacher — academic & attendance access',
    permissionKeys: [
      PERMISSIONS.ACADEMIC_READ,
      PERMISSIONS.ATTENDANCE_READ,
      PERMISSIONS.ATTENDANCE_MANAGE,
      PERMISSIONS.NOTIFICATION_READ,
    ],
  },
  staff_tu: {
    name: 'Staf TU',
    description: 'Administration staff — surat, mutasi, US; also assists SPMB work',
    permissionKeys: [
      PERMISSIONS.SPMB_REGISTRATION_READ,
      PERMISSIONS.SPMB_REGISTRATION_MANAGE,
      PERMISSIONS.STUDENT_READ,
      PERMISSIONS.EMPLOYEE_READ,
      PERMISSIONS.TATAUSAHA_READ,
      PERMISSIONS.TATAUSAHA_MANAGE,
      PERMISSIONS.ACADEMIC_YEAR_READ,
      PERMISSIONS.NOTIFICATION_READ,
    ],
  },
  bendahara: {
    name: 'Bendahara',
    description: 'Finance staff — payments & fees',
    permissionKeys: [
      PERMISSIONS.SPMB_REGISTRATION_READ,
      PERMISSIONS.FINANCE_READ,
      PERMISSIONS.FINANCE_MANAGE,
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
      PERMISSIONS.FINANCE_READ,
    ],
  },
};

/** Kategori keuangan default — pemasukan SPMB otomatis memetakan ke ini. */
const FINANCE_CATEGORIES: { key: string; name: string; type: 'INCOME' | 'EXPENSE' }[] = [
  { key: 'spmb_pendaftaran', name: 'Uang Pendaftaran SPMB', type: 'INCOME' },
  { key: 'spmb_dsp', name: 'DSP (Dana Sumbangan Pendidikan)', type: 'INCOME' },
  { key: 'spmb_spp', name: 'SPP Bulanan', type: 'INCOME' },
  { key: 'spmb_seragam', name: 'Seragam', type: 'INCOME' },
  { key: 'spmb_angsuran', name: 'Angsuran SPMB', type: 'INCOME' },
  { key: 'spmb_lainnya', name: 'Pemasukan SPMB Lainnya', type: 'INCOME' },
  { key: 'income_lainnya', name: 'Pemasukan Lainnya', type: 'INCOME' },
  { key: 'ops_gaji', name: 'Gaji & Honor', type: 'EXPENSE' },
  { key: 'ops_operasional', name: 'Operasional Sekolah', type: 'EXPENSE' },
  { key: 'ops_sarana', name: 'Sarana & Prasarana', type: 'EXPENSE' },
  { key: 'ops_kegiatan', name: 'Kegiatan Sekolah', type: 'EXPENSE' },
  { key: 'ops_lainnya', name: 'Pengeluaran Lainnya', type: 'EXPENSE' },
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
      update: { name: c.name, type: c.type },
      create: c,
    });
  }
  console.log(`Finance categories ensured: ${FINANCE_CATEGORIES.length}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
