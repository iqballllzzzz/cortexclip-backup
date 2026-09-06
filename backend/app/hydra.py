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

import json
import os
import re
import time
import asyncio
import dataclasses
from typing import Any

import httpx


# User-agent ponsel untuk provider anonim (unlimitedai/publicai) yang menolak
# permintaan tanpa UA browser.
UA_PONSEL = (
    "Mozilla/5.0 (Linux; Android 15; SM-F958 Build/AP3A.240905.015) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.86 Mobile Safari/537.36"
)

# Balasan yang secara HTTP 200 tapi isinya bukan jawaban model (banner limit,
# ajakan login). Harus diperlakukan sebagai kegagalan supaya failover jalan.
JUNK_MARKERS = (
    "batas untuk pengguna anonim",
    "login untuk melanjutkan",
    "masuk untuk melanjutkan",
    "sign in to continue",
    "rate limit exceeded",
)


class RespGagal(Exception):
    """Kegagalan satu endpoint: status HTTP + potongan body.

    Dipakai _panggil_satu() untuk melapor tanpa ikut memutuskan pencatatan
    statistik — itu tugas pemanggil (chat/uji_semua) lewat _fail().
    """

    def __init__(self, status: int, body: str) -> None:
        super().__init__(f"{status}: {body[:200]}")
        self.status = status
        self.body = body


@dataclasses.dataclass
class Endpoint:
    provider: str
    key: str
    model: str
    base_url: str
    kind: str = "chat"           # chat | audio
    cooldown_until: float = 0.0
    dead: bool = False
    # `failures` = kegagalan BERUNTUN, di-reset oleh _ok(). Dipakai HANYA untuk
    # menghitung panjang cooldown. JANGAN dipakai sebagai statistik: setelah
    # satu keberhasilan angkanya kembali 0, jadi panel admin akan selalu
    # melihat ~0 kegagalan. Statistik kumulatif ada di HydraGateway._stat
    # (teragregasi per provider+model, karena satu model bisa punya banyak key).
    failures: int = 0
    last_error: str = ""

    def is_available(self, now: float) -> bool:
        return not self.dead and now >= self.cooldown_until


@dataclasses.dataclass
class ModelStat:
    """Sukses/gagal KUMULATIF satu (provider, model).

    Teragregasi per model, bukan per Endpoint: satu model bisa punya beberapa
    endpoint (satu per API key), dan admin ingin melihat "model X berhasil N
    kali", bukan pecahan per key.
    """
    provider: str
    model: str
    ok_total: int = 0
    fail_total: int = 0
    latency_sum_ms: int = 0
    last_ok_at: float = 0.0
    last_fail_at: float = 0.0
    last_error: str = ""

    @property
    def total(self) -> int:
        return self.ok_total + self.fail_total

    @property
    def avg_latency_ms(self) -> int:
        return int(self.latency_sum_ms / self.ok_total) if self.ok_total else 0

    @property
    def reliability(self) -> float:
        return round(self.ok_total * 100 / self.total, 1) if self.total else 0.0


def _keys_from_env(name: str) -> list[str]:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return []
    return [k.strip() for k in raw.split(",") if k.strip()]


BASE_URLS = {
    # justwoker: provider berbayar milik pengguna. Diuji 2026-09-06: balas
    # halaman HTML Cloudflare (provider down) → TIDAK boleh lagi jadi
    # PRIORITAS_TINGGI, kalau tidak setiap panggilan chat membuang waktu
    # gagal di sini dulu. Tetap terdaftar supaya otomatis dipakai lagi
    # begitu providernya hidup.
    "justwoker": "https://api.justwoker.icu/v1",
    "groq": "https://api.groq.com/openai/v1",
    # DARI RISET 2026-09-05 (docs/riset-ai-gratis-2026-09.md):
    # Cloudflare Workers AI = 10.000 Neuron/hari gratis permanen, edge latency
    # 200-600ms. NVIDIA NIM = 40 RPM gratis termasuk VLM Qwen2.5-VL-72B.
    # Keduanya aktif otomatis begitu env key diisi (lihat KEY_ENV).
    "cloudflare": "https://api.cloudflare.com/client/v4/accounts/{account}/ai/v1",
    "nvidia": "https://integrate.api.nvidia.com/v1",
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
    "cloudflare": "CLOUDFLARE_API_KEYS",
    "nvidia": "NVIDIA_API_KEYS",
    "opencode": "OPENCODE_API_KEYS",
    "openrouter": "OPENROUTER_API_KEYS",
    "tokenrouter": "TOKENROUTER_API_KEYS",
    "gemini": "GEMINI_API_KEYS",
    "unlimitedai": "UNLIMITEDAI_ENABLED",
    "publicai": "PUBLICAI_ENABLED",
}

