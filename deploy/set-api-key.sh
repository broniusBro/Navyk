#!/usr/bin/env bash
# Set or replace the Claude API key on the server without showing it. Run as root:
#   ssh -t root@65.108.234.212 /srv/navyk/deploy/set-api-key.sh
set -euo pipefail
ENV_FILE=/etc/navyk/navyk.env
[ "$(id -u)" = 0 ] || { echo "run as root"; exit 1; }
read -r -s -p "New Claude API key (sk-ant-api03-…): " key; echo
case "$key" in sk-ant-api*) ;; *) echo "This does not look like a Claude API key (it starts with sk-ant-api). Nothing changed."; exit 1;; esac
install -d -m 700 /etc/navyk
touch "$ENV_FILE"; chmod 600 "$ENV_FILE"
grep -v '^ANTHROPIC_API_KEY=' "$ENV_FILE" > "$ENV_FILE.new" || true
printf 'ANTHROPIC_API_KEY=%s\n' "$key" >> "$ENV_FILE.new"
mv "$ENV_FILE.new" "$ENV_FILE"; chmod 600 "$ENV_FILE"
cd /srv/navyk && docker compose up -d --force-recreate app >/dev/null
sleep 3
curl -fsS "http://127.0.0.1:${APP_PORT:-8100}/api/health"; echo
