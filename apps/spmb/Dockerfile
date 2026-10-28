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
RUN pnpm install --frozen-lockfile --filter @smpmuh3/spmb...

FROM deps AS build
ARG NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/spmb ./apps/spmb
RUN pnpm --filter @smpmuh3/types build && pnpm --filter @smpmuh3/spmb build

FROM node:22-alpine AS runner
WORKDIR /app
RUN corepack enable
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/apps/spmb
EXPOSE 3001
CMD ["pnpm", "start"]
