"""Bagian 2 ad_premium: pencatatan tontonan & penukaran jadi premium."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from .ad_premium import (AD_PLANS, MIN_AD_GAP_S, SESSION_GAP_S, _parse,
                         plan_info)


async def record_watch(user_id: str, plan_key: str, sb) -> dict[str, Any]:
    """Catat satu iklan selesai ditonton untuk paket `plan_key`.

    `sb` = fungsi async(method, path, json_body=None) ke Supabase REST.

    Mengembalikan progres terbaru. Kalau target sudah tercapai, pemanggil yang
    memutuskan untuk menukarnya (redeem) — pemisahan ini membuat penukaran
    selalu eksplisit dan tercatat di ad_redemptions.
    """
    p = plan_info(plan_key)
    rows = await sb("GET", f"profiles?user_id=eq.{user_id}"
                           "&select=ad_credits,ad_target,ad_credits_updated_at")
    prof = (rows or [{}])[0]
    now = datetime.now(timezone.utc)
    last = _parse(prof.get("ad_credits_updated_at"))
    credits = int(prof.get("ad_credits") or 0)
    target = prof.get("ad_target")

    # anti-spam: klik "selesai" terlalu cepat tidak dihitung
    if last is not None and (now - last).total_seconds() < MIN_AD_GAP_S:
        sisa = MIN_AD_GAP_S - (now - last).total_seconds()
        return {"ok": False, "reason": "terlalu cepat",
                "tunggu_detik": round(sisa, 1), "credits": credits,
                "needed": p["ads"], "target": target}

    # ganti paket → progres lama tidak boleh terbawa
    if target != plan_key:
        credits = 0
        target = plan_key
    elif not p["installment"] and last is not None:
        # paket yang TIDAK boleh dicicil: jeda terlalu lama = mulai dari nol
        if (now - last).total_seconds() > SESSION_GAP_S:
            credits = 0

    credits += 1
    await sb("PATCH", f"profiles?user_id=eq.{user_id}",
             json_body={"ad_credits": credits, "ad_target": target,
                        "ad_credits_updated_at": now.isoformat()})
    return {"ok": True, "credits": credits, "needed": p["ads"],
            "target": target, "remaining": max(0, p["ads"] - credits),
            "ready": credits >= p["ads"],
            "installment": p["installment"]}


async def redeem(user_id: str, plan_key: str, sb) -> dict[str, Any]:
    """Tukar kredit iklan menjadi premium. Gagal kalau kredit belum cukup."""
    p = plan_info(plan_key)
    rows = await sb("GET", f"profiles?user_id=eq.{user_id}"
                           "&select=ad_credits,ad_target,premium_until")
    prof = (rows or [{}])[0]
    credits = int(prof.get("ad_credits") or 0)
    if prof.get("ad_target") != plan_key or credits < p["ads"]:
        return {"ok": False, "reason": "kredit iklan belum cukup",
                "credits": credits, "needed": p["ads"]}

    # tambah masa premium dari sisa yang masih aktif (jangan memotong)
    now = datetime.now(timezone.utc)
    base = _parse(prof.get("premium_until"))
    mulai = base if (base and base > now) else now
    until = mulai + timedelta(days=p["days"])

    await sb("PATCH", f"profiles?user_id=eq.{user_id}",
             json_body={"premium_until": until.isoformat(),
                        # premium = tanpa watermark selama masa aktif
                        "watermark_removed": True,
                        "ad_credits": 0, "ad_target": None})
    await sb("POST", "ad_redemptions", json_body=[{
        "user_id": user_id, "plan": plan_key,
        "ads_watched": credits, "granted_until": until.isoformat(),
    }])
    return {"ok": True, "premium_until": until.isoformat(),
            "plan": plan_key, "label": p["label"], "days": p["days"],
            "ads_used": credits}
