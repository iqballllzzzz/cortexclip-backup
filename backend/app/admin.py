"""Admin panel + sistem ban + analitik pemakaian.

Semua akses DB pakai service key (bypass RLS) — endpoint di main.py yang
memverifikasi bahwa pemanggil benar-benar admin (profiles.is_admin = true).

Isi:
- log_usage()      : catat tiap request AI (dipakai buat statistik & chart)
- record_login()   : catat login user
- ban_state()      : status ban satu user (dipakai guard semua endpoint)
- overview()       : angka besar + time series buat dashboard admin
- list_users()     : tabel user (plan, sisa limit, umur akun, request, model)
- ban_user()/unban_user()/set_plan()/set_admin()
"""
from __future__ import annotations

import asyncio
import os
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from .premium import sb, FREE_LIMITS, PREMIUM_LIMITS, PLANS

# ---------------------------------------------------------------------------
# Durasi ban yang boleh dipilih admin
# ---------------------------------------------------------------------------
BAN_DURATIONS: dict[str, dict[str, Any]] = {
    "1d":        {"label": "1 Hari",    "days": 1},
    "5d":        {"label": "5 Hari",    "days": 5},
    "1mo":       {"label": "1 Bulan",   "days": 30},
    "permanent": {"label": "Selamanya", "days": None},
}

PERMANENT_TS = "9999-12-31T23:59:59+00:00"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def _parse(ts: Optional[str]) -> Optional[datetime]:
    if not ts:
        return None
    try:
        return datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Logging (dipanggil dari pipeline — tidak boleh bikin request user gagal)
# ---------------------------------------------------------------------------
async def log_usage(
    user_id: str,
    kind: str,
    *,
    model: Optional[str] = None,
    provider: Optional[str] = None,
    status: str = "success",
    latency_ms: Optional[int] = None,
    project_id: Optional[str] = None,
    meta: Optional[dict[str, Any]] = None,
) -> None:
    """Catat 1 request ke usage_log. Error di-swallow (analitik != kritikal)."""
    try:
        await sb("POST", "usage_log", json_body={
            "user_id": user_id,
            "project_id": project_id,
            "kind": kind,
            "model": model,
            "provider": provider,
            "status": status,
            "latency_ms": latency_ms,
            "meta": meta,
        })
    except Exception as exc:  # pragma: no cover
        print(f"[admin] log_usage gagal: {exc}")


def log_usage_bg(user_id: str, kind: str, **kw: Any) -> None:
    """Versi fire-and-forget supaya pipeline nggak nunggu insert."""
    try:
        asyncio.get_running_loop().create_task(log_usage(user_id, kind, **kw))
    except RuntimeError:
        pass


async def record_login(user_id: str, user_agent: str = "", ip: str = "") -> None:
    try:
        await sb("POST", "login_events", json_body={
            "user_id": user_id, "user_agent": user_agent[:300], "ip": ip[:60],
        })
        rows = await sb("GET", f"profiles?user_id=eq.{user_id}&select=login_count")
        n = int((rows or [{}])[0].get("login_count") or 0) + 1
        await sb("PATCH", f"profiles?user_id=eq.{user_id}",
                 json_body={"login_count": n, "last_seen_at": _iso(_now())})
    except Exception as exc:
        print(f"[admin] record_login gagal: {exc}")


async def touch_seen(user_id: str) -> None:
    try:
        await sb("PATCH", f"profiles?user_id=eq.{user_id}",
                 json_body={"last_seen_at": _iso(_now())})
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Ban
# ---------------------------------------------------------------------------
def _humanize_left(until: datetime) -> str:
    if until.year >= 9999:
        return "selamanya"
    delta = until - _now()
    total = int(delta.total_seconds())
    if total <= 0:
        return "sudah berakhir"
    d, rem = divmod(total, 86400)
    h, rem = divmod(rem, 3600)
    m, _ = divmod(rem, 60)
    if d:
        return f"{d} hari {h} jam"
    if h:
        return f"{h} jam {m} menit"
    return f"{m} menit"


