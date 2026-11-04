# brolingvo · polski — контекст проекта

Бесплатное мобильное веб-приложение (PWA) для изучения польского языка русскоязычными:
от нуля (A1) до свободной речи (B1). Короткие уроки по 3–6 минут, озвучка, распознавание речи,
серии дней, XP, интервальное повторение, словарь с карточками, ИИ-помощник и ИИ-собеседник.
Форк приложения Navyk (та же механика аккаунтов, прогресса и повторений), но свой дизайн и контент.

## Где живёт
- Код: ветка `polish` репозитория `broniusBro/Navyk` (не связана с `main` — navyk.app её не видит).
- Продакшен: https://poland.brolingvo.com на общем сервере Hetzner 65.108.234.212 (там же navyk.app и bronus.app),
  правила — `bronus-core/host/README.md`. Своя «квартира»: `/srv/brolingvo-poland`, Compose-проект `brolingvo-poland`,
  порт `127.0.0.1:8120` (реестр `/etc/host/projects`), секреты `/etc/brolingvo-poland/brolingvo-poland.env`,
  сайт `/etc/caddy/sites/poland.brolingvo.com.caddy`, таймеры `brolingvo-poland-autoupdate` и `brolingvo-poland-backup`.
- Первый запуск: `deploy/deploy-from-mac.sh` (с Mac владельца, по SSH). Дальше сервер сам подтягивает ветку
  `polish` каждые 5 минут с откатом при сбое. **Не трогать общий Caddyfile и чужие проекты.**

## Курс
- Программа — `scripts/curriculum.py` → `content/course.json` (3 уровня × 6–8 модулей × 4 урока = 80 уроков).
- Формат урока — `content/_template/FORMAT.md`; уроки — `content/{a1|a2|b1}/{module}/{lesson}.ru.md`.
- Валидатор: `python3 scripts/build_content.py` (CI). Урок с ошибкой не попадает в приложение.
- Объяснения — на русском, на «ты»; польский — живой, с диакритикой. Сравнение с русским и украинским.
- Типы упражнений: single/multi_choice, match_pairs, fill_gap, order_steps, build_sentence, type_answer, speak,
  translate (ИИ), dialog (ИИ). У каждого варианта — `why`, у каждого упражнения — `hint`.
- Сценарии вкладки «Разговор» — `content/talk/scenarios.json`.

## ИИ
- `server/src/ai/` — клиент Claude API и три роли: проверка перевода, ИИ-собеседник (ролевые диалоги и свободный
  разговор), помощник «Pani Ania». Модели — `server/src/config/models.json`. Ключ — только на сервере.
- Без ключа или при лимите всё работает в запасном режиме: чек-лист самопроверки, образец диалога.
- Лимиты: `AI_PER_DAY` (на аккаунт/устройство), `IP_AI_PER_DAY`. Текст ученика — данные в тегах, не инструкции.

## Принципы
- Бесплатно. Без аккаунта открыт первый модуль; аккаунт (бесплатный) сохраняет прогресс и открывает весь курс.
- Mobile-first, тёмная тема, анимации с уважением к `prefers-reduced-motion`, доступность AA.
- Дизайн — `docs/design/direction.md`, токены `design/tokens.json`, контракт классов `docs/ui-contract.md`.
- DOM только через `h()` (без innerHTML), тексты — через i18n (`web/i18n/ru.json`), SQL — через параметры.
- Новые данные или обработчики → сначала обновить `content/legal/*` (политика, cookies, условия).
- Владелец — BRONIUS AND BRO GROUP SP. Z O.O. (Варшава).

## Команда агентов (`.claude/agents/`)
methodologist (уроки), translator/носитель польского (проверка языка), product-designer и graphic-designer
(дизайн и анимации), frontend-dev, backend-dev, devops, qa-tester, copywriter, marketer.
