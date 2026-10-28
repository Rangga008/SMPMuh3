import { config } from 'dotenv';
import { resolve } from 'node:path';
import { defineConfig } from 'prisma/config';

// Env lives at the repo root in development; an app-local .env may override.
config({ path: resolve(__dirname, '../../.env') });
config({ path: resolve(__dirname, '.env'), override: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
});
