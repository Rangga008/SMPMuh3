import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AuthTokens, AuthUser } from '@smpmuh3/types';
import argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { AuditService } from '../../audit/audit.service';
import { EnvService } from '../../core/config/env.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { UsersService } from '../users/users.service';

interface RequestMeta {
  ip?: string | undefined;
  userAgent?: string | undefined;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly env: EnvService,
    private readonly audit: AuditService,
  ) {}

  async login(
    email: string,
    password: string,
    meta: RequestMeta,
  ): Promise<AuthTokens> {
    const user = await this.users.findByEmail(email.toLowerCase());
    const valid =
      user !== null &&
      user.status === 'ACTIVE' &&
      (await argon2.verify(user.passwordHash, password).catch(() => false));

    if (!valid) {
      await this.audit.log({
        action: 'auth.login_failed',
        entity: 'user',
        metadata: { email },
        ...meta,
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    const tokens = await this.issueTokens(this.users.toAuthUser(user), meta);
    await this.audit.log({
      actorId: user.id,
      action: 'auth.login',
      entity: 'user',
      entityId: user.id,
      ...meta,
    });
    return tokens;
  }

  /** Rotates the refresh token and returns a new token pair. */
  async refresh(rawToken: string, meta: RequestMeta): Promise<AuthTokens> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      include: {
        user: {
          include: {
            roles: {
              include: {
                role: {
                  include: {
                    permissions: { include: { permission: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (
      !stored ||
      stored.revokedAt !== null ||
      stored.expiresAt < new Date() ||
      stored.user.status !== 'ACTIVE'
    ) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokens(this.users.toAuthUser(stored.user), meta);
  }

  /** Parent self-registration → account with the spmb_parent role. */
  async register(
    name: string,
    email: string,
    password: string,
    meta: RequestMeta,
  ): Promise<AuthTokens> {
    const normalized = email.toLowerCase();
    const exists = await this.users.findByEmail(normalized);
    if (exists) {
      throw new ConflictException('Email is already registered');
    }
    const user = await this.users.createWithRole({
      name: name.trim(),
      email: normalized,
      passwordHash: await argon2.hash(password),
      roleKey: 'spmb_parent',
    });
    const tokens = await this.issueTokens(this.users.toAuthUser(user), meta);
    await this.audit.log({
      actorId: user.id,
      action: 'auth.register',
      entity: 'user',
      entityId: user.id,
      ...meta,
    });
    return tokens;
  }

  /**
   * Issues a password-reset token. Always resolves — never reveals whether
   * the email exists. Delivery lands with notifications (Phase 10); in
   * development the token is logged by the audit trail / console below.
   */
  async forgotPassword(email: string, meta: RequestMeta): Promise<void> {
    const user = await this.users.findByEmail(email.toLowerCase());
    if (user) {
      const raw = randomBytes(32).toString('hex');
      await this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(raw),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      });
      this.logger.warn(
        `Password reset token for ${email} (dev only, email delivery pending): ${raw}`,
      );
      await this.audit.log({
        actorId: user.id,
        action: 'auth.forgot_password',
        entity: 'user',
        entityId: user.id,
        ...meta,
      });
    }
  }

  async resetPassword(token: string, password: string): Promise<void> {
    const stored = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!stored || stored.usedAt !== null || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: stored.userId },
        data: { passwordHash: await argon2.hash(password) },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: stored.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  async logout(rawToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async me(userId: string): Promise<AuthUser> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedException();
    }
    return this.users.toAuthUser(user);
  }

  private async issueTokens(
    user: AuthUser,
    meta: RequestMeta,
  ): Promise<AuthTokens> {
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      name: user.name,
      roles: user.roles,
      permissions: user.permissions,
    });

    const rawRefresh = randomBytes(48).toString('hex');
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(rawRefresh),
        expiresAt: new Date(Date.now() + this.env.jwtRefreshTtlMs),
        userAgent: meta.userAgent ?? null,
        ip: meta.ip ?? null,
      },
    });

    const decoded = this.jwt.decode(accessToken) as { exp: number; iat: number };
    return {
      accessToken,
      refreshToken: rawRefresh,
      expiresIn: decoded.exp - decoded.iat,
      tokenType: 'Bearer',
    };
  }
}

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}
