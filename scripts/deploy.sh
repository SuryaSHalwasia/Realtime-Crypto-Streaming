#!/usr/bin/env bash
set -Eeuo pipefail

# Run from repo root even if called from elsewhere
cd "$(dirname "${BASH_SOURCE[0]}")/.."

# --- Ensure pnpm is on PATH for non-login shells (Actions SSH sessions)
if ! command -v pnpm >/dev/null 2>&1; then
  export PNPM_HOME="${PNPM_HOME:-$HOME/.local/share/pnpm}"
  export PATH="$PNPM_HOME:$PATH"
fi

# --- Optional: load env from a shared file (kept outside deploy wipes)
# e.g. /opt/pluto/shared/.env
if [ -f "./shared/.env" ]; then
  set -a; source ./shared/.env; set +a
fi

# Defaults if not provided
export NODE_ENV="${NODE_ENV:-production}"
export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-http://localhost:8080}"
export TV_WINDOW_MODE="${TV_WINDOW_MODE:-offscreen}"

echo "[deploy] installing deps…"
pnpm install --frozen-lockfile

echo "[deploy] codegen (idempotent)…"
pnpm -C packages/api generate || true

echo "[deploy] ensuring Playwright Chromium…"
pnpm -C apps/server exec playwright install --with-deps chromium

echo "[deploy] building server & web…"
pnpm -C apps/server build
pnpm -C apps/web build

echo "[deploy] starting/reloading via PM2…"
if ! command -v pm2 >/dev/null 2>&1; then
  npm i -g pm2
fi
pm2 startOrReload ecosystem.config.cjs --env production
pm2 save

echo "[deploy] done."
