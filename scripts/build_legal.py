"""Сборка юридических страниц Navyk: content/legal/<doc>.<lang>.md → content/dist/legal/<doc>.<lang>.html.

Данные компании — content/legal/company.json (пустые поля не выводятся), подписи — labels.json.
Проверяет, что у каждого документа есть все языки и одинаковая структура разделов.
Запуск: python3 scripts/build_legal.py (вызывается и из build_content.py).
"""
import html
import json
import re
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
LEGAL = ROOT / "content" / "legal"
OUT = ROOT / "content" / "dist" / "legal"
LANGS = ("ru", "uk", "en", "pl")
DOCS = ("privacy", "cookies", "terms")
PLACEHOLDER = re.compile(r"\{\{\s*([a-z_]+(?:\.[a-z_]+)?)\s*\}\}")


def company_values(c: dict, lang: str) -> dict:
    registry = " · ".join(f"{k.upper()}: {c[k]}" for k in ("krs", "nip") if c.get(k))
    return {
        "company.name": c["name"],
        "company.address": f'{c["street"]}, {c["postcode"]} {c["city"]}, {c["country"][lang]}',
        "company.registry": registry,
        "company.email": c["email"],
        "company.site": c["site"],
        "updated": c["updated"],
        **{f"link.{d}": f"/{d}?lang={lang}" for d in DOCS},
    }


def inline(text: str) -> str:
    """Экранирование, затем **жирный**, `код`, [ссылка](url) (только http(s), mailto и свои пути)."""
    s = html.escape(text, quote=True)
    s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
    s = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", s)

    def link(m: re.Match) -> str:
        label, url = m.group(1), html.unescape(m.group(2))
        if not re.match(r"^(https://|mailto:|/[a-z])", url):
            raise ValueError(f"unsafe link {url}")
        return f'<a href="{html.escape(url, quote=True)}">{label}</a>'

    s = re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", link, s)
    s = re.sub(r"\b([\w.+-]+@[\w-]+(?:\.[\w-]+)+)\b(?![^<]*</a>)", r'<a href="mailto:\1">\1</a>', s)
    return s


def render_body(md: str) -> tuple[str, list[str]]:
    out, para, items, headings = [], [], [], []

    def flush():
        if para:
            out.append("<p>" + "<br>\n".join(inline(l) for l in para) + "</p>")
            para.clear()
        if items:
            out.append("<ul>\n" + "\n".join(f"<li>{inline(i)}</li>" for i in items) + "\n</ul>")
            items.clear()

    for line in md.splitlines():
        line = line.rstrip()
        if not line:
            flush()
        elif line.startswith("## "):
            flush()
            headings.append(line[3:])
            slug = re.match(r"(\d+)", line[3:])
            hid = f' id="s{slug.group(1)}"' if slug else ""
            out.append(f"<h2{hid}>{inline(line[3:])}</h2>")
        elif line.startswith("- "):
            if para:
                flush()
            items.append(line[2:])
        else:
            if items:
                flush()
            para.append(line)
    flush()
    return "\n".join(out), headings


def page(doc: str, lang: str, meta: dict, body: str, labels: dict, c: dict) -> str:
    L = labels[lang]
    alt = "\n".join(f'<link rel="alternate" hreflang="{l}" href="{c["site"]}/{doc}?lang={l}">' for l in LANGS)
    langs = " ".join(
        f'<a href="/{doc}?lang={l}" hreflang="{l}" lang="{l}"{" aria-current=\"page\"" if l == lang else ""}>{l.upper()}</a>' for l in LANGS
    )
    docs = " · ".join(f'<a href="/{d}?lang={lang}"{" aria-current=\"page\"" if d == doc else ""}>{html.escape(L[d])}</a>' for d in DOCS)
    v = company_values(c, lang)
    addr = html.escape(" · ".join(x for x in (v["company.name"], v["company.address"], v["company.registry"]) if x))
    return f"""<!doctype html>
<html lang="{lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>{html.escape(meta["title"])} · Navyk</title>
<meta name="description" content="{html.escape(meta["description"], quote=True)}">
<link rel="canonical" href="{c["site"]}/{doc}?lang={lang}">
{alt}
<link rel="icon" href="/icons/icon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nunito:wght@600;700;800;900&amp;display=swap">
<link rel="stylesheet" href="/css/legal.css">
</head>
<body>
<header class="legal-top">
  <a class="legal-brand" href="/">navyk<span>.</span></a>
  <nav class="legal-langs" aria-label="{html.escape(L["language"])}">{langs}</nav>
</header>
<main class="legal">
  <p><a class="legal-back" href="/">{html.escape(L["back"])}</a></p>
  <h1>{html.escape(meta["title"])}</h1>
{body}
</main>
<footer class="legal-foot">
  <nav aria-label="{html.escape(L["documents"])}">{docs}</nav>
  <p>{addr}</p>
  <p>{html.escape(L["independent"])}</p>
</footer>
</body>
</html>
"""


def main() -> int:
    c = json.loads((LEGAL / "company.json").read_text(encoding="utf-8"))
    labels = json.loads((LEGAL / "labels.json").read_text(encoding="utf-8"))
    errors, built = [], 0
    for doc in DOCS:
        base_shape = None
        for lang in LANGS:
            path = LEGAL / f"{doc}.{lang}.md"
            where = str(path.relative_to(ROOT))
            if not path.exists():
                errors.append(f"{where}: нет файла")
                continue
            text = path.read_text(encoding="utf-8")
            m = re.match(r"^---\n(.*?)\n---\n(.*)$", text, re.S)
            if not m:
                errors.append(f"{where}: нет шапки --- title/description ---")
                continue
            try:
                meta = yaml.safe_load(m.group(1)) or {}
            except yaml.YAMLError as e:
                errors.append(f"{where}: шапка не читается ({e.__class__.__name__}); значения бери в кавычки")
                continue
            if not meta.get("title") or not meta.get("description"):
                errors.append(f"{where}: в шапке нужны title и description")
                continue
            values = company_values(c, lang)
            unknown = {k for k in PLACEHOLDER.findall(m.group(2)) if k not in values}
            if unknown:
                errors.append(f"{where}: неизвестные подстановки {sorted(unknown)}")
                continue
            # строка, состоящая из одной пустой подстановки (например, без KRS/NIP), убирается целиком
            lines = []
            for line in m.group(2).splitlines():
                only = PLACEHOLDER.fullmatch(line.strip())
                if only and not values[only.group(1)]:
                    continue
                lines.append(PLACEHOLDER.sub(lambda x: values[x.group(1)], line))
            try:
                body, headings = render_body("\n".join(lines))
            except ValueError as e:
                errors.append(f"{where}: {e}")
                continue
            shape = [re.match(r"\d*", h).group(0) for h in headings]
            if base_shape is None:
                base_shape = shape
            elif shape != base_shape:
                errors.append(f"{where}: разделы не совпадают с другими языками")
            out = OUT / f"{doc}.{lang}.html"
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(page(doc, lang, meta, body, labels, c), encoding="utf-8")
            built += 1
    if errors:
        print("Ошибки юридических страниц:")
        for e in errors:
            print("  -", e)
        return 1
    print(f"OK: {built} юридических страниц в content/dist/legal/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
