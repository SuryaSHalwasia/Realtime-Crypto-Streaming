# syntax=docker/dockerfile:1.7

########################
# Base + pnpm (shared) #
########################
FROM node:20-alpine AS base
ENV PNPM_HOME="/root/.local/share/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.10.0 --activate
WORKDIR /app

########################
# deps: install (fast) #
########################
FROM base AS deps
WORKDIR /app
COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY packages/*/package.json packages/*/
COPY apps/*/package.json apps/*/
ARG PNPM_FROZEN_LOCKFILE=true
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile=${PNPM_FROZEN_LOCKFILE}

########################
# build: code + build  #
########################
FROM deps AS build
WORKDIR /app
COPY . .

ARG PNPM_FROZEN_LOCKFILE=true
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile=${PNPM_FROZEN_LOCKFILE}

# --- CODEGEN ---
RUN echo "=== CODEGEN in packages/api ===" \
 && pnpm --filter "./packages/api" exec buf generate \
 && echo "=== CODEGEN done ==="

# --- BUILD API / SERVER / WEB ---
RUN echo "=== BUILD API ===" \
 && pnpm --filter "./packages/api" run build || (echo "API build failed" && exit 1)

RUN echo "=== BUILD SERVER ===" \
 && pnpm --filter "./apps/server" run build || (echo "Server build failed" && exit 1)

RUN echo "=== BUILD WEB (Next) ===" \
 && pnpm --filter "./apps/web" run build || (echo "Web build failed" && exit 1) \
 && echo "=== LIST .next ===" \
 && ls -la apps/web/.next || true \
 && echo "=== LIST .next/standalone ===" \
 && ls -la apps/web/.next/standalone || (echo "❌ Missing .next/standalone (did you set output:'standalone' in apps/web/next.config.js?)" && exit 1) \
 && echo "=== LIST .next/static ===" \
 && ls -la apps/web/.next/static || true

RUN pnpm prune --prod

#############################
# Runtime: server (API)     #
#############################
FROM node:20-alpine AS server
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/server/dist ./apps/server/dist
RUN echo "=== RUNTIME SERVER DIST ===" && ls -la ./apps/server/dist
ENV PORT=8080
EXPOSE 8080
CMD ["node", "apps/server/dist/index.js"]

#############################
# Runtime: web (Next.js)    #
#############################
FROM node:20-alpine AS web
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# run from /app so we expect /app/server.js
WORKDIR /app

# 1) copy full .next to inspect
COPY --from=build /app/apps/web/.next /tmp/next
RUN echo "=== RUNTIME: /tmp/next contents ===" \
 && find /tmp/next -maxdepth 3 -type d -print \
 && ls -la /tmp/next || true \
 && ls -la /tmp/next/standalone || true \
 && ls -la /tmp/next/static || true

# 2) place files where the standalone server expects them
#    standalone contains server.js at its root; we want it at /app/server.js
COPY --from=build /app/apps/web/.next/standalone ./
#    static assets must live at /app/apps/web/.next/static
RUN mkdir -p /app/apps/web/.next
COPY --from=build /app/apps/web/.next/static /app/apps/web/.next/static
#    public assets at /app/apps/web/public
COPY --from=build /app/apps/web/public /app/apps/web/public

# 3) dump final layout
RUN echo "=== FINAL WEB LAYOUT ===" \
 && ls -la /app | sed -n '1,200p' \
 && echo "--- apps/web ---" \
 && find /app/apps/web -maxdepth 3 -type d -print \
 && echo "--- check server.js ---" \
 && ( [ -f /app/server.js ] && ls -la /app/server.js || (echo '❌ /app/server.js missing'; exit 1) )

ENV NEXT_PUBLIC_API_URL=http://server:8080
EXPOSE 3000
CMD ["node", "server.js"]
