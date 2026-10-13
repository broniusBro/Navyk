#!/usr/bin/env bash
# Navyk on the shared application server 65.108.234.212 (bronus.app lives there too; see bronus-core/host/README.md).
# Run on the Mac, from the navyk repository folder:
#   bash deploy/deploy-from-mac.sh                      # temporary address https://65-108-234-212.sslip.io
#   SITE=navyk.example.com bash deploy/deploy-from-mac.sh   # own domain (A record -> 65.108.234.212 first)
# Safe to run again: updates code, keeps secrets and settings. Afterwards the server updates itself from GitHub.
set -euo pipefail
APP_IP="${APP_IP:-65.108.234.212}"
SERVER="root@$APP_IP"
SITE="${SITE:-$(echo "$APP_IP" | tr . -).sslip.io}"
REPO_URL="${REPO_URL:-https://github.com/broniusBro/Navyk.git}"   # public repository: no deploy key needed

step() { printf '\n== %s\n' "$*"; }
mkdir -p "$HOME/.ssh/cm"; chmod 700 "$HOME/.ssh/cm"
ssh() { command ssh -o ControlMaster=auto -o ControlPath="$HOME/.ssh/cm/%r@%h-%p" -o ControlPersist=15m -o ServerAliveInterval=30 "$@"; }

step "1/5 Проверки: доступ к серверу и DNS"
ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new "$SERVER" 'echo "сервер: $(hostname), $(nproc) CPU, $(free -g | awk "/Mem:/{print \$2}") GB RAM, свободно $(df -h / | awk "NR==2{print \$4}")"'
ssh "$SERVER" 'command -v docker >/dev/null && test -d /etc/caddy/sites' || { echo "На сервере нет базовой настройки (bronus-core/host/bootstrap.sh)."; exit 1; }
ssh "$SERVER" 'grep -E "^navyk" /etc/host/projects || true'
case "$SITE" in
  *.sslip.io) echo "Адрес: https://$SITE (временный, DNS не нужен)";;
  *) got="$(dig +short A "$SITE" | tr '\n' ' ' | sed 's/ $//')"
     if [ "$got" = "$APP_IP" ]; then echo "DNS ok: $SITE -> $got"
     else echo "DNS: $SITE -> '${got:-нет записи}', а нужна одна A-запись $APP_IP. Добавьте её у регистратора и запустите снова."; exit 1; fi;;
esac

step "2/5 Код в /srv/navyk"
ssh "$SERVER" "set -e; if [ -d /srv/navyk/.git ]; then cd /srv/navyk && git fetch -q origin main && git checkout -q main && git reset -q --hard origin/main; else git clone -q '$REPO_URL' /srv/navyk; fi; chmod +x /srv/navyk/deploy/*.sh; cd /srv/navyk && git log --oneline -1"

step "3/5 Установка (первый раз 2–4 минуты). Ключ Claude API спросят на сервере, он не выводится на экран"
ssh -t "$SERVER" "cd /srv/navyk && SITE='$SITE' ./deploy/install.sh"

step "4/5 Проверка снаружи"
for i in $(seq 1 20); do
  ans="$(curl -fsS -m 5 "https://$SITE/api/health" 2>/dev/null || true)"
  [ -n "$ans" ] && { echo "https://$SITE/api/health -> $ans"; break; }
  [ "$i" = 20 ] && { echo "https://$SITE пока не отвечает (сертификат ещё выпускается). Запустите скрипт ещё раз через пару минут."; exit 1; }
  sleep 5
done
curl -s -o /dev/null -m 10 -w "https://$SITE/  -> %{http_code}\n" "https://$SITE/" || true

step "5/5 Готово"
echo "Navyk: https://$SITE"
echo "Обновления: сервер сам проверяет GitHub каждые 5 минут и выкладывает новую версию (откат, если она не запустилась)."
echo "Сменить ключ Claude API:  ssh -t $SERVER /srv/navyk/deploy/set-api-key.sh"
echo "Логи (включая стоимость каждого разбора):  ssh $SERVER 'cd /srv/navyk && docker compose logs --tail 100 app'"
