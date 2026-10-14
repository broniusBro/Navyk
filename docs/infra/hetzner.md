# Navyk на общем сервере приложений (Hetzner, 65.108.234.212)

Navyk живёт на том же сервере, что и bronus.app, по правилам из `bronus-core/host/README.md`:
общая только «здание» (обновления, файрвол, Docker, Caddy), у Navyk своя «квартира».

| | Navyk |
|---|---|
| Код | `/srv/navyk` (клон публичного репозитория, ключ GitHub не нужен) |
| Приложение | Docker Compose проект `navyk`, контейнер только для чтения, без привилегий |
| Порт | `127.0.0.1:8100` (зарезервирован в `/etc/host/projects`) |
| Секреты | `/etc/navyk/navyk.env` (chmod 600): ключи Claude API и почты, лимиты (список ниже) |
| Сайт в Caddy | `/etc/caddy/sites/<домен>.caddy` → `reverse_proxy 127.0.0.1:8100` |
| База данных | SQLite `/data/navyk.sqlite` в томе Docker `navyk_navyk-data` (аккаунты, сессии, прогресс; ADR 0003) |
| Резервные копии | таймер `navyk-backup` в 03:30 UTC: копия в томе (`/data/backups`) и на сервере `/var/backups/navyk`, 14 дней |
| Обновления | таймер `navyk-autoupdate` каждые 5 минут: если в `main` новый коммит — сборка, проверка здоровья, при сбое откат |

## Первый запуск (с Mac, из папки репозитория navyk)

```
bash deploy/deploy-from-mac.sh
```

Скрипт проверит доступ к серверу, склонирует код в `/srv/navyk`, спросит ключ Claude API
(ввод скрыт; можно пропустить — тогда вместо ИИ-разбора будет чек-лист самопроверки),
соберёт и запустит контейнер, добавит сайт в Caddy, включит автообновление и проверит адрес снаружи.

Рабочий адрес: **https://navyk.app** (подключён 2026-10-13). Скрипт с Mac по умолчанию использует navyk.app.

Повторный запуск без `SITE` сохраняет уже подключённый домен.

## Свой домен

1. У регистратора: одна A-запись домена → `65.108.234.212` (без AAAA).
2. `SITE=navyk.example.com bash deploy/deploy-from-mac.sh` — Caddy получит сертификат, старый сайт sslip будет удалён.

## Переменные окружения (`/etc/navyk/navyk.env`)

| Переменная | По умолчанию | Назначение |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | ключ Claude API для разбора промптов (`set-api-key.sh`) |
| `FREE_REVIEWS_PER_DAY` | 10 | разборов в день на аккаунт (вошедший) или устройство (аноним) |
| `IP_REVIEWS_PER_DAY` | 50 | разборов в день с одного IP |
| `PUBLIC_ORIGIN` | `http://localhost:8080` | адрес сайта: ссылки в письмах и защита от CSRF (POST/PUT/PATCH к `/api/*` принимаются только с этим `Origin`). `install.sh` пишет `https://<SITE>` сам |
| `EMAIL_PROVIDER` | `log` | `brevo`, `resend` или `log` (не отправлять; в продакшене в журнал попадает только «письмо не отправлено», без ссылки) |
| `EMAIL_API_KEY` | — | ключ API почтового провайдера (`set-email.sh`) |
| `EMAIL_FROM` | `Navyk <no-reply@navyk.app>` | отправитель; домен должен быть подтверждён у провайдера |
| `COOKIE_SECURE` | `true` | `false` только для локальной разработки по http (cookie `navyk_session` вместо `__Host-navyk_session`) |
| `AUTH_PER_MINUTE_PER_IP` | 20 | запросов к `/api/auth/*` в минуту с одного IP |
| `EMAILS_PER_HOUR_PER_ADDRESS` | 3 | писем на один адрес в час (регистрация, повтор, сброс) |
| `DATA_DIR` | `/data` в контейнере | папка базы; задаётся в `docker-compose.yml`, менять не нужно |

## Почта (подтверждение адреса, сброс пароля)

Без настроенного провайдера аккаунты создаются, но письма не уходят — ученик не сможет подтвердить адрес.
Достаточно одного провайдера; оба имеют бесплатный тариф для такого объёма.

