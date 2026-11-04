---
# Полное описание формата: content/_template/FORMAT.md. Рабочий пример: content/beginner/b2/b2.1.ru.md
id: "b2.1"                     # совпадает с content/course.json
lang: "ru"                     # ru | uk | en
level: "beginner"              # beginner | advanced | pro
module: "b2"
title: "Умный новый сотрудник"
goal: "После урока ты сможешь …"   # одна измеримая цель
duration_min: 4                # 3–5
prerequisites: []
principles: ["P1"]
free_preview: false
volatile: false
data_refs: []                  # ui_paths, models, plans, limits, regions, apps
verified_at: "2026-10-13"
sources:
  - url: "https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices"
    supports: "Какой факт урока подтверждает источник"
repeat:
  - concept: "P1"
    exercises: ["b2.1.e2"]
    schedule:
      - { day: 1, type: single_choice }
      - { day: 3, type: find_error }
      - { day: 7, type: fill_gap }
      - { day: 21, type: write_prompt }
---

<!-- Урок = одна идея. Блок = один экран. Объяснение — до 60 слов. Не меньше 4 упражнений.
     У каждого варианта, фрагмента, блока и пары есть why. У каждого упражнения есть hint. -->

::: step hook
Крючок: ситуация из жизни, запрос «до» и ответ Claude, вопрос к ученику.

```prompt
Сообщение человека
```

```claude
Ответ Claude
```
:::

::: step explain
Одна мысль на бытовом примере. Элементы интерфейса пишутся через {{data.ui_paths.<key>}}.
:::

::: exercise single_choice
id: "b2.1.e1"
type: "single_choice"
question: "..."
options:
  - text: "..."
    correct: true
    why: "..."
  - text: "..."
    correct: false
    why: "..."
hint: "..."
:::

::: exercise find_error
id: "b2.1.e2"
type: "find_error"
question: "Нажми на все слабые места."
prompt: "Напиши пост про наш магазин"
segments:
  - text: "Напиши пост "
    weak: false
    why: "..."
  - text: "про наш магазин"
    weak: true
    why: "..."
hint: "..."
:::

::: exercise improve_prompt
id: "b2.1.e3"
type: "improve_prompt"
question: "..."
weak_prompt: "Напиши пост про наш магазин"
placeholder: "..."
min_chars: 40
hint: "..."
review:
  task: "..."
  criteria: ["R1", "R2", "R3", "R4"]
  reference_prompt: |
    ...
  show_reference: true
  fallback_feedback:
    - "Вопрос для самопроверки"
:::

::: step summary
Одно правило, которое человек унесёт с собой.
:::

::: sources
- [Название](https://...)
:::
