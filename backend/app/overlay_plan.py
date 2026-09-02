"""Overlay planner: pilih ikon/b-roll/emoji yang RELATE dengan isi klip.

Alur:
1. genre klip (dari project) → kandidat kategori & emoji
2. AI memilih momen + kategori + alasan (Hydra) → fallback keyword
3. kategori → ikon dari icon_catalog (507 varian) + b-roll dari
   broll-catalog.json (500+ klip Mixkit ber-tag genre)

Semua pemilihan deterministik per klip (seed dari waktu) supaya preview
dan hasil unduhan memakai aset yang SAMA.
"""
from __future__ import annotations

import json
import random
import re
from pathlib import Path
from typing import Any

from .genre import GENRE_CATEGORIES, GENRE_EMOJI, DEFAULT_GENRE

CATALOG_PATH = Path(__file__).parent.parent / "data" / "broll-catalog.json"

ANIMATIONS = ["slide-left", "slide-right", "slide-up", "slide-down",
              "zoom-in", "pop-bounce", "fade-in", "drop-in"]

# kata kunci → kategori overlay (Indonesia + Inggris), dipakai fallback
WORD_CATEGORY: dict[str, str] = {}


def _add(words: str, cat: str) -> None:
    for w in words.split():
        WORD_CATEGORY[w] = cat


_add("uang duit cuan kaya miskin rugi untung modal gaji utang tabungan bank "
     "juta miliar triliun rupiah harga bayar mahal murah investasi saham "
     "money cash rich profit invest", "money")
_add("bisnis usaha kantor kerja klien karyawan perusahaan startup omzet "
     "jualan marketing meeting proyek target deadline business office", "work")
_add("api bakar panas meledak heboh viral gila parah banget ekstrem fire", "fire")
_add("menang juara sukses berhasil pencapaian trofi terbaik nomor puncak "
     "prestasi win success trophy champion", "success")
_add("teknologi ai robot komputer kode aplikasi software data internet "
     "digital algoritma server tech app", "tech")
_add("lucu ketawa ngakak receh kocak gokil bercanda haha wkwk jokes prank "
     "funny laugh comedy", "comedy")
_add("pesta ulang perayaan selamat hore yeay meriah kejutan party celebrate", "celebration")
_add("kota jakarta jalan gedung macet perkotaan bandung surabaya city street", "city")
_add("alam hutan laut gunung pantai indah tenang santai sejuk nature", "nature")
_add("gym olahraga latihan otot lari sehat bugar fitnes angkat beban "
     "workout fitness sport", "fitness")
_add("makan makanan masak resep restoran lezat enak dapur kuliner pedas "
     "food eat cook", "food")
_add("liburan wisata jalan-jalan petualangan perjalanan terbang pesawat "
     "hotel travel trip", "travel")
_add("orang bicara ngomong obrolan wawancara podcast diskusi tim kerumunan "
     "semua kalian kita teman keluarga people friend", "people")
_add("belajar sekolah kuliah guru dosen ilmu pelajaran kampus ujian materi "
     "riset penelitian buku education study learn", "education")
_add("musik lagu nyanyi band gitar konser album penyanyi nada music song", "music")
_add("game gaming main mabar rank push karakter skin esport gamer", "gaming")
_add("sedih nangis kecewa marah trauma sakit kehilangan menyesal takut "
     "cemas masalah konflik drama sad angry", "drama")
_add("sehat penyakit dokter obat tidur stres mental diet nutrisi tubuh "
     "imun health doctor", "health")
_add("hidup rutinitas kebiasaan rumah gaya fashion belanja hobi lifestyle", "lifestyle")
_add("hewan kucing anjing burung binatang animal cat dog", "animal")


def load_broll_catalog() -> list[dict[str, Any]]:
    try:
        with open(CATALOG_PATH) as f:
            return json.load(f).get("items", [])
    except Exception:
        return []


_BROLL = load_broll_catalog()
BROLL_BY_CATEGORY: dict[str, list[dict[str, Any]]] = {}
BROLL_BY_GENRE: dict[str, list[dict[str, Any]]] = {}
for _it in _BROLL:
    for _c in _it.get("categories", []):
        BROLL_BY_CATEGORY.setdefault(str(_c), []).append(_it)
    for _g in _it.get("genres", []):
        BROLL_BY_GENRE.setdefault(str(_g), []).append(_it)


def norm(word: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (word or "").lower())


