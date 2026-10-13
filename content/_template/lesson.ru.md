---
id: b2.1                     # совпадает с content/course.json
lang: ru                     # ru | uk | en; переводы — lesson.uk.md, lesson.en.md
title: Умный новый сотрудник
duration_min: 4
verified_at: 2026-10-13      # дата проверки фактов по официальным источникам
review:                      # только для уроков с write_prompt / improve_prompt
  criteria: [R1, R2, R3, R4] # какие критерии рубрики применять
  task: >
    Улучши запрос «напиши пост про наш магазин» так, чтобы его понял человек без контекста.
  reference_prompt: >
    Напиши пост для Instagram нашего магазина домашней керамики. ...
repeat:                      # интервальное повторение: какие понятия возвращаются
  - concept: P1
    days: [3, 7, 21]
---

<!-- Урок = 1 идея. Шаги идут по экранам. Каждый шаг — короткий текст (до 60 слов) или упражнение. -->

::: step hook
Пример «до»: расплывчатый запрос и средний ответ Claude. Вопрос: «Почему ответ такой общий?»
:::

::: step explain
Объяснение одной идеи на бытовом примере. Ссылка на английское название в интерфейсе, если есть.
:::

::: exercise compare_answers
question: Какой запрос дал этот ответ?
options:
  - text: ...
    correct: true
    why: ...
  - text: ...
    why: ...
:::

::: exercise find_error
prompt: "Напиши пост про наш магазин"
question: Чего здесь не хватает больше всего?
:::

::: exercise improve_prompt
<!-- Использует review.task и review.reference_prompt из шапки. -->
:::

::: step summary
Одна фраза-правило, которую человек унесёт с собой. Например: «Пиши так, будто объясняешь задачу коллеге, который ничего не знает о твоём проекте».
:::

::: sources
- https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
:::
