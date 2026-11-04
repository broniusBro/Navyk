# brolingvo · polski на общем сервере приложений (Hetzner, 65.108.234.212)

На сервере уже живут navyk.app и bronus.app. Правила — `bronus-core/host/README.md`:
общее только «здание» (обновления, файрвол, Docker, Caddy), у brolingvo своя «квартира».

| | brolingvo · polski |
|---|---|
| Код | `/srv/polish` — клон ветки `polish` публичного репозитория `broniusBro/Navyk` |
| Приложение | Docker Compose проект `polish`, контейнер только для чтения, без привилегий |
| Порт | `127.0.0.1:8110` (регистрируется в `/etc/host/projects` при установке) |
| Секреты | `/etc/polish/polish.env` (chmod 600) |
| Сайт в Caddy | `/etc/caddy/sites/poland.brolingvo.com.caddy` → `reverse_proxy 127.0.0.1:8110` |
| База | SQLite `/data/brolingvo.sqlite` в томе `polish_polish-data` |
| Резервные копии | таймер `polish-backup` 03:30 UTC → `/var/backups/polish`, 14 дней |
| Обновления | таймер `polish-autoupdate` каждые 5 минут: новый коммит в ветке `polish` → сборка, проверка, откат при сбое |

## Первый запуск

1. DNS у регистратора brolingvo.com: запись **A**, имя `poland`, значение `65.108.234.212` (без AAAA).
2. С Mac (нужен SSH-доступ root к серверу, как для navyk):
   ```
   curl -fsSL https://raw.githubusercontent.com/broniusBro/Navyk/polish/deploy/deploy-from-mac.sh | bash
   ```
   Скрипт проверит сервер, свободный порт и DNS, склонирует код в `/srv/polish`, спросит ключ Claude API
   (можно взять тот же, что у navyk; ввод скрыт), соберёт контейнер, добавит сайт в Caddy, включит автообновление
   и резервные копии, а в конце проверит, что navyk.app и bronus.app по-прежнему отвечают.

## Переменные окружения (`/etc/polish/polish.env`)

| Переменная | По умолчанию | Назначение |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | ключ Claude API для ИИ-помощника и собеседника (`deploy/set-api-key.sh`) |
| `AI_PER_DAY` | 200 | ИИ-запросов в день на аккаунт или устройство (реплика в разговоре = 1 запрос) |
| `IP_AI_PER_DAY` | 600 | ИИ-запросов в день с одного IP |
| `PUBLIC_ORIGIN` | ставит `install.sh` | адрес сайта: ссылки в письмах и защита от CSRF |
| `EMAIL_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_FROM` | `log` | почта для подтверждения адреса и сброса пароля (`deploy/set-email.sh`); домен отправителя brolingvo.com подтвердить у провайдера (SPF/DKIM) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | — | вход через Google (`deploy/set-google.sh`), redirect URI `https://poland.brolingvo.com/api/auth/google/callback` |
| `ADMIN_ORIGIN` | — | админка, например `https://admin.poland.brolingvo.com` (`deploy/enable-admin.sh`) |

## Полезное
- Логи (со стоимостью каждого ИИ-запроса): `ssh root@65.108.234.212 'cd /srv/polish && docker compose logs --tail 100 app'`
- Сменить ключ Claude API: `ssh -t root@65.108.234.212 /srv/polish/deploy/set-api-key.sh`
- Обновить вручную: `ssh root@65.108.234.212 /srv/polish/deploy/update.sh`
