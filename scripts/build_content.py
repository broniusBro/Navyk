"""Сборка и проверка контента Navyk.

Читает content/<level>/<module>/<lesson>.<lang>.md, проверяет правила формата
и пишет JSON для приложения и сервера в content/dist/<lang>/<lesson>.json.

Запуск: python3 scripts/build_content.py        (ошибки → код выхода 1)
Используется в CI: урок с ошибкой не попадёт в приложение.
"""
import json
import re
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content"
DIST = CONTENT / "dist"
LANGS = ("ru",)  # язык объяснений; изучаемый язык — польский
course = json.loads((CONTENT / "course.json").read_text(encoding="utf-8"))
TYPES = course["exercise_types"]
COURSE_LESSONS = {l["id"]: l for lvl in course["levels"] for m in lvl["modules"] for l in m["lessons"]}

UI_DATA = json.loads((CONTENT / "data" / "ui.json").read_text(encoding="utf-8"))
# Values for a module live next to it: content/data/modules/<module>.json, same sections as ui.json.
for extra in sorted((CONTENT / "data" / "modules").glob("*.json")):
    for section, values in json.loads(extra.read_text(encoding="utf-8")).items():
        if section.startswith("_"):
            continue
        clash = set(UI_DATA.get(section, {})) & set(values)
        if clash:
            raise SystemExit(f"{extra.name}: keys already defined elsewhere: {', '.join(sorted(clash))}")
        UI_DATA.setdefault(section, {}).update(values)
DATA_RE = re.compile(r"\{\{\s*data\.([a-z_]+)\.([a-z0-9_]+)\s*\}\}")


def data_value(section: str, key: str, lang: str, markdown: bool, where: str) -> str:
    """Значение {{data.section.key}} для языка урока. В Markdown-блоках название элемента выделяется жирным."""
    v = UI_DATA.get(section, {}).get(key)
    if v is None:
        err(where, f"нет значения для {{{{data.{section}.{key}}}}} в content/data/ui.json")
        return key
    if "label" in v:
        label = f"**{v['label']}**" if markdown else v["label"]
        hint = (v.get("hint") or {}).get(lang, "")
        return f"{label} ({hint})" if hint else label
    if lang not in v:
        err(where, f"нет перевода {lang} для data.{section}.{key}")
        return key
    return v[lang]


def resolve_data(node, lang: str, where: str, markdown: bool = False):
    """Подставляет {{data.*}} во все строки урока (шапка, шаги, упражнения)."""
    if isinstance(node, str):
        return DATA_RE.sub(lambda m: data_value(m.group(1), m.group(2), lang, markdown, where), node)
    if isinstance(node, list):
        return [resolve_data(x, lang, where, markdown) for x in node]
    if isinstance(node, dict):
        md = markdown or node.get("kind") in ("step", "sources")
        return {k: resolve_data(v, lang, where, md and k == "markdown") for k, v in node.items()}
    return node


BLOCK_RE = re.compile(r"^::: *(\w+)(?: +(\w+))?\s*\n(.*?)^:::\s*$", re.S | re.M)
errors: list[str] = []


def err(where: str, msg: str) -> None:
    errors.append(f"{where}: {msg}")


