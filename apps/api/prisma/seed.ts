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
      PERMISSIONS.ACADEMIC_YEAR_READ,
      PERMISSIONS.NOTIFICATION_READ,
      PERMISSIONS.SPMB_REGISTRATION_READ,
    ],
  },
};

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
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
