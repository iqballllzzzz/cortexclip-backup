"""Katalog ikon overlay 500+ — komposisi dari 39 artwork SVG dasar
(colored-icon.tsx) × varian warna & rotasi, di-tag kategori + genre.

Tujuan: variasi besar TANPA menambah aset manual, dan pemilihan ikon
selalu relate dengan genre + kata kunci klip.
"""
from __future__ import annotations

# ikon dasar (nama komponen di icon_svgs.py) → kategori
ICON_CATEGORY: dict[str, list[str]] = {
    "FlameIcon": ["fire", "drama", "sports"],
    "MoneyIcon": ["money", "work"],
    "MoneyBagIcon": ["money", "work"],
    "CoinFlipIcon": ["money", "tech"],
    "TrendUpIcon": ["money", "work", "tech"],
    "ChartUpIcon": ["money", "work", "education"],
    "TrophyIcon": ["success", "celebration", "sports"],
    "CrownIcon": ["success", "celebration", "money"],
    "DiamondIcon": ["success", "money", "abstract"],
    "RocketIcon": ["success", "tech", "abstract"],
    "TargetIcon": ["success", "work", "education"],
    "StarIcon": ["celebration", "abstract", "success"],
    "FireworkIcon": ["celebration", "comedy", "music"],
    "GiftIcon": ["celebration", "comedy", "lifestyle"],
    "BrainIcon": ["tech", "education", "health"],
    "IdeaIcon": ["tech", "education", "work"],
    "ZapIcon": ["tech", "abstract", "sports"],
    "GamepadIcon": ["gaming", "comedy"],
    "CameraIcon": ["lifestyle", "music", "work"],
    "MusicIcon": ["music", "celebration", "lifestyle"],
    "MicIcon": ["music", "people", "education"],
    "LaughIcon": ["comedy", "people", "celebration"],
    "SadIcon": ["drama", "people", "health"],
    "AngryIcon": ["drama", "people", "comedy"],
    "HeartIcon": ["lifestyle", "health", "people"],
    "MuscleIcon": ["fitness", "sports", "health"],
    "GymIcon": ["fitness", "sports", "health"],
    "FoodIcon": ["food", "lifestyle", "health"],
    "PlaneIcon": ["travel", "abstract", "city"],
    "GlobeIcon": ["travel", "tech", "education"],
    "CityIcon": ["city", "work", "travel"],
    "HomeIcon": ["lifestyle", "city", "people"],
    "LeafIcon": ["nature", "health", "lifestyle"],
    "ClockIcon": ["work", "education", "drama"],
    "BellIcon": ["work", "drama", "lifestyle"],
    "WarningIcon": ["drama", "education", "health"],
    "CheckIcon": ["education", "work", "success"],
    "XIcon": ["drama", "education", "comedy"],
    "QuestionIcon": ["education", "comedy", "drama"],
}

# varian warna: (suffix, pemetaan warna asal→baru)
# warna dasar colored-icon.tsx: Y #FFC53D, YD #E8A912, YL #FFE08A, OUT #3D2E00
COLOR_VARIANTS: dict[str, dict[str, str]] = {
    "":        {},                                    # asli (kuning khas brand)
    "-blue":   {"#FFC53D": "#4DA3FF", "#E8A912": "#1E6FD9", "#FFE08A": "#A8D3FF",
                "#3D2E00": "#062A4D"},
    "-green":  {"#FFC53D": "#4ADE80", "#E8A912": "#16A34A", "#FFE08A": "#BBF7D0",
                "#3D2E00": "#052E16"},
    "-pink":   {"#FFC53D": "#FF7AB8", "#E8A912": "#DB2777", "#FFE08A": "#FBCFE8",
                "#3D2E00": "#4A0B29"},
    "-purple": {"#FFC53D": "#A78BFA", "#E8A912": "#7C3AED", "#FFE08A": "#DDD6FE",
                "#3D2E00": "#2E1065"},
    "-red":    {"#FFC53D": "#FF6B6B", "#E8A912": "#DC2626", "#FFE08A": "#FECACA",
                "#3D2E00": "#450A0A"},
    "-teal":   {"#FFC53D": "#2DD4BF", "#E8A912": "#0D9488", "#FFE08A": "#99F6E4",
                "#3D2E00": "#042F2E"},
    "-orange": {"#FFC53D": "#FB923C", "#E8A912": "#EA580C", "#FFE08A": "#FED7AA",
                "#3D2E00": "#431407"},
    "-white":  {"#FFC53D": "#F8FAFC", "#E8A912": "#CBD5E1", "#FFE08A": "#FFFFFF",
                "#3D2E00": "#1E293B"},
    "-gold":   {"#FFC53D": "#FFD700", "#E8A912": "#B8860B", "#FFE08A": "#FFF3B0",
                "#3D2E00": "#3B2F00"},
    "-cyan":   {"#FFC53D": "#22D3EE", "#E8A912": "#0891B2", "#FFE08A": "#A5F3FC",
                "#3D2E00": "#083344"},
    "-lime":   {"#FFC53D": "#A3E635", "#E8A912": "#65A30D", "#FFE08A": "#D9F99D",
                "#3D2E00": "#1A2E05"},
    "-indigo": {"#FFC53D": "#818CF8", "#E8A912": "#4F46E5", "#FFE08A": "#C7D2FE",
                "#3D2E00": "#1E1B4B"},
}


