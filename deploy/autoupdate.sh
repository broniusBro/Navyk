#!/usr/bin/env bash
# Called by polish-autoupdate.timer. Pulls branch polish; rebuilds only if it changed; rolls back if the new version is unhealthy.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"; cd "$REPO"
APP_PORT="${APP_PORT:-8110}"
FAILED=/var/lib/polish/failed-commit
git fetch -q origin polish
target="$(git rev-parse origin/polish)"
[ "$(git rev-parse HEAD)" = "$target" ] && exit 0
# a commit that already failed its health check is not rebuilt again every 5 minutes
[ "$(cat "$FAILED" 2>/dev/null)" = "$target" ] && exit 0
if "$REPO/deploy/update.sh"; then
  rm -f "$FAILED"
else
  install -d /var/lib/polish && echo "$target" > "$FAILED"
  exit 1
fi
