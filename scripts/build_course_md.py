"""Строит читаемую карту курса docs/course/<level>.md из content/course.json.

Запуск: python3 scripts/build_course_md.py
Не редактируйте docs/course/*.md вручную — источник правды content/course.json.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
course = json.loads((ROOT / "content" / "course.json").read_text(encoding="utf-8"))
types = course["exercise_types"]
out_dir = ROOT / "docs" / "course"
out_dir.mkdir(parents=True, exist_ok=True)

for level in course["levels"]:
    lessons = [l for m in level["modules"] for l in m["lessons"]]
    ai = sum(any(types[e]["ai"] for e in l["exercises"]) for l in lessons)
    lines = [
        f"# Уровень «{level['title']['ru']}»",
        "",
        "_Сгенерировано из `content/course.json`, не редактировать вручную._",
        "",
        f"Цель уровня: {level['goal']}",
        "",
        f"Модулей: {len(level['modules'])}. Уроков: {len(lessons)}. С ИИ-разбором: {ai}. "
        f"С быстро меняющимися фактами (⚠️): {sum(l['volatile'] for l in lessons)}.",
        "",
    ]
    for m in level["modules"]:
        lines += [f"## {m['id'].upper()}. {m['title']['ru']}", "",
                  "| # | Урок | После урока человек сможет… | Упражнения | Практика с разбором |",
                  "|---|---|---|---|---|"]
        for l in m["lessons"]:
            flags = (" ⚠️" if l["volatile"] else "") + (" 🏁" if l.get("checkpoint") else "") + (" 🆓" if l.get("free_preview") else "")
            ex = ", ".join(types[e]["ru"] for e in l["exercises"])
            lines.append(f"| {l['id']} | {l['title']['ru']}{flags} | {l['goal']} | {ex} | {l.get('ai_practice', '—')} |")
        lines.append("")
    lines += ["⚠️ — факты, которые часто меняются (берутся из данных приложения). "
              "🏁 — контрольный урок. 🆓 — доступен до регистрации.", ""]
    (out_dir / f"{level['id']}.md").write_text("\n".join(lines), encoding="utf-8")
    print("written", out_dir / f"{level['id']}.md")
