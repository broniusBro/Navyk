#!/usr/bin/env bash
# Отправить тестовое письмо из работающего контейнера и показать ответ почтового сервиса.
# Запуск на сервере: ssh -t root@65.108.234.212 /srv/navyk/deploy/test-email.sh
set -euo pipefail
cd "$(dirname "$0")/.."
read -r -p "Send a test email to: " to
docker compose exec -T app node --disable-warning=ExperimentalWarning server/src/email/selftest.ts "$to" || true
echo
echo "Recent email events:"
docker compose logs --since 24h app 2>/dev/null | grep -E '"event":"email' | tail -n 10 | sed -E 's/"link":"[^"]*"/"link":"…"/g' || echo "(none)"
