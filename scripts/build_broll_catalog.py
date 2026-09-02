"""Bangun katalog b-roll 500+ dari Mixkit (kategori resmi, lisensi gratis).

Setiap video di-tag kategori CortexClip + genre supaya overlay relate dengan
isi klip (komedi → footage lucu, bisnis → footage uang, dst).
Output: backend/data/broll-catalog.json
"""
import concurrent.futures
import json
import re
import time
import urllib.request

UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/120 Safari/537.36"}

# slug Mixkit → (kategori CortexClip, genre)
SOURCES: list[tuple[str, str, str]] = [
    # slug, category, genre
    ("comedy", "comedy", "comedy"),
    ("funny", "comedy", "comedy"),
    ("happy", "comedy", "comedy"),
    ("party", "celebration", "comedy"),
    ("dance", "celebration", "comedy"),
    ("money", "money", "business"),
    ("business", "money", "business"),
    ("office", "work", "business"),
    ("finance", "money", "business"),
    ("marketing", "work", "business"),
    ("technology", "tech", "tech"),
    ("computer", "tech", "tech"),
    ("coding", "tech", "tech"),
    ("science", "tech", "education"),
    ("city", "city", "lifestyle"),
    ("street", "city", "lifestyle"),
    ("travel", "travel", "travel"),
    ("beach", "nature", "travel"),
    ("nature", "nature", "lifestyle"),
    ("forest", "nature", "lifestyle"),
    ("mountain", "nature", "travel"),
    ("ocean", "nature", "travel"),
    ("sunset", "nature", "lifestyle"),
    ("food", "food", "food"),
    ("cooking", "food", "food"),
    ("coffee", "food", "lifestyle"),
    ("restaurant", "food", "food"),
    ("sports", "fitness", "sports"),
    ("fitness", "fitness", "sports"),
    ("gym", "fitness", "sports"),
    ("running", "fitness", "sports"),
    ("football", "fitness", "sports"),
    ("people", "people", "lifestyle"),
    ("friends", "people", "lifestyle"),
    ("family", "people", "lifestyle"),
    ("crowd", "people", "lifestyle"),
    ("meeting", "work", "business"),
    ("education", "education", "education"),
    ("school", "education", "education"),
    ("book", "education", "education"),
    ("music", "music", "music"),
    ("concert", "music", "music"),
    ("guitar", "music", "music"),
    ("gaming", "gaming", "gaming"),
    ("esports", "gaming", "gaming"),
    ("car", "vehicle", "lifestyle"),
    ("motorcycle", "vehicle", "lifestyle"),
    ("airplane", "travel", "travel"),
    ("fire", "fire", "drama"),
    ("explosion", "fire", "drama"),
    ("storm", "drama", "drama"),
    ("rain", "drama", "drama"),
    ("night", "drama", "drama"),
    ("abstract", "abstract", "tech"),
    ("light", "abstract", "tech"),
    ("smoke", "abstract", "drama"),
    ("space", "abstract", "tech"),
    ("health", "health", "education"),
    ("medical", "health", "education"),
    ("baby", "people", "lifestyle"),
    ("animal", "animal", "lifestyle"),
    ("dog", "animal", "comedy"),
    ("cat", "animal", "comedy"),
    ("flower", "nature", "lifestyle"),
    ("winter", "nature", "lifestyle"),
    ("construction", "work", "business"),
    ("farm", "nature", "lifestyle"),
    ("shopping", "money", "lifestyle"),
    ("fashion", "lifestyle", "lifestyle"),
]

RX = re.compile(r"assets\.mixkit\.co/videos/(\d+)/\1-(720|360)\.mp4")
CATALOG_PATH = "/home/muhiqbalsukarno/cortexclip-backup/backend/data/broll-catalog.json"


def fetch(slug: str, page: int = 1, retries: int = 3) -> set[tuple[str, str]]:
    url = f"https://mixkit.co/free-stock-video/{slug}/"
    if page > 1:
        url += f"?page={page}"
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=30) as r:
                html = r.read().decode("utf-8", "ignore")
            return {(m.group(1), m.group(2)) for m in RX.finditer(html)}
        except Exception as exc:
            code = getattr(exc, "code", None)
            if code == 429 and attempt < retries - 1:
                wait = 20 * (attempt + 1)
                print(f"  .. {slug} p{page} 429 → tunggu {wait}s", flush=True)
                time.sleep(wait)
                continue
            if code == 404:
                return set()
            print(f"  !! {slug} p{page}: {exc}", flush=True)
            return set()
    return set()


def job(args):
    slug, cat, genre = args
    found: set[tuple[str, str]] = set()
    for page in (1, 2):
        found |= fetch(slug, page)
        time.sleep(1.5)   # sopan: hindari 429
    return slug, cat, genre, found


# resume: muat katalog lama supaya run berikutnya menambah, bukan menimpa
catalog: dict[str, dict] = {}
try:
    with open(CATALOG_PATH) as f:
        for it in json.load(f).get("items", []):
            catalog[it["id"]] = it
    print(f"resume: {len(catalog)} item sudah ada")
except Exception:
    pass

# lewati slug yang sudah menyumbang cukup item
done_tags = {t for it in catalog.values() for t in it.get("tags", [])}
todo = [s for s in SOURCES if s[0] not in done_tags]
print(f"slug perlu diambil: {len(todo)}/{len(SOURCES)}")

with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:
    for slug, cat, genre, found in ex.map(job, todo):
        print(f"  {slug:14s} -> {len(found):3d} klip ({cat}/{genre})", flush=True)
        for vid, res in found:
            if vid in catalog:
                it = catalog[vid]
                if cat not in it["categories"]:
                    it["categories"].append(cat)
                if genre not in it["genres"]:
                    it["genres"].append(genre)
                if slug not in it["tags"]:
                    it["tags"].append(slug)
                continue
            catalog[vid] = {
                "id": vid,
                "url": f"https://assets.mixkit.co/videos/{vid}/{vid}-{res}.mp4",
                "res": res,
                "categories": [cat],
                "genres": [genre],
                "tags": [slug],
            }

items = list(catalog.values())
out = {
    "version": 2,
    "source": "Mixkit (assets.mixkit.co) — Mixkit Stock Video Free License",
    "count": len(items),
    "items": items,
}
with open(CATALOG_PATH, "w") as f:
    json.dump(out, f, indent=1)

from collections import Counter
cats = Counter(c for it in items for c in it["categories"])
gens = Counter(g for it in items for g in it["genres"])
print(f"\nTOTAL b-roll unik: {len(items)}")
print("kategori:", dict(sorted(cats.items())))
print("genre:", dict(sorted(gens.items())))
print("tertulis:", CATALOG_PATH)
