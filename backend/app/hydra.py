"""Hydra AI Gateway — multi-provider, multi-key failover.

Verified working endpoints on this VPS (2026-08-29):
  groq        /openai/v1        qwen/qwen3.8-27b (chat+json), whisper-large-v3(-turbo) (audio STT)
  opencode    opencode.ai/zen/v1  *-free models (big-pickle main; ling-3.0-flash-fin-free verified fallback)
  openrouter  /api/v1           :free models (z-ai/glm-5.2:free etc., subject to upstream rate limits)
  tokenrouter api.tokenrouter.com  qwen3.8-max etc. (key has $0 credit -> cooldown; ready when topped up)
  gemini      native generateContent  AQ.* keys (Google AI Studio new format) via x-goog-api-key, 3.6/3.5-flash

Failover behaviour (user requirement "hydra"):
  - 429 / quota  -> endpoint cooldown 60s, try next
  - model gone   -> endpoint marked DEAD forever, auto-move to another model
  - network err  -> backoff, retry next endpoint
  - All providers rotate per call for load spreading.
"""

from __future__ import annotations

import os
import re
import time
import asyncio
import dataclasses
from typing import Any

import httpx


@dataclasses.dataclass
class Endpoint:
    provider: str
    key: str
    model: str
    base_url: str
    kind: str = "chat"           # chat | audio
    cooldown_until: float = 0.0
    dead: bool = False
    failures: int = 0
    last_error: str = ""

    def is_available(self, now: float) -> bool:
        return not self.dead and now >= self.cooldown_until


def _keys_from_env(name: str) -> list[str]:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return []
    return [k.strip() for k in raw.split(",") if k.strip()]


BASE_URLS = {
    # PRIORITAS 1 (kunci pengguna, model kuat): OpenAI-compatible justwoker.
    # Dipakai untuk memilih momen viral — pekerjaan yang paling menentukan
    # kualitas hasil, jadi tidak boleh jatuh ke model free yang ngawur.
    "justwoker": "https://api.justwoker.icu/v1",
    "groq": "https://api.groq.com/openai/v1",
    "opencode": "https://opencode.ai/zen/v1",
    "openrouter": "https://openrouter.ai/api/v1",
    "tokenrouter": "https://api.tokenrouter.com/v1",
    "gemini": "https://generativelanguage.googleapis.com/v1beta/openai",
    "unlimitedai": "https://app.unlimitedai.chat",
    "publicai": "https://publicai.co",
}

KEY_ENV = {
    "justwoker": "JUSTWOKER_API_KEYS",
    "groq": "GROQ_API_KEYS",
    "opencode": "OPENCODE_API_KEYS",
    "openrouter": "OPENROUTER_API_KEYS",
    "tokenrouter": "TOKENROUTER_API_KEYS",
    "gemini": "GEMINI_API_KEYS",
    "unlimitedai": "UNLIMITEDAI_ENABLED",
    "publicai": "PUBLICAI_ENABLED",
}

# Provider yang DIUTAMAKAN untuk pekerjaan penting (pemilihan momen viral).
# Diverifikasi 2026-09-05: HTTP 200, balas JSON rapi.
PRIORITAS_TINGGI = ("justwoker",)

