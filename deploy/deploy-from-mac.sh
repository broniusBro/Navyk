#!/usr/bin/env bash
# brolingvo · polski on the shared application server 65.108.234.212 (navyk.app and bronus.app live there too;
# rules: bronus-core/host/README.md). The app gets its own "apartment" and never touches other projects:
#   code /srv/brolingvo-poland (branch "polish" of the public Navyk repository), Compose project "polish", port 127.0.0.1:8120,
#   secrets /etc/brolingvo-poland/brolingvo-poland.env, Caddy site /etc/caddy/sites/poland.brolingvo.com.caddy, own timers and backups.
#
# Run on the Mac (any folder — the script needs nothing local except ssh access as root):
#   curl -fsSL https://raw.githubusercontent.com/broniusBro/Navyk/polish/deploy/deploy-from-mac.sh -o /tmp/polish-deploy.sh && bash /tmp/polish-deploy.sh
# or from a checkout of the branch:  bash deploy/deploy-from-mac.sh
# Safe to run again: updates code, keeps secrets and settings. Afterwards the server updates itself from GitHub.
set -euo pipefail
APP_IP="${APP_IP:-65.108.234.212}"
SERVER="root@$APP_IP"
SITE="${SITE:-poland.brolingvo.com}"
APP_PORT="${APP_PORT:-8120}"
BRANCH="${BRANCH:-polish}"
REPO_URL="${REPO_URL:-https://github.com/broniusBro/Navyk.git}"   # public repository: no deploy key needed
DIR=/srv/brolingvo-poland

step() { printf '\n== %s\n' "$*"; }
mkdir -p "$HOME/.ssh/cm"; chmod 700 "$HOME/.ssh/cm"
# Non-interactive calls must not read stdin: with `curl … | bash` stdin is the rest of this script.
ssh() { command ssh -o ControlMaster=auto -o ControlPath="$HOME/.ssh/cm/%r@%h-%p" -o ControlPersist=15m -o ServerAliveInterval=30 "$@" </dev/null; }
# Interactive call (questions on the server): terminal from /dev/tty even when the script itself comes from a pipe.
ssh_tty() { command ssh -t -o ControlMaster=auto -o ControlPath="$HOME/.ssh/cm/%r@%h-%p" -o ControlPersist=15m -o ServerAliveInterval=30 "$@" </dev/tty; }

step "1/5 Проверки: доступ к серверу, свободный порт, DNS"
ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new "$SERVER" 'echo "сервер: $(hostname), $(nproc) CPU, $(free -g | awk "/Mem:/{print \$2}") GB RAM, свободно $(df -h / | awk "NR==2{print \$4}")"'
ssh "$SERVER" 'command -v docker >/dev/null && test -d /etc/caddy/sites' || { echo "На сервере нет базовой настройки (bronus-core/host/bootstrap.sh)."; exit 1; }
echo "Проекты на сервере (их не трогаем):"; ssh "$SERVER" 'cat /etc/host/projects 2>/dev/null || true'
busy="$(ssh "$SERVER" "ss -ltnH 'sport = :$APP_PORT' | head -1; awk -v p=$APP_PORT '\$2==p && \$1!=\"brolingvo-poland\" {print \"registered for \"\$1}' /etc/host/projects 2>/dev/null" || true)"
if [ -n "$busy" ] && ! ssh "$SERVER" "test -d $DIR/.git"; then
  echo "Порт $APP_PORT занят ($busy). Запустите с другим портом: APP_PORT=8120 bash deploy-from-mac.sh"; exit 1
fi
got="$(dig +short A "$SITE" | tr '\n' ' ' | sed 's/ $//')"
if [ "$got" = "$APP_IP" ]; then echo "DNS ok: $SITE -> $got"
else
  echo "DNS: $SITE -> '${got:-нет записи}', а нужна A-запись $APP_IP."
  echo "У регистратора brolingvo.com добавьте: тип A, имя poland, значение $APP_IP (без AAAA). Через несколько минут запустите снова."
  exit 1
fi

step "2/5 Код в $DIR (ветка $BRANCH)"
ssh "$SERVER" "set -e; if [ -d $DIR/.git ]; then cd $DIR && git fetch -q origin $BRANCH && git checkout -q $BRANCH && git reset -q --hard origin/$BRANCH; else git clone -q --branch $BRANCH --single-branch '$REPO_URL' $DIR; fi; chmod +x $DIR/deploy/*.sh; cd $DIR && git log --oneline -1"

step "3/5 Установка (первый раз 2–4 минуты). Ключ Claude API спросят на сервере (можно взять тот же, что у navyk); он не выводится на экран"
ssh_tty "$SERVER" "cd $DIR && SITE='$SITE' APP_PORT='$APP_PORT' ./deploy/install.sh"

step "4/5 Проверка снаружи"
for i in $(seq 1 20); do
  ans="$(curl -fsS -m 5 "https://$SITE/api/health" 2>/dev/null || true)"
  [ -n "$ans" ] && { echo "https://$SITE/api/health -> $ans"; break; }
  [ "$i" = 20 ] && { echo "https://$SITE пока не отвечает (сертификат ещё выпускается). Запустите скрипт ещё раз через пару минут."; exit 1; }
  sleep 5
done
curl -s -o /dev/null -m 10 -w "https://$SITE/  -> %{http_code}\n" "https://$SITE/" || true
for other in navyk.app bronus.app; do
  curl -s -o /dev/null -m 10 -w "соседи: https://$other/ -> %{http_code}\n" "https://$other/" || true
done

step "5/5 Готово"
echo "brolingvo · polski: https://$SITE"
echo "Обновления: сервер сам проверяет ветку $BRANCH на GitHub каждые 5 минут (откат, если новая версия не запустилась)."
echo "Сменить ключ Claude API:  ssh -t $SERVER $DIR/deploy/set-api-key.sh"
echo "Почта (подтверждение адреса, сброс пароля):  ssh -t $SERVER $DIR/deploy/set-email.sh"
echo "Логи (включая стоимость каждого ИИ-запроса):  ssh $SERVER 'cd $DIR && docker compose logs --tail 100 app'"
