import { Global, Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { Redis } from 'ioredis';
import { EnvService } from './config/env.service';
import { REDIS } from './core.tokens';
import { HealthController } from './health/health.controller';
import { PrismaService } from './prisma/prisma.service';
import { StorageService } from './storage/storage.service';

@Global()
@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [
    EnvService,
    PrismaService,
    StorageService,
    {
      provide: REDIS,
      useFactory: (env: EnvService) =>
        new Redis(env.redisUrl, {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          retryStrategy: () => null,
        }),
      inject: [EnvService],
    },
  ],
  exports: [EnvService, PrismaService, REDIS, StorageService],
})
export class CoreModule {}
