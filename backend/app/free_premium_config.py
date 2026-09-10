"""Pengaturan status Free Premium (Nonton Iklan) — open, closed, hidden.

Saved in /home/muhiqbalsukarno/cortexclip-backup/backend/app_settings.json.
- open (Buka): normal, iklan berjalan lancar
- closed (Tutup): user klik -> "Maaf, premium gratis sedang ada kendala."
- hidden (Hapus): menu free premium disembunyikan total dari UI website
"""
from __future__ import annotations

import json
import os

SETTINGS_FILE = os.path.join(os.path.dirname(__file__), "..", "app_settings.json")


def get_free_premium_status() -> str:
    if os.path.exists(SETTINGS_FILE):
        try:
            with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                val = data.get("free_premium_status")
                if val in ("open", "closed", "hidden"):
                    return val
        except Exception:
            pass
    return "open"


def set_free_premium_status(status: str) -> str:
    if status not in ("open", "closed", "hidden"):
        raise ValueError("Status tidak valid. Harus 'open', 'closed', atau 'hidden'")
    data = {}
    if os.path.exists(SETTINGS_FILE):
        try:
            with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            data = {}
    data["free_premium_status"] = status
    with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    return status
