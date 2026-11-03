import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { EnvService } from '../core/config/env.service';
import { PrismaService } from '../core/prisma/prisma.service';

export interface WaEnqueueResult {
  /** Pesan langsung terkirim saat itu juga (gateway aktif & antrean kosong). */
  sent: boolean;
  /** Pesan masuk antrean menunggu giliran kirim. */
  queued: boolean;
  /** Tautan wa.me siap klik — fallback bila gateway nonaktif/gagal. */
  waUrl: string;
  /** Id baris antrean (untuk pelacakan). */
  messageId?: string;
}

/** Konfigurasi efektif gateway WA (DB → fallback env). */
export interface WaConfig {
  enabled: boolean;
  gatewayUrl: string;
  hasToken: boolean;
  tokenPreview: string | null;
  intervalSeconds: number;
  dailyLimit: number;
  source: 'db' | 'env';
}

const SETTINGS_ID = 'whatsapp';
const MAX_ATTEMPTS = 3;
const WORKER_TICK_MS = 3_000;

/**
 * Pengirim pesan WhatsApp lewat antrean anti-spam.
 *
 * - Konfigurasi disimpan di tabel `whatsapp_settings` (singleton) dan bisa
 *   diubah dari Pengaturan → WhatsApp; env WA_GATEWAY_* jadi nilai awal.
 * - Pesan tidak dikirim sekaligus — masuk `whatsapp_messages` lalu worker
 *   mengirim satu per satu dengan jeda `intervalSeconds` (default 8 dtk)
 *   dan batas `dailyLimit` per hari, supaya nomor tidak dianggap spam.
 * - Bila gateway nonaktif/token kosong, pesan tetap mengantre dan caller
 *   mendapat `waUrl` (wa.me) sebagai jalur manual.
 */
