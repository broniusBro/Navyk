#!/usr/bin/env bash
# Install or re-install Navyk on the shared application server. Run as root from /srv/navyk.
#   SITE=navyk.example.com ./deploy/install.sh
# Safe to run again. Follows bronus-core/host/README.md: port 8100, secrets in /etc/navyk,
# own Caddy site file /etc/caddy/sites/<SITE>.caddy, own Compose project "navyk".
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"; cd "$REPO"
APP_PORT="${APP_PORT:-8100}"
IP="$(curl -fsS -m 5 http://169.254.169.254/hetzner/v1/metadata/public-ipv4 2>/dev/null || hostname -I | awk '{print $1}')"
SITE="${SITE:-$(echo "$IP" | tr . -).sslip.io}"
ENV_FILE=/etc/navyk/navyk.env
CADDY_SITE="/etc/caddy/sites/$SITE.caddy"
say() { printf '\n== navyk: %s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
[ "$(id -u)" = 0 ] || die "run as root"
command -v docker >/dev/null || die "Docker missing — run bronus-core/host/bootstrap.sh first"
[ -d /etc/caddy/sites ] || die "/etc/caddy/sites missing — run bronus-core/host/bootstrap.sh first"
if [ -f /etc/host/projects ] && ! grep -qE '^navyk[[:space:]]+'"$APP_PORT"'[[:space:]]' /etc/host/projects; then
  die "port $APP_PORT is not registered for navyk in /etc/host/projects"
fi
if ss -ltnH "sport = :$APP_PORT" | grep -q . && ! docker compose ps -q app 2>/dev/null | grep -q .; then
  die "port $APP_PORT is already used by something else"
fi

say "1/5 secrets ($ENV_FILE)"
install -d -m 700 /etc/navyk
if [ ! -f "$ENV_FILE" ]; then
  key=""
  if [ -t 0 ]; then
    read -r -s -p "Claude API key (sk-ant-api03-…), Enter to skip — the app then shows the self-check list instead of AI review: " key; echo
  fi
  umask 077
  printf 'ANTHROPIC_API_KEY=%s\nFREE_REVIEWS_PER_DAY=10\nIP_REVIEWS_PER_DAY=50\n' "$key" > "$ENV_FILE"
  echo "created (the key is not printed)"
else
  echo "kept existing"
fi
chmod 600 "$ENV_FILE"

say "2/5 build and start (first time 2–4 minutes)"
APP_PORT="$APP_PORT" docker compose build --pull app
APP_PORT="$APP_PORT" docker compose up -d app
for i in $(seq 1 60); do
  curl -fsS -m 3 "http://127.0.0.1:$APP_PORT/api/health" >/dev/null 2>&1 && break
  [ "$i" = 60 ] && { docker compose logs --tail 80 app; die "app did not become healthy"; }
  sleep 2
done
curl -fsS "http://127.0.0.1:$APP_PORT/api/health"; echo

say "3/5 Caddy site $SITE"
NEW="$(printf '%s {\n\tencode zstd gzip\n\treverse_proxy 127.0.0.1:%s\n}\n' "$SITE" "$APP_PORT")"
if [ "$(cat "$CADDY_SITE" 2>/dev/null)" != "$NEW" ]; then
  BK=""; [ -f "$CADDY_SITE" ] && { BK="$CADDY_SITE.bak-$(date +%Y%m%d-%H%M%S)"; cp -a "$CADDY_SITE" "$BK"; }
  printf '%s\n' "$NEW" > "$CADDY_SITE"; chmod 644 "$CADDY_SITE"
  if runuser -u caddy -- env HOME=/var/lib/caddy XDG_DATA_HOME=/var/lib/caddy/.local/share XDG_CONFIG_HOME=/var/lib/caddy/.config \
       caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/tmp/caddy-validate.log 2>&1; then
    systemctl restart caddy   # reload did not always apply changes on this server (host/README.md)
    echo "Caddy restarted"
  else
    tail -5 /tmp/caddy-validate.log
    if [ -n "$BK" ]; then cp -a "$BK" "$CADDY_SITE"; else rm -f "$CADDY_SITE"; fi
    die "Caddy rejected the site file; previous state restored"
  fi
  # old site files of navyk under another name (e.g. the sslip address after a real domain is set)
  for f in /etc/caddy/sites/*.caddy; do
    [ "$f" != "$CADDY_SITE" ] && grep -q "reverse_proxy 127.0.0.1:$APP_PORT" "$f" && { echo "removing old $f"; rm -f "$f"; systemctl restart caddy; }
  done
else
  echo "unchanged"
fi

say "4/5 automatic updates from GitHub (every 5 minutes, only when main changed)"
cat > /etc/systemd/system/navyk-autoupdate.service <<EOF
[Unit]
Description=Navyk: update from GitHub if main changed
After=network-online.target docker.service

[Service]
Type=oneshot
WorkingDirectory=$REPO
Environment=APP_PORT=$APP_PORT
ExecStart=$REPO/deploy/autoupdate.sh
EOF
cat > /etc/systemd/system/navyk-autoupdate.timer <<'EOF'
[Unit]
Description=Navyk: check GitHub for updates

[Timer]
OnBootSec=3min
OnUnitActiveSec=5min
RandomizedDelaySec=30

[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now navyk-autoupdate.timer >/dev/null
echo "enabled"

say "5/5 check through HTTPS"
for i in $(seq 1 30); do
  if curl -fsS -m 5 "https://$SITE/api/health" >/dev/null 2>&1; then echo "https://$SITE ok"; break; fi
  [ "$i" = 30 ] && echo "https://$SITE not answering yet (DNS or certificate). The app itself is running; run this script again later."
  sleep 4
done
echo
echo "Navyk: https://$SITE"
