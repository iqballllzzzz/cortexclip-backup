"""YouTube pipeline (server-side) dengan HYDRA downloader 3 provider:

1. RapidAPI autolink   (multi-situs: youtube, x/twitter, tiktok, dll)
2. RapidAPI ytstream   (YouTube spesialis — progressive + adaptive formats)
3. nexray aio          (multi-situs, gratis)
4. yt-dlp (fallback terakhir, langsung dari VPS)

Kalau satu provider gagal/error → otomatis pindah ke provider berikutnya.
File langsung di-download dari googlevideo (CDN YouTube) ke VPS lalu
diproses: audio -> transkripsi Groq -> 2-pass clip selection -> simpan DB.
"""

from __future__ import annotations

import os
import re
import time
import asyncio
import subprocess
from typing import Any, Optional

import httpx

UPLOAD_DIR = os.environ.get("UPLOAD_DIR", "/home/muhiqbalsukarno/cortexclip-backup/backend/uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

RAPIDAPI_AUTOLINK_KEY = os.environ.get("RAPIDAPI_AUTOLINK_KEY", "ca5c6d6fa3mshfcd2b0a0feac6b7p140e57jsn72684628152a")
RAPIDAPI_YTSTREAM_KEY = os.environ.get("RAPIDAPI_YTSTREAM_KEY", "6fabfe3ba0msha10853256d5c5f9p1c1247jsnf1625ea46cb6")

UA_BROWSER = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"

_YT_ID_PATTERNS = [
    r"youtube\.com/watch\?v=([a-zA-Z0-9_-]{11})",
    r"youtube\.com/embed/([a-zA-Z0-9_-]{11})",
    r"youtube\.com/v/([a-zA-Z0-9_-]{11})",
    r"youtube\.com/shorts/([a-zA-Z0-9_-]{11})",
    r"youtu\.be/([a-zA-Z0-9_-]{11})",
]


def yt_video_id(url: str) -> Optional[str]:
    for pat in _YT_ID_PATTERNS:
        m = re.search(pat, url)
        if m:
            return m.group(1)
    return None


# --------------------------------------------------------------------------
# Provider 1: RapidAPI autolink (all-in-one)
# --------------------------------------------------------------------------
async def _prov_autolink(url: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=90) as client:
        r = await client.post(
            "https://auto-download-all-in-one.p.rapidapi.com/v1/social/autolink",
            json={"url": url},
            headers={
                "content-type": "application/json; charset=utf-8",
                "user-agent": UA_BROWSER,
                "x-rapidapi-host": "auto-download-all-in-one.p.rapidapi.com",
                "x-rapidapi-key": RAPIDAPI_AUTOLINK_KEY,
            },
        )
    r.raise_for_status()
    d = r.json()
    medias = [m for m in (d.get("medias") or []) if m.get("type") == "video" and m.get("url")]
    if not medias:
        raise RuntimeError("autolink: tidak ada media video")
    best = max(medias, key=lambda m: (m.get("height") or 0) if (m.get("height") or 0) <= 720 else 0)
    return {
        "title": d.get("title") or "video",
        "duration": float(d.get("duration") or 0),
        "url": best["url"],
        "provider": "rapidapi-autolink",
        "needs_merge": False,
    }


# --------------------------------------------------------------------------
# Provider 2: RapidAPI ytstream (YouTube)
# --------------------------------------------------------------------------
def _pick_ytstream(data: dict[str, Any]) -> dict[str, Any]:
    title = data.get("title") or "video"
    duration = float(data.get("lengthSeconds") or 0)
    # progressive (video+audio dalam satu file) — paling simpel
    progressive = [f for f in (data.get("formats") or [])
                   if str(f.get("mimeType", "")).startswith("video/mp4") and f.get("url")]
    if progressive:
        def _h(f):
            try:
                return int(f.get("height") or 0)
            except (TypeError, ValueError):
                return 0
        cand = [f for f in progressive if _h(f) <= 720] or [min(progressive, key=_h)]
        best = max(cand, key=_h)
        return {"title": title, "duration": duration, "url": best["url"],
                "provider": "rapidapi-ytstream", "needs_merge": False}
    # adaptive: video terpisah + audio → butuh merge ffmpeg
    vids = [f for f in (data.get("adaptiveFormats") or [])
            if str(f.get("mimeType", "")).startswith("video/mp4") and f.get("url")]
    auds = [f for f in (data.get("adaptiveFormats") or [])
            if str(f.get("mimeType", "")).startswith("audio/mp4") and f.get("url")]
    if vids and auds:
        def _h(f):
            try:
                return int(f.get("height") or 0)
            except (TypeError, ValueError):
                return 0
        v = max([f for f in vids if _h(f) <= 720] or vids, key=_h)
        a = max(auds, key=lambda f: int(f.get("bitrate") or 0))
        return {"title": title, "duration": duration, "url": v["url"],
                "audio_url": a["url"], "provider": "rapidapi-ytstream", "needs_merge": True}
    raise RuntimeError("ytstream: format tidak lengkap")


async def _prov_ytstream(url: str) -> dict[str, Any]:
    vid = yt_video_id(url)
    if not vid:
        raise RuntimeError("ytstream: bukan link YouTube")
    async with httpx.AsyncClient(timeout=90) as client:
        r = await client.get(
            "https://ytstream-download-youtube-videos.p.rapidapi.com/dl",
            params={"id": vid},
            headers={
                "x-rapidapi-host": "ytstream-download-youtube-videos.p.rapidapi.com",
                "x-rapidapi-key": RAPIDAPI_YTSTREAM_KEY,
            },
        )
    r.raise_for_status()
    d = r.json()
    if d.get("status") != "OK":
        raise RuntimeError(f"ytstream: status {d.get('status')}")
    return _pick_ytstream(d)


# --------------------------------------------------------------------------
# Provider 3: nexray aio (gratis, multi-situs)
# --------------------------------------------------------------------------
async def _prov_nexray(url: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=90) as client:
        r = await client.get("https://api.nexray.eu.cc/downloader/aio", params={"url": url})
    r.raise_for_status()
    d = r.json()
    if not d.get("status") or not (d.get("result") or {}).get("medias"):
        raise RuntimeError("nexray: status gagal")
    res = d["result"]
    medias = [m for m in res["medias"] if m.get("type") == "video" and m.get("url")]
    if not medias:
        raise RuntimeError("nexray: tidak ada media video")
    best = max(medias, key=lambda m: (m.get("height") or 0) if (m.get("height") or 0) <= 720 else 0)
    return {
        "title": res.get("title") or "video",
        "duration": float(res.get("duration") or 0),
        "url": best["url"],
        "provider": "nexray-aio",
        "needs_merge": False,
    }


# --------------------------------------------------------------------------
# Provider 4: yt-dlp (fallback terakhir)
# --------------------------------------------------------------------------
def _prov_ytdlp(url: str, out_path: str) -> None:
    import yt_dlp
    opts = {
        "format": "bv*[height<=720]+ba/b[height<=720]/b",
        "outtmpl": out_path,
        "merge_output_format": "mp4",
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        ydl.download([url])


# --------------------------------------------------------------------------
# Download + verifikasi
# --------------------------------------------------------------------------
def _ffmpeg_download(url: str, out_path: str, extra: Optional[list[str]] = None) -> None:
    cmd = ["ffmpeg", "-y", "-user_agent", UA_BROWSER, "-i", url, *(extra or []),
           "-c", "copy", "-movflags", "+faststart", out_path]
    subprocess.run(cmd, check=True, capture_output=True, timeout=1800)


def _ffprobe_duration(path: str) -> float:
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", path],
            capture_output=True, text=True, check=True).stdout.strip()
        return float(out or 0)
    except Exception:
        return 0.0


def _verify(path: str) -> bool:
    if not os.path.isfile(path) or os.path.getsize(path) < 500_000:
        return False
    return _ffprobe_duration(path) > 5.0


async def hydra_download(url: str, out_path: str) -> dict[str, Any]:
    """Coba 3 provider API → direct download; gagal semua → yt-dlp.
    Return {title, duration, provider}."""
    meta: dict[str, Any] = {}
    errors: list[str] = []
    for prov in (_prov_autolink, _prov_ytstream, _prov_nexray):
        name = prov.__name__.replace("_prov_", "")
        try:
            info = await prov(url)
            meta = info
            base = out_path.rsplit(".", 1)[0]
            await asyncio.to_thread(_ffmpeg_download, info["url"], out_path)
            if info.get("needs_merge") and info.get("audio_url"):
                audio_tmp = base + "_audio.m4a"
                await asyncio.to_thread(_ffmpeg_download, info["audio_url"], audio_tmp)
                merged = base + "_merged.mp4"
                def _merge():
                    subprocess.run(
                        ["ffmpeg", "-y", "-i", out_path, "-i", audio_tmp,
                         "-c", "copy", "-movflags", "+faststart", merged],
                        check=True, capture_output=True, timeout=1800)
                    os.replace(merged, out_path)
                    os.unlink(audio_tmp)
                await asyncio.to_thread(_merge)
            if await asyncio.to_thread(_verify, out_path):
                return {"title": info["title"], "duration": info.get("duration") or 0.0,
                        "provider": info["provider"]}
            errors.append(f"{name}: file tidak valid")
        except Exception as exc:
            errors.append(f"{name}: {exc}")
            print(f"[youtube-hydra] {name} gagal: {exc}")
            continue
    # fallback terakhir: yt-dlp
    try:
        await asyncio.to_thread(_prov_ytdlp, url, out_path)
        if await asyncio.to_thread(_verify, out_path):
            return {"title": "video", "duration": _ffprobe_duration(out_path), "provider": "yt-dlp"}
        errors.append("yt-dlp: file tidak valid")
    except Exception as exc:
        errors.append(f"yt-dlp: {exc}")
    raise RuntimeError("Semua downloader gagal: " + " | ".join(errors))


# --------------------------------------------------------------------------
# Audio + transkripsi (pipeline server-side penuh)
# --------------------------------------------------------------------------
def _extract_audio_wav(src: str, dst: str) -> str:
    subprocess.run(
        ["ffmpeg", "-y", "-i", src, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", dst],
        check=True, capture_output=True, timeout=900,
    )
    return dst


def _wav_chunk_paths(wav_path: str, chunk_seconds: int = 600) -> list[tuple[str, float]]:
    """Split WAV ke potongan <25MB (Groq limit): 600s @16kHz mono ≈ 19MB."""
    dur = _ffprobe_duration(wav_path)
    out = []
    t = 0.0
    while t < dur:
        end = min(t + chunk_seconds, dur)
        p = f"{wav_path}.p{int(t)}.wav"
        subprocess.run(
            ["ffmpeg", "-y", "-ss", str(t), "-to", str(end), "-i", wav_path, "-c", "copy", p],
            check=True, capture_output=True, timeout=300,
        )
        out.append((p, end - t))
        t = end
    return out


async def run_youtube_pipeline(project_id: str, user_id: str, url: str, target_count: int) -> None:
    """Background task: hydra download -> audio -> transcribe -> detect clips -> DB."""
    from .transcribe import transcribe_wav_chunk, transcript_with_words
    from .clip_selection import detect_clips
    from . import jobs as jobs_mod

    src_path = os.path.join(UPLOAD_DIR, f"yt_{project_id}.mp4")
    wav_path = os.path.join(UPLOAD_DIR, f"yt_{project_id}.wav")
    try:
        await jobs_mod.update_project(project_id, status="downloading")
        info = await hydra_download(url, src_path)
        title = info["title"][:120]
        try:
            from .premium import sb
            await sb("PATCH", f"projects?id=eq.{project_id}", json_body={"title": title})
        except Exception:
            pass

        await jobs_mod.update_project(project_id, status="transcribing")
        await asyncio.to_thread(_extract_audio_wav, src_path, wav_path)
        parts = await asyncio.to_thread(_wav_chunk_paths, wav_path)

        segments: list[dict[str, Any]] = []
        offset = 0.0
        for p, chunk_dur in parts:
            try:
                with open(p, "rb") as f:
                    segs = await transcribe_wav_chunk(f.read(), offset, chunk_dur)
                segments.extend(segs or [])
            except Exception as exc:
                print(f"[youtube] chunk @ {offset:.0f}s gagal: {exc}")
            finally:
                try:
                    os.unlink(p)
                except OSError:
                    pass
            offset += chunk_dur

        if not segments:
            raise RuntimeError("Transkripsi gagal / video tidak berisi ucapan.")
        segments.sort(key=lambda s: s["start"])
        duration = max(info.get("duration") or 0.0, _ffprobe_duration(src_path),
                       max(s["end"] for s in segments))
        transcript = {"language": "id", "duration": round(duration, 2),
                      "segments": transcript_with_words(segments)}
        await jobs_mod.update_project(project_id, transcript=transcript,
                                      duration_seconds=round(duration))

        await jobs_mod.update_project(project_id, status="analyzing")
        clips = await detect_clips(transcript, target_count)
        if not clips:
            raise RuntimeError("AI tidak menemukan klip yang layak dari video ini.")
        await jobs_mod.replace_clips(project_id, user_id, clips)
        await jobs_mod.update_project(project_id, status="completed")
    except Exception as exc:
        try:
            from .premium import sb
            await sb("PATCH", f"projects?id=eq.{project_id}",
                     json_body={"status": "failed", "error_message": str(exc)[:500]})
        except Exception:
            pass
        print(f"[youtube] pipeline gagal: {exc}")
    finally:
        for p in (src_path, wav_path):
            try:
                if os.path.exists(p):
                    os.unlink(p)
            except OSError:
                pass
