# apps/api — NestJS API. Build context: repository root.
FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/types/package.json ./packages/types/package.json
COPY packages/ui/package.json ./packages/ui/package.json
COPY packages/config/package.json ./packages/config/package.json
COPY packages/auth/package.json ./packages/auth/package.json
RUN --mount=type=cache,id=s/9b9f3406-4abc-4e18-bc1a-d9b6a37e76af-/root/.local/share/pnpm/store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @smpmuh3/api...

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm --filter @smpmuh3/types build \
    && pnpm --filter @smpmuh3/api exec prisma generate \
    && rm -f apps/api/tsconfig.build.tsbuildinfo \
    && pnpm --filter @smpmuh3/api build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
EXPOSE 4000
CMD ["node", "apps/api/dist/main.js"]
