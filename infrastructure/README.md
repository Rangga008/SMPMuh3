# Infrastructure

Local development infrastructure for the school platform. **Development only** —
production deployment (Nginx, TLS, Cloudflare) is handled in later phases.

## Services

| Service | Purpose | Port(s) |
|---|---|---|
| `postgres` | Primary database (all modules share one logical database, separated by Prisma schema) | 5432 |
| `redis` | Sessions/cache, rate limiting, future queues | 6379 |
| `rabbitmq` | Async jobs/events (notifications, integrations) | 5672, management UI on 15672 |
| `s3` | S3-compatible object storage for documents/uploads (S3Mock in dev) | API on 9000 |

## Usage

```bash
cp .env.example .env     # from repo root, then edit values
pnpm infra:up            # start all services
pnpm infra:logs          # follow logs
pnpm infra:down          # stop (data volumes are preserved)
```

Equivalent without pnpm (run from the repo root — `--env-file` resolves
relative to your current directory):

```bash
docker compose --env-file .env -f infrastructure/docker-compose.yml up -d
```

## Notes

- The bucket named by `S3_BUCKET` is created automatically on start.
- RabbitMQ management: http://localhost:15672.
- Data persists in named Docker volumes (`postgres-data`, `redis-data`,
  `rabbitmq-data`, `s3-data`). `docker compose down -v` deletes them.