def variant_svg(base_svg: str, variant: str) -> str:
    """Terapkan varian warna ke SVG dasar."""
    mapping = COLOR_VARIANTS.get(variant, {})
    if not mapping:
        return base_svg
    out = base_svg
    # ganti case-insensitive (SVG generator memakai uppercase hex)
    for src, dst in mapping.items():
        out = out.replace(src, dst).replace(src.lower(), dst)
    return out


# varian warna yang MASUK AKAL per kategori (hindari 'uang ungu', 'api biru')
CATEGORY_VARIANTS: dict[str, list[str]] = {
    "money":       ["", "-gold", "-green", "-lime", "-orange"],
    "work":        ["", "-blue", "-indigo", "-white", "-teal"],
    "success":     ["", "-gold", "-orange", "-white", "-purple"],
    "celebration": ["", "-pink", "-purple", "-orange", "-gold", "-cyan"],
    "comedy":      ["", "-pink", "-orange", "-lime", "-cyan", "-purple"],
    "fire":        ["", "-orange", "-red", "-gold"],
    "tech":        ["", "-blue", "-cyan", "-indigo", "-purple", "-teal"],
    "abstract":    ["", "-purple", "-cyan", "-indigo", "-pink", "-teal"],
    "education":   ["", "-blue", "-teal", "-lime", "-white"],
    "fitness":     ["", "-red", "-orange", "-lime", "-teal"],
    "sports":      ["", "-red", "-orange", "-lime", "-blue"],
    "food":        ["", "-orange", "-red", "-lime", "-gold"],
    "health":      ["", "-green", "-teal", "-red", "-white"],
    "nature":      ["", "-green", "-lime", "-teal", "-cyan"],
    "travel":      ["", "-cyan", "-blue", "-teal", "-orange"],
    "city":        ["", "-blue", "-indigo", "-white", "-teal"],
    "people":      ["", "-blue", "-pink", "-orange", "-teal"],
    "lifestyle":   ["", "-pink", "-teal", "-white", "-lime"],
    "music":       ["", "-purple", "-pink", "-indigo", "-cyan"],
    "gaming":      ["", "-purple", "-cyan", "-lime", "-red"],
    "drama":       ["", "-red", "-purple", "-indigo", "-white"],
    "animal":      ["", "-orange", "-lime", "-pink", "-teal"],
}

