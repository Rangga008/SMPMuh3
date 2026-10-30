# apps/spmb — Next.js SPMB site. Build context: repository root.
FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/spmb/package.json ./apps/spmb/package.json
COPY packages/types/package.json ./packages/types/package.json
COPY packages/ui/package.json ./packages/ui/package.json
COPY packages/config/package.json ./packages/config/package.json
COPY packages/auth/package.json ./packages/auth/package.json
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @smpmuh3/spmb...

FROM deps AS build
ARG NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    DOCKER_BUILD=1
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/spmb ./apps/spmb
RUN --mount=type=cache,id=next-cache-spmb,target=/app/apps/spmb/.next/cache \
    pnpm --filter @smpmuh3/types build && pnpm --filter @smpmuh3/spmb build

# Runner hanya membawa output standalone — tanpa node_modules penuh.
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3001 \
    HOSTNAME=0.0.0.0
COPY --from=build /app/apps/spmb/.next/standalone ./
COPY --from=build /app/apps/spmb/.next/static ./apps/spmb/.next/static
EXPOSE 3001
CMD ["node", "apps/spmb/server.js"]
