# Запуск Navyk на Hetzner

Один раз руками (≈15 минут), дальше всё автоматически: каждый коммит в `main` проходит тесты
и выкладывается на сервер (`.github/workflows/deploy.yml`).

## 1. SSH-ключ для выкладки (на вашем компьютере, macOS/Linux)

```
ssh-keygen -t ed25519 -f ~/.ssh/navyk_deploy -N "" -C navyk-deploy
cat ~/.ssh/navyk_deploy.pub      # публичный — для Hetzner
pbcopy < ~/.ssh/navyk_deploy     # приватный — в буфер, для GitHub (на Linux: cat ~/.ssh/navyk_deploy)
```

Приватный ключ никому не отправляйте и не вставляйте в чат.

## 2. Сервер в Hetzner Cloud

console.hetzner.com → проект → **Add Server**:

| Поле | Значение |
|---|---|
| Location | Falkenstein, Nuremberg или Helsinki (ЕС) |
| Image | Ubuntu 24.04 |
| Type | самый маленький Shared vCPU (x86 или Arm) — для старта хватит |
| Networking | Public IPv4 + IPv6 |
| SSH keys | Add SSH key → вставить содержимое `navyk_deploy.pub` |
| Backups | включить (рекомендуется) |
| Cloud config | вставить файл `deploy/cloud-init.yaml` целиком |
| Name | navyk-prod |

Create & Buy. Запишите IPv4. Через 3–5 минут сервер сам закончит настройку.

## 3. Секреты в GitHub

Репозиторий → Settings → Secrets and variables → Actions → **New repository secret**:

| Name | Значение |
|---|---|
| `DEPLOY_HOST` | IPv4 сервера |
| `DEPLOY_SSH_KEY` | приватный ключ из шага 1 (весь текст, включая строки BEGIN/END) |
| `ANTHROPIC_API_KEY` | ключ Claude API `sk-ant-api03-…` (если ещё не добавлен) |

## 4. Первая выкладка

Actions → **Deploy** → Run workflow. В конце в сводке будет адрес:
`https://<ip-с-дефисами>.sslip.io` (например `https://203-0-113-7.sslip.io`). HTTPS настоящий.

## 5. Свой домен (когда появится)

1. У регистратора: A-запись `@` → IPv4 сервера (и AAAA → IPv6, по желанию).
2. GitHub → Settings → Secrets and variables → Actions → вкладка **Variables** → `NAVYK_DOMAIN` = `navyk.app`.
3. Actions → Deploy → Run workflow. Caddy сам получит сертификат.

## Что настроено на сервере

- Node.js 22, приложение как сервис `navyk` (отдельный пользователь без прав, код только для чтения, слушает 127.0.0.1:8080).
- Caddy: HTTPS (Let's Encrypt), сжатие, проксирование на приложение.
- Файрвол: открыты только 22, 80, 443. Вход по SSH только по ключу.
- Автоматические обновления безопасности Ubuntu.
- Ключ Claude API: `/etc/navyk/secrets.env` (только root), приходит из секретов GitHub при каждой выкладке.

## Диагностика (если нужно зайти на сервер)

```
ssh -i ~/.ssh/navyk_deploy root@<IP>
systemctl status navyk caddy
journalctl -u navyk -n 100     # логи приложения, в т.ч. стоимость каждого разбора
cloud-init status --long       # завершилась ли первичная настройка
```
