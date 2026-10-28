import { Injectable } from '@nestjs/common';
import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';
import { z } from 'zod';

// Load the repo-root .env for development, then any app-local .env.
// In production, env vars are injected and these files simply don't exist.
loadDotenv({ path: resolve(process.cwd(), '../../.env') });
loadDotenv({ path: resolve(process.cwd(), '.env'), override: true });

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),
  CORS_ORIGINS: z.string().default(''),
  S3_ENDPOINT: z.string().default('http://localhost:9000'),
  S3_REGION: z.string().default('local'),
  S3_ACCESS_KEY: z.string().default('dev-access-key'),
  S3_SECRET_KEY: z.string().default('dev-secret-key'),
  S3_BUCKET: z.string().default('smpmuh3-dev'),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true),
});

type Env = z.infer<typeof envSchema>;

const TTL_FACTOR: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/** Parses durations like "15m", "12h", "30d" into milliseconds. */
export function ttlToMs(ttl: string): number {
  const match = /^(\d+)([smhd])$/.exec(ttl.trim());
  if (!match) {
    throw new Error(`Invalid TTL format: "${ttl}" (expected e.g. 15m, 12h, 30d)`);
  }
  return Number(match[1]) * TTL_FACTOR[match[2]!]!;
}

@Injectable()
export class EnvService {
  private readonly env: Env;

  constructor() {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error(
        `Invalid environment configuration:\n${parsed.error.issues
          .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
          .join('\n')}`,
      );
    }
    this.env = parsed.data;
  }

  get nodeEnv() {
    return this.env.NODE_ENV;
  }
  get isProduction() {
    return this.env.NODE_ENV === 'production';
  }
  get apiPort() {
    return this.env.API_PORT;
  }
  get databaseUrl() {
    return this.env.DATABASE_URL;
  }
  get redisUrl() {
    return this.env.REDIS_URL;
  }
  get jwtAccessSecret() {
    return this.env.JWT_ACCESS_SECRET;
  }
  get jwtAccessTtl() {
    return this.env.JWT_ACCESS_TTL;
  }
  get jwtRefreshTtlMs() {
    return ttlToMs(this.env.JWT_REFRESH_TTL);
  }
  get corsOrigins(): string[] {
    return this.env.CORS_ORIGINS.split(',')
      .map((o) => o.trim())
      .filter(Boolean);
  }
  get s3() {
    return {
      endpoint: this.env.S3_ENDPOINT,
      region: this.env.S3_REGION,
      accessKeyId: this.env.S3_ACCESS_KEY,
      secretAccessKey: this.env.S3_SECRET_KEY,
      bucket: this.env.S3_BUCKET,
      forcePathStyle: this.env.S3_FORCE_PATH_STYLE,
    };
  }
}