async def ban_state(user_id: str) -> Optional[dict[str, Any]]:
    """None kalau user tidak diban. Kalau diban → detail buat frontend.

    Ban yang sudah kedaluwarsa otomatis dibersihkan (banned_until dihapus).
    """
    rows = await sb("GET", f"profiles?user_id=eq.{user_id}"
                           "&select=banned_until,ban_reason,banned_at")
    if not rows:
        return None
    until = _parse(rows[0].get("banned_until"))
    if not until:
        return None
    if until <= _now():
        try:
            await sb("PATCH", f"profiles?user_id=eq.{user_id}",
                     json_body={"banned_until": None, "ban_reason": None, "banned_at": None})
        except Exception:
            pass
        return None
    permanent = until.year >= 9999
    return {
        "banned": True,
        "permanent": permanent,
        "banned_until": None if permanent else until.isoformat(),
        "duration_left": _humanize_left(until),
        "reason": rows[0].get("ban_reason") or "",
        "banned_at": rows[0].get("banned_at"),
        "message": (
            f"Akun anda telah di ban {'selamanya' if permanent else f'selama {_humanize_left(until)}'}, "
            "tolong hubungi customer service kami untuk memohon pengembalian akun "
            "atau buat akun baru."
        ),
    }


async def ban_user(admin_id: str, target_user: str, duration: str,
                   reason: str = "") -> dict[str, Any]:
    if duration not in BAN_DURATIONS:
        raise ValueError(f"Durasi ban tidak dikenal: {duration}")
    spec = BAN_DURATIONS[duration]
    if spec["days"] is None:
        until_iso = PERMANENT_TS
    else:
        until_iso = _iso(_now() + timedelta(days=int(spec["days"])))
    await sb("PATCH", f"profiles?user_id=eq.{target_user}", json_body={
        "banned_until": until_iso,
        "ban_reason": reason[:500] or None,
        "banned_at": _iso(_now()),
        "banned_by": admin_id,
    })
    await _audit(admin_id, target_user, "ban",
                 {"duration": duration, "label": spec["label"], "reason": reason})
    return {"ok": True, "banned_until": until_iso, "label": spec["label"]}


async def unban_user(admin_id: str, target_user: str) -> dict[str, Any]:
    await sb("PATCH", f"profiles?user_id=eq.{target_user}", json_body={
        "banned_until": None, "ban_reason": None, "banned_at": None, "banned_by": None,
    })
    await _audit(admin_id, target_user, "unban", {})
    return {"ok": True}


async def set_plan(admin_id: str, target_user: str, plan_key: str) -> dict[str, Any]:
    """Admin kasih/cabut premium manual. plan_key: 'free' atau kunci PLANS."""
    if plan_key == "free":
        # Menurunkan ke free WAJIB ikut mereset hak bebas-watermark.
        # Sebelumnya hanya plan & premium_until yang dihapus, sementara
        # profiles.watermark_removed tetap true dari masa premium. Akibatnya user
        # yang sudah free tetap dapat unduhan tanpa watermark, DAN tombol
        # "Hapus watermark" hilang dari editor (UI menyembunyikannya kalau
        # watermark_removed true) sehingga tidak ada cara mengembalikannya.
        await sb("PATCH", f"profiles?user_id=eq.{target_user}",
                 json_body={"plan": "free", "premium_until": None,
                            "watermark_removed": False, "ads_watched": 0})
        await _audit(admin_id, target_user, "set_plan", {"plan": "free"})
        return {"ok": True, "plan": "free"}
    if plan_key not in PLANS:
        raise ValueError("Plan tidak dikenal")
    days = int(PLANS[plan_key]["days"])
    until = _iso(_now() + timedelta(days=days))
    await sb("PATCH", f"profiles?user_id=eq.{target_user}",
             json_body={"plan": "premium", "premium_until": until})
    await _audit(admin_id, target_user, "set_plan", {"plan": plan_key, "until": until})
    return {"ok": True, "plan": "premium", "premium_until": until}


