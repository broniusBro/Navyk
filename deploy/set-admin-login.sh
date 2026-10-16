#!/usr/bin/env bash
# Force the admin login: create (or update) a Navyk account with this email and password, confirm it
# and give it a role in the admin panel. Password input is hidden and never printed. Run as root:
#   ssh -t root@65.108.234.212 /srv/navyk/deploy/set-admin-login.sh
set -euo pipefail
cd /srv/navyk
[ "$(id -u)" = 0 ] || { echo "run as root"; exit 1; }
read -r -p "Admin email: " email
email="$(printf '%s' "$email" | tr -d '[:space:]')"
[ -n "$email" ] || { echo "Empty email. Nothing changed."; exit 1; }
read -r -p "Role [owner/admin/viewer] (Enter = owner): " role
role="${role:-owner}"
read -r -s -p "New password (input hidden, min 8 characters): " p1; echo
read -r -s -p "Repeat the password: " p2; echo
[ "$p1" = "$p2" ] || { echo "Passwords differ. Nothing changed."; exit 1; }
printf '%s\n' "$p1" | docker compose exec -T app node --disable-warning=ExperimentalWarning server/src/admin/set-login.ts "$email" "$role"
unset p1 p2
echo "Sign in: $(grep -E '^ADMIN_ORIGIN=' /etc/navyk/navyk.env | tail -1 | cut -d= -f2-)"
