#!/usr/bin/env bash
# Daily copy of the accounts database (called by navyk-backup.timer, 03:30). Run as root from /srv/navyk.
# Inside the container: VACUUM INTO /data/backups/navyk-<date>.sqlite (consistent copy while the app runs, 14 days kept).
# Then the file is copied to the host: /var/backups/navyk (also 14 days).
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"; cd "$REPO"
DEST=/var/backups/navyk
KEEP_DAYS=14
day="$(date -u +%F)"
docker compose exec -T app node --no-warnings server/src/backup.ts
install -d -m 700 "$DEST"
docker compose cp "app:/data/backups/navyk-$day.sqlite" "$DEST/navyk-$day.sqlite"
chmod 600 "$DEST/navyk-$day.sqlite"
find "$DEST" -maxdepth 1 -name 'navyk-*.sqlite' -mtime +"$KEEP_DAYS" -delete
echo "navyk backup: $DEST/navyk-$day.sqlite ($(du -h "$DEST/navyk-$day.sqlite" | cut -f1))"
