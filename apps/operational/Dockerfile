# apps/operational — Next.js admin shell. Build context: repository root.
FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/operational/package.json ./apps/operational/package.json
COPY packages/types/package.json ./packages/types/package.json
COPY packages/ui/package.json ./packages/ui/package.json
COPY packages/config/package.json ./packages/config/package.json
COPY packages/auth/package.json ./packages/auth/package.json
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @smpmuh3/operational...

FROM deps AS build
ARG NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    DOCKER_BUILD=1
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/operational ./apps/operational
RUN --mount=type=cache,id=next-cache-ops,target=/app/apps/operational/.next/cache \
    pnpm --filter @smpmuh3/types build && pnpm --filter @smpmuh3/operational build

# Runner hanya membawa output standalone — tanpa node_modules penuh.
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3002 \
    HOSTNAME=0.0.0.0
COPY --from=build /app/apps/operational/.next/standalone ./
COPY --from=build /app/apps/operational/.next/static ./apps/operational/.next/static
EXPOSE 3002
CMD ["node", "apps/operational/server.js"]
