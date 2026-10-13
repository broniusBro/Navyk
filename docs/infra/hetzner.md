# Navyk на общем сервере приложений (Hetzner, 65.108.234.212)

Navyk живёт на том же сервере, что и bronus.app, по правилам из `bronus-core/host/README.md`:
общая только «здание» (обновления, файрвол, Docker, Caddy), у Navyk своя «квартира».

| | Navyk |
|---|---|
| Код | `/srv/navyk` (клон публичного репозитория, ключ GitHub не нужен) |
| Приложение | Docker Compose проект `navyk`, контейнер только для чтения, без привилегий |
| Порт | `127.0.0.1:8100` (зарезервирован в `/etc/host/projects`) |
| Секреты | `/etc/navyk/navyk.env` (chmod 600): `ANTHROPIC_API_KEY`, лимиты разборов |
| Сайт в Caddy | `/etc/caddy/sites/<домен>.caddy` → `reverse_proxy 127.0.0.1:8100` |
| База данных | пока не нужна (прогресс хранится на устройстве ученика) |
| Обновления | таймер `navyk-autoupdate` каждые 5 минут: если в `main` новый коммит — сборка, проверка здоровья, при сбое откат |

## Первый запуск (с Mac, из папки репозитория navyk)

```
bash deploy/deploy-from-mac.sh
```

Скрипт проверит доступ к серверу, склонирует код в `/srv/navyk`, спросит ключ Claude API
(ввод скрыт; можно пропустить — тогда вместо ИИ-разбора будет чек-лист самопроверки),
соберёт и запустит контейнер, добавит сайт в Caddy, включит автообновление и проверит адрес снаружи.

Рабочий адрес: **https://navyk.app** (подключён 2026-10-13). Без `SITE` скрипт ставит временный https://65-108-234-212.sslip.io.

**Важно:** при повторном запуске всегда указывайте `SITE=navyk.app`, иначе сайт переключится обратно на sslip.io.

## Свой домен

1. У регистратора: одна A-запись домена → `65.108.234.212` (без AAAA).
2. `SITE=navyk.example.com bash deploy/deploy-from-mac.sh` — Caddy получит сертификат, старый сайт sslip будет удалён.

## Обслуживание

```
ssh -t root@65.108.234.212 /srv/navyk/deploy/set-api-key.sh        # сменить ключ Claude API (ввод скрыт)
ssh root@65.108.234.212 'cd /srv/navyk && docker compose logs --tail 100 app'   # логи, стоимость разборов
ssh root@65.108.234.212 'systemctl list-timers navyk-autoupdate.timer; journalctl -u navyk-autoupdate -n 30'
ssh root@65.108.234.212 'cd /srv/navyk && ./deploy/update.sh'   # обновить немедленно
```

Правила общего сервера: после правки Caddy — `caddy validate` и `systemctl restart caddy`
(скрипты делают это сами, с откатом); секреты в чат не передавать.
