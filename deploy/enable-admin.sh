#!/usr/bin/env bash
# Turn on the admin panel at admin.<site> and make the first owner. Run as root, interactively:
#   ssh -t root@65.108.234.212 /srv/navyk/deploy/enable-admin.sh
# Before: DNS A record admin.<site> -> this server's IP; the owner's account registered on the site
# with a confirmed email (or signed in with Google). Safe to run again (e.g. to add another owner).
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"; cd "$REPO"
APP_PORT="${APP_PORT:-8100}"
ENV_FILE=/etc/navyk/navyk.env
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
[ "$(id -u)" = 0 ] || die "run as root"
[ -f "$ENV_FILE" ] || die "$ENV_FILE missing — run deploy/install.sh first"

SITE="$(grep -E '^PUBLIC_ORIGIN=https://' "$ENV_FILE" | tail -1 | sed -E 's#^PUBLIC_ORIGIN=https://##; s#/.*$##')"
[ -n "$SITE" ] || die "PUBLIC_ORIGIN is not set in $ENV_FILE — run deploy/install.sh first"
ADMIN_HOST="${ADMIN_HOST:-admin.$SITE}"

echo "== 1/4 DNS for $ADMIN_HOST"
IP="$(curl -fsS -m 5 http://169.254.169.254/hetzner/v1/metadata/public-ipv4 2>/dev/null || hostname -I | awk '{print $1}')"
GOT="$(getent ahostsv4 "$ADMIN_HOST" 2>/dev/null | awk 'NR==1{print $1}')"
if [ "$GOT" != "$IP" ]; then
  die "$ADMIN_HOST resolves to '${GOT:-nothing}', expected $IP. Add the DNS record: type A, name admin, value $IP — then run again (DNS may take a few minutes)."
fi
echo "ok ($IP)"

echo "== 2/4 ADMIN_ORIGIN in $ENV_FILE"
grep -v '^ADMIN_ORIGIN=' "$ENV_FILE" > "$ENV_FILE.new" || true
printf 'ADMIN_ORIGIN=https://%s\n' "$ADMIN_HOST" >> "$ENV_FILE.new"
mv "$ENV_FILE.new" "$ENV_FILE"; chmod 600 "$ENV_FILE"
echo "ok"

echo "== 3/4 Caddy site + app restart (deploy/install.sh)"
SITE="$SITE" APP_PORT="$APP_PORT" "$REPO/deploy/install.sh"
APP_PORT="$APP_PORT" docker compose up -d --force-recreate app >/dev/null
for i in $(seq 1 30); do
  curl -fsS -m 3 "http://127.0.0.1:$APP_PORT/api/health" >/dev/null 2>&1 && break
  [ "$i" = 30 ] && die "app did not come back; see: docker compose logs --tail 80 app"
  sleep 2
done

echo "== 4/4 owner of the admin panel"
read -r -p "Email of the owner's Navyk account (empty = skip): " email
email="$(printf '%s' "$email" | tr -d '[:space:]')"
if [ -n "$email" ]; then
  docker compose exec -T app node --disable-warning=ExperimentalWarning server/src/admin/grant.ts "$email" owner
fi
echo
echo "Admin panel: https://$ADMIN_HOST — sign in with the account's email and password."
echo "Google-only account? Set a password on https://$SITE: Sign in -> Forgot password."
