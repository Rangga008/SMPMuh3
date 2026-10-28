import { Controller, Get, Inject } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckError,
  HealthCheckService,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import { Redis } from 'ioredis';
import { Public } from '../../identity/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS } from '../core.tokens';

@Public()
@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /** Liveness — process is up. */
  @Get()
  liveness() {
    return { status: 'ok' };
  }

  /** Readiness — dependencies reachable. */
  @Get('ready')
  @HealthCheck()
  readiness() {
    return this.health.check([
      () => this.checkDatabase(),
      () => this.checkRedis(),
    ]);
  }

  private async checkDatabase(): Promise<HealthIndicatorResult> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { database: { status: 'up' } };
    } catch (e) {
      throw new HealthCheckError('Database check failed', {
        database: { status: 'down', error: (e as Error).message },
      });
    }
  }

  private async checkRedis(): Promise<HealthIndicatorResult> {
    try {
      await this.redis.ping();
      return { redis: { status: 'up' } };
    } catch (e) {
      throw new HealthCheckError('Redis check failed', {
        redis: { status: 'down', error: (e as Error).message },
      });
    }
  }
}