@Injectable()
export class WhatsappService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsappService.name);
  private timer: NodeJS.Timeout | null = null;
  private dispatching = false;
  private lastSentAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly env: EnvService,
  ) {}

  static waUrl(phone: string, message: string) {
    const target = normalizeWaTarget(phone);
    return `https://wa.me/${target}?text=${encodeURIComponent(message)}`;
  }

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), WORKER_TICK_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  // ---------- Konfigurasi ----------

  /** Baris settings — dibuat malas dari env saat pertama diakses. */
  private async settingsRow() {
    let row = await this.prisma.whatsappSetting.findUnique({
      where: { id: SETTINGS_ID },
    });
    if (!row) {
      row = await this.prisma.whatsappSetting.create({
        data: {
          id: SETTINGS_ID,
          enabled: this.env.waGateway.configured,
          gatewayUrl: this.env.waGateway.url,
          gatewayToken: this.env.waGateway.token || null,
        },
      });
    }
    return row;
  }

  async getConfig(): Promise<WaConfig> {
    const row = await this.settingsRow();
    const token = row.gatewayToken;
    return {
      enabled: row.enabled,
      gatewayUrl: row.gatewayUrl,
      hasToken: !!token,
      tokenPreview: token ? `••••${token.slice(-4)}` : null,
      intervalSeconds: row.intervalSeconds,
      dailyLimit: row.dailyLimit,
      source: 'db',
    };
  }

  async updateConfig(
    dto: {
      enabled?: boolean;
      gatewayUrl?: string;
      gatewayToken?: string;
      intervalSeconds?: number;
      dailyLimit?: number;
    },
    actorId: string,
  ): Promise<WaConfig> {
    const data: Prisma.WhatsappSettingUpdateInput = { updatedBy: actorId };
    if (dto.enabled !== undefined) data.enabled = dto.enabled;
    if (dto.gatewayUrl !== undefined) data.gatewayUrl = dto.gatewayUrl;
    if (dto.intervalSeconds !== undefined)
      data.intervalSeconds = dto.intervalSeconds;
    if (dto.dailyLimit !== undefined) data.dailyLimit = dto.dailyLimit;
    // Token write-only: string kosong/blank berarti "hapus", absen = tidak diubah.
    if (dto.gatewayToken !== undefined) {
      data.gatewayToken = dto.gatewayToken.trim() || null;
    }
    await this.settingsRow();
    await this.prisma.whatsappSetting.update({
      where: { id: SETTINGS_ID },
      data,
    });
    return this.getConfig();
  }

  /** Token mentah — hanya untuk pemakaian internal worker. */
  private async rawToken() {
    const row = await this.settingsRow();
    return { row, token: row.gatewayToken ?? '' };
  }

  // ---------- Antrean ----------

  /**
   * Masukkan pesan ke antrean. Selalu membuat baris — pengiriman aktual
   * dilakukan worker sesuai jeda & batas harian.
   */
  async enqueue(input: {
    type: string;
    phone: string;
    message: string;
    refType?: string;
    refId?: string;
    actorId?: string;
  }): Promise<WaEnqueueResult> {
    const target = normalizeWaTarget(input.phone);
    const waUrl = `https://wa.me/${target}?text=${encodeURIComponent(input.message)}`;
    const row = await this.prisma.whatsappMessage.create({
      data: {
        type: input.type,
        phone: target,
        message: input.message,
        refType: input.refType ?? null,
        refId: input.refId ?? null,
        createdBy: input.actorId ?? null,
      },
    });
    // Coba kirim segera bila antrean kosong — worker juga menyusul.
    void this.tick();
    return { sent: false, queued: true, waUrl, messageId: row.id };
  }

  async listMessages(options: {
    type?: string | undefined;
    status?: 'QUEUED' | 'SENDING' | 'SENT' | 'FAILED' | 'CANCELLED' | undefined;
    take?: number | undefined;
  }) {
    const where: Prisma.WhatsappMessageWhereInput = {};
    if (options.type) where.type = options.type;
    if (options.status) where.status = options.status;
    const [rows, counts] = await Promise.all([
      this.prisma.whatsappMessage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Math.min(options.take ?? 100, 300),
      }),
      this.prisma.whatsappMessage.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
    ]);
    const types = await this.prisma.whatsappMessage.findMany({
      select: { type: true },
      distinct: ['type'],
    });
    return {
      messages: rows.map((m) => this.messageDto(m)),
      counts: Object.fromEntries(
        counts.map((c) => [c.status, c._count._all]),
      ),
      types: types.map((t) => t.type),
    };
  }

  /** Kirim ulang pesan gagal/dibatalkan → antre lagi. */
  async retryMessage(id: string) {
    const msg = await this.prisma.whatsappMessage.findUnique({ where: { id } });
    if (!msg) throw new NotFoundException('Pesan tidak ditemukan.');
    if (!['FAILED', 'CANCELLED'].includes(msg.status)) {
      throw new BadRequestException(
        'Hanya pesan gagal/dibatalkan yang bisa dikirim ulang.',
      );
    }
    const updated = await this.prisma.whatsappMessage.update({
      where: { id },
      data: { status: 'QUEUED', attempts: 0, lastError: null },
    });
    void this.tick();
    return this.messageDto(updated);
  }

  async cancelMessage(id: string) {
    const msg = await this.prisma.whatsappMessage.findUnique({ where: { id } });
    if (!msg) throw new NotFoundException('Pesan tidak ditemukan.');
    if (msg.status !== 'QUEUED') {
      throw new BadRequestException(
        'Hanya pesan yang masih mengantre yang bisa dibatalkan.',
      );
    }
    const updated = await this.prisma.whatsappMessage.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
    return this.messageDto(updated);
  }

  // ---------- Worker ----------

  /** Satu putaran kirim — dipanggil interval & setelah enqueue/retry. */
  private async tick() {
    if (this.dispatching) return;
    this.dispatching = true;
    try {
      const { row: cfg, token } = await this.rawToken();
      if (!cfg.enabled || !token) return;
      if (Date.now() - this.lastSentAt < cfg.intervalSeconds * 1000) return;

      // Batas harian (dihitung dari sent_at hari ini + queued yang sedang dikirim).
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      const sentToday = await this.prisma.whatsappMessage.count({
        where: { status: 'SENT', sentAt: { gte: dayStart } },
      });
      if (sentToday >= cfg.dailyLimit) return;

      const next = await this.prisma.whatsappMessage.findFirst({
        where: { status: 'QUEUED' },
        orderBy: { createdAt: 'asc' },
      });
      if (!next) return;

      // Klaim atomik — hindari kirim ganda bila ada replika API.
      const claimed = await this.prisma.whatsappMessage.updateMany({
        where: { id: next.id, status: 'QUEUED' },
        data: { status: 'SENDING', attempts: { increment: 1 } },
      });
      if (claimed.count === 0) return;

      const result = await this.deliver(next.phone, next.message, {
        url: cfg.gatewayUrl,
        token,
      });
      this.lastSentAt = Date.now();
      if (result.ok) {
        await this.prisma.whatsappMessage.update({
          where: { id: next.id },
          data: { status: 'SENT', sentAt: new Date(), lastError: null },
        });
      } else {
        const attempts = next.attempts + 1;
        const final = attempts >= MAX_ATTEMPTS;
        await this.prisma.whatsappMessage.update({
          where: { id: next.id },
          data: {
            status: final ? 'FAILED' : 'QUEUED',
            lastError: result.error.slice(0, 300),
          },
        });
        if (!final) this.lastSentAt = 0; // retry segera pada tick berikutnya
      }
    } catch (err) {
      this.logger.warn(
        `WA worker error: ${err instanceof Error ? err.message : err}`,
      );
    } finally {
      this.dispatching = false;
    }
  }

  /** Panggilan HTTP ke gateway gaya-Fonnte ({target, message} + Bearer token). */
  private async deliver(
    phone: string,
    message: string,
    gw: { url: string; token: string },
  ): Promise<{ ok: boolean; error: string }> {
    try {
      const res = await fetch(gw.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: gw.token,
        },
        body: JSON.stringify({ target: phone, message }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const body = (await res.json().catch(() => ({}))) as {
        status?: boolean;
        reason?: string;
      };
      if (body.status === false) {
        return { ok: false, error: body.reason ?? 'gateway menolak' };
      }
      return { ok: true, error: '' };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private messageDto(m: {
    id: string;
    type: string;
    phone: string;
    message: string;
    status: string;
    attempts: number;
    lastError: string | null;
    sentAt: Date | null;
    refType: string | null;
    refId: string | null;
    createdAt: Date;
  }) {
    return {
      id: m.id,
      type: m.type,
      phone: m.phone,
      message: m.message,
      status: m.status,
      attempts: m.attempts,
      lastError: m.lastError,
      sentAt: m.sentAt,
      refType: m.refType,
      refId: m.refId,
      waUrl: WhatsappService.waUrl(m.phone, m.message),
      createdAt: m.createdAt,
    };
  }
}

/** 08xx / +62xx / 62xx → 62xx (format wa.me & Fonnte). */
export function normalizeWaTarget(phone: string): string {
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = `62${digits.slice(1)}`;
  if (digits.startsWith('620')) return digits; // sudah internasional +62
  if (!digits.startsWith('62')) digits = `62${digits}`;
  return digits;
}
