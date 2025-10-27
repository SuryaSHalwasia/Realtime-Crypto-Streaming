#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ---------- Codegen (idempotent)
echo "[run.sh] generating API stubs…"
pnpm -C "$ROOT_DIR/packages/api" generate

# ---------- Ensure Playwright browser (headed Chromium per spec)
echo "[run.sh] installing Playwright Chromium…"
pnpm -C "$ROOT_DIR/apps/server" exec playwright install --with-deps chromium

# ---------- Env for web to reach server
export NEXT_PUBLIC_API_URL="http://localhost:8080"

# ---------- Start services
echo "[run.sh] starting Connect server…"
pnpm -C "$ROOT_DIR/apps/server" dev:api &
SERVER_PID=$!

echo "[run.sh] starting Next.js web…"
pnpm -C "$ROOT_DIR/apps/web" dev &
WEB_PID=$!

pids=("$SERVER_PID" "$WEB_PID")
echo "[run.sh] server PID=$SERVER_PID, web PID=$WEB_PID"

cleanup() {
  echo -e "\n[run.sh] shutting down…"
  for pid in "${pids[@]}"; do
    if [[ -n "${pid:-}" ]] && [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done

  # wait briefly for graceful shutdown
  for _ in {1..20}; do
    alive=0
    for pid in "${pids[@]}"; do
      if [[ -n "${pid:-}" ]] && kill -0 "$pid" 2>/dev/null; then
        alive=1
        break
      fi
    done
    [[ $alive -eq 0 ]] && break
    sleep 0.2
  done

  # force kill if still alive
  for pid in "${pids[@]}"; do
    if [[ -n "${pid:-}" ]] && kill -0 "$pid" 2>/dev/null; then
      echo "[run.sh] force killing $pid"
      kill -9 "$pid" 2>/dev/null || true
    fi
  done
}

on_sigint()  { echo "[run.sh] SIGINT received";  cleanup; exit 0; }
on_sigterm() { echo "[run.sh] SIGTERM received"; cleanup; exit 0; }
trap on_sigint INT
trap on_sigterm TERM
trap cleanup EXIT

# ---------- Wait until one process exits, then clean up the other
if wait -n "${pids[@]}" 2>/dev/null; then
  status=$?
else
  # Fallback for shells without wait -n (e.g., some Git Bash)
  while :; do
    any_done=0
    for pid in "${pids[@]}"; do
      if ! kill -0 "$pid" 2>/dev/null; then
        any_done=1
        break
      fi
    done
    [[ $any_done -eq 1 ]] && break
    sleep 0.5
  done
  status=0
fi

cleanup
exit "$status"
