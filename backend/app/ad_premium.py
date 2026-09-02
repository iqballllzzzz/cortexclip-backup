"""Premium lewat menonton iklan (AdSense) — kredit iklan & penukaran.

Aturan (dari user):
  day   = 8 iklan    — harus sekali jalan, TIDAK bisa dicicil
  week  = 45 iklan   — harus sekali jalan, TIDAK bisa dicicil
  month = 340 iklan  — BOLEH dicicil (nonton sedikit, lanjut kapan saja)

Kenapa "tidak bisa dicicil" perlu ditegakkan di server: kalau hanya di UI, user
bisa menutup tab lalu kembali dan tetap melanjutkan hitungan. Untuk day/week,
progres direset kalau jeda antar iklan melebihi SESSION_GAP_S — jadi memang
harus satu kali duduk. Untuk month, progres disimpan permanen.

Watermark: user premium TIDAK pernah dapat watermark (dicek di render), jadi
menukar paket apa pun otomatis menghilangkan watermark selama masa aktif.
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

# jumlah iklan per paket
AD_PLANS: dict[str, dict[str, Any]] = {
    "day": {"ads": 8, "days": 1, "label": "1 Hari", "installment": False},
    "week": {"ads": 45, "days": 7, "label": "7 Hari", "installment": False},
    "month": {"ads": 340, "days": 30, "label": "30 Hari", "installment": True},
}

# jeda maksimal antar iklan untuk paket yang tidak boleh dicicil
SESSION_GAP_S = int(os.getenv("AD_SESSION_GAP_S", "900"))   # 15 menit
# jeda minimal antar iklan (anti-spam klik "selesai" berulang)
MIN_AD_GAP_S = float(os.getenv("AD_MIN_GAP_S", "8"))

ADSENSE_CLIENT = os.getenv("ADSENSE_CLIENT", "ca-pub-6841543975898069")


def _parse(ts: Any) -> Optional[datetime]:
    if not ts:
        return None
    try:
        d = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
    except ValueError:
        return None
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def plan_info(key: str) -> dict[str, Any]:
    p = AD_PLANS.get(key)
    if not p:
        raise ValueError(f"Paket iklan tidak dikenal: {key}")
    return p


def summary(profile: dict[str, Any]) -> dict[str, Any]:
    """Ringkasan progres iklan user untuk ditampilkan di UI."""
    target = profile.get("ad_target") or None
    credits = int(profile.get("ad_credits") or 0)
    out: dict[str, Any] = {
        "adsense_client": ADSENSE_CLIENT,
        "plans": [
            {"key": k, "label": v["label"], "ads": v["ads"],
             "days": v["days"], "installment": v["installment"]}
            for k, v in AD_PLANS.items()
        ],
        "target": target,
        "credits": credits,
        "needed": AD_PLANS[target]["ads"] if target in AD_PLANS else 0,
        "session_gap_s": SESSION_GAP_S,
    }
    if target in AD_PLANS:
        out["remaining"] = max(0, AD_PLANS[target]["ads"] - credits)
    return out