async def set_admin(admin_id: str, target_user: str, value: bool) -> dict[str, Any]:
    await sb("PATCH", f"profiles?user_id=eq.{target_user}", json_body={"is_admin": value})
    await _audit(admin_id, target_user, "grant_admin" if value else "revoke_admin", {})
    return {"ok": True, "is_admin": value}


async def _audit(admin_id: str, target: Optional[str], action: str,
                 detail: dict[str, Any]) -> None:
    try:
        await sb("POST", "admin_actions", json_body={
            "admin_id": admin_id, "target_user": target,
            "action": action, "detail": detail,
        })
    except Exception as exc:
        print(f"[admin] audit gagal: {exc}")


async def is_admin(user_id: str) -> bool:
    rows = await sb("GET", f"profiles?user_id=eq.{user_id}&select=is_admin")
    return bool(rows and rows[0].get("is_admin"))


# ---------------------------------------------------------------------------
# Statistik dashboard
# ---------------------------------------------------------------------------
async def _count(path: str) -> int:
    """COUNT via PostgREST head+count."""
    import httpx
    url = f"{os.environ.get('SUPABASE_URL', 'http://localhost:8000')}/rest/v1/{path}"
    key = os.environ.get("SUPABASE_SERVICE_KEY", "")
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(url, headers={
            "apikey": key, "Authorization": f"Bearer {key}",
            "Prefer": "count=exact", "Range": "0-0",
        })
    cr = r.headers.get("content-range", "")
    if "/" in cr:
        tail = cr.split("/")[-1]
        if tail.isdigit():
            return int(tail)
    try:
        return len(r.json())
    except Exception:
        return 0