# ikon paling representatif per kategori (dipakai lebih dulu)
CATEGORY_PRIMARY: dict[str, list[str]] = {
    "money":       ["MoneyIcon", "MoneyBagIcon", "CoinFlipIcon", "TrendUpIcon", "ChartUpIcon"],
    "work":        ["ChartUpIcon", "TargetIcon", "ClockIcon", "IdeaIcon", "CityIcon"],
    "success":     ["TrophyIcon", "CrownIcon", "TargetIcon", "RocketIcon", "DiamondIcon"],
    "celebration": ["FireworkIcon", "GiftIcon", "StarIcon", "TrophyIcon", "CrownIcon"],
    "comedy":      ["LaughIcon", "FireworkIcon", "GiftIcon", "GamepadIcon", "AngryIcon"],
    "fire":        ["FlameIcon", "ZapIcon", "RocketIcon"],
    "tech":        ["BrainIcon", "IdeaIcon", "ZapIcon", "GlobeIcon", "CoinFlipIcon"],
    "abstract":    ["StarIcon", "DiamondIcon", "ZapIcon", "RocketIcon"],
    "education":   ["BrainIcon", "IdeaIcon", "CheckIcon", "QuestionIcon", "ClockIcon"],
    "fitness":     ["MuscleIcon", "GymIcon", "FlameIcon", "TrophyIcon"],
    "sports":      ["TrophyIcon", "MuscleIcon", "GymIcon", "FlameIcon", "TargetIcon"],
    "food":        ["FoodIcon", "HeartIcon", "StarIcon"],
    "health":      ["HeartIcon", "MuscleIcon", "LeafIcon", "FoodIcon"],
    "nature":      ["LeafIcon", "GlobeIcon", "HomeIcon"],
    "travel":      ["PlaneIcon", "GlobeIcon", "CameraIcon", "CityIcon"],
    "city":        ["CityIcon", "HomeIcon", "PlaneIcon"],
    "people":      ["LaughIcon", "MicIcon", "HeartIcon", "HomeIcon"],
    "lifestyle":   ["HeartIcon", "HomeIcon", "CameraIcon", "StarIcon", "FoodIcon"],
    "music":       ["MusicIcon", "MicIcon", "CameraIcon", "StarIcon"],
    "gaming":      ["GamepadIcon", "ZapIcon", "TrophyIcon", "FlameIcon"],
    "drama":       ["SadIcon", "AngryIcon", "WarningIcon", "XIcon", "BellIcon"],
    "animal":      ["LaughIcon", "LeafIcon", "HeartIcon"],
}


def build_catalog() -> list[dict[str, object]]:
    """Semua kombinasi ikon×warna dengan tag kategori (500+ entri)."""
    items: list[dict[str, object]] = []
    for comp, cats in ICON_CATEGORY.items():
        for variant in COLOR_VARIANTS:
            items.append({
                "id": f"{comp}{variant}",
                "component": comp,
                "variant": variant,
                "categories": cats,
            })
    return items


ICON_CATALOG = build_catalog()

# indeks kategori → daftar id ikon
BY_CATEGORY: dict[str, list[str]] = {}
for _it in ICON_CATALOG:
    for _c in _it["categories"]:            # type: ignore[union-attr]
        BY_CATEGORY.setdefault(str(_c), []).append(str(_it["id"]))


def icons_for(categories: list[str]) -> list[str]:
    """Semua id ikon untuk daftar kategori (urut prioritas kategori)."""
    out: list[str] = []
    seen: set[str] = set()
    for c in categories:
        for i in BY_CATEGORY.get(c, []):
            if i not in seen:
                seen.add(i)
                out.append(i)
    return out


def relevant_icons(category: str) -> list[str]:
    """Ikon RELEVAN untuk satu kategori: komponen representatif × warna yang
    cocok. Ini yang dipakai planner supaya ikon nyambung dengan konteks
    (misal kategori 'money' tidak memunculkan ikon gitar ungu)."""
    comps = CATEGORY_PRIMARY.get(category)
    if not comps:
        comps = [str(it["component"]) for it in ICON_CATALOG
                 if category in it["categories"]]      # type: ignore[operator]
        comps = list(dict.fromkeys(comps))
    variants = CATEGORY_VARIANTS.get(category, ["", "-blue", "-teal", "-orange"])
    out = [f"{c}{v}" for c in comps for v in variants]
    return out or ["StarIcon"]


def parse_id(icon_id: str) -> tuple[str, str]:
    """'MoneyIcon-blue' → ('MoneyIcon', '-blue')."""
    if "-" in icon_id:
        comp, _, rest = icon_id.partition("-")
        return comp, f"-{rest}"
    return icon_id, ""


TOTAL = len(ICON_CATALOG)