def parse_lesson(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    m = re.match(r"^---\n(.*?)\n---\n(.*)$", text, re.S)
    if not m:
        err(str(path), "нет шапки --- ... ---")
        return {}
    meta = yaml.safe_load(m.group(1))
    blocks = []
    for b in BLOCK_RE.finditer(m.group(2)):
        kind, sub, body = b.group(1), b.group(2), b.group(3)
        if kind == "exercise":
            data = yaml.safe_load(body)
            if not isinstance(data, dict):
                err(str(path), f"упражнение {sub}: YAML не разобран")
                continue
            blocks.append({"kind": "exercise", **data})
        else:
            blocks.append({"kind": kind, "variant": sub, "markdown": body.strip()})
    return {"meta": meta, "blocks": blocks}


def check_exercise(where: str, ex: dict) -> None:
    t = ex.get("type")
    if t not in TYPES:
        err(where, f"неизвестный тип {t}")
        return
    if not ex.get("hint"):
        err(where, "нет hint")
    if t in ("single_choice", "multi_choice", "compare_answers"):
        opts = ex.get("options") or []
        if len(opts) < 2:
            err(where, "меньше 2 вариантов")
        if not any(o.get("correct") for o in opts):
            err(where, "нет верного варианта")
        if t == "single_choice" and sum(bool(o.get("correct")) for o in opts) != 1:
            err(where, "в single_choice должен быть ровно 1 верный")
        for o in opts:
            if not o.get("why"):
                err(where, f"нет why у варианта «{str(o.get('text'))[:30]}»")
    if t == "find_error":
        segs = ex.get("segments") or []
        if "".join(s["text"] for s in segs) != ex.get("prompt"):
            err(where, "фрагменты не склеиваются в prompt")
        if not any(s.get("weak") for s in segs):
            err(where, "нет слабых фрагментов")
        for s in segs:
            if not s.get("why"):
                err(where, f"нет why у фрагмента «{s['text'][:30]}»")
    if t == "match_pairs" and len(ex.get("pairs") or []) < 2:
        err(where, "меньше 2 пар")
    if t == "order_steps" and len(ex.get("items") or []) < 2:
        err(where, "меньше 2 шагов")
    if t == "match_pairs":
        for p in ex.get("pairs") or []:
            if not p.get("why"):
                err(where, f"нет why у пары «{p.get('left')}»")
    if t == "fill_gap":
        gaps = ex.get("gaps") or []
        if str(ex.get("text", "")).count("___") != len(gaps):
            err(where, "число ___ не равно числу gaps")
        for g in gaps:
            if sum(bool(o.get("correct")) for o in g.get("options") or []) != 1:
                err(where, "в каждом пропуске ровно 1 верный вариант")
    if t == "build_sentence":
        if len(ex.get("words") or []) < 2 or not ex.get("translation") or not ex.get("why"):
            err(where, "build_sentence: нужны words (≥2), translation, why")
    if t == "type_answer":
        if not ex.get("accept") or not ex.get("prompt") or not ex.get("why"):
            err(where, "type_answer: нужны prompt, accept, why")
    if t == "speak":
        if not ex.get("phrase") or not ex.get("translation") or not ex.get("why"):
            err(where, "speak: нужны phrase, translation, why")
    if t == "translate":
        r = ex.get("review") or {}
        if not ex.get("source") or not ex.get("accept") or not r.get("task") or not r.get("fallback_feedback"):
            err(where, "translate: нужны source, accept, review.task, review.fallback_feedback")
    if t == "dialog":
        sc = ex.get("scenario") or {}
        for k in ("title", "setting", "partner", "opener", "goals"):
            if not sc.get(k):
                err(where, f"dialog: нет scenario.{k}")
        if len(ex.get("sample") or []) < 2:
            err(where, "dialog: sample — минимум 2 реплики")
        for line in ex.get("sample") or []:
            if line.get("who") not in ("partner", "you") or not line.get("pl") or not line.get("ru"):
                err(where, "dialog: реплика sample должна иметь who (partner|you), pl, ru")


def shape(lesson: dict) -> list:
    """Структура урока без текста — должна совпадать во всех языках."""
    out = []
    for b in lesson["blocks"]:
        if b["kind"] == "exercise":
            item = ["exercise", b.get("id"), b.get("type")]
            if b.get("type") == "find_error":
                item.append([bool(s.get("weak")) for s in b.get("segments", [])])
            if b.get("options"):
                item.append([bool(o.get("correct")) for o in b["options"]])
            out.append(item)
        else:
            out.append([b["kind"], b.get("variant")])
    return out


def main() -> int:
    built = 0
    by_id: dict[str, dict[str, dict]] = {}
    for path in sorted(CONTENT.glob("*/*/*.*.md")):
        if path.parts[-3] == "_template":
            continue
        lesson_id, lang = path.name.rsplit(".", 2)[0], path.name.rsplit(".", 2)[1]
        where = str(path.relative_to(ROOT))
        lesson = parse_lesson(path)
        if not lesson:
            continue
        lesson = resolve_data(lesson, lang, where)
        meta = lesson["meta"]
        if meta.get("id") != lesson_id or meta.get("lang") != lang:
            err(where, "id/lang в шапке не совпадают с именем файла")
        if lesson_id not in COURSE_LESSONS:
            err(where, "урока нет в course.json")
        if not meta.get("verified_at"):
            err(where, "нет verified_at")
        if meta.get("title") != COURSE_LESSONS.get(lesson_id, {}).get("title", {}).get(lang):
            err(where, "title не совпадает с course.json")
        for v in meta.get("vocab") or []:
            if not (isinstance(v, dict) and v.get("pl") and v.get("ru")):
                err(where, "vocab: каждый элемент — {pl, ru}")
        ids = [b.get("id") for b in lesson["blocks"] if b["kind"] == "exercise"]
        for r in meta.get("repeat") or []:
            for eid in r.get("exercises") or []:
                if eid not in ids:
                    err(where, f"repeat ссылается на несуществующее упражнение {eid}")
        exercises = [b for b in lesson["blocks"] if b["kind"] == "exercise"]
        if len(exercises) < 5:
            err(where, f"упражнений {len(exercises)}, нужно не меньше 5")
        if len({e.get("type") for e in exercises}) < 4:
            err(where, "меньше 4 разных типов упражнений")
        seen = set()
        for e in exercises:
            if e.get("id") in seen or not str(e.get("id", "")).startswith(lesson_id + ".e"):
                err(where, f"плохой или повторный id упражнения {e.get('id')}")
            seen.add(e.get("id"))
        for ex in exercises:
            check_exercise(f"{where} [{ex.get('id')}]", ex)
        by_id.setdefault(lesson_id, {})[lang] = lesson

    for lesson_id, langs in by_id.items():
        missing = [l for l in LANGS if l not in langs]
        if missing:
            err(lesson_id, f"нет переводов: {', '.join(missing)}")
        base = shape(langs.get("ru") or next(iter(langs.values())))
        for lang, lesson in langs.items():
            if shape(lesson) != base:
                err(f"{lesson_id}.{lang}", "структура отличается от ru (блоки, id, верные ответы или слабые фрагменты)")

    if errors:
        print("Ошибки контента:")
        for e in errors:
            print("  -", e)
        return 1

    for lesson_id, langs in by_id.items():
        for lang, lesson in langs.items():
            out = DIST / lang / f"{lesson_id}.json"
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(json.dumps(lesson, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
            built += 1
    print(f"OK: {len(by_id)} уроков, {built} файлов в content/dist/")
    # юридические страницы собираются вместе с уроками (Docker и CI вызывают только этот скрипт)
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import build_legal

    return build_legal.main()


if __name__ == "__main__":
    sys.exit(main())
