# apps/cbt — Next.js CBT siswa. Build context: repository root.
FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/cbt/package.json ./apps/cbt/package.json
COPY packages/types/package.json ./packages/types/package.json
COPY packages/ui/package.json ./packages/ui/package.json
COPY packages/config/package.json ./packages/config/package.json
COPY packages/auth/package.json ./packages/auth/package.json
RUN --mount=type=cache,id=s/508ee5c6-3958-4c4c-8b49-0fdac2851451-/root/.local/share/pnpm/store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @smpmuh3/cbt...

FROM deps AS build
ARG NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    DOCKER_BUILD=1
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/cbt ./apps/cbt
RUN --mount=type=cache,id=s/508ee5c6-3958-4c4c-8b49-0fdac2851451-/app/apps/cbt/.next/cache,target=/app/apps/cbt/.next/cache \
    pnpm --filter @smpmuh3/types build && pnpm --filter @smpmuh3/cbt build

# Runner hanya membawa output standalone — tanpa node_modules penuh.
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3005 \
    HOSTNAME=0.0.0.0
COPY --from=build /app/apps/cbt/.next/standalone ./
COPY --from=build /app/apps/cbt/.next/static ./apps/cbt/.next/static
EXPOSE 3005
CMD ["node", "apps/cbt/server.js"]
