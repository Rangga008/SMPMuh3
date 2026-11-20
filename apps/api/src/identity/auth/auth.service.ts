import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AuthTokens, AuthUser } from '@smpmuh3/types';
import argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { AuditService } from '../../audit/audit.service';
import { EnvService } from '../../core/config/env.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { StorageService } from '../../core/storage/storage.service';
import { WhatsappService } from '../../spmb/whatsapp.service';
import { normalizePhone, UsersService } from '../users/users.service';
import { encryptPassword } from '../users/password-view';

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
    private readonly storage: StorageService,
    private readonly whatsapp: WhatsappService,
  ) {}

  async login(
    identifier: string,
    password: string,
    meta: RequestMeta,
  ): Promise<AuthTokens> {
    const user = await this.users.findByIdentifier(identifier.trim());
    const valid =
      user !== null &&
      user.status === 'ACTIVE' &&
      (await argon2.verify(user.passwordHash, password).catch(() => false));

    if (!valid) {
      await this.audit.log({
        action: 'auth.login_failed',
        entity: 'user',
        metadata: { identifier },
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

  /**
   * Parent self-registration → account with the spmb_parent role.
   * Nomor HP wajib (login + kwitansi); email opsional.
   */
  async register(
    name: string,
    phone: string,
    email: string | undefined,
    password: string,
    meta: RequestMeta,
  ): Promise<AuthTokens> {
    const normalizedPhone = normalizePhone(phone);
    const phoneTaken = await this.users.findByPhone(normalizedPhone);
    if (phoneTaken) {
      throw new ConflictException('Nomor HP sudah terdaftar');
    }
    const normalizedEmail = email?.toLowerCase().trim() || undefined;
    if (normalizedEmail) {
      const emailTaken = await this.users.findByEmail(normalizedEmail);
      if (emailTaken) {
        throw new ConflictException('Email sudah terdaftar');
      }
    }
    const user = await this.users.createWithRole({
      name: name.trim(),
      phone: normalizedPhone,
      email: normalizedEmail,
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
  async forgotPassword(
    identifier: string,
    meta: RequestMeta,
  ): Promise<void> {
    const user = await this.users.findByIdentifier(identifier.trim());
    if (user) {
      const raw = randomBytes(32).toString('hex');
      await this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(raw),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      });
      // JANGAN log token mentah — token = kunci takeover akun; siapa pun yang
      // bisa membaca log (journald, file log) jangan sampai bisa reset akun.
      // Log metadata saja; token dikirim lewat kanal notifikasi.
      this.logger.log(
        `Password reset token diterbitkan untuk ${identifier} (berlaku 1 jam, pengiriman via notifikasi).`,
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

  /**
   * Minta OTP reset sandi via WhatsApp. Selalu resolve tanpa membocorkan
   * apakah akun/nomor ada — respons sama untuk semua identifier.
   */
  async requestPasswordOtp(identifier: string, meta: RequestMeta): Promise<void> {
    const user = await this.users.findByIdentifier(identifier.trim());
    if (!user || user.status !== 'ACTIVE' || !user.phone) return;

    // Satu OTP aktif per akun — permintaan baru membatalkan yang lama.
    await this.prisma.passwordResetOtp.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    const code = String(Math.floor(100000 + Math.random() * 900000));
    await this.prisma.passwordResetOtp.create({
      data: {
        userId: user.id,
        codeHash: hashToken(code),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 menit
      },
    });
    await this.whatsapp.enqueue({
      type: 'password_otp',
      phone: user.phone,
      message:
        `*SMP Muhammadiyah 3 Bandung*\n\n` +
        `Kode OTP reset kata sandi akun *${user.name}*:\n\n` +
        `*${code}*\n\n` +
        `Berlaku 10 menit. JANGAN berikan kode ini ke siapa pun, ` +
        `termasuk yang mengaku pihak sekolah. Abaikan bila bukan permintaan Anda.`,
      refType: 'user',
      refId: user.id,
    });
    await this.audit.log({
      actorId: user.id,
      action: 'auth.password_otp_requested',
      entity: 'user',
      entityId: user.id,
      ...meta,
    });
  }

  /** Reset sandi dengan OTP dari WhatsApp — maks 5 percobaan per kode. */
  async resetPasswordWithOtp(identifier: string, code: string, password: string, meta: RequestMeta): Promise<void> {
    const invalid = new UnauthorizedException('Kode OTP salah atau kedaluwarsa.');
    const user = await this.users.findByIdentifier(identifier.trim());
    if (!user) throw invalid;
    const otp = await this.prisma.passwordResetOtp.findFirst({
      where: { userId: user.id, usedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp || otp.expiresAt < new Date() || otp.attempts >= 5) throw invalid;
    if (otp.codeHash !== hashToken(code.trim())) {
      await this.prisma.passwordResetOtp.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });
      throw invalid;
    }
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash: await argon2.hash(password),
          passwordView: encryptPassword(password),
        },
      }),
      this.prisma.passwordResetOtp.update({
        where: { id: otp.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    await this.audit.log({
      actorId: user.id,
      action: 'auth.password_reset_otp',
      entity: 'user',
      entityId: user.id,
      ...meta,
    });
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

  /** Profil mandiri: ubah nama/kontak akun sendiri. */
  async updateMe(
    userId: string,
    data: { name?: string; phone?: string; email?: string },
  ): Promise<AuthUser> {
    if (data.phone !== undefined) data.phone = normalizePhone(data.phone);
    if (data.phone) {
      const clash = await this.users.findByPhone(data.phone);
      if (clash && clash.id !== userId) {
        throw new ConflictException('Nomor HP sudah dipakai akun lain.');
      }
    }
    const email = data.email === '' ? null : data.email;
    if (email) {
      const clash = await this.users.findByEmail(email.toLowerCase().trim());
      if (clash && clash.id !== userId) {
        throw new ConflictException('Email sudah dipakai akun lain.');
      }
    }
    const updated = await this.users.updateUser(userId, {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.phone !== undefined ? { phone: data.phone } : {}),
      ...(data.email !== undefined ? { email } : {}),
    });
    // Ortu memperbarui nomor HP di akunnya → nomor kontak di data siswa
    // ikut sinkron (satu sumber kebenaran, tak perlu diisi dua kali).
    if (data.phone !== undefined) {
      await this.prisma.student.updateMany({
        where: { parentId: userId, deletedAt: null },
        data: { parentPhone: data.phone || null },
      });
    }
    await this.audit.log({
      actorId: userId,
      action: 'auth.update_profile',
      entity: 'user',
      entityId: userId,
    });
    return this.users.toAuthUser(updated);
  }

  /** Ganti sandi sendiri — wajib konfirmasi sandi lama; sesi lain dicabut. */
  async changeMyPassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.users.findById(userId);
    const ok =
      user !== null &&
      (await argon2.verify(user.passwordHash, currentPassword).catch(() => false));
    if (!ok) {
      throw new UnauthorizedException('Sandi saat ini salah');
    }
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          passwordHash: await argon2.hash(newPassword),
          passwordView: encryptPassword(newPassword),
        },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    await this.audit.log({
      actorId: userId,
      action: 'auth.change_password',
      entity: 'user',
      entityId: userId,
    });
  }

  /** Data pegawai yang terhubung ke akun (untuk halaman profil). */
  myEmployee(userId: string) {
    return this.prisma.employee.findFirst({
      where: { userId },
      select: {
        id: true,
        nip: true,
        name: true,
        type: true,
        email: true,
        phone: true,
        address: true,
        photoUrl: true,
        department: true,
        isDeptHead: true,
        isActive: true,
      },
    });
  }

  /** Pegawai memperbarui kontak/alamatnya sendiri (field identitas tetap admin). */
  updateMyEmployee(userId: string, dto: { email?: string; phone?: string; address?: string }) {
    return this.prisma.employee.updateMany({
      where: { userId },
      data: {
        ...(dto.email !== undefined ? { email: dto.email || null } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone ? normalizePhone(dto.phone) : null } : {}),
        ...(dto.address !== undefined ? { address: dto.address || null } : {}),
      },
    });
  }

  /** Unggah foto profil pegawai — disimpan di storage, URL endpoint publik. */
  async uploadMyEmployeePhoto(userId: string, file: Express.Multer.File) {
    const emp = await this.prisma.employee.findFirst({ where: { userId } });
    if (!emp) throw new NotFoundException('Akun belum terhubung ke data pegawai.');
    const ext = file.mimetype === 'image/png' ? 'png' : file.mimetype === 'image/webp' ? 'webp' : 'jpg';
    const key = `employees/${emp.id}/photo.${ext}`;
    await this.storage.putObject(key, file.buffer, file.mimetype);
    await this.prisma.employee.update({ where: { id: emp.id }, data: { photoUrl: key } });
    return { photoUrl: key };
  }

  /** Foto pegawai — endpoint publik seperti logo sekolah. */
  async employeePhoto(employeeId: string) {
    const emp = await this.prisma.employee.findUniqueOrThrow({ where: { id: employeeId } });
    if (!emp.photoUrl) throw new NotFoundException('Pegawai belum punya foto.');
    const buf = await this.storage.getObjectBuffer(emp.photoUrl);
    const ext = emp.photoUrl.split('.').pop() ?? 'jpg';
    return { buf, mime: ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg', name: `foto-${emp.name}.${ext}` };
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
