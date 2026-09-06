#!/usr/bin/env python
"""Uji NYATA setiap model kandidat di semua provider Hydra.

Tujuan: hanya model yang BENAR-BENAR menjawab yang masuk DEFAULT_MODELS.
Menembak satu prompt JSON kecil ke tiap (provider, model) dan mencatat
status + latensi + apakah balasannya JSON valid.

Pakai: backend/.venv/bin/python backend/test-model-hidup.py
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

import httpx  # noqa: E402

PROMPT = [{"role": "user", "content":
           'Balas JSON saja: {"skor": 7, "alasan": "uji"}'}]

KANDIDAT: dict[str, tuple[str, str, list[str]]] = {
    # provider: (base_url, env_key, [model...])
    "groq": ("https://api.groq.com/openai/v1", "GROQ_API_KEYS", [
        "qwen/qwen3.8-27b", "qwen/qwen3.6-27b",
        "openai/gpt-oss-120b", "openai/gpt-oss-20b",
        "groq/compound", "groq/compound-mini", "allam-2-7b",
    ]),
    "gemini": ("https://generativelanguage.googleapis.com/v1beta",
               "GEMINI_API_KEYS", [
                   "gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash",
                   "gemini-3.5-flash", "gemini-3.5-flash-lite",
                   "gemini-3.1-flash-lite", "gemini-flash-latest",
                   "gemini-flash-lite-latest", "gemini-2.5-flash",
                   "gemini-2.5-flash-lite", "gemini-3-flash-preview",
               ]),
    "openrouter": ("https://openrouter.ai/api/v1", "OPENROUTER_API_KEYS", [
        "z-ai/glm-5.2:free", "minimax/minimax-m3:free",
        "minimax/minimax-m2.7:free",
        "nvidia/nemotron-3-super-120b-a12b:free",
        "nvidia/nemotron-3-ultra-550b-a55b:free",
        "nvidia/nemotron-3.5-lightning:free",
        "google/gemma-4-31b-it:free", "google/gemma-4-26b-a4b-it:free",
        "inclusionai/ling-3.0-flash-fin:free",
        "inclusionai/ling-3.0-flash-sante:free",
        "liquid/lfm-2.5-2.6b:free", "thinkingmachines/inkling:free",
        "thinkingmachines/inkling-small:free",
        "poolside/laguna-s-2.1:free", "poolside/laguna-xs-2.1:free",
        "cohere/north-mini-code:free",
        "dots-studio/dots-3-note-preview:free",
        "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    ]),
    "opencode": ("https://opencode.ai/zen/v1", "OPENCODE_API_KEYS", [
        "big-pickle", "ling-3.0-flash-fin-free", "deepseek-v4-flash-free",
        "nemotron-3.5-lightning-free", "mimo-v2.5-free", "hy3-free",
        "laguna-s-2.1-free",
    ]),
    "tokenrouter": ("https://api.tokenrouter.com/v1", "TOKENROUTER_API_KEYS", [
        "qwen/qwen3.8-flash", "qwen/qwen3.7-max",
        "google/gemini-3.5-flash-lite",
    ]),
    "justwoker": ("https://api.justwoker.icu/v1", "JUSTWOKER_API_KEYS", [
        "claude-opus-5", "claude-sonnet-5",
    ]),
}


def key_of(env: str) -> str:
    return (os.environ.get(env, "") or "").split(",")[0].strip()


async def uji(provider: str, base: str, key: str, model: str) -> dict:
    t0 = time.time()
    try:
        async with httpx.AsyncClient(timeout=70) as c:
            if provider == "gemini":
                r = await c.post(
                    f"{base}/models/{model}:generateContent",
                    headers={"x-goog-api-key": key,
                             "Content-Type": "application/json"},
                    json={"contents": [{"role": "user", "parts": [
                        {"text": PROMPT[0]["content"]}]}],
                        "generationConfig": {"maxOutputTokens": 512}})
                txt = ""
                if r.status_code == 200:
                    d = r.json()
                    for p in (d.get("candidates") or [{}])[0].get(
                            "content", {}).get("parts", []) or []:
                        txt += p.get("text", "")
            else:
                headers = {"Authorization": f"Bearer {key}",
                           "Content-Type": "application/json"}
                if provider == "openrouter":
                    headers["HTTP-Referer"] = "https://cortexclip.app"
                    headers["X-Title"] = "CortexClip"
                r = await c.post(f"{base}/chat/completions", headers=headers,
                                 json={"model": model, "messages": PROMPT,
                                       "max_tokens": 512, "temperature": 0.2})
                txt = ""
                if r.status_code == 200:
                    d = r.json()
                    txt = ((d.get("choices") or [{}])[0]
                           .get("message", {}).get("content") or "")
        dt = time.time() - t0
        jsonable = False
        if txt:
            s = txt.strip()
            if s.startswith("```"):
                s = s.split("```")[1] if "```" in s[3:] else s
                s = s[4:] if s.lower().startswith("json") else s
            try:
                json.loads(s[s.find("{"):s.rfind("}") + 1])
                jsonable = True
            except Exception:
                jsonable = False
        return {"provider": provider, "model": model, "status": r.status_code,
                "ok": r.status_code == 200 and bool(txt), "json": jsonable,
                "detik": round(dt, 1),
                "err": "" if r.status_code == 200 else r.text[:110]}
    except Exception as exc:
        return {"provider": provider, "model": model, "status": 0, "ok": False,
                "json": False, "detik": round(time.time() - t0, 1),
                "err": str(exc)[:110]}


async def main() -> int:
    tugas = []
    for provider, (base, env, models) in KANDIDAT.items():
        key = key_of(env)
        if not key:
            print(f"[skip] {provider}: tidak ada key")
            continue
        for m in models:
            tugas.append(uji(provider, base, key, m))

    print(f"menguji {len(tugas)} (provider, model)…\n")
    hasil = await asyncio.gather(*tugas)

    hidup: dict[str, list[str]] = {}
    for h in sorted(hasil, key=lambda x: (x["provider"], not x["ok"], x["detik"])):
        tanda = "OK " if h["ok"] else "MATI"
        js = "json" if h["json"] else "    "
        print(f"  [{tanda}] {js} {h['detik']:5.1f}s  "
              f"{h['provider']:12s} {h['model']:52s} {h['err']}")
        if h["ok"]:
            hidup.setdefault(h["provider"], []).append(h["model"])

    print("\n=== MODEL HIDUP (urut tercepat) ===")
    for p, ms in hidup.items():
        print(f"{p}: {len(ms)}")
        for m in ms:
            print(f"    {m}")
    total_ok = sum(len(v) for v in hidup.values())
    print(f"\nTOTAL HIDUP: {total_ok}/{len(tugas)}")

    with open("/tmp/model-hidup.json", "w") as f:
        json.dump(hidup, f, indent=1)
    print("tersimpan: /tmp/model-hidup.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
