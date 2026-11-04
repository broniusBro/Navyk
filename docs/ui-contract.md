# UI-контракт brolingvo · polski

Общий договор между дизайном (CSS) и кодом (JS). Классы — BEM, состояния — `.is-*`.
Существующие классы из Navyk (`web/js/ui/**`) остаются: `.screen`, `.btn`, `.btn--primary`, `.btn--ghost`,
`.ex`, `.ex__question`, `.ex__tag`, `.feedback--ok/--bad`, `.why--ok/--bad/--info`, `.hint`, `.lesson__bar`,
`.sheet`, `.field`, формы входа и т. д. — дизайнер перерисовывает их в новом стиле, не меняя имён.
DOM всегда строится через `h()` из `web/js/ui/dom.js` (без innerHTML).

## Экраны и навигация

| Маршрут | Экран | Корневой класс |
|---|---|---|
| `#/welcome` | Онбординг (первый запуск): приветствие → цель → уровень → минут в день → регистрация/«позже» | `.onboard` |
| `#/` | **Учёба**: шапка (серия, XP, сердечко-цель дня), карточка «продолжить», уровни A1/A2/B1 | `.home` |
| `#/level/<id>` | Дорога уроков уровня | `.path` (из Navyk) |
| `#/lesson/<id>` | Урок (без таббара) | `.lesson` |
| `#/talk` | **Разговор**: свободный чат с ИИ-собеседником + сценарии | `.talk` |
| `#/talk/<scenario>` | Чат сценария | `.chat` |
| `#/words` | **Словарь**: слова пройденных уроков, карточки | `.words` |
| `#/me` | **Профиль / кабинет**: аватар, статистика, цель дня, настройки, аккаунт | `.profile` |
| `#/login`, `#/register`, `#/forgot`, `#/reset/<t>`, `#/confirm/<t>`, `#/check-email` | Аккаунт (из Navyk) | `.auth` |

Нижняя панель вкладок (на всех экранах, кроме урока, чата и авторизации):
`nav.tabbar > a.tabbar__item(.is-active) > span.tabbar__icon + span.tabbar__label` — Учёба, Разговор, Словарь, Профиль.

## Компоненты

- **Озвучка**: `button.audio-btn` (+`.is-playing`), большая `.audio-btn--big`, медленно `.audio-btn--slow` (черепаха).
  Ряд над заданием: `.ex__audio`.
- **Карточки фраз** (блок ```pl в шагах): `ul.phrases > li.phrase > (button.audio-btn, div.phrase__text > span.phrase__pl + span.phrase__ru)`.
- **Собери фразу**: `.tiles > p.tiles__translation, div.tiles__answer (пустой: .is-empty), div.tiles__bank`;
  `button.tile` (+`.is-used` в банке, `.tile--ok`, `.tile--bad` после проверки).
- **Напиши по-польски**: `.type-ans > p.type-ans__prompt, textarea.type-ans__input, div.pl-keys > button.pl-key`
  (ą ć ę ł ń ó ś ź ż). Результат: `.type-ans__result` + `.why`.
- **Скажи вслух**: `.speak > p.speak__phrase, p.speak__translation, p.speak__tip, button.mic-btn(.is-listening), p.speak__heard,
  div.speak__score(.is-good/.is-ok/.is-bad)`. Без микрофона — `button.btn` «Я повторил(а)».
- **ИИ-разбор перевода**: `.ai-review > div.ai-review__head(span.ai-avatar + strong) , p.ai-review__verdict(--ok/--close/--bad),
  p.ai-review__fix (исправленный вариант), ul.ai-review__list > li`. Загрузка: `.ai-review.is-loading` (скелетон/мерцание).
- **Чат / разговор** (упражнение dialog, вкладка «Разговор», помощник):
  `.chat > header.chat__scenario(h3, p, ul.chat__goals > li(.is-done))`,
  `div.chat__log > div.bubble(.bubble--partner|.bubble--you|.bubble--system) > p.bubble__pl, p.bubble__ru(hidden до нажатия), p.bubble__fix`,
  `div.chat__typing` (три точки), `div.chat__chips > button.chip`,
  `form.chat__input > textarea + button.mic-btn + button.chat__send`.
  Итог разговора: `.chat__summary` (звёзды `.stars > span.star.is-on`, цели, советы).
- **Помощник в уроке**: плавающая `button.helper-fab` (правый нижний угол над `.lesson__bar`) → нижняя шторка `.sheet` с `.chat`.
- **ИИ-аватары**: `span.ai-avatar` (+`.ai-avatar--tutor` помощник «Pani Ania», `.ai-avatar--partner` собеседник).
- **Онбординг**: `.onboard > .onboard__progress, .onboard__hero, h1, p, .onboard__options > button.onboard__option(.is-selected)`.
- **Главная**: `.home__header (.chip-stat--streak, .chip-stat--xp, .chip-stat--goal)`, `.continue-card`, `.level-card(.is-locked)`.
- **Разговор**: `.talk__hero` (кнопка «Свободный разговор»), `.scenario-grid > button.scenario-card > span.scenario-card__emoji + strong + span.badge`.
- **Словарь**: `.words__stats`, `.word-list > li.word > (button.audio-btn, span.word__pl, span.word__ru, span.word__lvl)`;
  тренировка карточками: `.flashcard(.is-flipped) > .flashcard__front/.flashcard__back`.
- **Профиль**: `.profile__head > .profile__avatar + .profile__name + .profile__email`, `.stat-grid > .stat > strong + span`,
  `.week-chart > .week-chart__bar(.is-today)`, `.settings-list > .settings-row (+ .switch)`, кнопки «Выйти», «Удалить аккаунт».
- **Праздник**: конфетти `burst()` из `ui/motion.js`; экран завершения урока `.complete` с XP-счётчиком.

## Анимации (уважать `prefers-reduced-motion`)
Переходы между экранами (slide/fade), «пружинка» на нажатие кнопок, появление пузырей чата снизу, печатающие точки,
пульсирующие кольца микрофона, переворот карточки словаря, прогресс-бар урока с «жидкой» заливкой,
вспышка верного ответа, тряска неверного, счётчик XP, огонёк серии.
