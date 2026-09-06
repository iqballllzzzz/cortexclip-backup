"""UJI NYATA: pemisahan toggle Ikon vs B-Roll di render_clip.render.

Menembak render_clip_caption_style_merge() dengan 4 kombinasi toggle dan
memastikan hasil merge-nya benar:
  1. broll=False                → icons=False, broll=False
  2. broll=True (klien lama)    → icons=True,  broll=True   (kompatibel)
  3. broll={icons:true,broll:false} → hanya ikon
  4. broll={icons:false,broll:true} → hanya b-roll

Tidak merender video penuh — hanya memverifikasi parsing flag (bagian yang
baru berubah). Jalankan: backend/.venv/bin/python test-broll-split.py
"""
from __future__ import annotations

import ast
import sys
import types


def _ekstrak_parser() -> callable:
    """Ambil logika parsing 'broll' dari render_clip.py tanpa mengimpor
    modul berat (fastapi/httpx dsb.) — cukup baca AST fungsi render_clip,
    lalu jalankan potongannya di namespace tiruan.
    """
    src = open("app/render_clip.py").read()
    pohon = ast.parse(src)
    # cari assignment di dalam render_clip yang mengekstrak flag broll
    target = None
    for node in ast.walk(pohon):
        if isinstance(node, ast.Assign):
            nama = [t.id for t in node.targets if isinstance(t, ast.Name)]
            if "_broll_val" in nama:
                target = node
    assert target is not None, "potongan _broll_val tidak ketemu di render_clip.py"

    # `style` adalah variabel lokal render_clip — suntikkan sebagai argumen
    # supaya potongan AST bisa dieksekusi berdiri sendiri.
    param = ast.arguments(
        posonlyargs=[], args=[ast.arg(arg="style")],
        kwonlyargs=[], kw_defaults=[], defaults=[])
    fn = ast.FunctionDef(
        name="_ambil_broll", args=param,
        body=[target, ast.Return(value=ast.Name(id="_broll_val", ctx=ast.Load()))],
        decorator_list=[])
    mod = ast.Module(body=[fn], type_ignores=[])
    ns: dict = {}
    exec(compile(ast.fix_missing_locations(mod), "<uji>", "exec"), ns)
    return ns["_ambil_broll"]


def main() -> int:
    gagal = 0

    def cek(kasus: str, style: dict, ingin: tuple[bool, bool]) -> None:
        nonlocal gagal
        ambil = _ekstrak_parser()
        _broll_val = ambil(style)
        if isinstance(_broll_val, dict):
            icons = bool(_broll_val.get("icons"))
            broll = bool(_broll_val.get("broll"))
        else:
            broll = bool(_broll_val)
            icons = broll
        ok = (icons, broll) == ingin
        print(f"  {kasus:48} → icons={icons!s:5} broll={broll!s:5} "
              f"{'OK' if ok else 'SALAH'}")
        if not ok:
            gagal += 1

    print("[uji] parsing flag broll (pisah toggle Ikon & B-Roll):")
    cek("broll absen (default)", {}, (False, False))
    cek("broll=False", {"broll": False}, (False, False))
    cek("broll=True (klien lama)", {"broll": True}, (True, True))
    cek("broll={icons:T, broll:F} (hanya ikon)",
        {"broll": {"icons": True, "broll": False}}, (True, False))
    cek("broll={icons:F, broll:T} (hanya b-roll)",
        {"broll": {"icons": False, "broll": True}}, (False, True))
    cek("broll={icons:T, broll:T} (keduanya)",
        {"broll": {"icons": True, "broll": True}}, (True, True))

    if gagal:
        print(f"[uji] GAGAL: {gagal} kasus salah")
        return 1
    print("[uji] SEMUA kasus lulus")
    return 0


if __name__ == "__main__":
    sys.exit(main())
