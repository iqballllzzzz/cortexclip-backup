"""Admin Real-Time Logging Engine — CortexClip AI.

Mencatat tiga kategori log utama secara real-time di memori (ring buffer 200 entri):
1. System & User Logs (/api/admin/logs/system)
2. AI System & Model Logs (/api/admin/logs/ai)
3. Error Logs & Error Captures (/api/admin/logs/export)
"""
from __future__ import annotations

import json
import time
from collections import deque
from typing import Any, Optional

MAX_LOGS = 200

# Buffer log di memori
_system_logs: deque[dict[str, Any]] = deque(maxlen=MAX_LOGS)
_ai_logs: deque[dict[str, Any]] = deque(maxlen=MAX_LOGS)
_error_logs: deque[dict[str, Any]] = deque(maxlen=MAX_LOGS)

# Seed log awal
_seed_time = time.time()
_seed_entry = {
    "id": 1,
    "timestamp": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(_seed_time)),
    "time_epoch": _seed_time,
    "level": "INFO",
    "category": "SYSTEM",
    "user": "system",
    "action": "Server Startup",
    "detail": "CortexClip Backend Service Engine Aktif (FastAPI + Nitro)",
    "ip": "127.0.0.1"
}
_system_logs.append(_seed_entry)

_ai_logs.append({
    "id": 1,
    "timestamp": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(_seed_time)),
    "time_epoch": _seed_time,
    "provider": "Groq",
    "model": "whisper-large-v3-turbo",
    "task": "STT Transkripsi",
    "latency_ms": 142,
    "status": "OK",
    "detail": "Engine STT Failover Utama Siap — 3 Worker Paralel",
    "active_workers": 3
})

_log_counter = 2


def log_system(action: str, detail: str, user: str = "system", level: str = "INFO", category: str = "SYSTEM", ip: str = "") -> None:
    """Catat log sistem / pengguna real-time."""
    global _log_counter
    now = time.time()
    _system_logs.appendleft({
        "id": _log_counter,
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(now)),
        "time_epoch": now,
        "level": level,
        "category": category,
        "user": user,
        "action": action,
        "detail": detail,
        "ip": ip or "127.0.0.1"
    })
    _log_counter += 1


def log_ai(provider: str, model: str, task: str, latency_ms: int = 0, status: str = "OK", detail: str = "") -> None:
    """Catat log panggilan model AI real-time."""
    global _log_counter
    now = time.time()
    _ai_logs.appendleft({
        "id": _log_counter,
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(now)),
        "time_epoch": now,
        "provider": provider,
        "model": model,
        "task": task,
        "latency_ms": latency_ms,
        "status": status,
        "detail": detail or f"Panggilan API {provider} / {model} selesai dalam {latency_ms}ms"
    })
    _log_counter += 1


def log_error(source: str, message: str, stack: str = "", user: str = "guest", category: str = "ERROR", ip: str = "") -> None:
    """Catat error apapun (backend / frontend / AI) ke log admin."""
    global _log_counter
    now = time.time()
    entry = {
        "id": _log_counter,
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(now)),
        "time_epoch": now,
        "level": "ERROR",
        "category": category,
        "source": source,
        "user": user,
        "action": f"ERROR [{source}]",
        "detail": message,
        "stack": stack,
        "ip": ip or "127.0.0.1"
    }
    _error_logs.appendleft(entry)
    _system_logs.appendleft(entry)
    _log_counter += 1


def get_system_logs(limit: int = 100) -> list[dict[str, Any]]:
    return list(_system_logs)[:limit]


def get_ai_logs(limit: int = 100) -> list[dict[str, Any]]:
    return list(_ai_logs)[:limit]


def export_logs_content(kind: str = "all", fmt: str = "json") -> tuple[str, str, str]:
    """Ekspor log untuk diunduh (returns content, filename, content_type)."""
    now_str = time.strftime("%Y%m%d_%H%M%S")
    if kind == "ai":
        data = list(_ai_logs)
        prefix = "cortexclip-ai-logs"
    elif kind == "error":
        data = list(_error_logs)
        prefix = "cortexclip-error-logs"
    else:
        data = {"system_logs": list(_system_logs), "ai_logs": list(_ai_logs), "error_logs": list(_error_logs)}
        prefix = "cortexclip-full-logs"

    if fmt == "txt":
        lines = [f"=== CORTEXCLIP LOG EXPORT [{kind.upper()}] - {now_str} ==="]
        if isinstance(data, dict):
            for k, v in data.items():
                lines.append(f"\n--- {k.upper()} ({len(v)} entries) ---")
                for item in v:
                    lines.append(f"[{item.get('timestamp')}] [{item.get('level', 'INFO')}] [{item.get('user', '-')}] {item.get('action') or item.get('task')}: {item.get('detail')}")
        else:
            for item in data:
                lines.append(f"[{item.get('timestamp')}] [{item.get('level', 'INFO')}] [{item.get('user', '-')}] {item.get('action') or item.get('task')}: {item.get('detail')}")
        return "\n".join(lines), f"{prefix}_{now_str}.txt", "text/plain; charset=utf-8"

    return json.dumps(data, indent=2, ensure_ascii=False), f"{prefix}_{now_str}.json", "application/json; charset=utf-8"
