# 02 — Карта знаний курса Navyk: что должен знать ученик на каждом уровне

- Подготовили агенты claude-expert и methodologist
- Дата проверки всех источников: **2026-10-13**
- Источники только официальные: platform.claude.com (бывший docs.claude.com), code.claude.com, support.claude.com, privacy.claude.com, claude.com, anthropic.com, modelcontextprotocol.io, academy.claude.com / anthropic.skilljar.com, github.com/anthropics.
- Всё, что не нашлось в официальной документации, помечено **«не подтверждено»**.

---

## 0. Краткий вывод

1. **Документация переехала.** Адрес docs.claude.com теперь перенаправляет на **platform.claude.com/docs** (API, модели, промптинг, MCP-коннектор, Skills). Документация Claude Code и Agent SDK лежит на **code.claude.com/docs**. В уроках нужно ставить ссылки на новые адреса.
2. **За последние 3 месяца продукт сильно изменился.** 16.09.2026 Cowork объединили с чатом, и режим больше не выбирают. Тогда же появились артефакты Docs, Slides и Design, а создавать старые («legacy») артефакты больше нельзя. В июле–августе 2026 память переделали в «Topics». Модельный ряд сейчас такой: Opus 5.5, Sonnet 5.5, Haiku 5.5, Fable 5.1, Mythos 5.1. Поэтому всё, что касается интерфейса, тарифов и моделей, нужно хранить в контенте отдельно и легко обновлять.
3. **Регион: важный риск для русскоязычной аудитории.** Россия и Беларусь **не входят** в список поддерживаемых стран. Украина поддерживается, кроме Крыма и Донецкой, Херсонской, Луганской и Запорожской областей. Ограничение действует для claude.ai, Claude Code, Cowork и API. Использование из неподдерживаемого региона не поддерживается, даже если аккаунт создан в другой стране. Об этом нужно честно сказать в онбординге. Обходы вроде VPN не учим.
4. **Интерфейс Claude не переведён на русский и украинский.** Поддерживаемые языки интерфейса: EN, FR, DE, HI, ID, IT, JA, KO, PT-BR, ES. Общаться с Claude можно на любом языке. Значит, в уроках названия кнопок даём по-английски и в скобках перевод.
5. **Официальных учебных материалов на RU и UK не найдено** (не подтверждено, что их нет совсем). Anthropic Academy (Skilljar) даёт 23 бесплатных курса с сертификатами, все на английском. Туториалы на GitHub написаны под Claude 3 и частично устарели: например, приём prefill («говорить за Claude») с моделей 4.6 возвращает ошибку 400. Ниша Navyk — короткие уроки, три языка, актуальность и проверка промптов.
6. **«Позвоночник промптинга».** Основа — официальный гайд *Prompting best practices*: ясность и прямота, контекст и мотивация, примеры, структура (XML), роль, формат «что делать, а не что не делать», длинный контекст (данные сверху, вопрос снизу), право сказать «не знаю» и опора на цитаты, проверка результата. Для агентов добавляются масштаб задачи, обратимость действий и критерии успеха. На этих принципах построена рубрика проверяющего из 10 критериев (раздел 1.3).
7. **Для проверяющего промптов** подходит Claude Haiku 5.5: цена от $0.10 / $0.50 за MTok, минимальный кешируемый префикс 512 токенов, чтение из кеша стоит 0.1× базовой цены. Этот выбор согласован с идеей «дешёвая модель + кеширование» из CLAUDE.md.
8. **Структура курса.** Новичок: 7 модулей и 34 урока. Продвинутый: 8 модулей и 41 урок. Профессионал: 7 модулей и 45 уроков. Итого около 120 кандидатов в уроки по 3–5 минут.

---

## 1. «Позвоночник промптинга» и рубрика проверки

### 1.1. Принципы из официального гайда

