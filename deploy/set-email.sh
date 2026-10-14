#!/usr/bin/env bash
# Set or replace the email provider and its API key on the server without showing the key. Run as root:
#   ssh -t root@65.108.234.212 /srv/navyk/deploy/set-email.sh
# Providers: brevo or resend (the sending domain navyk.app must be verified there first, see docs/infra/hetzner.md);
# log = do not send (production then only logs that an email was due).
set -euo pipefail
ENV_FILE=/etc/navyk/navyk.env
[ "$(id -u)" = 0 ] || { echo "run as root"; exit 1; }
read -r -p "Email provider (brevo / resend / log): " provider
provider="$(printf '%s' "$provider" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"
case "$provider" in brevo|resend|log) ;; *) echo "Unknown provider '$provider'. Nothing changed."; exit 1;; esac
key=""
if [ "$provider" != log ]; then
  read -r -s -p "API key for $provider (input hidden): " key; echo
  case "$provider:$key" in
    resend:re_*) ;;
    brevo:xkeysib-*) ;;
    *:) echo "Empty key. Nothing changed."; exit 1;;
    *) read -r -p "This does not look like a $provider API key (Resend keys usually start with re_, Brevo keys with xkeysib-). Use it anyway? [y/N] " yn
       case "$yn" in y|Y) ;; *) echo "Nothing changed."; exit 1;; esac;;
  esac
fi
from=""
read -r -p "Sender, Enter for the default \"Navyk <no-reply@navyk.app>\": " from
# Only a name was typed (e.g. "Navyk"): add the default address, a sender needs one.
if [ -n "$from" ] && [[ "$from" != *@* ]]; then from="$from <no-reply@navyk.app>"; fi
install -d -m 700 /etc/navyk
touch "$ENV_FILE"; chmod 600 "$ENV_FILE"
grep -vE '^(EMAIL_PROVIDER|EMAIL_API_KEY|EMAIL_FROM)=' "$ENV_FILE" > "$ENV_FILE.new" || true
printf 'EMAIL_PROVIDER=%s\nEMAIL_API_KEY=%s\n' "$provider" "$key" >> "$ENV_FILE.new"
[ -n "$from" ] && printf 'EMAIL_FROM=%s\n' "$from" >> "$ENV_FILE.new"
mv "$ENV_FILE.new" "$ENV_FILE"; chmod 600 "$ENV_FILE"
cd /srv/navyk && docker compose up -d --force-recreate app >/dev/null
sleep 3
curl -fsS "http://127.0.0.1:${APP_PORT:-8100}/api/health"; echo
echo "Email provider: $provider (the key is not printed). Check: register on the site and look for the confirmation email."
