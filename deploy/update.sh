#!/usr/bin/env bash
# Update to the latest commit of the checked-out branch: pull, rebuild, restart, check; roll back automatically if unhealthy.
# Run as root from /srv/brolingvo-poland (also called by the autoupdate timer).
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"; cd "$REPO"
APP_PORT="${APP_PORT:-$(awk '$1=="brolingvo-poland" {print $2; exit}' /etc/host/projects 2>/dev/null)}"; APP_PORT="${APP_PORT:-8120}"
prev="$(git rev-parse HEAD)"
# the branch this checkout follows (polish on the old Navyk repo, main on brolingvo-poland) — never a hardcoded name
BRANCH="$(git symbolic-ref -q --short HEAD || echo main)"
git pull -q --ff-only origin "$BRANCH"
now="$(git rev-parse HEAD)"
healthy() {
  for i in $(seq 1 45); do
    curl -fsS -m 3 "http://127.0.0.1:$APP_PORT/api/health" >/dev/null 2>&1 && return 0
    sleep 2
  done
  return 1
}
# servers installed before accounts existed: derive PUBLIC_ORIGIN (CSRF check, email links) from the Caddy site
ENV_FILE=/etc/brolingvo-poland/brolingvo-poland.env
if [ -f "$ENV_FILE" ] && ! grep -q '^PUBLIC_ORIGIN=' "$ENV_FILE"; then
  site="$(grep -l "reverse_proxy 127.0.0.1:$APP_PORT" /etc/caddy/sites/*.caddy 2>/dev/null | head -1 | xargs -r basename | sed 's/\.caddy$//' || true)"
  [ -n "$site" ] && { printf 'PUBLIC_ORIGIN=https://%s\n' "$site" >> "$ENV_FILE"; echo "brolingvo-poland: PUBLIC_ORIGIN=https://$site added"; }
fi
APP_PORT="$APP_PORT" docker compose build app
APP_PORT="$APP_PORT" docker compose up -d app
if healthy; then
  echo "brolingvo-poland updated ${prev:0:7} -> ${now:0:7}"
  docker image prune -f >/dev/null 2>&1 || true
  exit 0
fi
docker compose logs --tail 80 app >&2
echo "brolingvo-poland ${now:0:7} unhealthy — rolling back to ${prev:0:7}" >&2
git checkout -q "$prev"
APP_PORT="$APP_PORT" docker compose build app && APP_PORT="$APP_PORT" docker compose up -d app
healthy && echo "rolled back to ${prev:0:7} (the branch stays ahead; fix it in GitHub and the next run retries)" >&2
git checkout -q "$BRANCH" 2>/dev/null || true
git reset -q --hard "$prev"
exit 1
