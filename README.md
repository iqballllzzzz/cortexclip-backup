# CortexClip AI — Auto Clipper

> **Dokumen hidup** — diperbarui setiap milestone. Bisa dibaca AI/manusia untuk memahami project & menyalakan kembali di VPS baru.

**CortexClip** adalah AI auto-clipper SaaS ala OpusClip: upload 1 video panjang (atau URL YouTube) → transkripsi → 2-pass AI clip selection → klip pendek 9:16 siap unggah dengan subtitle karaoke premium.

---

## 🚀 Startup Cepat (VPS Baru)

Jika VPS ini mati & ingin nyalakan ulang di VPS baru:

### 1. Prasyarat
```bash
# Ubuntu 22.04+; install:
apt update && apt install -y git python3.11 python3.11-venv ffmpeg curl
# Node 20+ & Bun
curl -fsSL https://bun.sh/install | bash
```

### 2. Ambil kode
```bash
git clone https://github.com/iqballllzzzz/cortexclip-backup.git
cd cortexclip-backup
bun install
```

### 3. Backend (Python FastAPI)
```bash
cd backend
python3.11 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt   # atau: pip install fastapi uvicorn httpx python-dotenv
```

**Salin `.env`** — berisi semua API keys & konfigurasi (lihat [KONFIGURASI](#konfigurasi-env)). File ini TIDAK di-git (aman); backup ada di Google Drive (`CortexClip-Backup/`).

**`run.py` WAJIB dipakai untuk launch** (bukan uvicorn langsung):
```bash
source .venv/bin/activate
python3 run.py    # memuat .env dengan override=True, lalu uvicorn :8787
```

### 4. Supabase (self-host)
Ikuti [Supabase Self-Hosting dengan Docker](https://supabase.com/docs/guides/self-hosting/docker). Konfigurasi: URL `http://localhost:8000` (envoy/kong), anon + service key di `.env`. Migration SQL ada di `supabase/migrations/`. Tabel: `profiles`, `projects`, `clips`; bucket storage: `video-uploads` (public) & `clips`.

### 5. Frontend (TanStack Start + Bun)
```bash
# production build + serve
rm -rf .output
NITRO_PRESET=node-server bun run build
node .output/server/index.mjs &    # port 8080
```

---

## 🏗️ Arsitektur

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Frontend   │     │   Backend        │     │   Supabase      │
│  :8080      │────▶│   FastAPI :8787  │────▶│   self-host     │
│  TanStack   │     │   Hydra AI GW    │     │   :8000 (envoy) │
│  React 19   │     │   ffmpeg render  │     │   Postgres      │
└─────────────┘     └──────────────────┘     │   GoTrue auth   │
                                               │   Storage       │
                                               └─────────────────┘
```

- **Frontend**: `/root/cortexclip-backup` — React 19, TanStack Start/Router, Tailwind 4, shadcn/ui, motion. Build Nitro `node-server`, serve port **8080**.
- **Backend**: `/root/cortexclip/backend` — Python 3.11 FastAPI, port **8787**. Modul: `hydra.py` (AI gateway), `transcribe.py` (STT), `clip_selection.py` (2-pass AI), `subtitles.py` (ASS karaoke), `render_clip.py` (ffmpeg MP4), `render.py` (ffmpeg pipelines), `scene_detect.py`, `face_track.py`.
- **Supabase**: self-host Docker di VPS (envoy :8000). Auth GoTrue, Postgres, Storage (S3-compatible). IP publik **178.128.82.140**.

### Alur pipeline AI
1. User upload video → storage `video-uploads/{user_id}/{project_id}.mp4`
2. Frontend extrak audio (chunk 45s WAV) → kirim ke backend `/api/transcribe/*`
3. Backend transkripsi via **Groq Whisper** (`whisper-large-v3-turbo`) → word-level timestamps
4. `clip_selection.detect_clips()`: **pass 1** skor window 0-100 (viral potential), **pass 2** pilih klip + judul/deskripsi/hashtag/hook
5. Klip disimpan di tabel `clips` (start/end, virality_score, caption_words)
6. User atur gaya subtitle & render → backend buat **ASS karaoke** → ffmpeg burn-in → MP4 → upload storage → `rendered_url` (public URL)

---

## 🤖 Hydra AI Gateway (`backend/app/hydra.py`)

Multi-provider, multi-key, failover otomatis (konsep "hydra"): kalau 1 API key mati/rate-limit, langsung pindah provider lain.

**Provider aktif (38 endpoints):**
| Provider | Base URL | Model | Key |
|---|---|---|---|
| groq | `api.groq.com/openai/v1` | qwen3.8-27b, gpt-oss, whisper-large-v3(-turbo) | `GROQ_API_KEYS` |
| opencode | `opencode.ai/zen/v1` | **big-pickle** (utama), ling-3.0-flash-fin-free, dll | `OPENCODE_API_KEYS` |
| openrouter | `openrouter.ai/api/v1` | 17 model `:free` | `OPENROUTER_API_KEYS` |
| tokenrouter | `api.tokenrouter.com/v1` | qwen3.8-flash, qwen3.7-max, gemini-3.5-flash-lite | `TOKENROUTER_API_KEYS` |
| gemini | `generativelanguage.googleapis.com/v1beta` | gemini-3.6-flash, gemini-3.5-flash | `GEMINI_API_KEYS` |
| unlimitedai | `app.unlimitedai.chat` | chat-model-reasoning (gratis, tanpa key) | `UNLIMITEDAI_ENABLED=1` |
| publicai | `publicai.co` | publicai-chat (gratis, tanpa key) | `PUBLICAI_ENABLED=1` |

**Kunci penting Gemini**: key baru Google AI Studio format `AQ.*` **bukan** `AIzaSy...`. Authentikasi via header **`x-goog-api-key`** + endpoint **native** `models/{model}:generateContent` (openai-compat TOLAK AQ.*). 401/403 → cooldown 300s (bukan dead), supaya key valid langsung kepakai lagi.

**Failover**: 429/quota → cooldown 60s; model hilang → dead permanen; network error → backoff; all providers rotate tiap call.

---

## 📦 Backup Otomatis (rclone → Google Drive)

Script: `scripts/backup-drive.sh` — **cron tiap 12 jam** (jam 08:15 & 20:15):

- Snapshot dikompres `cortexclip-backup-<timestamp>.tar.gz` → `gdrive:CortexClip-Backup/`
- Isi: `.env` backend, `backend/app`, frontend repo, `.hermes`, rclone config
- **Rotasi**: simpan 2 snapshot terakhir, yang lama otomatis dihapus (Drive/VPS tidak penuh)
- **Aman**: hanya menyentuh folder `CortexClip-Backup/`, tidak ada hapus di luar itu

Restore: download `.tar.gz` terbaru → extract → ikuti [Startup Cepat](#-startup-cepat-vps-baru).

---

## 🌐 Konfigurasi .env

File `.env` (backend, TIDAK di-git, ada di Drive backup):

```
SUPABASE_URL=http://localhost:8000
PUBLIC_SUPABASE_URL=http://178.128.82.140:8000
SUPABASE_ANON_KEY=...       # anon key
SUPABASE_SERVICE_KEY=...    # service role key
GROQ_API_KEYS=gsk_...
OPENCODE_API_KEYS=...
OPENROUTER_API_KEYS=sk-or-v1...
TOKENROUTER_API_KEYS=...
GEMINI_API_KEYS=AQ....      # format AQ.* dari Google AI Studio
UNLIMITEDAI_ENABLED=1
PUBLICAI_ENABLED=1
ADMIN_USER=admin
ADMIN_PASSWORD=...
SUPABASE_JWT_SECRET=...     # untuk verifikasi token
```

Frontend `.env`: `SUPABASE_URL`, `VITE_SUPABASE_URL`, `VITE_BACKEND_URL` (lihat `.env` di repo root, untracked).

---

## 🗄️ API Backend

| Route | Fungsi |
|---|---|
| `GET /health` | health check |
| `POST /api/transcribe/chunk` | STT per chunk audio |
| `POST /api/transcribe/commit` | gabung transkrip |
| `GET /api/caption-effects` | gaya caption |
| `POST /api/render-clip` | render MP4 (ASS burn) |
| `GET /api/subtitles/ass?srt=...` | generate ASS |
| `GET /api/hydra/status` | status AI endpoints (butuh user JWT) |
| `POST /api/admin/login` | login admin |
| `GET /api/admin/overview` | overview admin (endpoints, jobs) |

---

## 🧑‍💻 Admin

- Login: `admin@cortexclip.app` (via Supabase auth, `is_admin=true`)
- Endpoint admin: `/api/admin/login` → token → `/api/admin/overview`
- Test email: admin login di UI.

---

## 🎨 Desain UI

- **Modern simple minimalis** (approved 2026-08): netral hangat, aksen oren matte diredam `oklch(0.6 0.11 60)`, Bento grid asimetris, floating glass pill nav, heading **Space Grotesk 700** + body **DM Sans**, glassmorphism 1-layer, zero glow/mesh/blur-3xl.
- Jangan gunakan kelas lama: `mesh-gradient`, `text-gradient-amber`, `aurora`, `grid-lines`, `card-hover-lift`, `shadow-lift`, `animate-pulse-glow`.

---

## 📝 Gaya Subtitle (Presets)

8 gaya subtitle siap pakai — dipilih lewat kartu preview animasi "Halo" di editor:
**hormozi, tiktok-pop, neon-glow, clean-minimal, comic-bang, sermon-elegant, typewriter, gaming-energy.**

Tiap gaya = kombinasi font (Montserrat/Anton/Noto Serif/Inter/Impact/Courier), warna, bentuk, dan animasi khas. Satu sumber kebenaran: `backend/app/subtitles.py` → `STYLE_PRESETS` (untuk render MP4/libass) mirror `src/components/subtitle-styles.tsx` → `SUBTITLE_PRESETS` (untuk preview browser). Frontend mengirim `caption_style.preset` ke `/api/render-clip`, backend apply preset → ASS → ffmpeg burn. Preview browser == hasil MP4.

**Editor terpadu** (halaman proyek): pilih gaya subtitle (8 preset), atur ukuran & posisi atas/bawah. Auto-framing wajah **selalu aktif** (tanpa toggle). Satu tombol **"Unduh"** → render MP4 9:16 di server → otomatis unduh (tanpa pilihan webm/mp4 format). Efek subtitle & warna aktif dihapus (digantikan preset).

---

## ⚠️ Catatan Penting

- **Jangan force-push/rebase/amend history** yang sudah di-push (branch tersambung Lovable). Commit baru biasa saja.
- Backend git repo lokal (`/root/cortexclip/backend`) tanpa remote — commit lokal cukup.
- Setiap milestone: `git pull` → commit → push ke `iqballllzzzz/cortexclip-backup`.
- Jangan cetak API keys/PAT di chat. Semua di `.env` (untracked).
- IP VPS: **178.128.82.140** — port: frontend 8080, backend 8787, supabase 8000.

---

## ⚡ Preview Instan (VPS yang nggarap)

Preview klip di editor **tidak lagi streaming video sumber 43MB**. Saat kartu klip dibuka,
backend memotong klip 12 detik resolusi rendah (360x640, {@literal ultrafast}) dan menyimpan URL kecil
(~100-500KB) — browser memutarnya instan. Endpoint: `POST /api/preview-clip` → kolom
`clips.preview_url` + `preview_ready`. Auto-request saat kartu di-expand, fallback ke sumber bila gagal.

*Terakhir diperbarui: 2026-08-29 — sesi editor terpadu: 8 gaya subtitle preset (preview animasi "Halo", backend ASS STYLE_PRESETS), auto-framing wajah selalu aktif, tombol "Unduh" tunggal, rendered_url publik (VPS IP), preview instan (potong 12s 360x640 di VPS), backup rclone 12 jam, README hidup, perbaikan korupsi `***` di main.py & backend-api.ts.*