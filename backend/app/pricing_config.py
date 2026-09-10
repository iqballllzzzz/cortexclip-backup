"""Pengaturan Harga Paket Premium Dinamis & Diskon — CortexClip.

Disimpan secara persisten di backend/app_settings.json.
Dapat diubah dan di-reset oleh Owner / Superadmin.
"""
from __future__ import annotations

import json
import os
from typing import Any

SETTINGS_FILE = os.path.join(os.path.dirname(__file__), "..", "app_settings.json")

DEFAULT_PLANS: dict[str, dict[str, Any]] = {
    "day": {
        "label": "1 Hari",
        "days": 1,
        "amount": 5000,
        "original_amount": 5000,
        "discount_percent": 0,
        "discount_label": "",
    },
    "5day": {
        "label": "5 Hari",
        "days": 5,
        "amount": 19000,
        "original_amount": 25000,
        "discount_percent": 24,
        "discount_label": "Diskon 24%",
    },
    "month": {
        "label": "1 Bulan",
        "days": 30,
        "amount": 89000,
        "original_amount": 150000,
        "discount_percent": 41,
        "discount_label": "Diskon 41%",
    },
    "year": {
        "label": "1 Tahun",
        "days": 365,
        "amount": 299000,
        "original_amount": 499000,
        "discount_percent": 40,
        "discount_label": "Diskon 40%",
    },
}


def _read_settings() -> dict[str, Any]:
    if os.path.exists(SETTINGS_FILE):
        try:
            with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def _write_settings(data: dict[str, Any]) -> None:
    with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def get_pricing_plans() -> dict[str, dict[str, Any]]:
    """Mengembalikan daftar harga paket terkini dari pengaturan atau default."""
    data = _read_settings()
    custom_plans = data.get("pricing_plans")
    if not isinstance(custom_plans, dict):
        return {k: dict(v) for k, v in DEFAULT_PLANS.items()}

    merged = {}
    for k, default_val in DEFAULT_PLANS.items():
        if k in custom_plans and isinstance(custom_plans[k], dict):
            c = custom_plans[k]
            amount = int(c.get("amount", default_val["amount"]))
            orig_amount = int(c.get("original_amount", default_val["original_amount"]))
            custom_disc_label = str(c.get("discount_label", "")).strip()

            disc_pct = 0
            if orig_amount > amount and orig_amount > 0:
                disc_pct = round((1 - (amount / orig_amount)) * 100)

            if not custom_disc_label and disc_pct > 0:
                custom_disc_label = f"Diskon {disc_pct}%"

            merged[k] = {
                "label": default_val["label"],
                "days": default_val["days"],
                "amount": amount,
                "original_amount": orig_amount,
                "discount_percent": disc_pct,
                "discount_label": custom_disc_label,
            }
        else:
            merged[k] = dict(default_val)
    return merged


def set_pricing_plans(new_plans: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Simpan harga paket baru."""
    current = get_pricing_plans()
    for k, item in new_plans.items():
        if k in current and isinstance(item, dict):
            if "amount" in item:
                current[k]["amount"] = max(1000, int(item["amount"]))
            if "original_amount" in item:
                current[k]["original_amount"] = max(current[k]["amount"], int(item["original_amount"]))
            if "discount_label" in item:
                current[k]["discount_label"] = str(item["discount_label"]).strip()

            # recalculate discount percent
            amt = current[k]["amount"]
            orig = current[k]["original_amount"]
            if orig > amt and orig > 0:
                pct = round((1 - (amt / orig)) * 100)
                current[k]["discount_percent"] = pct
                if not current[k]["discount_label"]:
                    current[k]["discount_label"] = f"Diskon {pct}%"
            else:
                current[k]["discount_percent"] = 0
                current[k]["discount_label"] = ""

    data = _read_settings()
    data["pricing_plans"] = current
    _write_settings(data)
    return current


def reset_pricing_plans() -> dict[str, dict[str, Any]]:
    """Kembalikan seluruh harga ke default."""
    data = _read_settings()
    if "pricing_plans" in data:
        del data["pricing_plans"]
        _write_settings(data)
    return {k: dict(v) for k, v in DEFAULT_PLANS.items()}
