#!/usr/bin/env python
"""Uji NYATA statistik sukses/gagal per model (panel admin).

Membuktikan dengan eksekusi sungguhan, bukan cek string:

  1. Panggilan chat yang BERHASIL menaikkan ok_total model pemenang.
  2. Endpoint yang GAGAL menaikkan fail_total model itu — termasuk kegagalan
     yang terjadi sebelum failover berhasil. usage_log tidak bisa menjawab ini
     karena di sana hanya model PEMENANG yang tercatat.
  3. Keberhasilan TIDAK me-reset fail_total (beda dengan Endpoint.failures yang
     memang di-reset karena dipakai menghitung cooldown).
  4. `katalog()` memuat SEMUA model yang dikenal, termasuk provider tanpa API
     key (configured=false), jadi tidak ada model yang tersembunyi di panel.
  5. Angka bertahan lewat simpan → muat ulang (selamat dari restart server).

PENTING — simpan_statistik() menulis nilai ABSOLUT (upsert), jadi tabel
model_stats menganggap hanya ada SATU penulis. Di produksi itu benar: run.py
menjalankan uvicorn tanpa `workers`, jadi backend = satu proses.
Konsekuensinya untuk skrip ini: uji persistensi TIDAK BOLEH menyimpan seluruh
statistik, karena backend yang sedang jalan punya angka versinya sendiri di
memori dan akan saling menimpa. Karena itu uji persistensi di bawah hanya
menulis dan menghapus BARIS UJINYA SENDIRI (provider 'ujicoba').

Jalankan: backend/.venv/bin/python backend/test-model-stats.py
"""
from __future__ import annotations

import asyncio
import os
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from dotenv import load_dotenv

load_dotenv(HERE / ".env", override=True)

from app.hydra import DEFAULT_MODELS, Endpoint, gateway  # noqa: E402

GAGAL: list[str] = []
UJI_PROVIDER = "ujicoba"          # provider palsu, dibersihkan di akhir


def cek(nama: str, syarat: bool, detail: str = "") -> None:
    print(f"[{'OK  ' if syarat else 'GAGAL'}] {nama}" + (f" — {detail}" if detail else ""))
    if not syarat:
        GAGAL.append(nama)