# Order matters within a provider. Free models first.
DEFAULT_MODELS: dict[str, list[str]] = {
    "justwoker": [
        "claude-opus-5",
    ],
    "groq": [
        "qwen/qwen3.8-27b",
        "openai/gpt-oss-20b",
        "openai/gpt-oss-120b",
        "qwen/qwen3.6-27b",
        "groq/compound-mini",
        "whisper-large-v3-turbo",   # audio
        "whisper-large-v3",         # audio
    ],
    "opencode": [
        "big-pickle",
        "ling-3.0-flash-fin-free",
        "deepseek-v4-flash-free",
        "nemotron-3.5-lightning-free",
        "mimo-v2.5-free",
        "hy3-free",
        "laguna-s-2.1-free",
    ],
    "openrouter": [
        "z-ai/glm-5.2:free",
        "minimax/minimax-m3:free",
        "minimax/minimax-m2.7:free",
        "nvidia/nemotron-3-super-120b-a12b:free",
        "nvidia/nemotron-3-ultra-550b-a55b:free",
        "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
        "nvidia/nemotron-3.5-lightning:free",
        "google/gemma-4-31b-it:free",
        "google/gemma-4-26b-a4b-it:free",
        "inclusionai/ling-3.0-flash-fin:free",
        "liquid/lfm-2.5-2.6b:free",
        "thinkingmachines/inkling:free",
        "thinkingmachines/inkling-small:free",
        "poolside/laguna-s-2.1:free",
        "poolside/laguna-xs-2.1:free",
        "cohere/north-mini-code:free",
        "dots-studio/dots-3-note-preview:free",
    ],
    "tokenrouter": [
        "qwen/qwen3.8-flash",
        "qwen/qwen3.7-max",
        "google/gemini-3.5-flash-lite",
    ],
    "gemini": [
        "gemini-3.6-flash",
        "gemini-3.5-flash",
    ],
    "unlimitedai": [
        "chat-model-reasoning",
    ],
    "publicai": [
        "publicai-chat",
    ],
}

AUDIO_CAPABLE = {"groq": {"whisper-large-v3", "whisper-large-v3-turbo"}}
AUDIO_CHAT_CAPABLE = {"gemini"}  # multimodal chat providers that accept input_audio

COOLDOWN_SECONDS = 60
DEAD_MODEL_PATTERNS = [
    re.compile(r"model .{0,40}(not found|not available|not supported|decommissioned|does not exist)", re.I),
    re.compile(r"invalid model", re.I),
    re.compile(r"no available channel", re.I),
    re.compile(r"is not supported", re.I),
]
QUOTA_PATTERNS = [
    re.compile(r"insufficient.{0,20}(credit|quota|fund)", re.I),
    re.compile(r"quota", re.I),
    re.compile(r"no payment method", re.I),
]


class HydraError(Exception):
    pass