def categorize_word(word: str) -> str | None:
    t = norm(word)
    if not t:
        return None
    if t in WORD_CATEGORY:
        return WORD_CATEGORY[t]
    # coba buang akhiran umum Indonesia (-nya, -lah, -ku, -mu)
    for suf in ("nya", "lah", "kah", "ku", "mu"):
        if t.endswith(suf) and len(t) > len(suf) + 2:
            base = t[: -len(suf)]
            if base in WORD_CATEGORY:
                return WORD_CATEGORY[base]
    if len(t) > 3 and t.endswith("s") and t[:-1] in WORD_CATEGORY:
        return WORD_CATEGORY[t[:-1]]
    return None


def pick_icon(category: str, genre: str, seed: int) -> str:
    """Id ikon RELEVAN untuk kategori (komponen representatif × warna cocok)."""
    from .icon_catalog import relevant_icons

    pool = relevant_icons(category)
    if not pool:
        pool = relevant_icons(
            GENRE_CATEGORIES.get(genre, GENRE_CATEGORIES[DEFAULT_GENRE])[0]
        )
    return random.Random(seed).choice(pool) if pool else "StarIcon"


def pick_broll(category: str, genre: str, seed: int) -> str | None:
    """URL b-roll: cocok kategori dulu, lalu genre, lalu apa saja."""
    pool = BROLL_BY_CATEGORY.get(category) or BROLL_BY_GENRE.get(genre) or _BROLL
    if not pool:
        return None
    rnd = random.Random(seed)
    return str(rnd.choice(pool).get("url") or "") or None


def pick_emoji(word: str, category: str, genre: str, seed: int) -> str | None:
    """Emoji: kata spesifik dulu (word_emoji), lalu emoji genre."""
    from .word_emoji import word_emoji

    e = word_emoji(word)
    if e:
        return e
    pool = GENRE_EMOJI.get(genre) or GENRE_EMOJI[DEFAULT_GENRE]
    return random.Random(seed).choice(pool) if pool else None


def fallback_placements(
    words: list[dict[str, Any]],
    genre: str = DEFAULT_GENRE,
    max_overlays: int = 6,
    min_gap: float = 5.0,
) -> list[dict[str, Any]]:
    """Penempatan dari kata kunci — kategori & aset mengikuti genre."""
    out: list[dict[str, Any]] = []
    last = -99.0
    genre_cats = GENRE_CATEGORIES.get(genre, GENRE_CATEGORIES[DEFAULT_GENRE])
    for w in words:
        if len(out) >= max_overlays:
            break
        t = float(w.get("start", 0) or 0)
        if t - last < min_gap:
            continue
        word = str(w.get("word", w.get("text", "")))
        cat = categorize_word(word)
        if not cat:
            continue
        # relevansi genre: kategori di luar daftar genre di-skip kecuali
        # kategori universal (money/success/fire dipakai hampir semua genre)
        if cat not in genre_cats and cat not in ("money", "success", "fire", "people"):
            continue
        seed = int(t * 100) + len(cat)
        rnd = random.Random(seed)
        out.append({
            "time_start": round(t, 2),
            "time_end": round(t + 2.6, 2),
            "word": word,
            "category": cat,
            "genre": genre,
            "icon_id": pick_icon(cat, genre, seed),
            "side": rnd.choice(["right", "left"]),
            "animation": rnd.choice(ANIMATIONS),
            "broll_url": pick_broll(cat, genre, seed),
            "emoji": pick_emoji(word, cat, genre, seed),
            "reason": f"kata '{word}' → kategori {cat} (genre {genre})",
        })
        last = t
    return out