async def main() -> int:
    gateway.build()
    print(f"endpoint terbentuk: {len(gateway._endpoints)}")

    # Muat dulu supaya angka "sebelum" realistis (dan delta chat bisa diuji).
    await gateway.muat_statistik()
    awal = {k: (v.ok_total, v.fail_total) for k, v in gateway._stat.items()}
    print(f"statistik awal dari DB: {len(awal)} model\n")

    # ------------------------------------------------------------------ 1-3
    # Endpoint palsu: kegagalan PASTI terjadi, tidak bergantung provider nyata
    # sedang error, dan tidak mencemari statistik model sungguhan.
    ep = Endpoint(provider=UJI_PROVIDER, key="kunci-palsu", model="model-palsu",
                  base_url="https://127.0.0.1:9/v1", kind="chat")
    kunci = f"{UJI_PROVIDER}/model-palsu"

    gateway._fail(ep, 500, "kegagalan sengaja untuk uji")
    st = gateway._stat.get(kunci)
    cek("kegagalan tercatat kumulatif", bool(st and st.fail_total == 1),
        f"fail_total={st.fail_total if st else 'tidak ada'}")
    cek("pesan error kegagalan tersimpan",
        bool(st and "kegagalan sengaja" in st.last_error))

    gateway._fail(ep, 500, "kegagalan kedua")
    cek("kegagalan kedua menambah, bukan menimpa", bool(st and st.fail_total == 2),
        f"fail_total={st.fail_total if st else '-'}")

    gateway._ok(ep, 1234)
    cek("keberhasilan tercatat", bool(st and st.ok_total == 1))
    cek("fail_total TIDAK ter-reset oleh keberhasilan", bool(st and st.fail_total == 2),
        "ini bedanya dengan Endpoint.failures yang memang di-reset")
    cek("Endpoint.failures (beruntun) memang di-reset", ep.failures == 0)
    cek("latensi rata-rata dihitung", bool(st and st.avg_latency_ms == 1234),
        f"avg={st.avg_latency_ms if st else '-'}ms")
    cek("keandalan dihitung dari total", bool(st and abs(st.reliability - 33.3) < 0.2),
        f"reliability={st.reliability if st else '-'}%")

    # --------------------------------------------------- chat NYATA (delta)
    t0 = time.time()
    try:
        jawab = await gateway.chat(
            [{"role": "system", "content": "Balas JSON saja."},
             {"role": "user", "content": 'Balas persis: {"ok": true}'}],
            temperature=0.1, max_tokens=48,
        )
        menang = gateway.last_chat_model
        st_m = gateway._stat.get(menang)
        ok_awal = awal.get(menang, (0, 0))[0]
        cek("chat NYATA berhasil", bool(jawab and jawab.strip()),
            f"{menang} dalam {time.time() - t0:.2f}s")
        cek("ok_total model pemenang NAIK satu",
            bool(st_m and st_m.ok_total == ok_awal + 1),
            f"{menang}: {ok_awal} -> {st_m.ok_total if st_m else '-'}")
    except Exception as exc:
        cek("chat NYATA berhasil", False, str(exc)[:120])

    # -------------------------------------------------------------------- 4
    katalog = gateway.katalog()
    dikenal = sum(len(v) for v in DEFAULT_MODELS.values())
    cek("katalog memuat SEMUA model yang dikenal", len(katalog) == dikenal,
        f"{len(katalog)} baris vs {dikenal} model di DEFAULT_MODELS")

    wajib = {"provider", "model", "ok_total", "fail_total", "total", "reliability",
             "avg_latency_ms", "configured", "available", "last_ok_at",
             "last_fail_at", "last_error", "keys"}
    kurang = wajib - set(katalog[0]) if katalog else wajib
    cek("setiap baris katalog punya field sukses/gagal", not kurang,
        f"kurang: {sorted(kurang)}" if kurang else "lengkap")

    tanpa_key = [r for r in katalog if not r["configured"]]
    print(f"       model tanpa API key (tetap tampil): {len(tanpa_key)}"
          + (f" — contoh {tanpa_key[0]['provider']}/{tanpa_key[0]['model']}"
             if tanpa_key else ""))

    kunci_semua = [f"{r['provider']}/{r['model']}" for r in katalog]
    cek("tidak ada model kembar di katalog",
        len(kunci_semua) == len(set(kunci_semua)),
        f"{len(kunci_semua)} baris, {len(set(kunci_semua))} unik")
    cek("model uji palsu TIDAK bocor ke katalog",
        all(r["provider"] != UJI_PROVIDER for r in katalog),
        "katalog hanya berisi model yang benar-benar terdaftar")

    # -------------------------------------------------------------------- 5
    if not os.environ.get("SUPABASE_URL"):
        print("[LEWAT] uji persistensi: SUPABASE_URL tidak ada di env")
    else:
        # Isolasi: sisakan HANYA baris uji di _stat sebelum menyimpan, supaya
        # angka model sungguhan milik backend produksi tidak tertimpa.
        st_uji = gateway._stat[kunci]
        harapan = (st_uji.ok_total, st_uji.fail_total, st_uji.latency_sum_ms)
        gateway._stat = {kunci: st_uji}
        await gateway.simpan_statistik(paksa=True)

        gateway._stat = {}               # seperti proses baru setelah restart
        gateway._stat_loaded = False
        await gateway.muat_statistik()
        pulih = gateway._stat.get(kunci)
        cek("statistik selamat dari simpan→muat (tahan restart)",
            bool(pulih) and (pulih.ok_total, pulih.fail_total,
                             pulih.latency_sum_ms) == harapan,
            f"{harapan} -> {(pulih.ok_total, pulih.fail_total, pulih.latency_sum_ms) if pulih else 'hilang'}")
        # Pemeriksaan yang BISA gagal: baca ulang tabel dan pastikan angka
        # model produksi tidak berubah dari `awal` (uji tidak menimpa apa pun).
        try:
            from app.premium import sb
            rows = await sb("GET", "model_stats?select=provider,model,ok_total,fail_total&limit=2000") or []
            db_now = {f"{r['provider']}/{r['model']}": (r["ok_total"], r["fail_total"])
                      for r in rows}
            berubah = [k for k, v in awal.items()
                       if k in db_now and db_now[k] != v]
            cek("angka model produksi TIDAK tertimpa oleh uji ini", not berubah,
                f"berubah: {berubah[:3]}" if berubah
                else f"{len(awal)} baris awal tetap sama")
        except Exception as exc:
            cek("angka model produksi TIDAK tertimpa oleh uji ini", False,
                str(exc)[:100])

        # bersihkan baris uji supaya tabel produksi tetap bersih
        try:
            from app.premium import sb
            await sb("DELETE", f"model_stats?provider=eq.{UJI_PROVIDER}")
            sisa = await sb("GET", f"model_stats?provider=eq.{UJI_PROVIDER}&select=provider") or []
            cek("baris uji terhapus dari DB", len(sisa) == 0,
                f"sisa {len(sisa)} baris")
        except Exception as exc:
            cek("baris uji terhapus dari DB", False, str(exc)[:100])

    print()
    if GAGAL:
        print(f"HASIL: {len(GAGAL)} pemeriksaan GAGAL -> {GAGAL}")
        return 1
    print("HASIL: semua pemeriksaan LULUS")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