class HydraGateway:
    def __init__(self) -> None:
        self._endpoints: list[Endpoint] = []
        self._built = False
        # model chat terakhir yang sukses (dibaca pipeline untuk analitik admin)
        self.last_chat_model: str = ""

    def build(self) -> None:
        eps: list[Endpoint] = []
        for provider, models in DEFAULT_MODELS.items():
            keys = _keys_from_env(KEY_ENV[provider])
            print(f"[hydra] {provider}: {len(keys)} key(s) from env")
            for key in keys:
                for model in models:
                    kind = "audio" if provider == "groq" and model.startswith("whisper") else "chat"
                    eps.append(Endpoint(
                        provider=provider, key=key, model=model,
                        base_url=BASE_URLS[provider], kind=kind,
                    ))
        self._endpoints = eps
        self._built = True
        print(f"[hydra] built {len(eps)} endpoints")

    def _ensure(self) -> None:
        if not self._built:
            self.build()

    def _pool(self, audio: bool) -> list[Endpoint]:
        self._ensure()
        now = time.time()
        if audio:
            # prefer dedicated STT endpoints, fall back to multimodal chat
            pool = [e for e in self._endpoints
                    if e.is_available(now) and (e.kind == "audio"
                                                or e.provider in AUDIO_CHAT_CAPABLE)]
        else:
            pool = [e for e in self._endpoints if e.is_available(now) and e.kind == "chat"]
        by_provider: dict[str, list[Endpoint]] = {}
        for e in pool:
            by_provider.setdefault(e.provider, []).append(e)
        # PRIORITAS_TINGGI selalu dicoba PALING AWAL (provider berbayar milik
        # pengguna dengan model kuat). Lalu provider ber-key lain, lalu provider
        # anonim sebagai jaring pengaman. Rotasi tetap jalan di dalam tier.
        prio = [p for p in by_provider if p in PRIORITAS_TINGGI and by_provider[p]]
        keyed = [p for p in by_provider
                 if p not in PRIORITAS_TINGGI and by_provider[p] and by_provider[p][0].key]
        anon = [p for p in by_provider
                if p not in PRIORITAS_TINGGI and by_provider[p] and not by_provider[p][0].key]

        def _rotate(names: list[str]) -> list[Endpoint]:
            if not names:
                return []
            offset = int(time.time() // 10) % len(names)
            names = names[offset:] + names[:offset]
            out: list[Endpoint] = []
            while any(by_provider[n] for n in names):
                for n in names:
                    if by_provider[n]:
                        out.append(by_provider[n].pop(0))
            return out

        # prio TIDAK dirotasi: urutannya deterministik supaya model terbaik
        # selalu jadi percobaan pertama.
        urut_prio: list[Endpoint] = []
        for n in prio:
            urut_prio.extend(by_provider[n])
            by_provider[n] = []
        return urut_prio + _rotate(keyed) + _rotate(anon)

    def _fail(self, ep: Endpoint, status: int, body: str) -> None:
        ep.failures += 1
        ep.last_error = body[:300]
        text = body.lower()
        if status in (401, 403) and ep.provider == "gemini":
            # invalid/expired OAuth-style key ("AQ.*"): don't kill forever — user
            # may replace the key; short cooldown so it gets retried later.
            ep.cooldown_until = time.time() + 300
            print(f"[hydra] {ep.provider}/{ep.model} auth 401/403 -> cooldown 300s")
            return
        if status == 429 or "rate" in text:
            ep.cooldown_until = time.time() + COOLDOWN_SECONDS
            print(f"[hydra] {ep.provider}/{ep.model} rate-limited -> cooldown {COOLDOWN_SECONDS}s")
            return
        if status in (400, 404):
            for pat in DEAD_MODEL_PATTERNS:
                if pat.search(body):
                    ep.dead = True
                    print(f"[hydra] {ep.provider}/{ep.model} DEAD (model gone)")
                    return
        for pat in QUOTA_PATTERNS:
            if pat.search(body):
                # quota exhausted: long cooldown, retry in 30 min
                ep.cooldown_until = time.time() + 1800
                print(f"[hydra] {ep.provider}/{ep.model} quota exhausted -> cooldown 30min")
                return
        ep.cooldown_until = time.time() + min(300, 10 * ep.failures)

    def _ok(self, ep: Endpoint) -> None:
        ep.failures = 0
        ep.cooldown_until = 0.0

    # ------------------------------------------------------------------ chat
    async def chat(
        self,
        messages: list[dict[str, Any]],
        *,
        audio: bool = False,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        json_mode: bool = False,
        timeout: float = 180.0,
    ) -> str:
        self._ensure()
        tried: list[str] = []
        last_err = ""
        for attempt in range(3):
            for ep in self._pool(audio=audio):
                if audio and ep.kind == "audio":
                    continue  # STT endpoints handled by transcribe()
                tried.append(f"{ep.provider}/{ep.model}")
                body: dict[str, Any] = {
                    "model": ep.model,
                    "messages": messages,
                    "temperature": temperature,
                    "max_tokens": max_tokens,
                }
                if json_mode:
                    body["response_format"] = {"type": "json_object"}
                headers = {
                    "Authorization": f"Bearer {ep.key}",
                    "Content-Type": "application/json",
                }
                if ep.provider == "gemini":
                    # AQ.* keys (Google AI Studio new format) authenticate via
                    # x-goog-api-key, NOT Bearer, and use the NATIVE
                    # generateContent endpoint (openai-compat rejects AQ.* keys).
                    headers = {
                        "x-goog-api-key": ep.key,
                        "Content-Type": "application/json",
                    }
                if ep.provider in ("unlimitedai", "publicai"):
                    # free no-key chat endpoints (SSE); body/parse dibedakan
                    pass  # handler di bawah
                if ep.provider == "openrouter":
                    headers["HTTP-Referer"] = "https://cortexclip.app"
                    headers["X-Title"] = "CortexClip"
                try:
                    async with httpx.AsyncClient(timeout=timeout) as client:
                        if ep.provider == "unlimitedai":
                            import uuid as _uuid
                            user_text = next((m.get("content", "") for m in messages if m.get("role") == "user"), "")
                            if isinstance(user_text, list):
                                user_text = "".join(p.get("text", "") for p in user_text if isinstance(p, dict))
                            now = "2026-08-29T00:00:00.000Z"
                            gbody2 = {
                                "chatId": str(_uuid.uuid4()),
                                "messages": [{"id": str(_uuid.uuid4()), "role": "user", "content": user_text,
                                              "parts": [{"type": "text", "text": user_text}], "createdAt": now}],
                                "selectedChatModel": "chat-model-reasoning",
                                "selectedCharacter": None, "selectedStory": None,
                                "deviceId": str(_uuid.uuid4()), "locale": "id",
                            }
                            resp = await client.post(f"{ep.base_url}/api/chat", json=gbody2, headers={
                                "origin": "https://app.unlimitedai.chat",
                                "referer": "https://app.unlimitedai.chat/id",
                                "user-agent": "Mozilla/5.0 (Linux; Android 15; SM-F958 Build/AP3A.240905.015) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.86 Mobile Safari/537.36",
                                "x-next-intl-locale": "id",
                                "content-type": "application/json",
                            })
                        elif ep.provider == "publicai":
                            import os as _os
                            def _gid(n=16):
                                return "".join("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[int.from_bytes(_os.urandom(1), "big") % 62] for _ in range(n))
                            user_text = next((m.get("content", "") for m in messages if m.get("role") == "user"), "")
                            if isinstance(user_text, list):
                                user_text = "".join(p.get("text", "") for p in user_text if isinstance(p, dict))
                            gbody3 = {
                                "tools": {}, "id": _gid(),
                                "messages": [{"id": _gid(), "role": "user", "parts": [{"type": "text", "text": user_text}]}],
                                "trigger": "submit-message",
                            }
                            resp = await client.post(f"{ep.base_url}/api/chat", json=gbody3, headers={
                                "origin": "https://publicai.co",
                                "referer": "https://publicai.co/chat",
                                "user-agent": "Mozilla/5.0 (Linux; Android 15; SM-F958 Build/AP3A.240905.015) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.86 Mobile Safari/537.36",
                                "content-type": "application/json",
                            })
                        elif ep.provider == "gemini":
                            # Native Gemini API
                            contents = []
                            for m in messages:
                                role = "model" if m.get("role") == "assistant" else "user"
                                text = m.get("content", "")
                                if isinstance(text, list):
                                    text = "".join(p.get("text", "") for p in text if isinstance(p, dict))
                                contents.append({"role": role, "parts": [{"text": text}]})
                            gbody: dict[str, Any] = {
                                "contents": contents,
                                "generationConfig": {
                                    "temperature": temperature,
                                    "maxOutputTokens": max_tokens,
                                },
                            }
                            if json_mode:
                                gbody["generationConfig"]["responseMimeType"] = "application/json"
                            resp = await client.post(
                                f"{ep.base_url}/models/{ep.model}:generateContent",
                                json=gbody, headers=headers,
                            )
                        else:
                            body: dict[str, Any] = {
                                "model": ep.model,
                                "messages": messages,
                                "temperature": temperature,
                                "max_tokens": max_tokens,
                            }
                            if json_mode:
                                body["response_format"] = {"type": "json_object"}
                            resp = await client.post(
                                f"{ep.base_url}/chat/completions",
                                json=body, headers=headers,
                            )
                    if resp.status_code == 200:
                        data = resp.text
                        if ep.provider == "unlimitedai":
                            # SSE lines: {"type":"delta","delta":"..."}
                            import json as _json
                            content = "".join(
                                _json.loads(l)["delta"] for l in data.split("\n")
                                if l.strip().startswith("{") and _json.loads(l).get("type") == "delta"
                            )
                        elif ep.provider == "publicai":
                            import json as _json
                            content = "".join(
                                _json.loads(l[6:])["delta"] for l in data.split("\n")
                                if l.startswith("data: ") and '"text-delta"' in l
                            )
                        elif ep.provider == "gemini":
                            data = resp.json()
                            candidates = data.get("candidates") or []
                            if candidates:
                                parts = (candidates[0].get("content", {}).get("parts") or [])
                                content = "".join(p.get("text", "") for p in parts if isinstance(p, dict))
                            else:
                                content = ""
                        else:
                            data = resp.json()
                            msg = (data.get("choices") or [{}])[0].get("message", {})
                            content = msg.get("content")
                        if isinstance(content, list):
                            content = "".join(
                                p.get("text", "") for p in content if isinstance(p, dict)
                            )
                        # some reasoning models put output in reasoning; skip
                        if content and content.strip():
                            # response sampah dari provider anonim (limit pesan
                            # panjang, banner, dsb) BUKAN jawaban — perlakukan
                            # sebagai error supaya failover ke endpoint berikutnya
                            low = content.strip().lower()
                            junk_markers = (
                                "batas untuk pengguna anonim",
                                "login untuk melanjutkan",
                                "masuk untuk melanjutkan",
                                "sign in to continue",
                                "rate limit exceeded",
                            )
                            if len(content) < 400 and any(m in low for m in junk_markers):
                                self._fail(ep, 503, f"junk response: {content[:80]}")
                                last_err = f"{ep.provider}/{ep.model}: junk response"
                            else:
                                self._ok(ep)
                                self.last_chat_model = f"{ep.provider}/{ep.model}"
                                return content
                        self._fail(ep, 500, "empty content")
                    else:
                        self._fail(ep, resp.status_code, resp.text)
                        last_err = f"{ep.provider}/{ep.model}: {resp.status_code} {resp.text[:150]}"
                except Exception as exc:
                    self._fail(ep, 0, str(exc))
                    last_err = f"{ep.provider}/{ep.model}: {exc}"
            if attempt < 2:
                await asyncio.sleep(2)
        raise HydraError(
            f"Semua endpoint AI gagal setelah 3 attempt. Terakhir: {last_err}. "
            f"Dicoba: {', '.join(tried[:12])}"
        )

    # ------------------------------------------------------------ STT (audio)
    async def transcribe(self, wav_bytes: bytes) -> dict[str, Any] | None:
        """STT dengan failover: Groq Whisper (word timestamps) → Gemini native
        (audio inline). Returns verbose_json-like dict or None."""
        self._ensure()
        now = time.time()
        # Path 1: Groq Whisper dedicated endpoints
        for ep in self._endpoints:
            if ep.kind != "audio" or not ep.is_available(now):
                continue
            try:
                async with httpx.AsyncClient(timeout=600) as client:
                    resp = await client.post(
                        f"{ep.base_url}/audio/transcriptions",
                        headers={"Authorization": f"Bearer {ep.key}"},
                        files={"file": ("chunk.wav", wav_bytes, "audio/wav")},
                        data={
                            "model": ep.model,
                            "response_format": "verbose_json",
                            "timestamp_granularities[]": "word",
                        },
                    )
                if resp.status_code == 200:
                    self._ok(ep)
                    return resp.json()
                self._fail(ep, resp.status_code, resp.text)
            except Exception as exc:
                self._fail(ep, 0, str(exc))
        # Path 2: Gemini native audio (fallback STT — model multimodal flash)
        gem = [e for e in self._endpoints if e.provider == "gemini" and e.is_available(now)]
        if not gem:
            return None
        ep = gem[0]
        try:
            import base64 as _b64
            import subprocess as _sp
            import tempfile as _tf
            import json as _json
            # wav 16kHz mono 600s ≈ 19MB → base64 25MB kegedean buat inline;
            # kompres ke mp3 64kbps dulu (600s ≈ 4.8MB).
            with _tf.NamedTemporaryFile(suffix=".wav", delete=False) as f:
                f.write(wav_bytes)
                wav_tmp = f.name
            mp3_tmp = wav_tmp + ".mp3"
            try:
                _sp.run(["ffmpeg", "-y", "-i", wav_tmp, "-vn", "-ac", "1", "-ar", "16000",
                         "-b:a", "64k", mp3_tmp], check=True, capture_output=True, timeout=300)
                audio_b64 = _b64.b64encode(open(mp3_tmp, "rb").read()).decode()
            finally:
                for p in (wav_tmp, mp3_tmp):
                    try:
                        os.unlink(p)
                    except OSError:
                        pass
            body = {
                "contents": [{"role": "user", "parts": [
                    {"text": (
                        "Transkripsikan audio ini kata demi kata dalam bahasa aslinya. "
                        "Pecah menjadi segmen pendek (maksimal 12 kata). Balas HANYA "
                        "JSON array tanpa penjelasan: "
                        '[{"start": detik_mulai, "end": detik_selesai, "text": "..."}]'
                    )},
                    {"inline_data": {"mime_type": "audio/mp3", "data": audio_b64}},
                ]}],
                "generationConfig": {"temperature": 0.0, "maxOutputTokens": 8192},
            }
            async with httpx.AsyncClient(timeout=600) as client:
                # NOTE: ep.base_url gemini = .../v1beta/openai (compat) — untuk
                # native generateContent pakai root v1beta langsung.
                resp = await client.post(
                    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent",
                    headers={"x-goog-api-key": ep.key, "Content-Type": "application/json"},
                    json=body,
                )
            if resp.status_code != 200:
                self._fail(ep, resp.status_code, resp.text[:300])
                print(f"[hydra] gemini STT: status {resp.status_code}")
                return None
            self._ok(ep)
            d = resp.json()
            cand = (d.get("candidates") or [{}])[0]
            if cand.get("finishReason") not in (None, "STOP", "MAX_TOKENS"):
                print(f"[hydra] gemini STT: finishReason={cand.get('finishReason')} (blocked?)")
            parts = (cand.get("content", {}).get("parts") or [])
            text = "".join(p.get("text", "") for p in parts if isinstance(p, dict))
            if not text:
                print(f"[hydra] gemini STT: jawaban kosong, promptFeedback={str(d.get('promptFeedback'))[:150]}")
                return None
            # parse JSON array (tahan markdown fence)
            t = text.strip()
            if t.startswith("```"):
                t = t.split("\n", 1)[1] if "\n" in t else t
                t = t.rsplit("```", 1)[0]
            s0 = t.find("[")
            s1 = t.rfind("]")
            if s0 == -1 or s1 <= s0:
                return None
            arr = _json.loads(t[s0:s1 + 1])
            segments = []
            for s in arr if isinstance(arr, list) else []:
                if not isinstance(s, dict) or not str(s.get("text", "")).strip():
                    continue
                try:
                    st_ = float(s.get("start", 0))
                    en_ = float(s.get("end", 0))
                except (TypeError, ValueError):
                    continue
                if en_ <= st_:
                    continue
                segments.append({"start": round(st_, 2), "end": round(en_, 2),
                                 "text": str(s["text"]).strip()})
            if not segments:
                return None
            return {"segments": segments, "text": " ".join(s["text"] for s in segments),
                    "stt_provider": "gemini-3.6-flash"}
        except Exception as exc:
            print(f"[hydra] gemini STT fallback gagal: {exc}")
            self._fail(ep, 0, str(exc))
            return None

    # Path 3 & 4 dilakukan pemanggil (transcribe.py) karena melibatkan modul
    # terpisah (hf_stt.py, local_whisper.py) — chain lengkap ada di
    # transcribe_wav_chunk_via_chain() di bawah.

    def status(self) -> list[dict[str, Any]]:
        self._ensure()
        now = time.time()
        return [
            {
                "provider": e.provider,
                "model": e.model,
                "kind": e.kind,
                "available": e.is_available(now),
                "cooldown_remaining": max(0, int(e.cooldown_until - now)),
                "failures": e.failures,
                "dead": e.dead,
                "last_error": e.last_error,
            }
            for e in self._endpoints
        ]


gateway = HydraGateway()
