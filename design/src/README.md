# Исходники стилей

`app.src.css` — исходник `web/css/app.css` с плейсхолдерами для SVG-графики (вычинанки-розетки, аватары ИИ);
`svg.py` генерирует эти SVG и подставляет их вместо плейсхолдеров `__NAME__` как data-URI.

Правки: либо меняй `web/css/app.css` напрямую (не трогая длинные строки `url("data:image/svg+xml…")`),
либо правь `app.src.css`/`svg.py` и пересобирай: `cp design/src/app.src.css web/css/app.css && python3 design/src/svg.py web/css/app.css`.
