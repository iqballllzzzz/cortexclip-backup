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
SUPABASE_URL = os.environ.get("SUPABASE_URL", "http://localhost:8000")

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


def _pick_media_pair(medias: list[dict[str, Any]], title: str, duration: float) -> dict[str, Any]:
    """Pilih format terbaik dari daftar medias (nexray/autolink style):
    1) video mp4 <=1080p + audio m4a tertinggi → merge ffmpeg (KUALITAS TERBAIK)
    2) progressive (video+audio satu file, itag 22=720p / 18=360p) sebagai cadangan
    """
    vids = [m for m in medias if m.get("type") == "video" and m.get("url")
            and str(m.get("ext", "mp4")) == "mp4"]
    auds = [m for m in medias if m.get("type") == "audio" and m.get("url")
            and str(m.get("ext", "")) == "m4a"]

    def _h(m: dict[str, Any]) -> int:
        try:
            return int(m.get("height") or 0)
        except (TypeError, ValueError):
            return 0

    # 1) DASH: video terbaik <=1080p + audio m4a → merge (720p/1080p, bukan 360p!)
    if vids:
        cand = [m for m in vids if 0 < _h(m) <= 1080] or [min(vids, key=_h)]
        v = max(cand, key=_h)
        out: dict[str, Any] = {"title": title, "duration": duration, "url": v["url"],
                               "provider": "x-dash", "needs_merge": False}
        if auds:
            def _kb(m: dict[str, Any]) -> int:
                q = str(m.get("quality", ""))
                try:
                    return int(q.split("(")[1].split("kb")[0])
                except (IndexError, ValueError):
                    return 0
            a = max(auds, key=_kb)
            out["audio_url"] = a["url"]
            out["needs_merge"] = True
        return out

    # 2) progressive cadangan: itag 22 (720p) diutamakan di atas 18 (360p)
    progressive = [m for m in vids if m.get("formatId") in (18, 22)]
    if progressive:
        best = max(progressive, key=_h)
        return {"title": title, "duration": duration, "url": best["url"],
                "provider": "x-progressive", "needs_merge": False}
    raise RuntimeError("tidak ada media video mp4")


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
    medias = d.get("medias") or []
    if not medias:
        raise RuntimeError("autolink: tidak ada media")
    return _pick_media_pair(medias, d.get("title") or "video", float(d.get("duration") or 0))


# --------------------------------------------------------------------------
# Provider 2: RapidAPI ytstream (YouTube)
# --------------------------------------------------------------------------
def _pick_ytstream(data: dict[str, Any]) -> dict[str, Any]:
    title = data.get("title") or "video"
    duration = float(data.get("lengthSeconds") or 0)

    def _h(f: dict[str, Any]) -> int:
        try:
            return int(f.get("height") or 0)
        except (TypeError, ValueError):
            return 0

    # adaptive dulu: video terbaik <=1080p + audio → merge (kualitas terbaik)
    vids = [f for f in (data.get("adaptiveFormats") or [])
            if str(f.get("mimeType", "")).startswith("video/mp4") and f.get("url")]
    auds = [f for f in (data.get("adaptiveFormats") or [])
            if str(f.get("mimeType", "")).startswith("audio/mp4") and f.get("url")]
    if vids and auds:
        v = max([f for f in vids if 0 < _h(f) <= 1080] or vids, key=_h)
        a = max(auds, key=lambda f: int(f.get("bitrate") or 0))
        return {"title": title, "duration": duration, "url": v["url"],
                "audio_url": a["url"], "provider": "rapidapi-ytstream", "needs_merge": True}

    # progressive cadangan (itu 360p) — hanya kalau adaptive tidak tersedia
    progressive = [f for f in (data.get("formats") or [])
                   if str(f.get("mimeType", "")).startswith("video/mp4") and f.get("url")]
    if progressive:
        cand = [f for f in progressive if 0 < _h(f) <= 720] or [min(progressive, key=_h)]
        best = max(cand, key=_h)
        return {"title": title, "duration": duration, "url": best["url"],
                "provider": "rapidapi-ytstream", "needs_merge": False}
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
    return _pick_media_pair(res["medias"], res.get("title") or "video", float(res.get("duration") or 0))


