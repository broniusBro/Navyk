# brolingvo · polski

Бесплатное приложение для изучения польского языка: от «Dzień dobry» до свободного разговора.
https://poland.brolingvo.com

- 80 коротких уроков: A1 «Старт» → A2 «Повседневность» → B1 «Свободная речь»
- Озвучка каждой фразы, «Скажи вслух» с распознаванием речи, словарь с карточками
- ИИ-помощник «Pani Ania» в каждом уроке и ИИ-собеседник для ролевых разговоров
- Серии дней, XP, интервальное повторение, аккаунт с синхронизацией прогресса

## Запуск локально

```
python3 scripts/build_content.py
DATA_DIR=/tmp/brolingvo COOKIE_SECURE=false PUBLIC_ORIGIN=http://localhost:8080 \
  ANTHROPIC_API_KEY=sk-ant-... node --disable-warning=ExperimentalWarning server/src/http.ts
```
Открыть http://localhost:8080. Без `ANTHROPIC_API_KEY` ИИ-функции работают в запасном режиме.

Тесты: `cd server && npm test`, `cd web && npm test && npm run check`.

## Развёртывание
Сервер 65.108.234.212, папка `/srv/polish`, порт 8120 — см. `CLAUDE.md` и `docs/infra/server.md`.
Первый раз: `bash deploy/deploy-from-mac.sh`.

Это ветка `polish` репозитория Navyk; с веткой `main` (navyk.app) она не связана.