Основные источники: [Prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices), [Reduce hallucinations](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-hallucinations), [Claude Code best practices](https://code.claude.com/docs/en/best-practices.md).

| # | Принцип (пересказ) | Суть для ученика | Где появляется впервые | Где повторяется и усложняется |
|---|---|---|---|---|
| P1 | **Ясно и прямо** | Claude похож на умного, но нового сотрудника, который не знает ваших норм. Пишите конкретно. Если хотите результат «сверх ожидаемого», попросите об этом явно. «Золотое правило»: дайте промпт коллеге без контекста. Если он запутается, Claude тоже запутается. | Новичок, М2 | Продв. М7; Проф. (CLAUDE.md, промпт для routine) |
| P2 | **Контекст и мотивация** | Объясняйте, *зачем* нужно правило. Пример из гайда: «текст будут читать вслух, поэтому без многоточий». Claude обобщает объяснение лучше, чем голый запрет. | Новичок, М2 | Проекты, инструкции, системный промпт |
| P3 | **Формат: что делать, а не чего не делать** | Описывайте желаемый результат («связная проза абзацами»), а не запрет («без markdown»). Стиль промпта влияет на стиль ответа. | Новичок, М2 | Продв. (документы), Проф. (structured outputs) |
| P4 | **Последовательные шаги** | Если важны порядок или полнота, давайте нумерованный список шагов. | Новичок, М2 | Длинные задачи, routines |
| P5 | **Примеры (few-shot)** | Примеры — один из самых надёжных способов задать формат и тон. Они должны быть релевантными и разнообразными, лучше всего 3–5 штук в тегах `<example>`. | Новичок, М7 (лёгкая версия) | Продв. М7, Проф. М7 |
| P6 | **Структура через XML-теги** | Отделяйте инструкции, контекст, данные и примеры тегами (`<instructions>`, `<context>`, `<document>`). Имена тегов должны быть единообразными, вложенность допустима. | Продв. М7 | Проф. (API, системные промпты) |
| P7 | **Роль** | Даже одна фраза о роли фокусирует тон и поведение. Роль задаётся в системном промпте или в инструкциях. | Новичок, М2 | Проекты, навыки, API `system` |
| P8 | **Длинный контекст** | Длинные документы ставьте **вверху**, вопрос и инструкции **внизу**: по тестам Anthropic, качество растёт до 30%. Документы оборачивайте в `<document>` с `<source>`. | Новичок, М3 (файлы, упрощённо) | Продв. М7, Проф. М4 |
| P9 | **Право сказать «не знаю» и опора на источник** | Разрешите Claude признать неуверенность. Попросите сначала извлечь дословные цитаты, а потом делать вывод. Можно попросить подтвердить каждое утверждение цитатой или ограничиться только предоставленными документами. | Новичок, М7 | Продв. М3 (research), Проф. (агентный код: «не гадай о коде, который не открыл») |
| P10 | **Цепочки и самопроверка** | Черновик, затем проверка по критериям, затем доработка. В API каждый шаг — отдельный вызов. | Продв. М7 | Проф. М6 (evaluator-optimizer) |
| P11 | **Критерии успеха и проверка** | Дайте Claude способ проверить работу (тест, пример, скриншот). Просите показать доказательства, а не просто «готово». | Продв. М6 | Проф. М1, М7 (evals) |
| P12 | **Масштаб и обратимость (агенты)** | Указывайте, что входит в задачу и что не входит. Опасные и необратимые действия (удаление, push, отправка сообщений) — только после подтверждения. Не переусложнять. | Продв. М6 | Проф. М1–М3, М6 |
| P13 | **Управление контекстом** | Контекст — главный ресурс: качество падает, когда окно заполнено. Новая задача — новый чат (или `/clear`). Если пришлось поправлять дважды, лучше начать заново с улучшенным промптом. | Новичок, М7 | Продв. М8, Проф. М1 |

**Устаревшее, что не надо учить:**
- **Prefill** (дописывать начало ответа за Claude). С моделей 4.6 запрос с prefill последней реплики ассистента возвращает ошибку 400. Вместо него используют прямые инструкции, XML-теги или Structured Outputs. Глава 5 GitHub-туториала («Speaking for Claude») поэтому устарела.
- **Extended thinking с `budget_tokens`.** На новых моделях его заменили adaptive thinking и параметр `effort`.
- Модельно-специфичные советы (например, «Opus 4.6 склонен к переусложнению») не включаем в «вечные» уроки: они меняются с каждой моделью.

### 1.2. Интервальное повторение принципов

| Понятие | День 1 | День 3 | День 7 | День 21 |
|---|---|---|---|---|
| P1 Ясность + «тест коллеги» | урок М2 | упражнение «найди ошибку» | «допиши запрос» | свободный промпт с проверкой |
| P2 Контекст «зачем» | урок М2 | «собери промпт из блоков» | в уроке про проекты | свободный промпт |
| P3 Формат позитивно | урок М2 | выбор ответа | в уроке про артефакты | свободный промпт |
| P9 «Не знаю» и цитаты | урок М7 | в уроке про файлы | в уроке про research | свободный промпт с документом |
| P13 Новый чат и контекст | урок М7 | в уроке про лимиты | в уроке про длинные задачи | Claude Code `/clear` (Проф.) |

### 1.3. Рубрика для проверяющего («практика промптинга»)

Каждый критерий оценивается по шкале 0 / 1 / 2: 0 — нет, 1 — частично, 2 — хорошо. Набор критериев зависит от уровня урока: проверяющий не должен требовать XML от новичка. Критерий R10 добавил Navyk, его нет в гайде Anthropic.

| ID | Критерий | Вопрос проверяющего | Основа | Новичок | Продвинутый | Профессионал |
|---|---|---|---|---|---|---|
| R1 | **Цель** | Понятно ли, какой результат нужен и для чего? Пройдёт ли «тест коллеги»? | P1 | ✔ (вес 3) | ✔ (3) | ✔ (2) |
| R2 | **Контекст** | Есть ли нужные факты: кто аудитория, какая ситуация, исходные данные, *почему* важны ограничения? | P2 | ✔ (3) | ✔ (2) | ✔ (2) |
| R3 | **Формат результата** | Заданы ли длина, структура, тон и язык? Сформулировано ли это как «что делать»? | P3 | ✔ (2) | ✔ (2) | ✔ (1) |
| R4 | **Ограничения и критерии успеха** | Ясно ли, что считается хорошим ответом и чего избегать? | P1, P11 | ✔ (2) | ✔ (2) | ✔ (2) |
| R5 | **Шаги и порядок** | Если задача многошаговая, указаны ли шаги или порядок? | P4 | ○ (только если уместно) | ✔ (1) | ✔ (1) |
| R6 | **Примеры** | Если важен формат или стиль, есть ли 1–3 примера и не слишком ли они однотипны? | P5 | ○ (бонус) | ✔ (1) | ✔ (2) |
| R7 | **Структура и разделение данных** | Отделены ли инструкции от данных (теги, заголовки)? Стоят ли длинные данные выше вопроса? | P6, P8 | — | ✔ (1) | ✔ (2) |
| R8 | **Честность и опора на источники** | Если задача фактическая или работает с документом: разрешено ли «не знаю», просят ли цитаты или ссылки? | P9 | ○ (бонус) | ✔ (1) | ✔ (1) |
| R9 | **Масштаб и безопасность действий** (агентные задачи) | Определены ли границы задачи, способ проверки и правило «спроси перед необратимым»? | P11, P12 | — | ○ (в уроках по длинным задачам) | ✔ (2) |
| R10 | **Приватность** (правило Navyk) | Не вставлены ли пароли, ключи API, номера документов или чужие персональные данные? | Navyk; см. privacy.claude.com | ✔ (блокирующий) | ✔ (блокирующий) | ✔ (блокирующий) |

✔ — критерий оценивается; ○ — оценивается только если уместен; — — не оценивается.

**Правила для системного промпта проверяющего** (черновик требований, сам текст промпта — отдельная задача):
- Ответ состоит из четырёх частей: **«Что хорошо»** (1–3 пункта), **«Чего не хватает»** (максимум 3 пункта, по порядку веса), **«Улучшенная версия»** (переписанный промпт ученика с сохранением его задачи), **итоговая оценка** (сумма весов, нормированная до 0–100, и уровень: «черновик» / «рабочий» / «сильный»).
- Отвечать на языке ученика (ru, uk или en).
- Оценивать **промпт**, а не выполнять его.
- Не придираться к отсутствию необязательных элементов. Короткий промпт для простой задачи может быть отличным: гайд Claude Code прямо говорит, что расплывчатые промпты уместны при исследовании.
- Входные данные ученика оборачивать в тег `<student_prompt>`, а уровень и цель урока — в `<lesson_context>` (принцип P6). Это заодно защищает от инъекций: текст ученика — это данные, а не инструкции.
- Ответ возвращать через Structured Outputs (JSON-схема), без prefill.
- Если сработал критерий R10, сначала предупредить о приватности и не повторять чувствительные данные в ответе.

---

## 2. Уровень «Новичок»

Цель уровня: человек уверенно пользуется чатом Claude, формулирует понятные запросы, работает с файлами, проектами и памятью, понимает ограничения и риски.

### Модуль Н1. Знакомство с Claude

| # | Урок | После урока человек сможет… | Ключевые понятия | Источник |
|---|---|---|---|---|
| Н1.1 | Что такое Claude | объяснить своими словами, что Claude — языковая модель от Anthropic, и назвать 3 типичные задачи для неё | ИИ-ассистент, языковая модель | [Get started](https://support.claude.com/en/articles/8114491-get-started-with-claude); [Use cases](https://support.claude.com/en/articles/7996845-what-are-some-things-i-can-use-claude-for) |
| Н1.2 | Где живёт Claude: веб, десктоп, мобильное приложение | выбрать подходящий способ доступа (claude.ai, Desktop, iOS/Android) под свою задачу | интерфейс, аккаунт | [Where can I access Claude](https://support.claude.com/en/articles/8461763-where-can-i-access-claude) |
| Н1.3 | Кто и откуда может пользоваться | проверить, поддерживается ли его страна, и понять, что от этого зависит | поддерживаемые регионы | [Supported countries](https://www.anthropic.com/supported-countries) ⚠️ |
| Н1.4 | Модели и «усилие» | выбрать модель (Haiku, Sonnet, Opus) и уровень effort под задачу и объяснить разницу «быстро и дёшево» против «глубоко» | модель, effort, thinking | [Model, effort, thinking](https://support.claude.com/en/articles/8664678-change-the-model-effort-and-thinking-settings) ⚠️ |
| Н1.5 | Тарифы и лимиты | назвать отличия Free и Pro, найти Settings > Usage и объяснить, что такое 5-часовой и недельный лимит | план, session limit, weekly limit | [Pricing](https://claude.com/pricing) ⚠️; [Usage limits](https://support.claude.com/en/articles/11647753-how-do-usage-and-length-limits-work) ⚠️ |
| Н1.6 | Что Claude знает и чего не знает | объяснить, что такое дата отсечения знаний, и когда нужен веб-поиск | knowledge cutoff, веб-поиск | [Training data](https://support.claude.com/en/articles/8114494-how-up-to-date-is-claude-s-training-data) |

### Модуль Н2. Как формулировать запросы (ядро «позвоночника»)

| # | Урок | После урока человек сможет… | Ключевые понятия | Источник |
|---|---|---|---|---|
| Н2.1 | «Умный новый сотрудник» | переписать расплывчатый запрос в конкретный, пройдя «тест коллеги» | ясность (P1) | [Best practices: Be clear and direct](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices) |
| Н2.2 | Объясни «зачем» | добавить к запросу контекст и цель так, чтобы ответ стал точнее | контекст, мотивация (P2) | там же, «Add context» |
| Н2.3 | Скажи, каким должен быть ответ | задать длину, структуру, тон и язык ответа в позитивной форме | формат (P3) | там же, «Control the format» |
| Н2.4 | Шаги по порядку | разбить сложный запрос на нумерованные шаги | шаги (P4) | там же |
| Н2.5 | Роль для Claude | задать роль одной фразой и увидеть, как меняется ответ | роль (P7) | там же, «Give Claude a role» |
| Н2.6 | Диалог, а не один выстрел | уточнять и править ответ следующими сообщениями, в том числе выделять и править фрагмент на месте | итерация, follow-up | [Usage limit best practices](https://support.claude.com/en/articles/9797557-usage-limit-best-practices); [Release notes](https://support.claude.com/en/articles/12138966-release-notes) (12.06.2026, правка на месте) ⚠️ |

### Модуль Н3. Файлы и изображения

| # | Урок | После урока человек сможет… | Ключевые понятия | Источник |
|---|---|---|---|---|
| Н3.1 | Загружаем файл | загрузить PDF, DOCX или фото через «+», перетаскиванием или вставкой и задать по нему вопрос | загрузка, типы файлов | [Upload files](https://support.claude.com/en/articles/8241126-upload-files-to-claude) |
| Н3.2 | Ограничения файлов | назвать лимиты (до 20 файлов в чате, PDF до 1000 страниц, графику в PDF Claude видит только до 100 страниц) и понять, что делать с большим файлом | лимиты ⚠️ | там же |
| Н3.3 | Вопросы к документу | задать вопрос так, чтобы ответ опирался на текст: «сначала найди цитаты» | P8, P9 | там же; [Reduce hallucinations](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-hallucinations) |
| Н3.4 | Картинки и скриншоты | получить полезный разбор скриншота, фото или графика, зная, какое качество изображения требуется | vision | [Upload files](https://support.claude.com/en/articles/8241126-upload-files-to-claude) |

### Модуль Н4. Проекты

| # | Урок | После урока человек сможет… | Ключевые понятия | Источник |
|---|---|---|---|---|
| Н4.1 | Зачем нужен проект | объяснить, чем проект отличается от обычного чата, и создать первый проект | project, workspace | [What are projects](https://support.claude.com/en/articles/9517075-what-are-projects) |
| Н4.2 | Знания проекта | добавить в проект файлы, которые нужны в каждом чате, и убрать лишние | project knowledge | там же |
| Н4.3 | Инструкции проекта | написать короткую инструкцию проекта с ролью, тоном и правилами | project instructions (P2, P7) | там же; [Personalization](https://support.claude.com/en/articles/10185728-understanding-claude-s-personalization-features) |
| Н4.4 | Лимиты проектов | знать, что на Free доступно до 5 проектов, а RAG для больших баз знаний — только на платных планах | RAG ⚠️ | [What are projects](https://support.claude.com/en/articles/9517075-what-are-projects); [RAG](https://support.claude.com/en/articles/11473015-retrieval-augmented-generation-rag-for-projects) |

### Модуль Н5. Память и персонализация

| # | Урок | После урока человек сможет… | Ключевые понятия | Источник |
|---|---|---|---|---|
| Н5.1 | Инструкции для Claude (настройки профиля) | задать общие предпочтения для всех чатов и отличать их от инструкций проекта | Instructions for Claude | [Personalization](https://support.claude.com/en/articles/10185728-understanding-claude-s-personalization-features) |
| Н5.2 | Как работает память | найти Settings > Memory, прочитать, отредактировать и удалить «Topics» | memory, Topics ⚠️ | [Chat search & memory](https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context) |
| Н5.3 | Управление памятью словами | попросить Claude запомнить, изменить или забыть факт и выключить память для отдельного чата | память в чате | там же |
| Н5.4 | Поиск по прошлым чатам | сослаться на прошлый разговор вместо повторения (на платных планах) | chat search ⚠️ | там же |
| Н5.5 | Инкогнито | выбрать инкогнито-чат, когда разговор не должен попасть в историю и память | incognito | [Incognito chats](https://support.claude.com/en/articles/12260368-use-incognito-chats) |

### Модуль Н6. Приватность и безопасность

| # | Урок | После урока человек сможет… | Ключевые понятия | Источник |
|---|---|---|---|---|
| Н6.1 | Используются ли мои чаты для обучения | найти настройку Model Improvement и принять осознанное решение | Model Improvement, privacy settings ⚠️ | [Is my data used for training](https://privacy.claude.com/en/articles/10023580-is-my-data-used-for-model-training) |
| Н6.2 | Что нельзя отправлять | перечислить, что не стоит вставлять в чат (пароли, ключи, чужие персональные данные) и как обезличить текст | гигиена данных (R10) | там же; правило Navyk |
| Н6.3 | Лайк, дизлайк и делиться чатом | понимать, что отзыв сохраняет весь разговор до 5 лет, и как работает публичная ссылка на чат | feedback, share | [Training](https://privacy.claude.com/en/articles/10023580-is-my-data-used-for-model-training); [Share chats](https://support.claude.com/en/articles/10593882-share-and-unshare-chats) |
| Н6.4 | Чувствительные темы в памяти | понимать, что здоровье, политика и подобные темы по умолчанию не запоминаются | sensitive topics | [Chat search & memory](https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context) |

### Модуль Н7. Типичные ошибки и проверка ответов

| # | Урок | После урока человек сможет… | Ключевые понятия | Источник |
|---|---|---|---|---|
| Н7.1 | Галлюцинации | распознать признаки выдуманного ответа и попросить источник | hallucination | [Reduce hallucinations](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-hallucinations) |
| Н7.2 | Разреши сказать «не знаю» | добавить в промпт разрешение признавать неуверенность | P9 | там же |
| Н7.3 | Слишком общий запрос | найти и исправить 3 типичные ошибки: нет цели, нет контекста, нет формата | P1–P3 | [Best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices) |
| Н7.4 | Бесконечный длинный чат | понять, когда начать новый чат, почему это экономит лимиты и улучшает ответы | контекстное окно (P13) | [Usage limits](https://support.claude.com/en/articles/11647753-how-do-usage-and-length-limits-work) |
| Н7.5 | Покажи пример | добавить к запросу 1–2 примера желаемого результата | few-shot (P5) | [Best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices) |
| Н7.6 | Экономим лимиты | применить 5 советов: группировать вопросы, давать контекст сразу, использовать проекты, выключать лишние инструменты, выбирать effort пониже | usage | [Usage limit best practices](https://support.claude.com/en/articles/9797557-usage-limit-best-practices) |

---

## 3. Уровень «Продвинутый»

Цель уровня: человек использует Claude для реальных результатов: документов, таблиц, исследований и автоматизированной работы с подключёнными сервисами.

### Модуль П1. Артефакты

| # | Урок | После урока человек сможет… | Ключевые понятия | Источник |
|---|---|---|---|---|
| П1.1 | Что такое артефакт | понять, когда Claude создаёт артефакт, и найти его во вкладке Artifacts | artifact | [What are artifacts](https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them) ⚠️ |
| П1.2 | Docs: живой документ | создать документ в Claude Docs и экспортировать его в Word, PDF или Google Docs | Docs | [Claude Docs](https://support.claude.com/en/articles/16923645-get-started-with-claude-docs) ⚠️ |
| П1.3 | Slides: презентация | получить редактируемую презентацию и экспортировать её в PowerPoint или Google Slides | Slides | [What are artifacts](https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them) |
| П1.4 | Design: макеты и лендинги | описать макет или лендинг так, чтобы Claude Design учёл стиль | Design, design system | [Claude Design](https://support.claude.com/en/articles/14604416-get-started-with-claude-design) ⚠️ |
| П1.5 | Мини-приложение с ИИ внутри | создать интерактивный артефакт, который сам вызывает Claude, и понять, чей лимит при этом расходуется | AI-powered artifacts | [What are artifacts](https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them) |
| П1.6 | Делиться безопасно | поделиться артефактом и помнить, что чужой код в артефакте — как файл от незнакомца | sharing | [Share artifacts](https://support.claude.com/en/articles/9547008-share-artifacts) |
| П1.7 | Dashboards (бета) | собрать дашборд из подключённых данных (Pro и выше) | Dashboards ⚠️ | [Dashboards](https://support.claude.com/en/articles/17454700-get-started-with-claude-dashboards) |

### Модуль П2. Документы и таблицы

| # | Урок | После урока человек сможет… | Ключевые понятия | Источник |
|---|---|---|---|---|
| П2.1 | Включаем создание файлов | найти переключатель «Code execution and file creation» и понять, зачем он нужен | code execution | [Create and edit files](https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude) |
| П2.2 | Таблица с формулами | получить XLSX с работающими формулами по описанию задачи | xlsx | там же |
| П2.3 | Анализ CSV и графики | загрузить данные и получить анализ и PNG-график | data analysis | там же |
| П2.4 | Word, PowerPoint и PDF на выходе | сформулировать требования к документу (аудитория, структура, объём) | docx, pptx, pdf (P3) | там же |
| П2.5 | Риски файлового режима | объяснить, что такое промпт-инъекция в файлах и почему за работой нужно следить | prompt injection | там же |
| П2.6 | Claude в Google Docs, Sheets и Slides | работать с Claude прямо внутри Google-документа | интеграция ⚠️ | [Claude in Google Docs/Sheets/Slides](https://support.claude.com/en/articles/16951679-use-claude-in-google-docs-sheets-and-slides) |

### Модуль П3. Поиск и исследование

| # | Урок | После урока человек сможет… | Ключевые понятия | Источник |
|---|---|---|---|---|
| П3.1 | Веб-поиск | включить веб-поиск и проверить ссылки в ответе | web search | [Web search](https://support.claude.com/en/articles/10684626-enable-and-use-web-search) |
| П3.2 | Поиск, размышление или Research | выбрать нужный инструмент: факт → поиск; рассуждение → thinking/effort; 5+ источников → Research | выбор инструмента | [When to use](https://support.claude.com/en/articles/11095361-when-should-i-use-web-search-extended-thinking-and-research) |
| П3.3 | Research: глубокое исследование | запустить Research с чёткими критериями успеха и проверить цитаты | Research ⚠️ (платные планы) | [Use research](https://support.claude.com/en/articles/11088861-use-research-on-claude) |
| П3.4 | Промпт для исследования | сформулировать вопрос, границы, источники и формат отчёта; попросить сверять источники между собой | P9, P11 | [Best practices: Research](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices) |

### Модуль П4. Коннекторы

| # | Урок | После урока человек сможет… | Ключевые понятия | Источник |
|---|---|---|---|---|
| П4.1 | Что такое коннектор | объяснить, что коннектор даёт Claude доступ к сервису с вашими правами | connector | [Use connectors](https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities) |
| П4.2 | Подключаем из каталога | подключить сервис через Customize > Connectors и включить его для конкретного чата | directory | там же ⚠️ |
| П4.3 | Свой коннектор (remote MCP) | добавить кастомный коннектор по URL (на Free — только один) | custom connector, MCP | там же |
| П4.4 | Доступ к инструментам | настроить загрузку инструментов («Auto» или «On demand») и понять, почему много инструментов расходует лимит | tool access | [Manage tool access](https://support.claude.com/en/articles/13730515-manage-claude-s-tool-access) |
| П4.5 | Безопасность коннекторов | оценить риски: запись данных, непроверенные серверы, обработка у третьих сторон | security | [Use connectors](https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities) |

### Модуль П5. Навыки (Skills) и плагины

| # | Урок | После урока человек сможет… | Ключевые понятия | Источник |
|---|---|---|---|---|
| П5.1 | Что такое навык | объяснить, что навык — это папка с инструкциями и ресурсами, которую Claude загружает по необходимости | skill, progressive disclosure | [What are skills](https://support.claude.com/en/articles/12512176-what-are-skills) |
| П5.2 | Встроенные навыки | узнать, какие навыки Anthropic работают автоматически (документы Office и PDF) | Anthropic skills | там же; [Use skills](https://support.claude.com/en/articles/12512180-use-skills-in-claude) |
| П5.3 | Свой навык без кода | написать простой SKILL.md с понятным описанием, когда его применять | custom skill | [Create custom skills](https://support.claude.com/en/articles/12512198-how-to-create-custom-skills) |
| П5.4 | Навык или инструкция проекта | выбрать, где хранить правило: в настройках профиля, в проекте или в навыке | сравнение | [Personalization](https://support.claude.com/en/articles/10185728-understanding-claude-s-personalization-features) |
| П5.5 | Плагины и каталог | найти навыки, коннекторы и плагины в общем каталоге и понимать, что плагин — это пакет из них | plugin, directory ⚠️ | [Use plugins](https://support.claude.com/en/articles/13837440-use-plugins-in-claude); [Directory](https://support.claude.com/en/articles/14328846-browse-skills-connectors-and-plugins-in-one-directory) |

### Модуль П6. Длинные задачи (бывший Cowork, теперь часть чата)

| # | Урок | После урока человек сможет… | Ключевые понятия | Источник |
|---|---|---|---|---|
| П6.1 | Чат и Cowork теперь одно целое | понимать, что Claude сам решает, когда задаче нужны инструменты, и что длинная задача продолжает работать в облаке | agentic task ⚠️ | [Cowork and chat are one Claude](https://support.claude.com/en/articles/16761823-claude-cowork-and-chat-are-one-claude) |
| П6.2 | Поставить большую задачу | описать многошаговую задачу с результатом, критериями «готово» и границами | P11, P12 | там же; [Best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices) |
| П6.3 | Безопасно работать с агентом | следить за ходом работы, останавливать её и не давать доступ к лишнему | safety | [Use Cowork safely](https://support.claude.com/en/articles/13364135-use-claude-cowork-safely) |
| П6.4 | Браузер и компьютер | понимать, что умеют встроенный браузер, Claude in Chrome и управление компьютером (бета, Pro и Max), и чем это рискованно | browser, computer use ⚠️ | [Built-in browser](https://support.claude.com/en/articles/16607400-use-the-built-in-browser-in-claude-cowork); [Computer use](https://support.claude.com/en/articles/14128542-let-claude-use-your-computer-in-cowork) |
| П6.5 | Запланированные задачи | создать повторяющуюся задачу, например ежедневную сводку, и проверить результаты прогонов | scheduled tasks ⚠️ | [Schedule recurring tasks](https://support.claude.com/en/articles/13854387-schedule-recurring-tasks-in-claude-cowork) |
| П6.6 | Задачи с телефона | запустить задачу с мобильного и продолжить её на компьютере | cross-device | [Cowork on web, desktop, mobile](https://support.claude.com/en/articles/15520349-use-claude-cowork-on-web-desktop-and-mobile) |

> Примечание: «Запланированные задачи» можно перенести в «Профессионал», но по официальной документации они доступны в обычном интерфейсе на Pro и Max без кода. Предлагаю дать базу здесь, а routines и cron оставить для Проф. М3.

### Модуль П7. Продвинутый промптинг

| # | Урок | После урока человек сможет… | Ключевые понятия | Источник |
|---|---|---|---|---|
| П7.1 | XML-теги | разделить инструкцию, контекст и данные тегами | P6 | [Best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices) |
| П7.2 | Хорошие примеры | подобрать 3 разнообразных примера в тегах `<example>` | P5 | там же |
| П7.3 | Длинные документы | разместить документы сверху, вопрос снизу и снабдить документы метаданными | P8 | там же, «Long context prompting» |
| П7.4 | Цитаты как опора | попросить сначала цитаты, потом вывод, и убрать утверждения без подтверждения | P9 | [Reduce hallucinations](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-hallucinations) |
| П7.5 | Черновик → критика → доработка | провести самопроверку в 3 шага | P10 | [Best practices: Chain](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices) |
| П7.6 | Пусть Claude возьмёт у тебя интервью | попросить Claude задать уточняющие вопросы до начала работы | interview pattern | [Claude Code best practices](https://code.claude.com/docs/en/best-practices.md) |

### Модуль П8. Контекст и лимиты для продвинутых

| # | Урок | После урока человек сможет… | Ключевые понятия | Источник |
|---|---|---|---|---|
| П8.1 | Контекстное окно | объяснить, что такое токены и окно (до 1M токенов на новых моделях в платных планах) и почему длинный чат «забывает» | context window ⚠️ | [Usage & length limits](https://support.claude.com/en/articles/11647753-how-do-usage-and-length-limits-work) |
| П8.2 | Автоматическое сжатие контекста | понимать, что значит «organizing its thoughts», и что важное лучше вынести в проект | context management | там же |
| П8.3 | Что расходует лимит | расставить по «дороговизне» effort, Research, инструменты и длинные чаты | usage | там же |

---

## 4. Уровень «Профессионал»

Цель уровня: человек строит рабочие процессы и продукты с Claude: Claude Code, API, MCP, агенты и автоматизация.

### Модуль Р1. Claude Code: основы

| # | Урок | После урока человек сможет… | Ключевые понятия | Источник |
|---|---|---|---|---|
| Р1.1 | Что такое Claude Code и где он работает | выбрать поверхность: терминал, VS Code, JetBrains, Desktop, веб (claude.ai/code) или мобильное приложение | agentic coding, surfaces | [Overview](https://code.claude.com/docs/en/overview) |
| Р1.2 | Установка и первый запуск | установить Claude Code нативным установщиком, проверить `claude --version` и войти | install ⚠️ | там же; [Quickstart](https://code.claude.com/docs/en/quickstart) |
| Р1.3 | Как работает агентный цикл | объяснить цикл «прочитать → действовать → проверить» и роль инструментов | agent loop | [How Claude Code works](https://code.claude.com/docs/en/how-claude-code-works) |
| Р1.4 | CLAUDE.md | создать CLAUDE.md через `/init` и сократить его по правилу «уберёшь строку — будут ли ошибки?» | CLAUDE.md, auto memory | [Memory](https://code.claude.com/docs/en/memory.md); [Best practices](https://code.claude.com/docs/en/best-practices.md) |
| Р1.5 | Режимы разрешений | переключать режимы (Shift+Tab: manual, plan, auto) и настроить allowlist | permission modes ⚠️ | [Permission modes](https://code.claude.com/docs/en/permission-modes.md) |
| Р1.6 | Explore → Plan → Code → Commit | провести задачу через plan mode и понимать, когда планирование не нужно | plan mode | [Best practices](https://code.claude.com/docs/en/best-practices.md) |
| Р1.7 | Дай способ проверить | сформулировать задачу с тестом, сборкой или скриншотом для самопроверки | verification (P11) | там же |
| Р1.8 | Контекст и откат | применять `/clear`, `/compact`, `Esc`, `/rewind` и checkpoints; знать, что checkpoints — не замена git | context, checkpoints | там же; [Checkpointing](https://code.claude.com/docs/en/checkpointing.md) |

### Модуль Р2. Расширение Claude Code

| # | Урок | После урока человек сможет… | Ключевые понятия | Источник |
|---|---|---|---|---|
| Р2.1 | Карта расширений | выбрать между CLAUDE.md, skill, subagent, hook, MCP и plugin под конкретную цель | features overview | [Extend Claude Code](https://code.claude.com/docs/en/features-overview.md) |
| Р2.2 | Навыки в Claude Code | создать `.claude/skills/<name>/SKILL.md` и вызвать навык через `/name` | skills | [Skills](https://code.claude.com/docs/en/skills.md) |
| Р2.3 | Субагенты | создать субагента в `.claude/agents/`, ограничить его инструменты и делегировать ему исследование | subagents | [Sub-agents](https://code.claude.com/docs/en/sub-agents.md) |
| Р2.4 | Хуки | написать хук, который запускает линтер после каждой правки (хуки детерминированы, CLAUDE.md — только совет) | hooks | [Hooks guide](https://code.claude.com/docs/en/hooks-guide.md) |
| Р2.5 | MCP в Claude Code | подключить сервер командой `claude mcp add --transport http …` | MCP | [MCP](https://code.claude.com/docs/en/mcp.md) |
| Р2.6 | Плагины | установить плагин через `/plugin` и оценить, можно ли ему доверять | plugins | [Plugins](https://code.claude.com/docs/en/plugins/overview.md); [Security](https://code.claude.com/docs/en/plugins/security.md) |

### Модуль Р3. Автоматизация и запланированные задачи

| # | Урок | После урока человек сможет… | Ключевые понятия | Источник |
|---|---|---|---|---|
| Р3.1 | Неинтерактивный режим | запустить `claude -p` в скрипте с выводом JSON | headless | [Headless](https://code.claude.com/docs/en/headless.md) |
| Р3.2 | Routines | создать routine с расписанием, API-триггером или GitHub-событием и написать для неё самодостаточный промпт | routines ⚠️ (research preview) | [Routines](https://code.claude.com/docs/en/routines.md) |
| Р3.3 | Облако или локально | выбрать между routine (облако), Desktop scheduled task (локальные файлы) и `/loop` (внутри сессии) | scheduling | [Scheduled tasks](https://code.claude.com/docs/en/scheduled-tasks.md); [Overview](https://code.claude.com/docs/en/overview) |
| Р3.4 | GitHub Actions и код-ревью | настроить автоматический ревью PR | CI/CD | [GitHub Actions](https://code.claude.com/docs/en/github-actions) |
| Р3.5 | Безопасность автоматизации | ограничить репозитории, сеть и коннекторы routine; помнить, что действия routine выполняются от вашего имени | least privilege | [Routines](https://code.claude.com/docs/en/routines.md) |
| Р3.6 | Параллельная работа | запускать параллельные сессии (worktrees, agent view) и применять паттерн «автор/ревьюер» | parallel sessions | [Best practices](https://code.claude.com/docs/en/best-practices.md); [Agents](https://code.claude.com/docs/en/agents.md) |

### Модуль Р4. Claude API

| # | Урок | После урока человек сможет… | Ключевые понятия | Источник |
|---|---|---|---|---|
| Р4.1 | Ключ и первый вызов | получить ключ в Console, сделать первый вызов Messages API и хранить ключ только на сервере | API key, Messages | [Get started](https://platform.claude.com/docs/en/get-started) |
| Р4.2 | Выбор модели и цены | выбрать модель по задаче и цене и понимать ID моделей и снимки | model IDs, pricing ⚠️ | [Models overview](https://platform.claude.com/docs/en/models/overview.md); [Pricing](https://platform.claude.com/docs/en/about-claude/pricing.md) |
| Р4.3 | Системный промпт и роль | написать системный промпт с ролью, контекстом и форматом | system (P2, P6, P7) | [Best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices) |
| Р4.4 | Thinking и effort | управлять глубиной рассуждения через `effort` (adaptive thinking) | effort ⚠️ | [Effort](https://platform.claude.com/docs/en/build-with-claude/effort) |
| Р4.5 | Структурированный вывод | получать JSON по схеме через Structured Outputs вместо prefill | structured outputs | [Structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) |
| Р4.6 | Tool use | описать инструмент (имя, описание, схема) и обработать `tool_use` и `tool_result` | tools | [Tool use overview](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview.md) |
| Р4.7 | Кеширование промпта | включить `cache_control`, знать минимальную длину префикса и TTL (5 минут или 1 час) | prompt caching ⚠️ | [Prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching.md) |
| Р4.8 | Batch и экономия | отправить пакет запросов со скидкой 50% и посчитать стоимость | batch | [Batch processing](https://platform.claude.com/docs/en/build-with-claude/batch-processing.md) |

### Модуль Р5. MCP (Model Context Protocol)

| # | Урок | После урока человек сможет… | Ключевые понятия | Источник |
|---|---|---|---|---|
| Р5.1 | Что такое MCP | объяснить MCP как «USB-C для ИИ» и назвать хост, клиент и сервер | host/client/server | [What is MCP](https://modelcontextprotocol.io/docs/getting-started/intro) |
| Р5.2 | Примитивы | различать tools, resources и prompts, а на стороне клиента — elicitation | primitives | [Architecture](https://modelcontextprotocol.io/docs/learn/architecture) |
| Р5.3 | Транспорты | выбрать stdio (локально) или Streamable HTTP (удалённо, OAuth) | transports | там же |
| Р5.4 | Свой MCP-сервер | собрать простой сервер с одним инструментом по официальному гайду | build server | [Build server](https://modelcontextprotocol.io/docs/develop/build-server) |
| Р5.5 | Подключение к Claude | подключить сервер к Claude Code, Desktop или claude.ai как custom connector, а через API — как MCP connector | integration | [MCP connector (API)](https://platform.claude.com/docs/en/agents-and-tools/mcp-connector.md); [Claude Code MCP](https://code.claude.com/docs/en/mcp.md) |
| Р5.6 | Хорошие инструменты для агентов | писать понятные названия и описания инструментов и экономно возвращать данные | tool design | [Writing tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents) |

> ⚠️ Спецификация MCP версии `2026-07-28` объявила sampling и logging устаревшими (deprecated) и перешла на stateless-модель с `server/discover`. Материалы и туториалы, написанные до июля 2026, могут описывать протокол иначе.

### Модуль Р6. Агенты

| # | Урок | После урока человек сможет… | Ключевые понятия | Источник |
|---|---|---|---|---|
| Р6.1 | Workflow или агент | отличать заранее заданные пути (workflow) от агента и выбирать самое простое решение | workflows vs agents | [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) |
| Р6.2 | 5 паттернов | узнавать паттерны chaining, routing, parallelization, orchestrator-workers и evaluator-optimizer | patterns | там же |
| Р6.3 | Agent SDK | запустить агента на Python или TypeScript с инструментами Claude Code и настроить разрешения | Agent SDK | [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview.md) |
| Р6.4 | Agent SDK, Client SDK или Managed Agents | выбрать, кто запускает цикл агента: вы, ваш код или Anthropic | сравнение | там же; [Managed Agents](https://platform.claude.com/docs/en/managed-agents/overview) ⚠️ (research preview) |
| Р6.5 | Контекст-инжиниринг | применять для агентов сжатие контекста, заметки, субагентов и память | context engineering | [Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) |
| Р6.6 | Безопасный агент | применять подтверждение необратимых действий, sandbox, минимальные права и защиту от инъекций | safety (P12) | [Secure deployment](https://code.claude.com/docs/en/agent-sdk/secure-deployment.md) |

### Модуль Р7. Промпт-инжиниринг для продакшена

| # | Урок | После урока человек сможет… | Ключевые понятия | Источник |
|---|---|---|---|---|
| Р7.1 | Сначала критерии успеха | сформулировать измеримые критерии до того, как писать промпт | success criteria | [Prompt engineering overview](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview) |
| Р7.2 | Evals | собрать набор тестов и сравнивать версии промпта | evals | [Develop tests](https://platform.claude.com/docs/en/test-and-evaluate/develop-tests); [Demystifying evals](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) |
| Р7.3 | Ограничители (guardrails) | снизить галлюцинации и утечку системного промпта и повысить согласованность ответов | guardrails | [Reduce hallucinations](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-hallucinations) |
| Р7.4 | Миграция между моделями | читать модельные гайды и проверять промпт на новой модели через evals | migration ⚠️ | [Migration guide](https://platform.claude.com/docs/en/about-claude/models/migration-guide) |
| Р7.5 | Промпт для агента | написать промпт агента с масштабом задачи, проверкой, правилами автономии и отчётом о прогрессе | P11, P12 | [Best practices: Agentic systems](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices) |

---

## 5. Быстро меняющиеся темы (контролировать ежемесячно)

Легенда: ⚠️ — в таблицах уроков означает «часто меняется или зависит от плана либо региона».

| Тема | Что меняется | Последнее изменение (по release notes) | Ограничения по плану или региону | Рекомендация для контента |
|---|---|---|---|---|
| **Модели** | названия, цены, effort по умолчанию, даты вывода из эксплуатации | Haiku 5.5 (07.10.2026), Sonnet 5.5 (28.09), Opus 5.5 (22.09), Fable/Mythos 5.1 (01.09) | Free — только Sonnet и Haiku; Fable — отдельная статья о доступе | Не зашивать названия в текст урока, брать их из переменной `{{model.*}}` |
| **Тарифы и цены** | цены, состав планов, API-кредиты в Max и Team | 07.10.2026 (кредиты API) | — | Отдельный JSON «plans», в уроках ссылаться на claude.com/pricing |
| **Лимиты** | 5-часовые и недельные лимиты, usage bundles, сброс лимитов | — | — | Цифры не указывать, учить находить Settings > Usage |
| **Интерфейс чата** | слияние с Cowork, меню «+», «Customize» | 16.09.2026 | раскатывается постепенно, сначала Pro и Max | Скриншоты хранить отдельно от текста, пути к кнопкам — в метаданных |
| **Артефакты** | типы Docs, Slides, Design, Dashboards (бета), Motion (бета); legacy закрыты 16.09 | 16.09.2026 | Dashboards — Pro+; Motion — Team/Enterprise | Проверять перед каждым релизом модуля П1 |
| **Память** | модель «Topics», чувствительные темы, работа памяти в Cowork | 10.07 и 25.08.2026 | на Team/Enterprise выключена по умолчанию; для HIPAA-организаций недоступна | Проверять ежемесячно |
| **Chat search** | — | — | Pro, Max, Team, Enterprise | — |
| **Проекты** | новая версия проектов («проект = одна беседа», параллельные потоки), бета | идёт раскатка | Free — до 5 проектов, RAG — только на платных; шаринг — Team/Enterprise | Урок Н4 пометить «может измениться» |
| **Research** | — | — | только платные планы | — |
| **Коннекторы** | каталог, права записи, режим «On demand» | 07.07.2026 (M365 write) | Free — 1 кастомный коннектор | — |
| **Skills и плагины** | каталог, сканирование безопасности, портал разработчиков | 25.09.2026 | Skills — все планы, нужен code execution | — |
| **Запланированные задачи и routines** | где выполняются (облако или локально), лимиты | 06.10.2026 (перенос в облако) | Pro и выше; routines — research preview | — |
| **Computer use, браузер, Chrome** | — | — | computer use — бета, Pro и Max | — |
| **Claude Code** | версии CLI (v2.1.2xx), режимы разрешений (auto mode по умолчанию с v2.1.283), команды | непрерывно | Desktop и веб — только платные планы | В уроках указывать минимальную версию |
| **API** | prefill убран, adaptive thinking, параметр effort, beta-заголовки | с моделей 4.6 | — | Ежемесячная сверка с migration guide |
| **MCP** | версия спецификации 2026-07-28: sampling и logging устарели, stateless-модель | июль 2026 | — | Указывать версию спецификации в уроке |
| **Регионы** | список стран | — | **RU и BY не поддерживаются**; UA — кроме Крыма и 4 областей | Онбординг; не учить обходам |
| **Язык интерфейса** | список языков | — | RU и UK отсутствуют | Названия кнопок давать по-английски с переводом |
| **Приватность** | настройка Model Improvement, сроки хранения | — | на коммерческих планах условия другие | Ссылка на privacy.claude.com |

---

## 6. Существующие официальные учебные материалы

| Материал | Что внутри | Язык | Актуальность | Что это значит для Navyk |
|---|---|---|---|---|
| [Anthropic Academy (Skilljar)](https://anthropic.skilljar.com/), вход также через [academy.claude.com](https://academy.claude.com/) | 23 курса: Claude 101, Claude Code 101, Claude Platform 101, Introduction to Claude Cowork, Claude Code in Action, Building with the Claude API, Intro to MCP, MCP Advanced, Intro to agent skills, Intro to subagents, серия AI Fluency и др. Бесплатно, есть сертификаты. | Английский. Других языков на страницах курсов не найдено (не подтверждено, что их нет) | Обновляется | Хороший ориентир по структуре. Navyk отличается форматом (3–5 минут, геймификация), языками RU/UK и проверкой промптов. |
| [Claude 101](https://anthropic.skilljar.com/claude-101) | Meet Claude → Projects, Artifacts, Skills → Connectors, Enterprise search, Research → use cases | EN | Актуален | Совпадает с нашей связкой «Новичок + Продвинутый» |
| [AI Fluency: Framework & Foundations](https://anthropic.skilljar.com/ai-fluency-framework-foundations) | Фреймворк «4D»: Delegation, Description, Discernment, Diligence | EN | — | Можно сослаться как на «философию» и сделать лёгкий урок в Н1 или Н7 (только ссылка на источник, без копирования) |
| [GitHub: anthropics/courses](https://github.com/anthropics/courses) | API fundamentals, prompt engineering tutorial, real world prompting, prompt evaluations, tool use (Jupyter) | EN | Используют Claude 3 Haiku и частично устарели | Не опираться на детали API из этих курсов |
| [Prompt engineering interactive tutorial](https://github.com/anthropics/prompt-eng-interactive-tutorial) | 9 глав + приложение (ясность, роли, разделение данных, формат, шаги, примеры, галлюцинации, сложные промпты) | EN | Claude 3; глава про prefill устарела | Последовательность глав хорошо ложится на «позвоночник» |
| [Engineering blog](https://www.anthropic.com/engineering) | Building effective agents, context engineering, Agent Skills, writing tools for agents, Claude Code best practices и др. | EN | Статьи 2024–2026 | Источник для уровня Профессионал |

---

## 7. Открытые вопросы (не подтверждено)

1. Есть ли официальные переводы курсов Academy на RU или UK — **не подтверждено** (на страницах не указано).
2. Какая модель по умолчанию стоит на Free-плане в приложении — **не подтверждено**: в статье о моделях этого нет, а на странице цен сказано только «Sonnet и Haiku».
3. В статье о персонализации противоречие: инструкции проекта то доступны Free, то «только платным». **Не подтверждено**, нужна ручная проверка в интерфейсе.
4. Отдельная статья о «styles» (стилях ответа) в найденных коллекциях не встретилась. Существует ли эта функция сейчас — **не подтверждено**.
5. Сроки хранения обычных чатов (кроме отзывов, до 5 лет) — в просмотренной статье не указаны, **не подтверждено**.

---

## 8. Источники (все проверены 2026-10-13)

**platform.claude.com (бывший docs.claude.com)**
- https://platform.claude.com/llms.txt — индекс документации
- https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview
- https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
- https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-hallucinations
- https://platform.claude.com/docs/en/models/overview.md
- https://platform.claude.com/docs/en/build-with-claude/prompt-caching.md

**code.claude.com**
- https://code.claude.com/docs/en/overview
- https://code.claude.com/docs/llms.txt — индекс
- https://code.claude.com/docs/en/best-practices.md
- https://code.claude.com/docs/en/routines.md
- https://code.claude.com/docs/en/agent-sdk/overview.md

**support.claude.com**
- https://support.claude.com/en/ (коллекции)
- https://support.claude.com/en/articles/12138966-release-notes
- https://support.claude.com/en/collections/18031719-features-and-capabilities
- https://support.claude.com/en/collections/9811058-get-started-with-claude
- https://support.claude.com/en/collections/18031876-usage-and-limits
- https://support.claude.com/en/collections/18031818-personalization-and-settings
- https://support.claude.com/en/collections/18031977-conversation-management
- https://support.claude.com/en/collections/19667525-claude-cowork
- https://support.claude.com/en/collections/17879426-general (коннекторы)
- https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context
- https://support.claude.com/en/articles/9517075-what-are-projects
- https://support.claude.com/en/articles/11647753-how-do-usage-and-length-limits-work
- https://support.claude.com/en/articles/9797557-usage-limit-best-practices
- https://support.claude.com/en/articles/13854387-schedule-recurring-tasks-in-claude-cowork
- https://support.claude.com/en/articles/16761823-claude-cowork-and-chat-are-one-claude
- https://support.claude.com/en/articles/12512176-what-are-skills
- https://support.claude.com/en/articles/11088861-use-research-on-claude
- https://support.claude.com/en/articles/11095361-when-should-i-use-web-search-extended-thinking-and-research
- https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude
- https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them
- https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities
- https://support.claude.com/en/articles/8664678-change-the-model-effort-and-thinking-settings
- https://support.claude.com/en/articles/8241126-upload-files-to-claude
- https://support.claude.com/en/articles/10769299-how-to-use-claude-in-your-preferred-language
- https://support.claude.com/en/articles/10185728-understanding-claude-s-personalization-features
- https://support.claude.com/en/articles/14503520-available-beta-and-research-preview-features

**privacy.claude.com, claude.com, anthropic.com**
- https://privacy.claude.com/en/articles/10023580-is-my-data-used-for-model-training
- https://claude.com/pricing
- https://www.anthropic.com/supported-countries
- https://www.anthropic.com/engineering
- https://www.anthropic.com/engineering/building-effective-agents

**modelcontextprotocol.io**
- https://modelcontextprotocol.io/docs/getting-started/intro
- https://modelcontextprotocol.io/docs/learn/architecture

**Учебные материалы**
- https://academy.claude.com/
- https://anthropic.skilljar.com/
- https://anthropic.skilljar.com/claude-101
- https://anthropic.skilljar.com/ai-fluency-framework-foundations
- https://github.com/anthropics/courses
- https://github.com/anthropics/prompt-eng-interactive-tutorial

> Ссылки из таблиц уроков, которые не открывались напрямую (например, `effort`, `structured-outputs`, `develop-tests`, `build-server`, `github-actions`, `quickstart`, `managed-agents/overview`), взяты из официальных индексов (llms.txt) или из ссылок внутри проверенных страниц. Сами страницы не открывались, поэтому перед написанием уроков их нужно открыть и проверить.
