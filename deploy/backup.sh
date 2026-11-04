#!/usr/bin/env bash
# Daily copy of the accounts database (called by brolingvo-poland-backup.timer, 03:30). Run as root from /srv/brolingvo-poland.
# Inside the container: VACUUM INTO /data/backups/brolingvo-<date>.sqlite (consistent copy while the app runs, 14 days kept).
# Then the file is copied to the host: /var/backups/brolingvo-poland (also 14 days).
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"; cd "$REPO"
DEST=/var/backups/brolingvo-poland
KEEP_DAYS=14
day="$(date -u +%F)"
docker compose exec -T app node --no-warnings server/src/backup.ts
install -d -m 700 "$DEST"
docker compose cp "app:/data/backups/brolingvo-$day.sqlite" "$DEST/brolingvo-$day.sqlite"
chmod 600 "$DEST/brolingvo-$day.sqlite"
find "$DEST" -maxdepth 1 -name 'brolingvo-*.sqlite' -mtime +"$KEEP_DAYS" -delete
echo "brolingvo-poland backup: $DEST/brolingvo-$day.sqlite ($(du -h "$DEST/brolingvo-$day.sqlite" | cut -f1))"
