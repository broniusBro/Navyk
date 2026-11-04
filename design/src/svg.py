# Builds data-URI SVG ornaments/avatars and substitutes __NAME__ placeholders in app.css.
# Usage: cp design/src/app.src.css web/css/app.css && python3 design/src/svg.py web/css/app.css
import sys, re, urllib.parse

def petals(n, d, extra=""):
    return "".join(f"<path d='{d}' transform='rotate({i*360/n:.1f})'{extra}/>" for i in range(n))

def dots(n, r, rad, off=0):
    import math
    out = []
    for i in range(n):
        a = math.radians(i * 360 / n + off)
        out.append(f"<circle cx='{math.cos(a)*rad:.2f}' cy='{math.sin(a)*rad:.2f}' r='{r}'/>")
    return "".join(out)

def tile(color, op):
    diamond = "M0-7L7 0 0 7-7 0z"
    corners = "".join(f"<path d='{diamond}' transform='translate({x} {y})'/>" for x in (0, 96) for y in (0, 96))
    return (f"<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96' viewBox='0 0 96 96'>"
            f"<g fill='{color}' fill-opacity='{op}'>{corners}"
            f"<g transform='translate(48 48)'>{petals(8, 'M0-5C5-10 5-17 0-23-5-17-5-10 0-5z')}<circle r='3'/>{dots(8, 1.6, 29, 22.5)}</g></g></svg>")

def rosette(color, op):
    return (f"<svg xmlns='http://www.w3.org/2000/svg' viewBox='-100 -100 200 200'>"
            f"<g fill='{color}' fill-opacity='{op}'>"
            f"{petals(12, 'M0-24C10-38 10-62 0-84-10-62-10-38 0-24z')}"
            f"{petals(12, 'M0-30C4-38 4-46 0-54-4-46-4-38 0-30z', ' transform-origin=\"0 0\"').replace('rotate(', 'rotate(15+')}"
            f"{dots(12, 3.2, 92, 15)}{dots(24, 1.6, 98, 0)}"
            f"{petals(8, 'M0-5C4-9 4-14 0-18-4-14-4-9 0-5z')}<circle r='4'/></g></svg>")

def fix_rot(s):
    # 'rotate(15+30.0)' -> 'rotate(45.0)'
    return re.sub(r"rotate\(15\+([\d.]+)\)", lambda m: f"rotate({15+float(m.group(1)):.1f})", s).replace(' transform-origin="0 0"', '')

TUTOR = """<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'>
<rect width='64' height='64' fill='#FFD58A'/>
<circle cx='52' cy='12' r='14' fill='#FFE4B0'/>
<path d='M12 64c0-11.5 9-19 20-19s20 7.5 20 19z' fill='#FFFFFF'/>
<path d='M26 46.5l6 6.5 6-6.5z' fill='#D21A3A'/>
<path d='M13 34c0-12 8.5-20.5 19-20.5S51 22 51 34v11H13z' fill='#9E1029'/>
<circle cx='32' cy='11.5' r='6.5' fill='#9E1029'/>
<rect x='28.5' y='39.5' width='7' height='7.5' fill='#E9B594'/>
<circle cx='32' cy='31' r='12.5' fill='#F6CFB2'/>
<path d='M19.3 31c0-8.2 5.6-14 12.7-14s12.7 5.8 12.7 14c-5.6-.8-10.4-3.8-12.7-8-2.3 4.2-7.1 7.2-12.7 8z' fill='#D21A3A'/>
<circle cx='27.5' cy='32.5' r='1.7' fill='#1B1722'/><circle cx='36.5' cy='32.5' r='1.7' fill='#1B1722'/>
<path d='M28.6 37c1.9 1.9 4.9 1.9 6.8 0' fill='none' stroke='#1B1722' stroke-width='1.7' stroke-linecap='round'/>
<circle cx='24.8' cy='36' r='2.1' fill='#F08A8A' fill-opacity='.55'/><circle cx='39.2' cy='36' r='2.1' fill='#F08A8A' fill-opacity='.55'/>
<circle cx='19.4' cy='37.5' r='1.9' fill='#F2A93B'/>
</svg>"""

PARTNER = """<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'>
<rect width='64' height='64' fill='#C9D7FF'/>
<circle cx='12' cy='54' r='16' fill='#DCE5FF'/>
<path d='M12 64c0-11.5 9-19 20-19s20 7.5 20 19z' fill='#2B59D6'/>
<path d='M26.5 45.5h11L32 52z' fill='#FFFFFF'/>
<rect x='28.5' y='38.5' width='7' height='8' fill='#D6A684'/>
<circle cx='32' cy='30' r='12.5' fill='#E8BC9A'/>
<path d='M19 28.5V21.5c0-5 4-8.5 9-8.5h8c5 0 9 3.5 9 8.5v7c-2-3-5-4.5-8.5-4.5h-9C24 24 21 25.5 19 28.5z' fill='#3B2F4A'/>
<circle cx='27' cy='31' r='4' fill='#FFFFFF' fill-opacity='.35' stroke='#1B1722' stroke-width='1.5'/>
<circle cx='37' cy='31' r='4' fill='#FFFFFF' fill-opacity='.35' stroke='#1B1722' stroke-width='1.5'/>
<path d='M31 31h2' stroke='#1B1722' stroke-width='1.5'/>
<circle cx='27' cy='31.3' r='1.3' fill='#1B1722'/><circle cx='37' cy='31.3' r='1.3' fill='#1B1722'/>
<path d='M28.8 37c1.9 1.5 4.5 1.5 6.4 0' fill='none' stroke='#1B1722' stroke-width='1.6' stroke-linecap='round'/>
</svg>"""

def uri(svg):
    svg = re.sub(r"\s*\n\s*", "", svg)
    return 'url("data:image/svg+xml,' + svg.replace("#", "%23").replace('"', "'") + '")'

SUBS = {
    "__TILE_LIGHT__": uri(tile("#D21A3A", ".055")),
    "__TILE_DARK__": uri(tile("#FFFFFF", ".035")),
    "__ROSETTE_ON_DARK__": uri(fix_rot(rosette("#FFFFFF", ".10"))),
    "__ROSETTE_ACCENT__": uri(fix_rot(rosette("#D21A3A", ".09"))),
    "__ROSETTE_AMBER__": uri(fix_rot(rosette("#F2A93B", ".22"))),
    "__ROSETTE_MASK__": uri(fix_rot(rosette("#000000", "1"))),
    "__AVATAR_TUTOR__": uri(TUTOR),
    "__AVATAR_PARTNER__": uri(PARTNER),
}

path = sys.argv[1]
css = open(path, encoding="utf8").read()
for k, v in SUBS.items():
    css = css.replace(k, v)
left = re.findall(r"__[A-Z_]+__", css)
if left:
    sys.exit(f"unresolved placeholders: {set(left)}")
open(path, "w", encoding="utf8").write(css)
print("ok", {k: len(v) for k, v in SUBS.items()})
