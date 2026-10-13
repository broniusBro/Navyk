# 01. «Движки» обучающих приложений: механики, доказательства, выводы для Navyk

Дата исследования: 2026-10-13. Автор: researcher (агент Navyk).
Метод: веб-поиск и чтение первоисточников (страницы App Store, сайты продуктов, блоги Duolingo, отчёты для акционеров, научные статьи). Цены — на дату чтения, в USD, если не указано иное; цены в сторах различаются по регионам и акциям. Пометка «не найдено» — данных в открытых источниках не нашёл, не додумывал.

---

## Краткий вывод

1. **Прямой конкурент — Kodree (бывш. Knowely) от Mate academy.** Уже есть отдельные курсы Claude Chat, Claude Code, Claude Cowork, Claude Design, Claude in Chrome; формат «80% практики», ИИ-проверка заданий, XP/лиги/серии. Но **только на английском** и с ценой $39.99/мес или $98.99/год ([kodree.com](https://kodree.com), [курс Claude Code](https://kodree.com/courses/claude-code), [App Store](https://apps.apple.com/us/app/knowely-80-hands-on-learning/id6739421200)). Ниша «Claude на русском/украинском в формате микро-уроков с практикой» — по найденным данным свободна.
2. **ИИ-проверка свободного текста стала стандартом у сильных игроков**: ИИ-ментор Kodree проверяет задания построчно, у Mimo — AI tutor, у Brilliant — ИИ-репетитор Koji (запущен в мае 2026), у Duolingo Max — Explain My Answer / Roleplay / Video Call. Но **отдельного продукта, где ИИ оценивает именно написанный пользователем промпт по рубрике, я не нашёл** — у Coursiv промпты только классифицируют «хороший/плохой», у Learn AI Prompting выбирают исправление из вариантов ([softwaretestinghelp](https://www.softwaretestinghelp.com/?p=425674), [coddykit](https://www.coddykit.com/apps/learn-ai-prompting)). Это главное окно для Navyk.
3. **Серия дней (streak) — механика с лучшей доказательной базой** среди геймификации: у Duolingo +3.3% к удержанию на 14-й день после переработки серии, +14% к удержанию на 7-й день от «ставки на серию», 7-дневная серия → в 3.6 раза выше шанс закончить курс ([блог Duolingo](https://blog.duolingo.com/improving-the-streak), [2017](https://blog.duolingo.com/how-streaks-keep-duolingo-learners-committed-to-their-language-goals/), [2022](https://blog.duolingo.com/how-duolingo-streak-builds-habit)). Независимое RCT на 60 тыс. школьников (2026) подтверждает рост вовлечённости у уже активных пользователей ([IPR WP-26-05](https://www.ipr.northwestern.edu/documents/working-papers/2026/wp-26-05.pdf)).
4. **Ценность до регистрации работает**: перенос экрана регистрации после первого урока дал Duolingo около +20% DAU ([Taplytics](https://taplytics.com/blog/duolingo-ab-test-onboarding)).
5. **Интервальное повторение и активное извлечение (тесты вместо перечитывания) — самые доказанные педагогические механики** (метаанализ 317 экспериментов; через неделю 56–61% против 40–42% у перечитывания) ([Cepeda 2006](https://www.evullab.org/pdf/CepedaPashlerVulWixtedRohrer-PB-2006.pdf), [Roediger & Karpicke 2006](https://psychology.ecu.edu/wp-content/pv-uploads/sites/216/2019/03/Roediger-Karpicke-2006.pdf)). Есть у EWA, Sololearn, Duolingo; у Kodree — не найдено.
6. **Наказующие лимиты (hearts/energy) раздражают пользователей** — главная жалоба в отзывах Mimo и Sololearn; переход Duolingo на energy вызвал 62% негатива в опросе Android Authority, хотя Duolingo сообщает о росте DAU и конверсии на iOS ([Android Authority](https://www.androidauthority.com/quitting-duolingo-energy-system-3599842/), [письмо акционерам Q2 2025](https://www.sec.gov/Archives/edgar/data/1562088/000156208825000165/q2fy25duolingo6-30x25share.htm)). Для MVP Navyk — не нужно.
7. **Главные жалобы по всему рынку — биллинг и автопродление** (EWA, Kodree, Coursiv) ([Trustpilot EWA](https://ca.trustpilot.com/review/appewa.com), [Trustpilot Kodree](https://www.trustpilot.com/review/kodree.com)). Прозрачная отмена подписки — дешёвое конкурентное преимущество.
8. **Лиги/лидерборды** — у Duolingo, Brilliant, Kodree; публичных цифр эффекта на удержание не найдено; метаанализ показывает, что чистая конкуренция слабее, чем конкуренция + кооперация ([Sailer & Homner 2020](https://link.springer.com/article/10.1007/s10648-019-09498-w)). Не для MVP.

---

## Сравнительная таблица

| Приложение | Что учит | Длина урока | Практика / ИИ-проверка свободного текста | Геймификация | Интервальное повторение | Ценность до регистрации | Цена (USD) | Платформы | RU / UK |
|---|---|---|---|---|---|---|---|---|---|
| **Kodree** (Mate academy) | ИИ (вкл. Claude Chat/Code/Cowork), данные, дизайн, код | «10+ мин/день» на курс; длина урока не указана | Да: ИИ-ментор проверяет задания, построчный фидбэк, AI Buddy | XP, лиги, лидерборд, серии, достижения, сертификаты | Не найдено | Не найдено | Веб: $39.99/мес, $98.99/год, $199.99 навсегда | Веб, iOS, Android | Только EN |
| **EWA** (Lithium Lab) | Английский, испанский, французский | ~5 мин/день (App Store); 10–15 мин (обзор) | ИИ-разговорник с фидбэком по произношению (обзор); в карточке App Store ИИ не описан | Дуэли, сравнение с другими, рейтинг; серии не подтверждены | Да, 40 000+ карточек | Не найдено | $11.99–15.99/мес, $34.99/6 мес, $49.99–99.99/год; RU: 549–1150 ₽/мес | iOS, Android | Интерфейс RU/UK есть |
| **Duolingo** | Языки, математика, музыка, шахматы | Короткие уроки (точная длина не найдена) | 13 типов упражнений с автопроверкой; ИИ в Max: Explain My Answer, Roleplay, Video Call | Серии, XP, 10 лиг, energy (вместо hearts), маскот Duo, квесты | Да (Half-Life Regression) | Да — урок до регистрации | Super ≈ $6.99/мес; Max $29.99/мес или $167.99/год | Веб, iOS, Android | Да |
| **Mimo** | Программирование, «AI-driven» разработка | ~5 мин | Набор кода с мгновенной проверкой; AI tutor (полный — в Max) | Серии, лидерборды, hearts, сертификаты | Не найдено | Бесплатный базовый план | Pro $14.99/мес или $9.99/мес годовой; Max $39.99/мес или $24.99/мес годовой | iOS, Android; веб только в Max | Интерфейс RU есть; UK не найден |
| **Brilliant** | Математика, наука, CS, основы ИИ | 5–15 мин (обзор); также 15–30 мин | Интерактивные задачи, код в браузере; ИИ-репетитор Koji (с 29.05.2026) | Серии + Streak Charges, XP, 10 лиг по 30 человек | Персональная практика (Premium); механизм не описан | Бесплатно первые уроки; 7-дн. триал | $24.99/мес; год $119.99–149.99 (источники расходятся) | Веб, iOS, Android | Не найдено |
| **Sololearn** | Программирование + «Learn AI» (Max) | «Bite-sized», точно не указано | Код, квизы, игры; ИИ-помощник Kodie; в Bug Hunter ответ свободным текстом проверяет ИИ | Серии; лимит ошибок (по отзыву); лиги — не подтверждены | Да (по App Store) | Бесплатный старт | Pro $6.99–12.99/мес, $47.99–79.99/год; Max — не найдено | iOS, Android, веб | Интерфейс RU есть |
| **Coursiv** | Использование ИИ-инструментов (вкл. Claude) | 5–20 мин | Чтение, fill-in-the-blank, квизы, игры «Prompt Master» (оценить промпт) — без ИИ-фидбэка | Серии, мини-игры | Не найдено | Длинный опрос (~20 вопросов) перед оплатой | $6.93 первая неделя; $39.99/мес после промо | Веб, iOS, Android | Не найдено |
| **Learn AI Prompting** (CoddyKit) | Промпт-инжиниринг | 5–10 мин | Переписать промпт; «отладка» сломанного промпта (выбор фикса); Python-проекты; AI Mentor отвечает на вопросы | Серии, сертификат | Не найдено | Бесплатный первый курс | Pro: цены не найдены | iOS, Android | Интерфейс на 22 языках (какие — не уточнено) |
| **Anthropic Academy** | Claude, Claude Code, API, MCP, Skills | Видео + квизы, напр. Claude Code in Action: 15 уроков ≈ 1 ч | Квизы; практика в своём Claude (нужна подписка/ключ) | Нет (сертификаты) | Нет | Нужна регистрация по email | Бесплатно | Веб | Только EN |

Источники к таблице — в разделах по приложениям ниже.

---

## Разбор по приложениям

### 1. Kodree (бывш. Knowely) — ближайший конкурент

- **Кто:** приложение Mate academy (EdTech-компания, основана в 2014, офис в Варшаве, работает в Украине, Польше и Бразилии) ([DOU](https://dou.eu/companies/mate-academy), [App Store](https://apps.apple.com/app/id6739421200)).
- **Позиционирование:** «80% Practice»; 60+ курсов: ИИ (Claude Code, Claude Cowork, Applied Vibe Coding, Prompting for Vibe Coding, LLM & RAG), данные (Excel, SQL, Python), дизайн (Figma), разработка; карьерные треки, в т.ч. «Vibe Coding Engineer» ([App Store](https://apps.apple.com/app/id6739421200)). На сайте также курсы Claude Chat, Claude Design, Claude in Chrome ([kodree.com](https://kodree.com)).
- **Курс Claude Code:** уровень intermediate, «10+ мин/день», 12 модулей, 59 уроков, 127 заданий. Модули: CLI, CLAUDE.md, проект на реальном репозитории, plan/loop, Git, MCP, Skills, headless/hooks/CI, параллельные сабагенты, плагины, мульти-агентный проект. Практика — в том числе на собственных репозиториях ([курс Claude Code](https://kodree.com/courses/claude-code)).
- **Курс Claude Chat:** начальный уровень, 8 модулей, 40 уроков, 84 задания: основы промптинга, роли, пошаговое рассуждение, память и проекты, файлы, deep research, распознавание галлюцинаций, артефакты, шаблоны и цепочки промптов, финальный проект. Проверяет ли ИИ именно промпты — на странице не сказано ([курс Claude Chat](https://kodree.com/courses/claude-chat)).
- **Типы упражнений:** написание кода, SQL-запросы, задачи в Excel, дизайн экранов во встроенном редакторе; проекты для портфолио ([App Store](https://apps.apple.com/app/id6739421200)). Точный список форматов внутри урока — не найдено.
- **Фидбэк:** ИИ-ментор проверяет каждое задание и даёт построчный фидбэк; AI Buddy подсказывает, когда застрял; в обновлении 1.38.6 добавлен ревьюер для Excel-задач ([App Store](https://apps.apple.com/app/id6739421200), [kodree.com](https://kodree.com)).
- **Геймификация:** XP, лиги, лидерборд, серии, достижения, профиль с серией/XP/лигой, гибкие дедлайны ([App Store](https://apps.apple.com/app/id6739421200)).
- **Интервальное повторение:** не найдено.
- **Онбординг:** в карточке — «практика в первые 5 минут»; есть ли урок до регистрации/оплаты — не найдено ([App Store US](https://apps.apple.com/us/app/knowely-80-hands-on-learning/id6739421200)).
- **Монетизация:** всё содержимое за подпиской. Сайт: $39.99/мес, $98.99/год, $199.99 навсегда, 14 дней на возврат ([kodree.com](https://kodree.com)). В App Store: 1 мес $19.99–24.99, 3 мес $38.49–59.99, 12 мес $98.99 ([App Store](https://apps.apple.com/app/id6739421200)).
- **Платформы:** веб, iOS (и Mac на Apple Silicon), Android ([kodree.com](https://kodree.com), [App Store](https://apps.apple.com/app/id6739421200)).
- **Языки:** только английский ([App Store](https://apps.apple.com/app/id6739421200)).
- **Отзывы:** App Store 4.4 (251 оценка); жалобы: нет версии для iPad, текст длинных уроков плохо прокручивается, не работает кнопка отзыва на урок ([App Store US](https://apps.apple.com/us/app/knowely-80-hands-on-learning/id6739421200)). Trustpilot 4.6 (532 отзыва); жалобы — условия подписки и неожиданные списания, только текст без видео ([Trustpilot](https://www.trustpilot.com/review/kodree.com)).

### 2. EWA (английский) и EWA: Learn AI Skills

- **Разработчик:** Lithium Lab Pte Ltd ([App Store](https://apps.apple.com/us/app/ewa-english-language-learning/id1200778841)).
- **Формат:** короткие уроки около 5 мин/день; видеокурсы на отрывках из фильмов и сериалов (15 000+), диалоги на бытовые темы, библиотека из 10 000+ адаптированных книг с аудио, курсы по уровням CEFR A1–C1 ([App Store US](https://apps.apple.com/us/app/ewa-english-language-learning/id1200778841), [App Store RU](https://apps.apple.com/ru/app/ewa-%D1%83%D1%87%D0%B8%D1%82%D1%8C-%D0%B0%D0%BD%D0%B3%D0%BB%D0%B8%D0%B9%D1%81%D0%BA%D0%B8%D0%B9-%D1%8F%D0%B7%D1%8B%D0%BA/id1200778841)). В обзоре — сессии по 10–15 мин ([learnenglish.life](https://learnenglish.life/reviews/ewa/)).
- **Типы упражнений:** перевод слова в одно касание при чтении и просмотре; карточки; Memento (сопоставить картинку и слово); Duelling (дуэль в реальном времени — выбрать перевод); Wordcraft (найти слова среди букв) ([App Store RU](https://apps.apple.com/ru/app/ewa-%D1%83%D1%87%D0%B8%D1%82%D1%8C-%D0%B0%D0%BD%D0%B3%D0%BB%D0%B8%D0%B9%D1%81%D0%BA%D0%B8%D0%B9-%D1%8F%D0%B7%D1%8B%D0%BA/id1200778841)). Исторически цикл заучивания слова из 5 шагов: карточка → выбор перевода EN→RU → RU→EN → сопоставление → собрать слово из букв ([Лайфхакер, 2017](https://lifehacker.ru/ewa/)).
- **ИИ:** обзор описывает ИИ-разговорник с фидбэком по произношению, точности и беглости (премиум), с замечанием о непостоянном качестве ([learnenglish.life](https://learnenglish.life/reviews/ewa/)); в карточке App Store ИИ не упомянут.
- **Интервальное повторение:** да, колода из 40 000+ карточек; трудные слова повторяются чаще ([App Store US](https://apps.apple.com/us/app/ewa-english-language-learning/id1200778841), [learnenglish.life](https://learnenglish.life/reviews/ewa/)).
- **Геймификация:** игры, дуэли, сравнение прогресса с другими; серии в карточке не упомянуты ([App Store RU](https://apps.apple.com/ru/app/ewa-%D1%83%D1%87%D0%B8%D1%82%D1%8C-%D0%B0%D0%BD%D0%B3%D0%BB%D0%B8%D0%B9%D1%81%D0%BA%D0%B8%D0%B9-%D1%8F%D0%B7%D1%8B%D0%BA/id1200778841)).
- **Онбординг:** не найдено (библиотека пейволов Adapty не описывает момент показа) ([Adapty](https://adapty.io/paywall-library/ewa-learn-english-spanish/)).
- **Цены:** США — $11.99–15.99/мес, $34.99/6 мес, $49.99–99.99/год ([App Store US](https://apps.apple.com/us/app/ewa-english-language-learning/id1200778841)); Россия — 549–1150 ₽/мес, 2490–2990 ₽/6 мес, 1390–4750 ₽/год ([App Store RU](https://apps.apple.com/ru/app/ewa-%D1%83%D1%87%D0%B8%D1%82%D1%8C-%D0%B0%D0%BD%D0%B3%D0%BB%D0%B8%D0%B9%D1%81%D0%BA%D0%B8%D0%B9-%D1%8F%D0%B7%D1%8B%D0%BA/id1200778841)). Набор курсов зависит от языка устройства.
- **Платформы:** iOS, Android ([learnenglish.life](https://learnenglish.life/reviews/ewa/)). Веб для обучения — не найдено (веб-аккаунт упоминается для отмены подписки).
- **Отзывы:** App Store 4.7 (≈196 тыс.); Trustpilot ≈4.5 (≈2050). Жалобы: списания и продления, ИИ-тьютор за доплату к годовой подписке, отмена только через веб, проблемы со входом, неверный уровень ([Trustpilot](https://ca.trustpilot.com/review/appewa.com), [App Store US](https://apps.apple.com/us/app/ewa-english-language-learning/id1200778841)).
- **EWA: Learn AI Skills (LearnAI by EWA):** отдельное приложение тех же создателей — короткие уроки на проектах по ChatGPT, Claude, Midjourney, «учиться, создавая». Trustpilot 3.9, всего 7 отзывов; формат упражнений, цены и языки — не найдено ([Trustpilot](https://www.trustpilot.com/review/ewaskills.com), [ewaskills.com](https://ewaskills.com)). **Это потенциальный конкурент с RU-аудиторией EWA — стоит отслеживать.**

### 3. Duolingo

- **Масштаб (Q2 2026):** 58.7 млн DAU (+23% г/г), 140.6 млн MAU, 12.7 млн платных подписчиков; удержание текущих пользователей (CURR) — рекорд 84% ([письмо акционерам Q2 2026](https://www.sec.gov/Archives/edgar/data/0001562088/000162828026053299/q2fy26duolingo6-30x26share.htm)).
- **Типы упражнений (13):** собрать предложение из слов; дописать пропущенное слово в переводе; выбрать правильный перевод; сопоставить слово и картинку; перевод с подсказкой-картинкой; прочитать и ответить; выбрать пропущенное слово; перемешанное предложение (с лишними словами); произнести фразу; «тапни пары»; свободный перевод; записать услышанное; выбрать услышанное ([Duolingo Wiki](https://duolingo.fandom.com/wiki/Exercise)).
- **ИИ-фидбэк (Max):** Explain My Answer (чат о том, почему ответ верен/неверен), Roleplay, Video Call ([AI Wiki](https://artificial-intelligence-wiki.com/industry-ai/ai-in-education/duolingo-max-pricing/)). Video Call в 2026 году выдают большинству новых подписчиков Super; рост ИИ-функций сдерживают из-за себестоимости ([Q2 2026](https://www.sec.gov/Archives/edgar/data/0001562088/000162828026053299/q2fy26duolingo6-30x26share.htm)).
- **Геймификация:** серии (+ заморозка серии за 400 гемов, «Streak Revival»), XP, 10 лиг с недельным циклом, квесты, маскот Duo ([лиги](https://blog.duolingo.com/duolingo-leagues-leaderboards/), [серии](https://blog.duolingo.com/how-duolingo-streak-builds-habit)). Hearts заменены на energy (25 единиц, тратится на каждое упражнение, восстанавливается за серию правильных ответов), анонс в июле 2025 ([Android Authority](https://www.androidauthority.com/quitting-duolingo-energy-system-3599842/)).
- **Интервальное повторение:** модель Half-Life Regression; ошибка прогноза на 45% ниже, чем у системы Лейтнера; в A/B-тесте упрощённая версия дала +12% к общей активности ([Settles & Meeder 2016](https://preview.aclanthology.org/fix_video/P16-1174.pdf)).
- **Онбординг:** цель и мотивация → уровень/тест на размещение → уроки без аккаунта → предложение зарегистрироваться после урока ([Appcues](https://goodux.appcues.com/blog/duolingo-user-onboarding)).
- **Цены:** Super ≈ $6.99/мес (≈$84/год); Max $29.99/мес или $167.99/год; семейный Max $240/год ([AI Wiki, обновлено 02.2026](https://artificial-intelligence-wiki.com/industry-ai/ai-in-education/duolingo-max-pricing/)).
- **Жалобы:** energy расходуется даже при безошибочных ответах; 62% из ≈18 тыс. голосов против ([Android Authority](https://www.androidauthority.com/quitting-duolingo-energy-system-3599842/)).

### 4. Mimo

- **Формат:** уроки около 5 мин, центр — набор настоящего кода с мгновенной проверкой; карьерные треки (у Python — 23 челленджа и 8 проектов) ([блог Mimo](https://mimo.org/blog/mimo-vs-codecademy)).
- **Упражнения:** выбор ответа, набор кода (без автокоррекции опечаток — жалоба), мобильная IDE для Python/JS/HTML, проекты ([App Store](https://apps.apple.com/us/app/mimo-learn-coding-ai-coding/id1133960732)).
- **ИИ:** AI tutor с контекстом урока; ограниченный в Basic/Pro, без ограничений в Max ([цены Mimo](https://mimo.org/pricing), [блог Mimo](https://mimo.org/blog/mimo-vs-codecademy)).
- **Геймификация:** серии, лидерборды, сертификаты, hearts с таймером восстановления ([App Store](https://apps.apple.com/us/app/mimo-learn-coding-ai-coding/id1133960732)).
- **Интервальное повторение:** не найдено.
- **Цены:** Pro $14.99/мес или $9.99/мес при годовой оплате; Max $39.99/мес или $24.99/мес при годовой; 7-дневный триал только для годового плана ([блог Mimo](https://mimo.org/blog/mimo-vs-codecademy), [цены Mimo](https://mimo.org/pricing)).
- **Платформы:** iOS, Android; полный веб — только в Max ([цены Mimo](https://mimo.org/pricing)).
- **Языки интерфейса:** в т.ч. русский; украинского нет ([App Store](https://apps.apple.com/us/app/mimo-learn-coding-ai-coding/id1133960732)).
- **Отзывы:** 4.8 (≈111 тыс.). Главная жалоба — hearts: ошибки быстро съедают сердца, ожидание 3–4 часа прерывает обучение ([App Store](https://apps.apple.com/us/app/mimo-learn-coding-ai-coding/id1133960732)).

### 5. Brilliant

- **Формат:** интерактивные задачи: короткое введение концепции → сразу применить; подсказки без готового ответа; визуальные модели; редактор кода в браузере. Длина по обзору — 5–15 мин (местами 15–30) ([SkillScouter](https://skillscouter.com/brilliant-review-math-science-coding/)).
- **Упражнения (по странице AI):** писать и запускать код, читать и отлаживать чужой код, регулярные проверки освоения с целевой практикой при провале, персональные сессии практики ([brilliant.org/s/sem/ai](https://brilliant.org/s/sem/ai)).
- **ИИ:** репетитор Koji (с 29.05.2026) видит прогресс, подсвечивает и меняет интерактивы на экране, ведёт пошагово, голосом или в чате ([SkillScouter](https://skillscouter.com/brilliant-review-math-science-coding/), [brilliant.org](https://brilliant.org/s/sem/ai)).
- **Геймификация:** серии; Streak Charges (до 2, зарабатываются уроками, автоматически спасают серию, не сгорают); недельные лиги по 30 человек, 10 уровней ([лиги](https://brilliant.org/help/features/what-are-leagues-and-leaderboards), [Streak Charge](https://brilliant.org/help/features/what-is-a-streak-charge/)).
- **Онбординг/монетизация:** выбор уровня; бесплатно — ограниченное число уроков в день («ключи») и первые уроки курсов; 7-дневный триал; $24.99/мес; год — $119.99 ([Educational App Store](https://www.educationalappstore.com/app/brilliant-solve-learn-grow)) или $149.99 ([SkillScouter](https://skillscouter.com/brilliant-review-math-science-coding/)) — источники расходятся.
- **Платформы:** веб, iOS, Android. RU/UK — не найдено.
- **Минусы (обзор):** нет видео-лекций, новые курсы по данным и программированию слабее математики ([SkillScouter](https://skillscouter.com/brilliant-review-math-science-coding/)).

### 6. Sololearn

- **Формат:** «bite-sized» интерактивные уроки, упражнения на код, проекты, игры, челленджи, квизы, мобильный компилятор; 15 курсов «Learn AI» в подписке Max (анализ данных, письмо и брейншторм с ИИ, SEO) ([App Store](https://apps.apple.com/us/app/sololearn/id1210079064)). На сайте в списке ИИ-курсов есть «Prompt Engineering»; формат практики в нём — не найдено ([sololearn.com/pro](https://www.sololearn.com/en/pro)).
- **ИИ:** помощник Kodie (персональные задания, подсказки, объяснения кода); в игре Bug Hunter пользователь пишет ответ, его проверяет ИИ ([AppFollow](https://appfollow.io/ios/sololearn-learn-to-code/1210079064?country=us), [TechRadar, 2024](https://www.techradar.com/computing/websites-apps/i-learned-how-to-use-ai-generative-prompts-with-this-one-app)).
- **Интервальное повторение:** заявлено ([App Store](https://apps.apple.com/us/app/sololearn/id1210079064)).
- **Геймификация:** серии ответов, баллы, соревнования с другими пользователями ([TechRadar](https://www.techradar.com/computing/websites-apps/i-learned-how-to-use-ai-generative-prompts-with-this-one-app)); лимит в 3 ошибки с ожиданием — по отзыву ([App Store](https://apps.apple.com/us/app/sololearn/id1210079064)). Лиги — не подтверждены источником.
- **Цены:** Pro $6.99–12.99/мес, $47.99–79.99/год (несколько позиций в App Store без пояснений); цена Max не найдена ([App Store](https://apps.apple.com/us/app/sololearn/id1210079064)).
- **Платформы:** iOS, Android, веб. Интерфейс — в т.ч. русский.
- **Отзывы:** 4.8 (≈82 тыс.); жалобы: помощь только в Max, резкий рост сложности, мало объяснений, «плати, чтобы учиться» ([App Store](https://apps.apple.com/us/app/sololearn/id1210079064)).

### 7. Другие приложения по ИИ и промптингу (2025–2026)

- **Coursiv:** ИИ-инструменты для не-инженеров; программы на 14 и 28 дней; чтение, fill-in-the-blank, квизы, игры AI-Spotter (найти сгенерированное изображение) и Prompt Master (оценить промпт как хороший/плохой); ИИ-фидбэк на практику не описан; серии; длинный онбординг-опрос; цены $6.93 первая неделя → $39.99/мес; рецензент называет маркетинг «крайне агрессивным» ([softwaretestinghelp, 09.2026](https://www.softwaretestinghelp.com/?p=425674)).
- **Learn AI Prompt Engineering (CoddyKit):** 53 курса A1–C2, ~199 уроков по 5–10 мин; в каждом — «до/после» и промпт для переписывания; 20 «миссий по отладке» неудачных промптов; 20 Python-проектов (шаблоны, токены, рубрика оценки ответов); AI Mentor отвечает на вопросы; серии; freemium с рекламой ([coddykit](https://www.coddykit.com/apps/learn-ai-prompting)).
- **Anthropic Academy:** 17 бесплатных курсов (Claude 101, AI Fluency, Claude Code in Action, Claude Code 101, Building with the Claude API, MCP, Agent Skills, Subagents, Cowork…), видео + квизы, сертификаты, только английский; для практики Claude Code 101 нужна подписка Claude или API-ключ ([обзор, 04.2026](https://pasqualepillitteri.it/en/news/371/anthropic-academy-free-courses-claude)). Это бесплатный «официальный» конкурент по содержанию, но без микро-формата, геймификации и RU/UK.

### 8. Русско- и украиноязычные предложения

- **Яндекс Практикум:** бесплатные «Нейросеть Алиса для начинающих», «Нейросети для учёбы»; платные «Нейросети для работы» (промпты для ChatGPT, Claude, Midjourney, ~2 мес), «ИИ-агенты и автоматизация» (n8n, RAG, 6–8 нед.). Автоматическая проверка промптов не описана ([thecode.media, 10.2026](https://thecode.media/kursy-po-neyrosetyam-yandex-praktikum/)). Формат — курс с наставниками, не микро-приложение.
- **Stepik:** несколько курсов по промптингу на русском (напр. «ПРОМТЫ: Вся БАЗА промпт-инжиниринга») ([stepik.org/279981](https://stepik.org/279981)); содержимое не прочитано (robots запрещает), детали — не найдено.
- **Дія.Освіта (Украина):** бесплатный сериал «ChatGPT: ваш особистий асистент…» — 8 серий, итоговый тест, сертификат, темы: промпты, ролевые промпты, галлюцинации; запуск — февраль 2025 ([КМУ](https://www.kmu.gov.ua/news/yak-robyty-bilshe-za-korotshyi-chas-mintsyfry-zapustylo-bezoplatnyi-praktychnyi-serial-pro-chatgpt-na-diiaosvita)).
- **Мобильного приложения в стиле Duolingo для обучения Claude/ИИ на русском или украинском — не найдено** (поиск в RU/UK-выдаче вернул курсы, вебинары и обёртки-чаты, но не обучающие приложения).

---

## Что удерживает, а что декоративно: доказательства

### Доказанные механики (сильные данные)

| Механика | Доказательство | Источник |
|---|---|---|
| **Активное извлечение (тесты вместо перечитывания)** | Через неделю: 56% у «изучил + проверил себя» против 42% у «перечитал»; 61% у «1 чтение + 3 теста» против 40% у «4 чтения» | [Roediger & Karpicke 2006](https://psychology.ecu.edu/wp-content/pv-uploads/sites/216/2019/03/Roediger-Karpicke-2006.pdf) |
| **Интервальное повторение** | Метаанализ 317 экспериментов: распределённое повторение лучше массированного почти всегда (12 из 271 сравнения без эффекта); оптимальный интервал растёт с нужным сроком запоминания | [Cepeda et al. 2006](https://www.evullab.org/pdf/CepedaPashlerVulWixtedRohrer-PB-2006.pdf) |
| **Адаптивное расписание повторений** | Half-Life Regression: ошибка прогноза на 45% ниже Лейтнера; в A/B-тесте +12% к активности | [Settles & Meeder 2016](https://preview.aclanthology.org/fix_video/P16-1174.pdf) |
| **Серия дней** | Переработка серии: +3.3% удержание D14, +10.5% учеников с активной серией; 7-дневная серия → в 2.4 раза выше шанс вернуться завтра | [Duolingo, Improving the streak](https://blog.duolingo.com/improving-the-streak) |
| **Ставка на серию / амулет выходного дня** | Wager: +14% к удержанию D7; амулет: +4% возвращаются через неделю | [Duolingo, 2017](https://blog.duolingo.com/how-streaks-keep-duolingo-learners-committed-to-their-language-goals/) |
| **Анимация вех серии, заморозка** | Вехи: +1.7% новичков остаются через 7 дней; 2 заморозки: +0.38% DAU; 7-дневная серия → в 3.6 раза выше шанс закончить курс | [Duolingo, 2022](https://blog.duolingo.com/how-duolingo-streak-builds-habit) |
| **Серии вне Duolingo (RCT)** | 60 тыс. школьников в Перу: напоминания о серии +9.4 п.п. к еженедельному входу среди активных; разрыв серии не демотивировал | [Aulagnon et al. 2026](https://www.ipr.northwestern.edu/documents/working-papers/2026/wp-26-05.pdf) |
| **Ценность до регистрации** | Перенос регистрации после урока: около +20% DAU | [Taplytics](https://taplytics.com/blog/duolingo-ab-test-onboarding) |
| **Умные напоминания** | Бандит-алгоритм для пушей: +0.5% DAU, +2% удержание новичков D7 | [Yancey & Settles, KDD 2020](https://research.Duolingo.com/papers/yancey.kdd20.pdf) |
| **ИИ-репетитор со структурой** | RCT в Гарварде (N=194): прирост знаний вдвое выше, чем на активном занятии в аудитории, за меньшее время; ключевое — пошаговая структура задаётся платформой, а не одним промптом; эталонные решения подаются модели | [Kestin et al. 2025](https://pmc.ncbi.nlm.nih.gov/articles/PMC12179260/) |

### Умеренные / неоднозначные

- **Геймификация в целом:** метаанализ — небольшие эффекты: на знания g=0.49, мотивацию g=0.36, поведение g=0.25; в строгих исследованиях значим только эффект на знания. Конкуренция вместе с кооперацией лучше, чем только конкуренция ([Sailer & Homner 2020](https://link.springer.com/article/10.1007/s10648-019-09498-w)).
- **Лиги / лидерборды:** Duolingo тестирует их с 2018 года, но цифр не публикует ([блог Duolingo](https://blog.duolingo.com/duolingo-leagues-leaderboards/)). Есть косвенное: перебалансировка XP в пользу новых уроков дала +1.1–1.8 млн минут обучения в день ([Time Spent Learning Well](https://blog.duolingo.com/time-spent-learning-well)). Вывод: XP надо привязывать к реальному обучению, а не к гринду.
- **Hearts/energy:** Duolingo заявляет рост DAU, медианного времени и конверсии на iOS ([Q2 2025](https://www.sec.gov/Archives/edgar/data/1562088/000156208825000165/q2fy25duolingo6-30x25share.htm)), но это прежде всего инструмент монетизации, и он вызывает самый сильный негатив пользователей (Mimo, Sololearn, Duolingo — см. выше).
- **Короткие уроки:** у Duolingo укорачивание уроков ухудшило метрику TSLW ([Time Spent Learning Well](https://blog.duolingo.com/time-spent-learning-well)). Слишком коротко — тоже плохо; 3–5 мин для Navyk — разумно, короче делать не стоит.

### Декоративное (нет данных об эффекте, или эффект косвенный)

Маскот, аватары, магазин за внутреннюю валюту, бейджи/достижения, сертификаты без внешнего признания (у Brilliant работодатели их не признают — [SkillScouter](https://skillscouter.com/brilliant-review-math-science-coding/)). Делают продукт приятнее, но данных об удержании в найденных источниках нет.

---

## Что это значит для Navyk

### 1. Движок MVP: обязательно vs позже

**Обязательно в MVP**

1. **Урок 3–5 минут = короткое объяснение + 3–6 упражнений с активным извлечением** (вопросы, а не только чтение). Обоснование: эффект тестирования.
2. **ИИ-проверка промпта — ключевое упражнение** (наше главное отличие). Реализация в духе Гарвардского RCT: пошаговую структуру задаёт платформа, у проверяющего — рубрика и эталонный пример для каждого задания, а не «оцени промпт». Ответ проверяющего: оценка по 3–4 критериям, «что хорошо / чего не хватает / как улучшить», затем попытка переписать (цикл «до/после», как у CoddyKit).
3. **Серия дней с мягкой защитой**: зачёт за 1 урок в день (Duolingo: привязка к XP запутывала — [Lenny's](https://lennysnewsletter.com/p/behind-the-product-duolingo-streaks)), 1–2 заморозки, зарабатываемые уроками (как Streak Charges у Brilliant), анимация на вехах 3/7/30 дней.
4. **Интервальное повторение** понятий и «карточек-приёмов» (простое расписание, напр. 1-3-7-14-30 дней, с переносом ошибок на ближайшее повторение); отдельная ежедневная сессия «Повторить».
5. **Первый урок и одна ИИ-проверка промпта — до регистрации.** Аккаунт — после урока, «чтобы сохранить серию».
6. **XP за пройденные уроки и практику** (не за повтор ради очков) — нужен как единица прогресса и для дневной цели.
7. **Напоминания** (веб-пуш/PWA, затем мобильные) с одним понятным сообщением о серии.
8. **Прозрачная подписка**: отмена в 2 клика внутри приложения, напоминание до конца триала (Mimo напоминает на 5-й день). Это прямой ответ на главную жалобу рынка.
9. **Лимит ИИ-проверок вместо hearts/energy**: бесплатно N проверок в день, остальные упражнения без ограничений. Ошибки не наказываем.

**Позже (v1.x и далее)**

- Лиги/лидерборды (лучше с кооперативным элементом — командные цели); квесты дня/месяца.
- Ставка на серию, «возрождение серии» (Duolingo Streak Revival в 2026 году вернул серии 15.4 млн человек — [Q2 2026](https://www.sec.gov/Archives/edgar/data/0001562088/000162828026053299/q2fy26duolingo6-30x26share.htm)).
- ИИ-тьютор в чате («объясни мой ответ»); адаптивная модель повторений (типа HLR) после накопления данных.
- Задания-песочницы для Claude Code (терминал/репозиторий); проекты для портфолио и сертификаты.
- Маскот, магазин, бейджи — по остаточному принципу.

### 2. Типы упражнений для реализации

**MVP (автопроверка без ИИ — дёшево):**
1. Выбор одного ответа (концепция, «что сделает Claude»).
2. Множественный выбор («отметь все, что улучшит промпт»).
3. Найди ошибку в промпте — выбор проблемного фрагмента (аналог «отладки промпта» у CoddyKit).
4. Собери промпт из блоков (роль / контекст / задача / формат / ограничения) — аналог «собери предложение» у Duolingo.
5. Расставь по порядку (шаги работы: plan → правка → проверка; порядок команд Claude Code).
6. Сопоставь пары (функция Claude ↔ сценарий; команда ↔ действие).
7. Заполни пропуск (в промпте, в CLAUDE.md, в команде CLI).
8. Сравни два ответа: «какой промпт дал этот результат / какой промпт лучше и почему».

**MVP (с ИИ-проверкой — платные ресурсы):**
9. **Напиши промпт под задачу** → разбор по рубрике.
10. **Улучши данный слабый промпт** → разбор + сравнение с эталоном.

**Позже:**
11. Напиши CLAUDE.md / описание навыка / системный промпт по требованиям → ИИ-разбор.
12. Многошаговый сценарий (цепочка промптов, работа с файлами).
13. Симуляция терминала Claude Code (выбор команды и предсказание результата).
14. Задание в реальном Claude с самоотчётом и чек-листом (как практика в Anthropic Academy/Kodree на своих репозиториях).

### 3. Конкурентные пробелы (возможности Navyk)

1. **RU/UK-контент о Claude в формате микро-уроков — не найден ни у кого.** Kodree и Anthropic Academy — только английский; Mimo и Sololearn имеют русский интерфейс, но не учат Claude; украинские предложения (Дія.Освіта) — разовые сериалы о ChatGPT. Украинская локализация особенно редка.
2. **ИИ-проверка именно промптов по рубрике** — у Kodree ИИ проверяет код и задания (про промпты не подтверждено), у Coursiv и CoddyKit — выбор из вариантов. Navyk может занять позицию «тренажёр промптинга с разбором от Claude».
3. **Охват от новичка до профи по всем продуктам Claude** (чат → проекты/артефакты → Claude Code/API/MCP) — у Kodree похоже, но платно и на английском; у Anthropic Academy — видео без привычки и практики.
4. **Честная монетизация** — у EWA, Kodree, Coursiv основные жалобы касаются оплаты.
5. **Актуальность** — функции Claude меняются часто; дата проверки в каждом уроке (из CLAUDE.md) может стать видимым преимуществом («проверено: <дата>»).

### 4. Риски

- Kodree (Mate academy — компания с украинскими корнями и аудиторией) может локализоваться на украинский/русский: у неё уже есть курсы Claude и ИИ-проверка. Отслеживать.
- EWA: Learn AI Skills — у создателей большая русскоязычная аудитория EWA; данных о формате мало. Отслеживать.
- Себестоимость ИИ-проверок: даже Duolingo сдерживает ИИ-функции из-за маржи ([Q2 2026](https://www.sec.gov/Archives/edgar/data/0001562088/000162828026053299/q2fy26duolingo6-30x26share.htm)) — подтверждает решение из CLAUDE.md о дешёвой модели, кешировании и лимитах.

---

## Источники

**Kodree / Mate academy**
- https://kodree.com
- https://kodree.com/courses/claude-code
- https://kodree.com/courses/claude-chat
- https://apps.apple.com/app/id6739421200
- https://apps.apple.com/us/app/knowely-80-hands-on-learning/id6739421200
- https://www.trustpilot.com/review/kodree.com
- https://dou.eu/companies/mate-academy

**EWA**
- https://apps.apple.com/us/app/ewa-english-language-learning/id1200778841
- https://apps.apple.com/ru/app/ewa-%D1%83%D1%87%D0%B8%D1%82%D1%8C-%D0%B0%D0%BD%D0%B3%D0%BB%D0%B8%D0%B9%D1%81%D0%BA%D0%B8%D0%B9-%D1%8F%D0%B7%D1%8B%D0%BA/id1200778841
- https://learnenglish.life/reviews/ewa/
- https://ca.trustpilot.com/review/appewa.com
- https://adapty.io/paywall-library/ewa-learn-english-spanish/
- https://lifehacker.ru/ewa/ (2017, устаревшее — только история формата)
- https://www.trustpilot.com/review/ewaskills.com
- https://ewaskills.com

**Duolingo**
- https://blog.duolingo.com/improving-the-streak
- https://blog.duolingo.com/how-streaks-keep-duolingo-learners-committed-to-their-language-goals/ (2017)
- https://blog.duolingo.com/how-duolingo-streak-builds-habit (2022)
- https://blog.duolingo.com/duolingo-leagues-leaderboards/
- https://blog.duolingo.com/time-spent-learning-well
- https://lennysnewsletter.com/p/behind-the-product-duolingo-streaks
- https://www.sec.gov/Archives/edgar/data/1562088/000156208825000165/q2fy25duolingo6-30x25share.htm
- https://www.sec.gov/Archives/edgar/data/0001562088/000162828026053299/q2fy26duolingo6-30x26share.htm
- https://www.androidauthority.com/quitting-duolingo-energy-system-3599842/
- https://artificial-intelligence-wiki.com/industry-ai/ai-in-education/duolingo-max-pricing/
- https://duolingo.fandom.com/wiki/Exercise
- https://goodux.appcues.com/blog/duolingo-user-onboarding
- https://taplytics.com/blog/duolingo-ab-test-onboarding
- https://preview.aclanthology.org/fix_video/P16-1174.pdf
- https://research.Duolingo.com/papers/yancey.kdd20.pdf
- https://www.businessofapps.com/news/duolingos-streak-feature-drives-record-17-million-daus

**Mimo**
- https://apps.apple.com/us/app/mimo-learn-coding-ai-coding/id1133960732
- https://mimo.org/pricing
- https://mimo.org/blog/mimo-vs-codecademy

**Brilliant**
- https://skillscouter.com/brilliant-review-math-science-coding/
- https://brilliant.org/s/sem/ai
- https://brilliant.org/help/features/what-are-leagues-and-leaderboards
- https://brilliant.org/help/features/what-is-a-streak-charge/
- https://www.educationalappstore.com/app/brilliant-solve-learn-grow

**Sololearn**
- https://apps.apple.com/us/app/sololearn/id1210079064
- https://appfollow.io/ios/sololearn-learn-to-code/1210079064?country=us
- https://www.techradar.com/computing/websites-apps/i-learned-how-to-use-ai-generative-prompts-with-this-one-app
- https://www.sololearn.com/en/pro

**Другие ИИ-приложения и RU/UK**
- https://www.softwaretestinghelp.com/?p=425674 (Coursiv)
- https://hackread.com/top-edtech-apps-delivering-ai-skills/
- https://www.coddykit.com/apps/learn-ai-prompting
- https://pasqualepillitteri.it/en/news/371/anthropic-academy-free-courses-claude
- https://www.aibuilderclub.com/blog/best-claude-code-courses-2026
- https://thecode.media/kursy-po-neyrosetyam-yandex-praktikum/
- https://stepik.org/279981
- https://www.kmu.gov.ua/news/yak-robyty-bilshe-za-korotshyi-chas-mintsyfry-zapustylo-bezoplatnyi-praktychnyi-serial-pro-chatgpt-na-diiaosvita
- https://dev.ua/news/shi-ta-diiaosvita-1741856750

**Исследования**
- https://psychology.ecu.edu/wp-content/pv-uploads/sites/216/2019/03/Roediger-Karpicke-2006.pdf
- https://www.evullab.org/pdf/CepedaPashlerVulWixtedRohrer-PB-2006.pdf
- https://link.springer.com/article/10.1007/s10648-019-09498-w
- https://www.ipr.northwestern.edu/documents/working-papers/2026/wp-26-05.pdf
- https://pmc.ncbi.nlm.nih.gov/articles/PMC12179260/
