#!/usr/bin/env bash
# Set or replace the Google sign-in credentials on the server without showing the secret. Run as root:
#   ssh -t root@65.108.234.212 /srv/brolingvo-poland/deploy/set-google.sh
# Create the OAuth client in Google Cloud Console first (docs/infra/hetzner.md, "Вход через Google").
set -euo pipefail
ENV_FILE=/etc/brolingvo-poland/brolingvo-poland.env
[ "$(id -u)" = 0 ] || { echo "run as root"; exit 1; }
read -r -p "Google OAuth Client ID (…apps.googleusercontent.com), empty = turn Google sign-in off: " cid
cid="$(printf '%s' "$cid" | tr -d '[:space:]')"
secret=""
if [ -n "$cid" ]; then
  case "$cid" in *.apps.googleusercontent.com) ;; *) echo "This does not look like a Google Client ID. Nothing changed."; exit 1;; esac
  read -r -s -p "Client secret (input hidden): " secret; echo
  [ -n "$secret" ] || { echo "Empty secret. Nothing changed."; exit 1; }
fi
install -d -m 700 /etc/brolingvo-poland
touch "$ENV_FILE"; chmod 600 "$ENV_FILE"
grep -vE '^(GOOGLE_CLIENT_ID|GOOGLE_CLIENT_SECRET)=' "$ENV_FILE" > "$ENV_FILE.new" || true
[ -n "$cid" ] && printf 'GOOGLE_CLIENT_ID=%s\nGOOGLE_CLIENT_SECRET=%s\n' "$cid" "$secret" >> "$ENV_FILE.new"
mv "$ENV_FILE.new" "$ENV_FILE"; chmod 600 "$ENV_FILE"
cd /srv/brolingvo-poland && docker compose up -d --force-recreate app >/dev/null
sleep 3
curl -fsS "http://127.0.0.1:$(awk '$1=="brolingvo-poland" {print $2; exit}' /etc/host/projects 2>/dev/null || echo 8120)/api/auth/providers"; echo
echo "Done (the secret is not printed). {\"google\":true} means the \"Continue with Google\" button is on."
