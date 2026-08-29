"""Hydra AI Gateway — multi-provider, multi-key failover.

Verified working endpoints on this VPS (2026-08-29):
  groq        /openai/v1        qwen/qwen3.8-27b (chat+json), whisper-large-v3(-turbo) (audio STT)
  opencode    opencode.ai/zen/v1  *-free models (ling-3.0-flash-fin-free verified; others auto-marked dead)
  openrouter  /api/v1           :free models (z-ai/glm-5.2:free etc., subject to upstream rate limits)
  tokenrouter api.tokenrouter.com  qwen3.8-max etc. (key has $0 credit -> cooldown; ready when topped up)
  gemini      generativelanguage  key invalid (AQ.* is not an AI Studio key) -> dead until replaced

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
    "groq": "https://api.groq.com/openai/v1",
    "opencode": "https://opencode.ai/zen/v1",
    "openrouter": "https://openrouter.ai/api/v1",
    "tokenrouter": "https://api.tokenrouter.com/v1",
    "gemini": "https://generativelanguage.googleapis.com/v1beta/openai",
}

KEY_ENV = {
    "groq": "GROQ_API_KEYS",
    "opencode": "OPENCODE_API_KEYS",
    "openrouter": "OPENROUTER_API_KEYS",
    "tokenrouter": "TOKENROUTER_API_KEYS",
    "gemini": "GEMINI_API_KEYS",
}

# Order matters within a provider. Free models first.
DEFAULT_MODELS: dict[str, list[str]] = {
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
        "inclusionai/ling-3.0-flash-fin:free",
        "nvidia/nemotron-3.5-lightning:free",
        "google/gemma-4-31b-it:free",
        "liquid/lfm-2.5-2.6b:free",
    ],
    "tokenrouter": [
        "qwen/qwen3.8-flash",
        "qwen/qwen3.7-max",
        "google/gemini-3.5-flash-lite",
    ],
    "gemini": [
        "gemini-2.0-flash",
        "gemini-2.5-flash",
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

    def build(self) -> None:
        eps: list[Endpoint] = []
        for provider, models in DEFAULT_MODELS.items():
            keys = _keys_from_env(KEY_ENV[provider])
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
        providers = list(by_provider)
        out: list[Endpoint] = []
        if providers:
            offset = int(time.time() // 10) % len(providers)
            providers = providers[offset:] + providers[:offset]
        while any(by_provider.values()):
            for p in providers:
                if by_provider[p]:
                    out.append(by_provider[p].pop(0))
        return out

    def _fail(self, ep: Endpoint, status: int, body: str) -> None:
        ep.failures += 1
        ep.last_error = body[:300]
        text = body.lower()
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
                if ep.provider == "openrouter":
                    headers["HTTP-Referer"] = "https://cortexclip.app"
                    headers["X-Title"] = "CortexClip"
                try:
                    async with httpx.AsyncClient(timeout=timeout) as client:
                        resp = await client.post(
                            f"{ep.base_url}/chat/completions",
                            json=body, headers=headers,
                        )
                    if resp.status_code == 200:
                        data = resp.json()
                        msg = (data.get("choices") or [{}])[0].get("message", {})
                        content = msg.get("content")
                        if isinstance(content, list):
                            content = "".join(
                                p.get("text", "") for p in content if isinstance(p, dict)
                            )
                        # some reasoning models put output in reasoning; skip
                        if content and content.strip():
                            self._ok(ep)
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
        """Groq Whisper transcription with word timestamps. Returns
        verbose_json dict or None when no STT endpoint is available."""
        self._ensure()
        now = time.time()
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
        return None

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