async def overview() -> dict[str, Any]:
    """Angka besar + seri waktu 14 hari + top model untuk dashboard admin."""
    now = _now()
    d1 = _iso(now - timedelta(days=1))
    d7 = _iso(now - timedelta(days=7))
    d30 = _iso(now - timedelta(days=30))
    today = _iso(now.replace(hour=0, minute=0, second=0, microsecond=0))

    (total_users, users_7d, total_projects, projects_today, total_clips,
     total_requests, req_24h, req_7d, banned_now, logins_7d, renders_total) = await asyncio.gather(
        _count("profiles?select=id"),
        _count(f"profiles?select=id&created_at=gte.{d7}"),
        _count("projects?select=id"),
        _count(f"projects?select=id&created_at=gte.{today}"),
        _count("clips?select=id"),
        _count("usage_log?select=id&status=eq.success"),
        _count(f"usage_log?select=id&status=eq.success&created_at=gte.{d1}"),
        _count(f"usage_log?select=id&status=eq.success&created_at=gte.{d7}"),
        _count(f"profiles?select=id&banned_until=gte.{_iso(now)}"),
        _count(f"login_events?select=id&created_at=gte.{d7}"),
        _count("render_jobs?select=id"),
    )

    premium_active = await _count(f"profiles?select=id&premium_until=gte.{_iso(now)}")

    # --- time series 14 hari (project & request & login) ---
    since = now - timedelta(days=13)
    since_iso = _iso(since.replace(hour=0, minute=0, second=0, microsecond=0))
    proj_rows = await sb("GET", f"projects?select=created_at,status&created_at=gte.{since_iso}"
                                "&order=created_at.asc&limit=5000") or []
    usage_rows = await sb("GET", f"usage_log?select=created_at,model,provider,kind,status,meta"
                                 f"&created_at=gte.{since_iso}&order=created_at.asc&limit=20000") or []
    login_rows = await sb("GET", f"login_events?select=created_at&created_at=gte.{since_iso}"
                                 "&order=created_at.asc&limit=20000") or []

    def bucket(rows: list[dict[str, Any]], only_success: bool = False) -> dict[str, int]:
        out: dict[str, int] = {}
        for r in rows:
            if only_success and r.get("status") not in (None, "success"):
                continue
            dt = _parse(r.get("created_at"))
            if not dt:
                continue
            out[dt.strftime("%Y-%m-%d")] = out.get(dt.strftime("%Y-%m-%d"), 0) + 1
        return out

    b_proj, b_use, b_login = bucket(proj_rows), bucket(usage_rows, True), bucket(login_rows)
    series = []
    for i in range(14):
        day = (since + timedelta(days=i)).strftime("%Y-%m-%d")
        series.append({
            "date": day,
            "label": (since + timedelta(days=i)).strftime("%d/%m"),
            "projects": b_proj.get(day, 0),
            "requests": b_use.get(day, 0),
            "logins": b_login.get(day, 0),
        })

    # --- model paling sering sukses (tanpa masalah) ---
    model_ok: dict[str, int] = {}
    model_err: dict[str, int] = {}
    kind_count: dict[str, int] = {}
    # kegagalan TERBARU per model: dipakai panel admin supaya "gagal" tidak
    # cuma jadi angka — admin bisa melihat pesan errornya langsung.
    err_terakhir: dict[str, dict[str, Any]] = {}
    for r in usage_rows:
        m = (r.get("model") or r.get("provider") or "tak-diketahui")
        if r.get("status") == "error":
            model_err[m] = model_err.get(m, 0) + 1
            meta = r.get("meta") or {}
            err_terakhir[m] = {
                "waktu": r.get("created_at"),
                "kind": r.get("kind"),
                "pesan": str(meta.get("error") or "")[:180],
            }
        else:
            model_ok[m] = model_ok.get(m, 0) + 1
            k = r.get("kind") or "lain"
            kind_count[k] = kind_count.get(k, 0) + 1

    top_models = []
    # Gabungan model yang pernah SUKSES maupun yang hanya GAGAL — model yang
    # 100% gagal dulu tidak pernah muncul di panel admin (hanya model_ok yang
    # diiterasi), padahal itulah yang paling perlu dilihat admin.
    semua_model = set(model_ok) | set(model_err)
    for m in sorted(semua_model, key=lambda k: -(model_ok.get(k, 0) + model_err.get(k, 0)))[:10]:
        ok = model_ok.get(m, 0)
        err = model_err.get(m, 0)
        baris: dict[str, Any] = {
            "model": m, "success": ok, "error": err,
            "reliability": round(ok * 100 / max(1, ok + err), 1),
        }
        if m in err_terakhir:
            baris["last_error"] = err_terakhir[m]
        top_models.append(baris)

    # --- project by status (pie) ---
    status_count: dict[str, int] = {}
    for r in proj_rows:
        s = r.get("status") or "unknown"
        status_count[s] = status_count.get(s, 0) + 1

    return {
        "kpi": {
            "total_users": total_users,
            "new_users_7d": users_7d,
            "premium_active": premium_active,
            "banned_now": banned_now,
            "total_projects": total_projects,
            "projects_today": projects_today,
            "total_clips": total_clips,
            "total_requests": total_requests,
            "requests_24h": req_24h,
            "requests_7d": req_7d,
            "logins_7d": logins_7d,
            "renders_total": renders_total,
        },
        "series": series,
        "top_models": top_models,
        "by_kind": [{"kind": k, "count": v} for k, v in
                    sorted(kind_count.items(), key=lambda kv: -kv[1])],
        "project_status": [{"status": k, "count": v} for k, v in
                           sorted(status_count.items(), key=lambda kv: -kv[1])],
        "generated_at": now.isoformat(),
    }