# Provider yang DIUTAMAKAN untuk pekerjaan penting (pemilihan momen viral).
# Ditetapkan dari UJI NYATA `backend/test-model-hidup.py` (2026-09-06):
# 30 dari 48 (provider, model) menjawab. groq tercepat (0,6-1,4s, JSON rapi,
# 14.400 req/hari) dan gemini paling pintar untuk penilaian momen — keduanya
# dicoba lebih dulu. justwoker DIKELUARKAN: providernya balas HTML Cloudflare.
PRIORITAS_TINGGI = ("groq", "gemini")

# Order matters within a provider: model TERBAIK dulu, lalu cadangan.
#
# DAFTAR INI HASIL UJI NYATA, bukan tebakan katalog.
# `backend/test-model-hidup.py` menembak satu prompt JSON ke setiap
# (provider, model) dan hanya yang balas HTTP 200 + isi non-kosong yang
# ditulis di sini. Hasil 2026-09-06: 30 hidup dari 48 kandidat.
# Cara menguji ulang tanpa skrip: panel admin -> "Kesehatan model AI" ->
# tombol "Uji semua model" (POST /api/admin/uji-model). Hasilnya langsung
# menambah angka sukses/gagal per model di panel yang sama.
#
# Model yang TERBUKTI MATI sudah dibuang beserta alasannya:
#   opencode/hy3-free, laguna-s-2.1-free      -> "Model is not supported"
#   opencode/deepseek-v4-flash-free, mimo-v2.5-free -> upstream error/timeout
#   openrouter/thinkingmachines/inkling*      -> "agentic harnesses only"
#   openrouter/google/gemma-4-*:free          -> 429 rate-limited permanen
#   openrouter/z-ai/glm-5.2:free              -> 429 (dipakai model chat lain)
#   openrouter/inclusionai/ling-3.0-flash-sante:free -> timeout
#   tokenrouter/*                             -> kredit $0
#   justwoker/*                               -> provider balas HTML Cloudflare
# Jalankan ulang test-model-hidup.py sebelum mengubah daftar ini.
DEFAULT_MODELS: dict[str, list[str]] = {
    # justwoker tetap ada supaya otomatis kepakai lagi kalau providernya hidup;
    # karena bukan PRIORITAS_TINGGI lagi, kegagalannya tidak melambatkan pool.
    "justwoker": [
        "claude-opus-5",
    ],
    # groq: TERCEPAT (0,6-1,4s), semua balas JSON rapi, 14.400 req/hari.
    "groq": [
        "qwen/qwen3.8-27b",          # 0,8s json — kualitas terbaik di groq
        "openai/gpt-oss-120b",       # 0,7s json
        "openai/gpt-oss-20b",        # 0,9s json
        "groq/compound",             # 1,4s json
        "groq/compound-mini",        # 1,2s json
        "qwen/qwen3.6-27b",          # 1,3s
        "allam-2-7b",                # 0,6s json (cadangan paling ringan)
        "whisper-large-v3-turbo",    # audio
        "whisper-large-v3",          # audio
    ],
    # gemini: 8 model flash hidup — satu-satunya yang bisa baca VIDEO utuh
    # (File API), jadi paling berharga untuk penilaian momen.
    # gemini: satu-satunya yang bisa baca VIDEO utuh (File API), jadi paling
    # berharga untuk penilaian momen. Diuji lewat /api/admin/uji-model
    # 2026-09-06: 7 hidup, 2 sedang overload (503, sementara — dipertahankan),
    # 2 sudah dihapus Google (404 permanen — dibuang):
    #   gemini-2.5-flash, gemini-2.5-flash-lite -> "This model is not found"
    "gemini": [
        "gemini-3.7-flash",          # 1,4s
        "gemini-3.5-flash",          # 1,4s
        "gemini-3.5-flash-lite",     # 0,7s
        "gemini-3.1-flash-lite",     # 0,6s
        "gemini-flash-lite-latest",  # 0,7s
        "gemini-3.6-flash",          # lambat saat ramai (18s)
        "gemini-3-flash-preview",    # lambat saat ramai (16s)
        "gemini-3.8-flash",          # 503 overload saat diuji; cooldown menangani
        "gemini-flash-latest",       # 503 overload saat diuji
    ],
    # openrouter :free — 12 hidup. Urut dari tercepat/terpintar.
    "openrouter": [
        "minimax/minimax-m3:free",
        "nvidia/nemotron-3-ultra-550b-a55b:free",
        "nvidia/nemotron-3-super-120b-a12b:free",
        "minimax/minimax-m2.7:free",
        "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
        "inclusionai/ling-3.0-flash-fin:free",
        "poolside/laguna-s-2.1:free",
        "poolside/laguna-xs-2.1:free",
        "dots-studio/dots-3-note-preview:free",
        "cohere/north-mini-code:free",
        "nvidia/nemotron-3.5-lightning:free",
        # liquid/lfm-2.5-2.6b:free DIBUANG — 429 lalu content kosong pada dua
        # kali uji berturut-turut (2026-09-06).
    ],
    "opencode": [
        "big-pickle",                    # 4,7s json
        "ling-3.0-flash-fin-free",       # 2,3s json
        "nemotron-3.5-lightning-free",   # 17,6s (lambat, cadangan akhir)
    ],
    # tokenrouter: kredit $0 sekarang; disimpan supaya langsung jalan kalau
    # pengguna top-up (kegagalan → cooldown, tidak mengganggu).
    "tokenrouter": [
        "qwen/qwen3.8-flash",
        "qwen/qwen3.7-max",
    ],
    # DARI RISET: aktif otomatis kalau CLOUDFLARE_API_KEYS +
    # CLOUDFLARE_ACCOUNT_ID diisi (10.000 Neuron/hari gratis permanen).
    # Diverifikasi nyata 2026-09-06 (kunci pengguna, account Agusu0764):
    #   llama-3.3-70b-fp8-fast balas {"ok":true} dalam <1s. Vision + coder
    #   disiapkan untuk fitur logo/manual-tracking berikutnya.
    "cloudflare": [
        "@cf/meta/llama-3.3-70b-instruct-fp8-fast",   # UJI: hidup, 794ms
        "@cf/qwen/qwen2.5-coder-32b-instruct",        # UJI: hidup (content dict)
        # @cf/meta/llama-3.2-11b-vision-instruct DIBUANG sementara: Cloudflare
        # mensyaratkan Model Agreement yang hanya bisa diterima manual di
        # dashboard (Workers AI -> model -> Accept). Belum bisa lewat API.
    ],
    # DARI RISET: aktif otomatis kalau NVIDIA_API_KEYS diisi (40 RPM gratis).
    # qwen2.5-vl-72b = grounding momen video terbaik yang gratis.
    # Diuji nyata 2026-09-06 dengan kunci pengguna: hanya 4 dari 8 kandidat
    # yang menjawab dalam waktu wajar. Yang lain TIMEOUT 150s+ atau hilang
    # dari katalog (410 Gone) — JANGAN dipasang walau ada di katalog:
    #   deepseek-v4-flash-0731, llama-3.2-90b-vision, gemma-4-31b -> timeout 150s+
    #   llama-3.1-nemotron-70b-instruct -> "Function not found for account"
    "nvidia": [
        "moonshotai/kimi-k3",                   # UJI: 200 '{"ok":true}'
        "nvidia/nemotron-3-super-120b-a12b",    # UJI: 200 '{"ok":true}'
        "nvidia/nemotron-3.5-lightning-30b-a3b", # UJI: 200 (reasoning)
        "openai/gpt-oss-20b",                   # UJI: 200 '{"ok":true}'
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
        # statistik kumulatif per "provider/model" — sumber angka sukses/gagal
        # di panel admin. Kunci = f"{provider}/{model}".
        self._stat: dict[str, ModelStat] = {}
        self._stat_dirty = False
        self._stat_loaded = False
        self._stat_last_save = 0.0

    # ------------------------------------------------------- statistik model
    def _stat_of(self, provider: str, model: str) -> ModelStat:
        kunci = f"{provider}/{model}"
        st = self._stat.get(kunci)
        if st is None:
            st = ModelStat(provider=provider, model=model)
            self._stat[kunci] = st
        return st

    def catat_ok(self, ep: Endpoint, latency_ms: int) -> None:
        st = self._stat_of(ep.provider, ep.model)
        st.ok_total += 1
        st.latency_sum_ms += max(0, latency_ms)
        st.last_ok_at = time.time()
        self._stat_dirty = True

    def catat_gagal(self, ep: Endpoint, pesan: str) -> None:
        st = self._stat_of(ep.provider, ep.model)
        st.fail_total += 1
        st.last_fail_at = time.time()
        st.last_error = (pesan or "")[:300]
        self._stat_dirty = True

    async def muat_statistik(self) -> None:
        """Pulihkan counter dari tabel model_stats (dipanggil saat startup).

        Tanpa ini setiap deploy mengembalikan semua angka ke 0 dan admin
        kehilangan riwayat keandalan model.
        """
        if self._stat_loaded:
            return
        self._stat_loaded = True
        try:
            from .premium import sb
            rows = await sb("GET", "model_stats?select=*&limit=2000") or []
        except Exception as exc:
            print(f"[hydra] muat statistik model gagal (dilanjutkan dari 0): {exc}")
            return
        for r in rows:
            prov, mod = r.get("provider") or "", r.get("model") or ""
            if not prov or not mod:
                continue
            st = self._stat_of(prov, mod)
            st.ok_total = int(r.get("ok_total") or 0)
            st.fail_total = int(r.get("fail_total") or 0)
            st.latency_sum_ms = int(r.get("latency_sum_ms") or 0)
            st.last_error = r.get("last_error") or ""
            for kolom, atribut in (("last_ok_at", "last_ok_at"),
                                   ("last_fail_at", "last_fail_at")):
                nilai = r.get(kolom)
                if nilai:
                    try:
                        from datetime import datetime as _dt
                        setattr(st, atribut,
                                _dt.fromisoformat(str(nilai).replace("Z", "+00:00")).timestamp())
                    except Exception:
                        pass
        print(f"[hydra] statistik model dipulihkan: {len(rows)} baris")

    async def simpan_statistik(self, paksa: bool = False) -> None:
        """Tulis counter ke model_stats. Debounce 30s supaya tidak spam DB."""
        if not self._stat_dirty and not paksa:
            return
        if not paksa and time.time() - self._stat_last_save < 30:
            return
        self._stat_last_save = time.time()
        self._stat_dirty = False
        baris = []
        from datetime import datetime as _dt, timezone as _tz

        def _iso(ts: float) -> Any:
            return _dt.fromtimestamp(ts, _tz.utc).isoformat() if ts else None

        for st in self._stat.values():
            if st.total == 0:
                continue
            baris.append({
                "provider": st.provider, "model": st.model,
                "ok_total": st.ok_total, "fail_total": st.fail_total,
                "latency_sum_ms": st.latency_sum_ms,
                "last_ok_at": _iso(st.last_ok_at),
                "last_fail_at": _iso(st.last_fail_at),
                "last_error": st.last_error,
                "updated_at": _dt.now(_tz.utc).isoformat(),
            })
        if not baris:
            return
        try:
            from .premium import sb
            # UPSERT: primary key (provider, model). Tanpa merge-duplicates
            # PostgREST balas 409 untuk baris yang sudah ada.
            await sb("POST", "model_stats", json_body=baris,
                     prefer="resolution=merge-duplicates,return=minimal")
        except Exception as exc:
            # analitik tidak boleh menjatuhkan pipeline
            self._stat_dirty = True
            print(f"[hydra] simpan statistik model gagal: {exc}")

    def build(self) -> None:
        eps: list[Endpoint] = []
        cf_account = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "").strip()
        for provider, models in DEFAULT_MODELS.items():
            keys = _keys_from_env(KEY_ENV[provider])
            base = BASE_URLS[provider]
            if provider == "cloudflare":
                # base_url Workers AI memuat account id. Tanpa itu endpoint
                # tidak bisa dibentuk — lewati provider ini, jangan bikin
                # endpoint rusak yang selalu gagal.
                if not cf_account:
                    if keys:
                        print("[hydra] cloudflare: CLOUDFLARE_ACCOUNT_ID kosong "
                              "-> provider dilewati")
                    continue
                base = base.replace("{account}", cf_account)
            print(f"[hydra] {provider}: {len(keys)} key(s) from env")
            for key in keys:
                for model in models:
                    kind = "audio" if provider == "groq" and model.startswith("whisper") else "chat"
                    eps.append(Endpoint(
                        provider=provider, key=key, model=model,
                        base_url=base, kind=kind,
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
        # statistik kumulatif dicatat DI SINI, bukan di pemanggil: semua jalur
        # (chat, STT groq, STT gemini) melewati _fail, jadi tidak ada kegagalan
        # yang lolos dari hitungan panel admin.
        self.catat_gagal(ep, f"{status} {body}" if status else body)
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

    def _ok(self, ep: Endpoint, latency_ms: int = 0) -> None:
        ep.failures = 0
        ep.cooldown_until = 0.0
        self.catat_ok(ep, latency_ms)

    # ------------------------------------------------------------------ chat
    # --------------------------------------------------------- satu endpoint
    async def _panggil_satu(
        self,
        ep: Endpoint,
        messages: list[dict[str, Any]],
        *,
        temperature: float,
        max_tokens: int,
        json_mode: bool,
        timeout: float,
    ) -> str:
        """Kirim satu permintaan ke SATU endpoint. Balikkan isi jawaban.

        Diekstrak dari chat() supaya jalur HTTP + parsing per provider hanya
        ada di satu tempat: dipakai chat() (dengan failover) DAN uji_semua()
        (menembak setiap model satu-satu). Duplikat kode di sini pernah membuat
        provider baru bekerja di satu jalur tapi tidak di jalur lain.

        Melempar RespGagal(status, body) untuk semua kegagalan supaya pemanggil
        yang memutuskan pencatatan statistik (_ok/_fail) — fungsi ini sendiri
        TIDAK mencatat apa pun.
        """
        headers = {
            "Authorization": f"Bearer {ep.key}",
            "Content-Type": "application/json",
        }
        if ep.provider == "gemini":
            # AQ.* keys (Google AI Studio new format) authenticate via
            # x-goog-api-key, NOT Bearer, and use the NATIVE generateContent
            # endpoint (openai-compat rejects AQ.* keys).
            headers = {"x-goog-api-key": ep.key, "Content-Type": "application/json"}
        if ep.provider == "openrouter":
            headers["HTTP-Referer"] = "https://cortexclip.app"
            headers["X-Title"] = "CortexClip"

        def _teks_pengguna() -> str:
            t = next((m.get("content", "") for m in messages if m.get("role") == "user"), "")
            if isinstance(t, list):
                t = "".join(p.get("text", "") for p in t if isinstance(p, dict))
            return t

        async with httpx.AsyncClient(timeout=timeout) as client:
            if ep.provider == "unlimitedai":
                import uuid as _uuid
                user_text = _teks_pengguna()
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
                    "user-agent": UA_PONSEL,
                    "x-next-intl-locale": "id",
                    "content-type": "application/json",
                })
            elif ep.provider == "publicai":
                import os as _os

                def _gid(n: int = 16) -> str:
                    abjad = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
                    return "".join(abjad[int.from_bytes(_os.urandom(1), "big") % 62]
                                   for _ in range(n))

                user_text = _teks_pengguna()
                gbody3 = {
                    "tools": {}, "id": _gid(),
                    "messages": [{"id": _gid(), "role": "user",
                                  "parts": [{"type": "text", "text": user_text}]}],
                    "trigger": "submit-message",
                }
                resp = await client.post(f"{ep.base_url}/api/chat", json=gbody3, headers={
                    "origin": "https://publicai.co",
                    "referer": "https://publicai.co/chat",
                    "user-agent": UA_PONSEL,
                    "content-type": "application/json",
                })
            elif ep.provider == "gemini":
                contents = []
                for m in messages:
                    role = "model" if m.get("role") == "assistant" else "user"
                    text = m.get("content", "")
                    if isinstance(text, list):
                        text = "".join(p.get("text", "") for p in text if isinstance(p, dict))
                    contents.append({"role": role, "parts": [{"text": text}]})
                gbody: dict[str, Any] = {
                    "contents": contents,
                    "generationConfig": {"temperature": temperature,
                                         "maxOutputTokens": max_tokens},
                }
                if json_mode:
                    gbody["generationConfig"]["responseMimeType"] = "application/json"
                # BASE_URLS["gemini"] menunjuk ke lapisan kompat OpenAI
                # (.../v1beta/openai), tapi generateContent adalah API NATIVE
                # yang ada di ROOT v1beta. Menempelkan /models/... ke base_url
                # kompat menghasilkan .../v1beta/openai/models/... = HTTP 404,
                # dan karena groq dicoba lebih dulu, kegagalan ini tidak pernah
                # terlihat: 11 model gemini praktis mati diam-diam.
                # Diverifikasi 2026-09-06: bentuk openai/ -> 404, root -> 200.
                akar = ep.base_url.rsplit("/openai", 1)[0]
                resp = await client.post(
                    f"{akar}/models/{ep.model}:generateContent",
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
                resp = await client.post(f"{ep.base_url}/chat/completions",
                                         json=body, headers=headers)

        if resp.status_code != 200:
            raise RespGagal(resp.status_code, resp.text)

        data = resp.text
        if ep.provider == "unlimitedai":
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
            d = resp.json()
            candidates = d.get("candidates") or []
            if candidates:
                parts = (candidates[0].get("content", {}).get("parts") or [])
                content = "".join(p.get("text", "") for p in parts if isinstance(p, dict))
            else:
                content = ""
        else:
            d = resp.json()
            msg = (d.get("choices") or [{}])[0].get("message", {})
            content = msg.get("content")

        if isinstance(content, list):
            content = "".join(p.get("text", "") for p in content if isinstance(p, dict))
        if isinstance(content, dict):
            # Cloudflare /ai/v1 membalas JSON literal sebagai OBJEK, bukan
            # string ("content": {"ok": true}). Serialisasi supaya jalur
            # pemanggil tetap menerima str (dulu: 'dict' object has no
            # attribute 'strip' -> model dilaporkan mati padahal hidup).
            content = json.dumps(content, ensure_ascii=False)
        # sebagian model reasoning menaruh keluaran di field reasoning: anggap kosong
        if not content or not content.strip():
            raise RespGagal(500, "empty content")

        # Jawaban SAMPAH dari provider anonim (banner limit, ajakan login) bukan
        # jawaban model — harus dianggap gagal supaya failover jalan.
        low = content.strip().lower()
        if len(content) < 400 and any(m in low for m in JUNK_MARKERS):
            raise RespGagal(503, f"junk response: {content[:80]}")
        return content

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
                t_mulai = time.time()   # untuk statistik latensi per model
                try:
                    content = await self._panggil_satu(
                        ep, messages, temperature=temperature,
                        max_tokens=max_tokens, json_mode=json_mode, timeout=timeout,
                    )
                except RespGagal as gagal:
                    self._fail(ep, gagal.status, gagal.body)
                    last_err = f"{ep.provider}/{ep.model}: {gagal.status} {gagal.body[:150]}"
                    continue
                except Exception as exc:
                    self._fail(ep, 0, str(exc))
                    last_err = f"{ep.provider}/{ep.model}: {exc}"
                    continue
                self._ok(ep, int((time.time() - t_mulai) * 1000))
                self.last_chat_model = f"{ep.provider}/{ep.model}"
                return content
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
            t_stt = time.time()
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
                    self._ok(ep, int((time.time() - t_stt) * 1000))
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
                # ep.base_url gemini = .../v1beta/openai (compat); generateContent
                # native ada di root v1beta — lihat catatan di _panggil_satu().
                akar_stt = ep.base_url.rsplit("/openai", 1)[0]
                resp = await client.post(
                    f"{akar_stt}/models/{ep.model}:generateContent",
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
                    "stt_provider": ep.model}
        except Exception as exc:
            print(f"[hydra] gemini STT fallback gagal: {exc}")
            self._fail(ep, 0, str(exc))
            return None

    # Path 3 & 4 dilakukan pemanggil (transcribe.py) karena melibatkan modul
    # terpisah (hf_stt.py, local_whisper.py) — chain lengkap ada di
    # transcribe_wav_chunk_via_chain() di bawah.

    def status(self) -> list[dict[str, Any]]:
        """Kesehatan tiap endpoint + statistik kumulatif per model.

        Satu baris per (provider, model) — bukan per key — supaya panel admin
        tidak menampilkan model yang sama berkali-kali ketika satu provider
        punya beberapa API key.
        """
        self._ensure()
        now = time.time()
        keluar: list[dict[str, Any]] = []
        terlihat: set[str] = set()
        for e in self._endpoints:
            kunci = f"{e.provider}/{e.model}"
            if kunci in terlihat:
                continue
            terlihat.add(kunci)
            # satu model bisa punya banyak endpoint (satu per key): dianggap
            # tersedia kalau MINIMAL SATU key-nya siap.
            saudara = [x for x in self._endpoints
                       if x.provider == e.provider and x.model == e.model]
            tersedia = any(x.is_available(now) for x in saudara)
            cooldown = min((max(0, int(x.cooldown_until - now)) for x in saudara),
                           default=0)
            st = self._stat.get(kunci)
            keluar.append({
                "provider": e.provider,
                "model": e.model,
                "kind": e.kind,
                "keys": len(saudara),
                "available": tersedia,
                "cooldown_remaining": cooldown,
                # kegagalan beruntun (dipakai untuk cooldown), BUKAN total
                "failures": max(x.failures for x in saudara),
                "dead": all(x.dead for x in saudara),
                "last_error": next((x.last_error for x in saudara if x.last_error), ""),
                # ---- statistik kumulatif yang dibaca panel admin ----
                "ok_total": st.ok_total if st else 0,
                "fail_total": st.fail_total if st else 0,
                "total": st.total if st else 0,
                "reliability": st.reliability if st else 0.0,
                "avg_latency_ms": st.avg_latency_ms if st else 0,
                "last_ok_at": st.last_ok_at if st else 0.0,
                "last_fail_at": st.last_fail_at if st else 0.0,
            })
        # urut: paling banyak dipakai dulu, lalu abjad supaya stabil
        keluar.sort(key=lambda r: (-r["total"], r["provider"], r["model"]))
        return keluar

    async def uji_semua(self, timeout: float = 180.0,
                        paralel: int = 6) -> dict[str, Any]:
        """Tembak SETIAP endpoint chat dengan satu prompt kecil.

        Kenapa perlu: pool ini memakai failover, jadi model pertama hampir
        selalu menang dan model cadangan tidak pernah dipanggil. Tanpa uji
        manual, panel admin akan menampilkan 0 sukses / 0 gagal untuk hampir
        semua model selamanya — pengguna tidak bisa menilai mana yang layak.

        Hasilnya masuk ke statistik yang SAMA (lewat _ok/_fail), jadi angka di
        panel admin bertambah persis seperti dipakai produksi. Endpoint audio
        (whisper) dilewati: mengujinya butuh unggah berkas audio.
        """
        self._ensure()
        target = [e for e in self._endpoints if e.kind == "chat"]
        # satu endpoint per (provider, model) — key lain tidak perlu diuji ulang
        unik: dict[str, Endpoint] = {}
        for e in target:
            unik.setdefault(f"{e.provider}/{e.model}", e)
        daftar = list(unik.values())

        sem = asyncio.Semaphore(max(1, paralel))
        hasil: list[dict[str, Any]] = []
        pesan = [{"role": "user", "content": 'Balas hanya: {"ok":true}'}]

        async def satu(ep: Endpoint) -> None:
            async with sem:
                t0 = time.time()
                try:
                    # max_tokens HARUS lapang: model reasoning (gpt-oss,
                    # nemotron-reasoning, dsb) menghabiskan anggaran token di
                    # field `reasoning` lalu mengirim content kosong. Dengan 32
                    # token, model yang sebenarnya HIDUP dilaporkan mati
                    # ("empty content") — terverifikasi pada gpt-oss-120b.
                    isi = await self._panggil_satu(ep, pesan, temperature=0.0,
                                                   max_tokens=512, json_mode=False,
                                                   timeout=timeout)
                except RespGagal as gagal:
                    self._fail(ep, gagal.status, gagal.body)
                    hasil.append({"provider": ep.provider, "model": ep.model,
                                  "ok": False,
                                  "error": f"{gagal.status} {gagal.body[:160]}"})
                    return
                except Exception as exc:
                    self._fail(ep, 0, str(exc))
                    hasil.append({"provider": ep.provider, "model": ep.model,
                                  "ok": False, "error": str(exc)[:200]})
                    return
                ms = int((time.time() - t0) * 1000)
                self._ok(ep, ms)
                hasil.append({"provider": ep.provider, "model": ep.model,
                              "ok": True, "latency_ms": ms})

        t_mulai = time.time()
        await asyncio.gather(*(satu(e) for e in daftar))
        await self.simpan_statistik(paksa=True)
        hidup = sum(1 for r in hasil if r["ok"])
        return {
            "diuji": len(hasil),
            "hidup": hidup,
            "mati": len(hasil) - hidup,
            "detik": round(time.time() - t_mulai, 1),
            "hasil": sorted(hasil, key=lambda r: (not r["ok"], r["provider"], r["model"])),
        }

    def katalog(self) -> list[dict[str, Any]]:
        """SEMUA model yang dikenal — termasuk provider yang belum punya key.

        `status()` hanya melihat endpoint yang benar-benar terbentuk, jadi model
        dari provider tanpa key (mis. cloudflare/nvidia sebelum key diisi) tidak
        pernah muncul. Panel admin harus menampilkan semuanya supaya jelas mana
        yang belum aktif — bukan menyembunyikannya seperti tidak ada.
        """
        aktif = {f"{r['provider']}/{r['model']}": r for r in self.status()}
        keluar: list[dict[str, Any]] = []
        for provider, models in DEFAULT_MODELS.items():
            punya_key = bool(_keys_from_env(KEY_ENV.get(provider, "")))
            if provider == "cloudflare" and not os.environ.get("CLOUDFLARE_ACCOUNT_ID", "").strip():
                punya_key = False
            for model in models:
                kunci = f"{provider}/{model}"
                baris = aktif.get(kunci)
                if baris is not None:
                    keluar.append({**baris, "configured": True})
                    continue
                st = self._stat.get(kunci)
                keluar.append({
                    "provider": provider, "model": model,
                    "kind": "audio" if provider == "groq" and model.startswith("whisper") else "chat",
                    "keys": 0,
                    "configured": punya_key,
                    "available": False,
                    "cooldown_remaining": 0,
                    "failures": 0,
                    "dead": False,
                    "last_error": st.last_error if st else "",
                    "ok_total": st.ok_total if st else 0,
                    "fail_total": st.fail_total if st else 0,
                    "total": st.total if st else 0,
                    "reliability": st.reliability if st else 0.0,
                    "avg_latency_ms": st.avg_latency_ms if st else 0,
                    "last_ok_at": st.last_ok_at if st else 0.0,
                    "last_fail_at": st.last_fail_at if st else 0.0,
                })
        keluar.sort(key=lambda r: (-r["total"], not r["configured"],
                                   r["provider"], r["model"]))
        return keluar


gateway = HydraGateway()