1. **Аккаунт.** Зарегистрироваться в [Brevo](https://www.brevo.com) или [Resend](https://resend.com)
   на рабочий адрес владельца (не личный).
2. **Домен navyk.app.** В кабинете провайдера добавить домен отправителя:
   Brevo — *Senders, Domains & Dedicated IPs → Domains → Add a domain*; Resend — *Domains → Add Domain*.
   Провайдер покажет DNS-записи — добавить их у регистратора navyk.app **точно как показано**:
   - **SPF** — TXT-запись на `navyk.app` (Brevo) или на поддомене `send.navyk.app` (Resend), вида
     `v=spf1 include:… ~all`. Если на `navyk.app` уже есть SPF-запись, не создавать вторую,
     а добавить `include:…` в существующую (две SPF-записи ломают обе);
   - **DKIM** — TXT (или CNAME) на поддомене, который назовёт провайдер (например `brevo1._domainkey`,
     `resend._domainkey`);
   - **DMARC** (рекомендуется) — TXT на `_dmarc.navyk.app`: `v=DMARC1; p=none; rua=mailto:<адрес владельца>`;
   - у Resend ещё MX на `send.navyk.app` (для отчётов о недоставке) — тоже добавить.
   Дождаться статуса *Verified/Authenticated* (обычно минуты, до 48 часов).
3. **Ключ API.** Brevo: *SMTP & API → API Keys → Generate a new API key* (ключ начинается с `xkeysib-`).
   Resend: *API Keys → Create API Key*, права *Sending access*, домен navyk.app (ключ начинается с `re_`).
4. **На сервер** (ввод ключа скрыт, контейнер пересоздаётся сам):
   ```
   ssh -t root@65.108.234.212 /srv/navyk/deploy/set-email.sh
   ```
5. **Проверка.** Зарегистрироваться на https://navyk.app своим адресом и дождаться письма (проверить «Спам»).
   В логах приложения не должно быть `email_error`:
   `ssh root@65.108.234.212 'cd /srv/navyk && docker compose logs --tail 100 app | grep email'`.
   Адреса и ссылки в логи не пишутся; в таблице `email_log` хранится только SHA-256 адреса и статус.

## Резервные копии базы

- Таймер `navyk-backup.timer` (ставит `install.sh`) раз в сутки в 03:30 UTC запускает `deploy/backup.sh`:
  внутри контейнера `VACUUM INTO /data/backups/navyk-<дата>.sqlite` (целостная копия без остановки),
  затем копия выносится на сервер в `/var/backups/navyk/` (chmod 600). Хранится 14 дней в обоих местах.
- Запустить вручную: `ssh root@65.108.234.212 /srv/navyk/deploy/backup.sh`.
- Проверить: `ssh root@65.108.234.212 'systemctl list-timers navyk-backup.timer; ls -lh /var/backups/navyk'`.
- Копии лежат на том же сервере: от потери сервера они не защищают. Включить Hetzner Backups
  для сервера (или копировать `/var/backups/navyk` наружу) — решение владельца, оно платное.
- **Восстановление** (необратимо, только владелец):
  ```
  cd /srv/navyk && docker compose stop app
  docker run --rm -v navyk_navyk-data:/data -v /var/backups/navyk:/b alpine \
    sh -c 'rm -f /data/navyk.sqlite-wal /data/navyk.sqlite-shm && cp /b/navyk-<дата>.sqlite /data/navyk.sqlite && chown 1000:1000 /data/navyk.sqlite'
  docker compose up -d app
  ```
- Удаление тома `navyk_navyk-data` (`docker compose down -v`) стирает все аккаунты. Не выполнять без копии.

## Обслуживание

```
ssh -t root@65.108.234.212 /srv/navyk/deploy/set-api-key.sh        # сменить ключ Claude API (ввод скрыт)
ssh -t root@65.108.234.212 /srv/navyk/deploy/set-email.sh          # почтовый провайдер и его ключ (ввод скрыт)
ssh root@65.108.234.212 'cd /srv/navyk && docker compose logs --tail 100 app'   # логи, стоимость разборов
ssh root@65.108.234.212 'systemctl list-timers navyk-autoupdate.timer; journalctl -u navyk-autoupdate -n 30'
ssh root@65.108.234.212 'cd /srv/navyk && ./deploy/update.sh'   # обновить немедленно
```

Правила общего сервера: после правки Caddy — `caddy validate` и `systemctl restart caddy`
(скрипты делают это сами, с откатом); секреты в чат не передавать.

### Проверка почты

Если письма не приходят, отправь тестовое письмо прямо из контейнера и посмотри ответ почтового сервиса:

```bash
ssh -t root@65.108.234.212 /srv/navyk/deploy/test-email.sh
```

Скрипт печатает `status` (`sent` / `failed` / `logged`) и причину отказа (`code`, `message`) без адресов.
Частые причины у Brevo: `unauthorized` с текстом про unrecognised IP — добавить IP сервера в Security → Authorised IPs;
ошибка про sender — подтвердить отправителя или домен в Senders, Domains & Dedicated IPs; `logged` — почта не настроена
(запусти `deploy/set-email.sh`).
