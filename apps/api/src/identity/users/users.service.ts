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

  findById(id: string): Promise<UserWithAccess | null> {
    return this.prisma.user.findUnique({
      where: { id },
      include: userWithAccess,
    });
  }

  async createWithRole(input: {
    name: string;
    email: string;
    passwordHash: string;
    roleKey: string;
  }): Promise<UserWithAccess> {
    const role = await this.prisma.role.findUniqueOrThrow({
      where: { key: input.roleKey },
    });
    return this.prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash: input.passwordHash,
        roles: { create: { roleId: role.id } },
      },
      include: userWithAccess,
    });
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
      email: user.email,
      name: user.name,
      roles,
      permissions: [...permissions],
    };
  }
}
