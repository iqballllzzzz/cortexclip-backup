# Riset: Backend AI Gratis/Unlimited untuk CortexClip — 2026-09-05

Sumber: 2 subagent riset paralel (web_search + web_extract, tautan terverifikasi).
Konteks: VPS 4-CPU tanpa GPU, FastAPI, multi-user. Masalah saat ini: Gemini AI Studio rate-limited.

## Kesimpulan Utama

**Stack terbaik (gratis permanen): Groq**
- Whisper-large-v3 STT (sudah dipakai) + Llama 4 Scout (multimodal, 5 frame/request) untuk skoring momen + Llama 3.3 70B untuk judul/deskripsi/hashtag
- Limit: 30 RPM; 8B = 14.400 req/hari, 70B = 1.000+ req/hari, 300+ token/detik
- Satu-satunya stack gratis single-vendor paling tahan load

**Gemini 2.5 Flash (pertahankan untuk video utuh)**
- SATU-SATUNYA API gratis yang menerima file video native (>1 jam) via File API / URL YouTube
- Limit: Flash 250 RPD, Flash-Lite 1.000 RPD (kuota Des 2025 dipangkas 50-80% — sumber bottleneck sekarang)
- Strategi: Gemini khusus video analysis berat, pindahkan text-gen murah (judul/hashtag) ke Groq

**GLM-4.6V-Flash (Z.AI/TheRouter)** — gratis $0/token, video native satu-pass ~1 jam, konteks 128K, function-calling multimodal. Warning: "limited-time free" bisa berubah berbayar kapan saja.

**NVIDIA NIM** — 40 RPM gratis, Qwen2.5-VL-72B = grounding video/momen terbaik yang gratis (1.000 kredit/tahun).

## Yang GAK layak
- HF Inference Providers: free tinggal $0,10 kredit/bulan (1.000 call/hari sudah dihapus Feb 2025) — mati
- llama.cpp lokal di 4-CPU: hanya 5-15 tok/s + 5-7GB RAM — hanya fallback async 3B, bukan backbone
- Proxy/scraper situs AI besar (openapis dll): ToS TINGGI (CFAA/DMCA, key bocor) — jangan
- Mistral free tier: prompt dipakai training + "evaluation only" — berisiko SaaS publik
- Cerebras: free trial 30 hari saja sekarang

## Riset 2: Deteksi Momen Viral TANPA video-LLM berat

**Rekomendasi #1: Ensemble transcript-first** (pola yang dipakai OpusClip/Klap/Vizard/2short — semua kompetitor memakai transkrip + LLM teks, BUKAN video-LLM):
1. Ganti window 60s tetap → segmentasi topik ala ClipsAI (TextTiling + embedding BERT lokal, 0 API, CPU-only, batas klip jatuh di transisi topik alami)
2. Skoring LLM teks dengan pool multi-provider gratis + failover otomatis: Groq → OpenRouter :free (top-up $10 sekali = 1.000 req/hari permanen) → Cerebras/GLM
3. Pre-filter sinyal lokal murah: energi audio ffmpeg, FaceMesh (sudah ada), penalti hook lemah 3 detik pertama (data OpusClip: 50-60% drop-off di 3 detik pertama)
4. LLM hanya menerima segmen kandidat terbaik (~2-5k token/video) — hemat 80-90% kuota

**Catatan jujur:** skor virality kompetitor bagus untuk RANKING antar-klip dalam satu video, TIDAK teruji sebagai prediktor views publikasi.

## Referensi implementasi open-source
- ClipsAI (github.com/ClipsAI/clipsai) — segmentasi tanpa-LLM, tanpa API key
- SupoClip (1.1k ⭐, AGPL-3.0 — hati-hati lisensi kalau komersial) — LLM pilih segmen + skor hook/engagement/value + face-crop
- AI-Youtube-Shorts-Generator (4.8k ⭐) — pola Whisper → LLM → render

---
File lengkap JSON riset: `.hermes/cache/delegation/subagent-summary-*-20260905_163220-*.txt` (raw).
