#!/usr/bin/env bash
# Update to the latest main: pull, rebuild, restart, check; roll back automatically if unhealthy.
# Run as root from /srv/navyk (also called by the autoupdate timer).
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"; cd "$REPO"
APP_PORT="${APP_PORT:-8100}"
prev="$(git rev-parse HEAD)"
git pull -q --ff-only origin main
now="$(git rev-parse HEAD)"
healthy() {
  for i in $(seq 1 45); do
    curl -fsS -m 3 "http://127.0.0.1:$APP_PORT/api/health" >/dev/null 2>&1 && return 0
    sleep 2
  done
  return 1
}
APP_PORT="$APP_PORT" docker compose build app
APP_PORT="$APP_PORT" docker compose up -d app
if healthy; then
  echo "navyk updated ${prev:0:7} -> ${now:0:7}"
  docker image prune -f >/dev/null 2>&1 || true
  exit 0
fi
docker compose logs --tail 80 app >&2
echo "navyk ${now:0:7} unhealthy — rolling back to ${prev:0:7}" >&2
git checkout -q "$prev"
APP_PORT="$APP_PORT" docker compose build app && APP_PORT="$APP_PORT" docker compose up -d app
healthy && echo "rolled back to ${prev:0:7} (main stays ahead; fix it in GitHub and the next run retries)" >&2
git checkout -q main 2>/dev/null || true
git reset -q --hard "$prev"
exit 1