# --------------------------------------------------------------------------
# Provider 4: yt-dlp (fallback terakhir)
# --------------------------------------------------------------------------
def _prov_ytdlp(url: str, out_path: str) -> None:
    import yt_dlp
    opts = {
        # utamakan 1080p, turun bertahap; progressive 360p hanya sebagai jaring
        "format": "bv*[height<=1080]+ba/b[height<=1080]/bv*[height<=720]+ba/b[height<=720]/b",
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
def _content_length(url: str) -> int:
    """Total ukuran file via Range request (Content-Range)."""
    try:
        with httpx.Client(timeout=30, follow_redirects=True) as client:
            r = client.get(url, headers={"User-Agent": UA_BROWSER, "Range": "bytes=0-0"})
            cr = r.headers.get("content-range", "")
            if "/" in cr:
                return int(cr.rsplit("/", 1)[1])
            return int(r.headers.get("content-length") or 0)
    except Exception:
        return 0


def _download_stream(url: str, out_path: str, chunk_mb: int = 8, workers: int = 6) -> None:
    """Paralel range-download (bypass throttle googlevideo yang membatasi
    koneksi full-download ~300KB/s, range 2MB/s) + verifikasi ukuran total."""
    import shutil
    total = _content_length(url)
    if total <= chunk_mb << 20:
        # file kecil: langsung streaming biasa
        tmp = out_path + ".part"
        with httpx.Client(timeout=httpx.Timeout(60.0, read=180.0), follow_redirects=True) as client:
            with client.stream("GET", url, headers={"User-Agent": UA_BROWSER}) as r:
                r.raise_for_status()
                with open(tmp, "wb") as f:
                    for chunk in r.iter_bytes(1 << 20):
                        f.write(chunk)
        os.replace(tmp, out_path)
        return

    step = chunk_mb << 20
    ranges = [(s, min(s + step, total) - 1) for s in range(0, total, step)]
    parts_dir = out_path + ".parts"
    os.makedirs(parts_dir, exist_ok=True)

    async def _grab(client: httpx.AsyncClient, idx: int, s: int, e: int) -> None:
        for attempt in range(3):
            try:
                r = await client.get(url, headers={"User-Agent": UA_BROWSER, "Range": f"bytes={s}-{e}"})
                r.raise_for_status()
                data = r.content
                if len(data) != e - s + 1:
                    raise RuntimeError(f"chunk {idx}: {len(data)} != {e - s + 1}")
                with open(f"{parts_dir}/{idx:05d}", "wb") as f:
                    f.write(data)
                return
            except Exception:
                if attempt == 2:
                    raise
                await asyncio.sleep(1.5 * (attempt + 1))

    async def _run() -> None:
        limits = httpx.Limits(max_connections=workers + 2)
        async with httpx.AsyncClient(timeout=httpx.Timeout(60, read=240),
                                     follow_redirects=True, limits=limits) as client:
            sem = asyncio.Semaphore(workers)

            async def _wrap(i: int, s: int, e: int) -> None:
                async with sem:
                    await _grab(client, i, s, e)

            await asyncio.gather(*[_wrap(i, s, e) for i, (s, e) in enumerate(ranges)])

    asyncio.run(_run())

    with open(out_path, "wb") as out:
        for i in range(len(ranges)):
            p = f"{parts_dir}/{i:05d}"
            with open(p, "rb") as f:
                shutil.copyfileobj(f, out, 1 << 20)
    shutil.rmtree(parts_dir, ignore_errors=True)

    got = os.path.getsize(out_path)
    if got != total:
        raise RuntimeError(f"ukuran beda: {got} vs {total}")


def _ffmpeg_download(url: str, out_path: str, extra: Optional[list[str]] = None) -> None:
    cmd = ["ffmpeg", "-y", "-rw_timeout", "30000000", "-user_agent", UA_BROWSER, "-i", url,
           *(extra or []), "-c", "copy", "-movflags", "+faststart", out_path]
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


def _verify(path: str, expected_duration: float = 0.0) -> bool:
    if not os.path.isfile(path) or os.path.getsize(path) < 500_000:
        return False
    dur = _ffprobe_duration(path)
    if dur <= 5.0:
        return False
    # file kepotong? durasi harus >= 90% durasi yang dijanjikan provider
    if expected_duration > 0 and dur < expected_duration * 0.9:
        print(f"[youtube-hydra] file terpotong: {dur:.0f}s vs ekspektasi {expected_duration:.0f}s")
        return False
    return True


async def hydra_download(url: str, out_path: str) -> dict[str, Any]:
    """Coba 3 provider API → direct download; gagal semua → yt-dlp.
    Return {title, duration, provider}."""
    errors: list[str] = []
    for prov in (_prov_autolink, _prov_ytstream, _prov_nexray):
        name = prov.__name__.replace("_prov_", "")
        try:
            info = await prov(url)
            base = out_path.rsplit(".", 1)[0]
            await asyncio.to_thread(_download_stream, info["url"], out_path)
            if info.get("needs_merge") and info.get("audio_url"):
                audio_tmp = base + "_audio.m4a"
                await asyncio.to_thread(_download_stream, info["audio_url"], audio_tmp)
                merged = base + "_merged.mp4"
                def _merge():
                    subprocess.run(
                        ["ffmpeg", "-y", "-i", out_path, "-i", audio_tmp,
                         "-c", "copy", "-movflags", "+faststart", merged],
                        check=True, capture_output=True, timeout=1800)
                    os.replace(merged, out_path)
                    os.unlink(audio_tmp)
                await asyncio.to_thread(_merge)
            if await asyncio.to_thread(_verify, out_path, info.get("duration") or 0.0):
                return {"title": info["title"], "duration": info.get("duration") or 0.0,
                        "provider": info["provider"]}
            errors.append(f"{name}: file tidak valid/terpotong")
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


async def run_media_pipeline(project_id: str, user_id: str, src_path: str, target_count: int) -> None:
    """Inti pipeline: audio -> transcribe (chunked) -> detect clips -> simpan DB.
    File sumber TIDAK dihapus di sini (pemanggil yang bertanggung jawab)."""
    from .transcribe import transcribe_wav_chunk, transcript_with_words
    from .clip_selection import detect_clips
    from . import jobs as jobs_mod

    wav_path = os.path.join(UPLOAD_DIR, f"wav_{project_id}.wav")
    try:
        await jobs_mod.update_project(project_id, status="transcribing")
        await asyncio.to_thread(_extract_audio_wav, src_path, wav_path)
        parts = await asyncio.to_thread(_wav_chunk_paths, wav_path)

        segments: list[dict[str, Any]] = []
        # PARALEL: chunk dikirim bersamaan (bukan berurutan) → video 1 jam
        # yang tadinya 8 chunk × ~40s = ~5 menit jadi ~1.5 menit.
        # Dibatasi semaphore supaya tidak kena rate-limit provider STT.
        workers = int(os.environ.get("STT_PARALLEL", "3"))
        sem = asyncio.Semaphore(max(1, workers))
        done_count = [0]
        total_chunks = len(parts)

        async def do_chunk(idx: int, path: str, off: float, dur: float):
            async with sem:
                try:
                    with open(path, "rb") as f:
                        data = f.read()
                    segs = await transcribe_wav_chunk(data, off, dur)
                    return segs or []
                except Exception as exc:
                    print(f"[pipeline] chunk @ {off:.0f}s gagal: {exc}")
                    return []
                finally:
                    try:
                        os.unlink(path)
                    except OSError:
                        pass
                    done_count[0] += 1
                    # progres terlihat di UI meski user keluar halaman
                    try:
                        pct = int(done_count[0] * 100 / max(1, total_chunks))
                        await jobs_mod.update_project(
                            project_id, status="transcribing", progress=pct)
                    except Exception:
                        pass

        offs = []
        _o = 0.0
        for p, cd in parts:
            offs.append((p, _o, cd))
            _o += cd
        results = await asyncio.gather(
            *[do_chunk(i, p, o, d) for i, (p, o, d) in enumerate(offs)]
        )
        for segs in results:
            segments.extend(segs)

        if not segments:
            raise RuntimeError("Transkripsi gagal / video tidak berisi ucapan.")
        segments.sort(key=lambda s: s["start"])
        # catat provider STT yang menang (analitik admin)
        try:
            from .admin import log_usage
            from . import transcribe as _tr
            prov = getattr(_tr, "LAST_STT_PROVIDER", "") or "whisper-chain"
            await log_usage(user_id, "transcribe", model=prov, provider=prov.split("-")[0],
                            project_id=project_id, meta={"segments": len(segments)})
        except Exception as exc:
            print(f"[pipeline] log transcribe gagal: {exc}")
        duration = max(_ffprobe_duration(src_path), max(s["end"] for s in segments))
        transcript = {"language": "id", "duration": round(duration, 2),
                      "segments": transcript_with_words(segments)}
        await jobs_mod.update_project(project_id, transcript=transcript,
                                      duration_seconds=round(duration))

        await jobs_mod.update_project(project_id, status="analyzing")
        # GENRE video → dipakai memilih ikon/b-roll/emoji yang relate +
        # mempertajam judul/deskripsi/hashtag agar sesuai isi & genre.
        genre = ""
        try:
            from .genre import detect_genre
            from .transcribe import transcript_to_text
            g = await detect_genre(transcript_to_text(transcript))
            genre = str(g.get("genre") or "")
            print(f"[pipeline] genre terdeteksi: {genre} (sumber {g.get('source')})")
            await jobs_mod.update_project(project_id, genre=genre)
        except Exception as exc:
            print(f"[pipeline] deteksi genre gagal: {exc}")

        clips = await detect_clips(transcript, target_count, genre=genre)
        if not clips:
            raise RuntimeError("AI tidak menemukan klip yang layak dari video ini.")
        try:
            from .admin import log_usage
            from .hydra import gateway as _gw
            await log_usage(user_id, "clip_detect",
                            model=_gw.last_chat_model or "hydra-chat",
                            provider=(_gw.last_chat_model or "/").split("/")[0],
                            project_id=project_id, meta={"clips": len(clips)})
        except Exception:
            pass
        await jobs_mod.replace_clips(project_id, user_id, clips)
        await jobs_mod.update_project(project_id, status="completed")
    except Exception as exc:
        try:
            from .premium import sb
            await sb("PATCH", f"projects?id=eq.{project_id}",
                     json_body={"status": "failed", "error_message": str(exc)[:500]})
        except Exception:
            pass
        print(f"[pipeline] gagal: {exc}")
    finally:
        try:
            if os.path.exists(wav_path):
                os.unlink(wav_path)
        except OSError:
            pass


async def run_upload_pipeline(project_id: str, user_id: str, storage_path: str, target_count: int) -> None:
    """File hasil upload user (video-uploads bucket) -> pipeline penuh."""
    from . import jobs as jobs_mod
    src_path = os.path.join(UPLOAD_DIR, f"up_{project_id}.mp4")
    try:
        await jobs_mod.update_project(project_id, status="downloading")
        url = f"{SUPABASE_URL}/storage/v1/object/public/video-uploads/{storage_path}"
        tmp = src_path + ".part"
        async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
            async with client.stream("GET", url, headers={"User-Agent": UA_BROWSER}) as r:
                r.raise_for_status()
                with open(tmp, "wb") as f:
                    async for chunk in r.aiter_bytes(1 << 20):
                        f.write(chunk)
        os.replace(tmp, src_path)
        if not _verify(src_path):
            raise RuntimeError("File hasil upload tidak bisa dibaca (korup/format tak didukung).")
        await run_media_pipeline(project_id, user_id, src_path, target_count)
    except Exception as exc:
        try:
            from .premium import sb
            await sb("PATCH", f"projects?id=eq.{project_id}",
                     json_body={"status": "failed", "error_message": str(exc)[:500]})
        except Exception:
            pass
        print(f"[upload] pipeline gagal: {exc}")
    finally:
        for p in (src_path, src_path + ".part"):
            try:
                if os.path.exists(p):
                    os.unlink(p)
            except OSError:
                pass


async def _persist_source_to_storage(project_id: str, user_id: str, src_path: str) -> None:
    """Upload video sumber ke bucket video-uploads + set projects.storage_path.

    Dipakai agar fitur preview klip & render/unduh server-side punya media sumber.
    Video di-kompres dulu ke 720p CRF28 supaya hemat storage (biasanya 3-5x kecil)
    tanpa merusak kualitas hasil klip vertikal 1080x1920.
    """
    from .premium import sb

    if not os.path.exists(src_path):
        return
    small = src_path + ".small.mp4"
    up_path = src_path
    try:
        def _compress() -> bool:
            try:
                # kompres penyimpanan: maks 1080p CRF26 — cukup tajam untuk
                # render final, jauh lebih kecil dari file asli
                subprocess.run(
                    ["ffmpeg", "-y", "-i", src_path,
                     "-vf", "scale=-2:min(1080\\,ih)", "-c:v", "libx264", "-preset", "veryfast",
                     "-crf", "26", "-c:a", "aac", "-b:a", "128k",
                     "-movflags", "+faststart", small],
                    check=True, capture_output=True, timeout=3600)
                return os.path.exists(small) and os.path.getsize(small) > 100_000
            except Exception as exc:
                print(f"[storage] kompres gagal, pakai file asli: {exc}")
                return False

        if await asyncio.to_thread(_compress):
            up_path = small

        storage_path = f"{user_id}/{project_id}/source.mp4"
        url = f"{SUPABASE_URL}/storage/v1/object/video-uploads/{storage_path}"
        service_key = os.environ.get("SUPABASE_SERVICE_KEY", "")
        size_mb = os.path.getsize(up_path) / 1024 / 1024

        async def _read_chunks():
            # httpx AsyncClient butuh async-iterable untuk streaming upload
            def _open():
                return open(up_path, "rb")

            f = await asyncio.to_thread(_open)
            try:
                while True:
                    b = await asyncio.to_thread(f.read, 1 << 20)
                    if not b:
                        break
                    yield b
            finally:
                await asyncio.to_thread(f.close)

        async with httpx.AsyncClient(timeout=1800) as client:
            resp = await client.post(
                url,
                headers={"apikey": service_key,
                         "Authorization": f"Bearer {service_key}",
                         "Content-Type": "video/mp4",
                         "x-upsert": "true"},
                content=_read_chunks(),
            )
        if resp.status_code not in (200, 201):
            print(f"[storage] upload sumber gagal ({resp.status_code}) {resp.text[:200]}")
            return
        await sb("PATCH", f"projects?id=eq.{project_id}",
                 json_body={"storage_path": storage_path})
        print(f"[storage] sumber tersimpan: {storage_path} ({size_mb:.1f} MB)")
    except Exception as exc:
        print(f"[storage] persist sumber gagal: {exc}")
    finally:
        try:
            if os.path.exists(small):
                os.unlink(small)
        except OSError:
            pass


async def run_youtube_pipeline(project_id: str, user_id: str, url: str, target_count: int) -> None:
    """Background task: hydra download -> pipeline penuh."""
    from . import jobs as jobs_mod

    src_path = os.path.join(UPLOAD_DIR, f"yt_{project_id}.mp4")
    try:
        await jobs_mod.update_project(project_id, status="downloading")
        info = await hydra_download(url, src_path)
        title = info["title"][:120]
        try:
            from .premium import sb
            await sb("PATCH", f"projects?id=eq.{project_id}", json_body={"title": title})
        except Exception:
            pass
        await run_media_pipeline(project_id, user_id, src_path, target_count)
        # Simpan video sumber ke storage supaya preview & render klip bisa jalan.
        # (Tanpa ini storage_path null → /api/preview-clip 500 "belum punya file media".)
        await _persist_source_to_storage(project_id, user_id, src_path)
    except Exception as exc:
        try:
            from .premium import sb
            await sb("PATCH", f"projects?id=eq.{project_id}",
                     json_body={"status": "failed", "error_message": str(exc)[:500]})
        except Exception:
            pass
        print(f"[youtube] pipeline gagal: {exc}")
    finally:
        try:
            if os.path.exists(src_path):
                os.unlink(src_path)
        except OSError:
            pass