async def list_users(search: str = "", limit: int = 100, offset: int = 0) -> dict[str, Any]:
    """Tabel user lengkap: plan, sisa limit harian, umur akun, request, model favorit."""
    q = ("admin_user_overview?select=*&order=joined_at.desc"
         f"&limit={int(limit)}&offset={int(offset)}")
    if search:
        safe = search.replace("*", "").replace(",", "")
        q += f"&or=(email.ilike.*{safe}*,display_name.ilike.*{safe}*)"
    rows = await sb("GET", q) or []

    now = _now()
    start_today = _iso(now.replace(hour=0, minute=0, second=0, microsecond=0))
    ids = [r["user_id"] for r in rows]
    used_today: dict[str, int] = {}
    fav_model: dict[str, str] = {}
    if ids:
        in_list = ",".join(ids)
        pr = await sb("GET", f"projects?select=user_id&user_id=in.({in_list})"
                             f"&created_at=gte.{start_today}&limit=5000") or []
        for r in pr:
            used_today[r["user_id"]] = used_today.get(r["user_id"], 0) + 1
        ur = await sb("GET", f"usage_log?select=user_id,model&user_id=in.({in_list})"
                             "&status=eq.success&order=created_at.desc&limit=8000") or []
        tally: dict[str, dict[str, int]] = {}
        for r in ur:
            m = r.get("model") or "-"
            tally.setdefault(r["user_id"], {})
            tally[r["user_id"]][m] = tally[r["user_id"]].get(m, 0) + 1
        for uid, d in tally.items():
            fav_model[uid] = max(d.items(), key=lambda kv: kv[1])[0]

    out = []
    for r in rows:
        uid = r["user_id"]
        prem_until = _parse(r.get("premium_until"))
        is_prem = bool(prem_until and prem_until > now)
        lim = (PREMIUM_LIMITS if is_prem else FREE_LIMITS)["projects_per_day"]
        joined = _parse(r.get("joined_at"))
        last = _parse(r.get("last_active_at"))
        ban_until = _parse(r.get("banned_until"))
        banned = bool(ban_until and ban_until > now)
        out.append({
            "user_id": uid,
            "email": r.get("email"),
            "display_name": r.get("display_name"),
            "plan": "premium" if is_prem else "free",
            "premium_until": r.get("premium_until"),
            "is_admin": bool(r.get("is_admin")),
            "banned": banned,
            "ban_permanent": bool(ban_until and ban_until.year >= 9999),
            "banned_until": r.get("banned_until") if banned else None,
            "ban_left": _humanize_left(ban_until) if banned and ban_until else None,
            "ban_reason": r.get("ban_reason"),
            "joined_at": r.get("joined_at"),
            "account_age_days": (now - joined).days if joined else None,
            "last_active_at": r.get("last_active_at"),
            "inactive_days": (now - last).days if last else None,
            "login_count": r.get("login_count") or 0,
            "total_projects": r.get("total_projects") or 0,
            "total_clips": r.get("total_clips") or 0,
            "total_requests": r.get("total_requests") or 0,
            "requests_30d": r.get("requests_30d") or 0,
            "quota_used_today": used_today.get(uid, 0),
            "quota_limit_today": lim,
            "quota_left_today": max(0, lim - used_today.get(uid, 0)),
            "favorite_model": fav_model.get(uid),
        })
    return {"users": out, "count": len(out), "offset": offset, "limit": limit}


async def user_detail(user_id: str) -> dict[str, Any]:
    """Detail satu user + 50 aktivitas terakhir + rincian model."""
    base = await list_users(search="", limit=1, offset=0)
    rows = await sb("GET", f"admin_user_overview?user_id=eq.{user_id}&select=*")
    if not rows:
        raise ValueError("User tidak ditemukan")
    lst = await list_users(search=str(rows[0].get("email") or ""), limit=1)
    prof = (lst.get("users") or [{}])[0]

    logs = await sb("GET", f"usage_log?user_id=eq.{user_id}&select=kind,model,provider,status,"
                           "latency_ms,created_at&order=created_at.desc&limit=50") or []
    projects = await sb("GET", f"projects?user_id=eq.{user_id}"
                               "&select=id,title,status,created_at,duration_seconds"
                               "&order=created_at.desc&limit=20") or []
    model_tally: dict[str, dict[str, int]] = {}
    allrows = await sb("GET", f"usage_log?user_id=eq.{user_id}&select=model,status&limit=5000") or []
    for r in allrows:
        m = r.get("model") or "-"
        model_tally.setdefault(m, {"success": 0, "error": 0})
        model_tally[m]["success" if r.get("status") != "error" else "error"] += 1
    models = [{"model": m, **v} for m, v in
              sorted(model_tally.items(), key=lambda kv: -kv[1]["success"])]
    return {"profile": prof, "recent_activity": logs, "projects": projects, "models": models}