async def ai_placements(
    words: list[dict[str, Any]],
    duration: float,
    genre: str = DEFAULT_GENRE,
    max_overlays: int = 6,
) -> list[dict[str, Any]] | None:
    """AI pilih momen + kategori; aset diambil dari katalog sesuai genre."""
    try:
        from .hydra import gateway
    except Exception:
        return None

    genre_cats = GENRE_CATEGORIES.get(genre, GENRE_CATEGORIES[DEFAULT_GENRE])
    allowed = sorted(set(genre_cats) | {"money", "success", "fire", "people"})
    text = " ".join(
        f"{w.get('word','')}@{float(w.get('start',0) or 0):.1f}" for w in words[:320]
    )
    prompt = (
        f"Video ini bergenre **{genre}**. Pilih momen TERBAIK untuk menyisipkan "
        f"overlay ikon + b-roll supaya penonton makin nempel.\n\n"
        f"Transkrip (kata@detik):\n{text}\n\n"
        f"Durasi klip {duration:.0f}s. Kategori yang BOLEH dipakai: "
        f"{json.dumps(allowed)}.\n"
        f"Animasi: {json.dumps(ANIMATIONS)}.\n\n"
        "Aturan:\n"
        f"- maksimal {max_overlays} overlay, jeda antar overlay minimal 4 detik\n"
        "- pilih saat kata kunci/emosi/angka paling kuat diucapkan\n"
        "- kategori WAJIB relevan dengan yang sedang dibicarakan saat itu\n"
        "- emoji harus cocok konteks kalimat\n\n"
        'Balas HANYA JSON array: [{"time_start": 12.0, "time_end": 15.0, '
        '"category": "money", "side": "right", "animation": "slide-left", '
        '"emoji": "💰", "keyword": "kata pemicu"}]'
    )
    try:
        raw = await gateway.chat(
            [{"role": "system",
              "content": "Kamu editor video vertikal viral. Jawab JSON array valid saja."},
             {"role": "user", "content": prompt}],
            temperature=0.4, max_tokens=1500,
        )
        i, j = raw.find("["), raw.rfind("]")
        if i == -1 or j <= i:
            return None
        items = json.loads(raw[i:j + 1])
    except Exception:
        return None

    out: list[dict[str, Any]] = []
    last = -99.0
    for it in items:
        if len(out) >= max_overlays or not isinstance(it, dict):
            continue
        try:
            ts = float(it.get("time_start", 0))
            te = float(it.get("time_end", ts + 2.6))
        except (TypeError, ValueError):
            continue
        if ts < 0 or ts > duration or ts - last < 4.0:
            continue
        te = max(ts + 1.0, min(te, duration, ts + 5.0))
        cat = str(it.get("category", "")).strip().lower()
        if cat not in allowed:
            cat = genre_cats[0]
        seed = int(ts * 100) + len(cat)
        rnd = random.Random(seed)
        anim = str(it.get("animation", "")).strip()
        emoji = str(it.get("emoji", "")).strip() or None
        kw = str(it.get("keyword", ""))[:40]
        out.append({
            "time_start": round(ts, 2),
            "time_end": round(te, 2),
            "word": kw,
            "category": cat,
            "genre": genre,
            "icon_id": pick_icon(cat, genre, seed),
            "side": str(it.get("side", "")).strip() or rnd.choice(["right", "left"]),
            "animation": anim if anim in ANIMATIONS else rnd.choice(ANIMATIONS),
            "broll_url": pick_broll(cat, genre, seed),
            "emoji": emoji or pick_emoji(kw, cat, genre, seed),
            "reason": f"AI: {cat} @ '{kw}' (genre {genre})",
        })
        last = ts
    return out or None


def _merge_topup(base: list[dict[str, Any]], extra: list[dict[str, Any]],
                 max_overlays: int, min_gap: float = 4.0) -> list[dict[str, Any]]:
    """Tambahkan kandidat `extra` yang tidak bertabrakan waktu dengan `base`."""
    out = list(base)
    for e in extra:
        if len(out) >= max_overlays:
            break
        ts = float(e.get("time_start", 0) or 0)
        if any(abs(ts - float(o.get("time_start", 0) or 0)) < min_gap for o in out):
            continue
        out.append(e)
    out.sort(key=lambda p: float(p.get("time_start", 0) or 0))
    return out


async def plan_overlays(
    words: list[dict[str, Any]],
    duration: float,
    genre: str = DEFAULT_GENRE,
    use_ai: bool = True,
    max_overlays: int = 6,
    min_overlays: int = 3,
) -> list[dict[str, Any]]:
    """AI dulu; fallback keyword. Selalu ber-tag genre & aset dari katalog.

    AI kadang hanya mengembalikan 1-2 momen (atau gagal parse) sehingga klip
    60 detik nyaris tanpa overlay. Karena itu hasil AI DILENGKAPI dari
    kandidat keyword sampai minimal `min_overlays`, dengan jeda >=4s supaya
    tidak bertumpuk.
    """
    ai: list[dict[str, Any]] = []
    if use_ai:
        ai = await ai_placements(words, duration, genre, max_overlays) or []
    kw = fallback_placements(words, genre, max_overlays)
    if not ai:
        return kw
    if len(ai) >= min_overlays:
        return ai
    merged = _merge_topup(ai, kw, max_overlays)
    print(f"[overlay_plan] AI {len(ai)} momen → dilengkapi keyword jadi "
          f"{len(merged)} (genre {genre})")
    return merged


CATALOG_STATS = {
    "broll_total": len(_BROLL),
    "broll_categories": {k: len(v) for k, v in sorted(BROLL_BY_CATEGORY.items())},
    "broll_genres": {k: len(v) for k, v in sorted(BROLL_BY_GENRE.items())},
}
