#!/usr/bin/env bash
# Called by brolingvo-poland-autoupdate.timer. Pulls the checked-out branch; rebuilds only if it changed; rolls back if the new version is unhealthy.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"; cd "$REPO"
APP_PORT="${APP_PORT:-$(awk '$1=="brolingvo-poland" {print $2; exit}' /etc/host/projects 2>/dev/null)}"; APP_PORT="${APP_PORT:-8120}"
FAILED=/var/lib/brolingvo-poland/failed-commit
# the branch this checkout follows (polish on the old Navyk repo, main on brolingvo-poland) — never a hardcoded name
BRANCH="$(git symbolic-ref -q --short HEAD || echo main)"
git fetch -q origin "$BRANCH"
target="$(git rev-parse "origin/$BRANCH")"
[ "$(git rev-parse HEAD)" = "$target" ] && exit 0
# a commit that already failed its health check is not rebuilt again every 5 minutes
[ "$(cat "$FAILED" 2>/dev/null)" = "$target" ] && exit 0
if "$REPO/deploy/update.sh"; then
  rm -f "$FAILED"
else
  install -d /var/lib/brolingvo-poland && echo "$target" > "$FAILED"
  exit 1
fi
