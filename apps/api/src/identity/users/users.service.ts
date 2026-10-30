import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AuthUser, PermissionKey } from '@smpmuh3/types';
import { PrismaService } from '../../core/prisma/prisma.service';

const userWithAccess = {
  roles: {
    include: {
      role: {
        include: { permissions: { include: { permission: true } } },
      },
    },
  },
} satisfies Prisma.UserInclude;

type UserWithAccess = Prisma.UserGetPayload<{ include: typeof userWithAccess }>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string): Promise<UserWithAccess | null> {
    return this.prisma.user.findUnique({
      where: { email },
      include: userWithAccess,
    });
  }

  findByPhone(phone: string): Promise<UserWithAccess | null> {
    return this.prisma.user.findUnique({
      where: { phone },
      include: userWithAccess,
    });
  }

  /** Resolve a login identifier — email jika mengandung '@', selain itu nomor HP. */
  findByIdentifier(identifier: string): Promise<UserWithAccess | null> {
    return identifier.includes('@')
      ? this.findByEmail(identifier.toLowerCase())
      : this.findByPhone(normalizePhone(identifier));
  }

  findById(id: string): Promise<UserWithAccess | null> {
    return this.prisma.user.findUnique({
      where: { id },
      include: userWithAccess,
    });
  }

  async createWithRole(input: {
    name: string;
    email?: string | undefined;
    phone?: string | undefined;
    passwordHash: string;
    roleKey: string;
  }): Promise<UserWithAccess> {
    const role = await this.prisma.role.findUniqueOrThrow({
      where: { key: input.roleKey },
    });
    return this.prisma.user.create({
      data: {
        name: input.name,
        email: input.email ?? null,
        phone: input.phone ?? null,
        passwordHash: input.passwordHash,
        roles: { create: { roleId: role.id } },
      },
      include: userWithAccess,
    });
  }

  /** List akun orang tua SPMB beserta ringkasan pendaftarannya. */
  listParents() {
    return this.prisma.user.findMany({
      where: { roles: { some: { role: { key: 'spmb_parent' } } } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
        _count: { select: { registrations: true, candidates: true } },
      },
    });
  }

  /** Detail akun ortu + seluruh pendaftarannya. */
  parentDetail(id: string) {
    return this.prisma.user.findFirst({
      where: { id, roles: { some: { role: { key: 'spmb_parent' } } } },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
        candidates: {
          select: { id: true, name: true, birthDate: true, gender: true },
        },
        registrations: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            number: true,
            status: true,
            pathway: true,
            createdAt: true,
            candidate: { select: { name: true } },
            wave: { select: { name: true } },
          },
        },
      },
    });
  }

  /** Update profil akun (nama/telepon/email/status) — untuk manajemen ortu & pegawai. */
  async updateUser(
    id: string,
    data: { name?: string; phone?: string | null; email?: string | null; status?: 'ACTIVE' | 'DISABLED' },
  ) {
    return this.prisma.user.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        ...(data.email !== undefined ? { email: data.email } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
      },
      include: userWithAccess,
    });
  }

  /** Hapus akun ortu — registrations/candidates cascade via schema. */
  deleteParent(id: string) {
    return this.prisma.user.deleteMany({
      where: { id, roles: { some: { role: { key: 'spmb_parent' } } } },
    });
  }

  // ---------- Akun staf (operasional & pegawai — bukan ortu) ----------

  /** Semua akun yang punya minimal satu role selain spmb_parent. */
  listStaff() {
    return this.prisma.user.findMany({
      where: {
        roles: { some: { role: { key: { not: 'spmb_parent' } } } },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
        roles: { select: { role: { select: { id: true, key: true, name: true } } } },
        employee: { select: { id: true, name: true, type: true } },
      },
    });
  }

  /** Buat akun staf baru + assign role. */
  async createStaff(input: {
    name: string;
    email?: string | undefined;
    phone?: string | undefined;
    passwordHash: string;
    roleIds: string[];
  }) {
    return this.prisma.user.create({
      data: {
        name: input.name,
        email: input.email ?? null,
        phone: input.phone ?? null,
        passwordHash: input.passwordHash,
        roles: { create: input.roleIds.map((roleId) => ({ roleId })) },
      },
      include: {
        roles: { select: { role: { select: { id: true, key: true, name: true } } } },
        employee: { select: { id: true, name: true, type: true } },
      },
    });
  }

  /** Ganti seluruh role akun (transaksi). */
  async setRoles(id: string, roleIds: string[]) {
    return this.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId: id } });
      if (roleIds.length > 0) {
        await tx.userRole.createMany({
          data: roleIds.map((roleId) => ({ userId: id, roleId })),
        });
      }
      return tx.user.findUniqueOrThrow({
        where: { id },
        include: {
          roles: { select: { role: { select: { id: true, key: true, name: true } } } },
          employee: { select: { id: true, name: true, type: true } },
        },
      });
    });
  }

  resetPassword(id: string, passwordHash: string) {
    return this.prisma.user.update({
      where: { id },
      data: { passwordHash },
    });
  }

  /** Hapus akun staf — menolak akun yang hanya punya role ortu. */
  async deleteStaff(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { roles: { include: { role: true } } },
    });
    if (!user) return { count: 0 };
    const staffRoles = user.roles.filter((r) => r.role.key !== 'spmb_parent');
    if (staffRoles.length === 0) return { count: 0 };
    return this.prisma.user.delete({ where: { id } }).then(() => ({ count: 1 }));
  }

  /** Flattens a user's roles/permissions into the request principal. */
  toAuthUser(user: UserWithAccess): AuthUser {
    const roles = user.roles.map((ur) => ur.role.key);
    const permissions = new Set<PermissionKey>();
    for (const ur of user.roles) {
      for (const rp of ur.role.permissions) {
        permissions.add(rp.permission.key as PermissionKey);
      }
    }
    return {
      id: user.id,
      email: user.email ?? undefined,
      phone: user.phone ?? undefined,
      name: user.name,
      roles,
      permissions: [...permissions],
    };
  }
}

/** Normalisasi nomor HP Indonesia → format 628xx (tanpa +/spasi/dash). */
export function normalizePhone(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = `62${digits.slice(1)}`;
  return digits;
}
