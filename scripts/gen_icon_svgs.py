"""Generator: colored-icon.tsx (React SVG) -> backend/app/icon_svgs.py (SVG XML murni).

Tujuan PARITY: ikon di RESULT harus artwork yang SAMA PERSIS dengan preview.
Preview memakai komponen React <FlameIcon/> dkk; server merasterisasi SVG
identik lewat cairosvg. Satu sumber kebenaran = colored-icon.tsx.
"""
import re
import sys

SRC = "src/components/colored-icon.tsx"
OUT = "backend/app/icon_svgs.py"

src = open(SRC, encoding="utf-8").read()

# --- 1. konstanta warna ---
colors = dict(re.findall(r'^const (\w+) = "(#[0-9A-Fa-f]{6})";', src, re.M))
print("warna:", colors)

# --- 2. body tiap ikon (antara <Base> dan </Base>) ---
bodies: dict[str, str] = {}
for m in re.finditer(
    r"function (\w+Icon)\(\) \{\s*return \(\s*<Base>(.*?)</Base>\s*\);\s*\}",
    src, re.S,
):
    bodies[m.group(1)] = m.group(2)
print("ikon ditemukan:", len(bodies))

ATTR = {
    "strokeWidth": "stroke-width",
    "strokeLinecap": "stroke-linecap",
    "strokeLinejoin": "stroke-linejoin",
    "strokeDasharray": "stroke-dasharray",
    "strokeOpacity": "stroke-opacity",
    "fillOpacity": "fill-opacity",
    "textAnchor": "text-anchor",
    "fontSize": "font-size",
    "fontWeight": "font-weight",
    "fontFamily": "font-family",
    "clipPath": "clip-path",
}

unhandled: set[str] = set()


def jsx_to_svg(body: str) -> str:
    s = body
    # buang komentar JSX {/* ... */}
    s = re.sub(r"\{/\*.*?\*/\}", "", s, flags=re.S)
    # warna: {Y} -> "#FFC53D"  (di dalam atribut: fill={Y})
    for name, hexv in colors.items():
        s = s.replace("{" + name + "}", f'"{hexv}"')
    # atribut camelCase -> kebab-case
    for camel, kebab in ATTR.items():
        s = s.replace(f"{camel}=", f"{kebab}=")
    # deteksi ekspresi JS sisa
    for leftover in re.findall(r"\{[^}]{1,40}\}", s):
        unhandled.add(leftover)
    # rapikan whitespace
    s = re.sub(r"\n\s+", "\n  ", s).strip()
    return s


svgs = {name: jsx_to_svg(b) for name, b in bodies.items()}
if unhandled:
    print("!! ekspresi JS belum ditangani:", unhandled)
    sys.exit(1)

# --- 3. ICON_MAP & CATEGORY_ICON ---
def parse_map(var: str) -> dict[str, str]:
    m = re.search(r"const " + var + r"[^\n]*?=\s*\{(.*?)\n\};", src, re.S)
    if not m:
        raise SystemExit(f"map {var} tidak ketemu")
    body = re.sub(r"//[^\n]*", "", m.group(1))
    out = {}
    for k, v in re.findall(r'"?([\w-]+)"?\s*:\s*(\w+Icon)', body):
        out[k] = v
    return out


icon_map = parse_map("ICON_MAP")
cat_map = parse_map("CATEGORY_ICON")
print("ICON_MAP:", len(icon_map), "CATEGORY_ICON:", len(cat_map))

missing = {v for v in list(icon_map.values()) + list(cat_map.values())} - set(svgs)
if missing:
    raise SystemExit(f"komponen tak punya body: {missing}")

# --- 4. tulis modul python ---
lines = [
    '"""SVG ikon overlay — DIGENERATE dari src/components/colored-icon.tsx.',
    "",
    "JANGAN diedit tangan: jalankan scripts/gen_icon_svgs.py setelah mengubah",
    "colored-icon.tsx supaya artwork RESULT tetap identik dengan PREVIEW.",
    '"""',
    "",
    "ICON_SVG: dict[str, str] = {",
]
for name in sorted(svgs):
    body = svgs[name].replace('"""', '\\"\\"\\"')
    lines.append(f'    "{name}": """{body}""",')
lines.append("}")
lines.append("")
lines.append("ICON_MAP: dict[str, str] = {")
for k in sorted(icon_map):
    lines.append(f'    "{k}": "{icon_map[k]}",')
lines.append("}")
lines.append("")
lines.append("CATEGORY_ICON: dict[str, str] = {")
for k in sorted(cat_map):
    lines.append(f'    "{k}": "{cat_map[k]}",')
lines.append("}")
lines.append("")
lines.append('DEFAULT_ICON = "StarIcon"')
lines.append("")
lines.append("")
lines.append("def resolve_icon(category: str | None, icon: str | None) -> str:")
lines.append('    """Mirror getColoredIcon() di colored-icon.tsx (urutan identik)."""')
lines.append("    if icon and icon in ICON_MAP:")
lines.append("        return ICON_MAP[icon]")
lines.append("    if category and category in CATEGORY_ICON:")
lines.append("        return CATEGORY_ICON[category]")
lines.append("    if category and category in ICON_MAP:")
lines.append("        return ICON_MAP[category]")
lines.append("    return DEFAULT_ICON")
lines.append("")
lines.append("")
lines.append("def svg_document(component: str, size: int = 256) -> str:")
lines.append('    """SVG lengkap siap diraster (viewBox 0 0 64 64 seperti <Base>)."""')
lines.append("    body = ICON_SVG.get(component) or ICON_SVG[DEFAULT_ICON]")
lines.append("    return (")
lines.append("        f'<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\" '")
lines.append("        f'width=\"{size}\" height=\"{size}\">{body}</svg>'")
lines.append("    )")
lines.append("")

open(OUT, "w", encoding="utf-8").write("\n".join(lines))
print("tertulis:", OUT, len(svgs), "ikon")
