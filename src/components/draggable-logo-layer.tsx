"use client";
/**
 * LOGO LAYER — logo custom di atas preview, bisa di-DRAG, RESIZE, & HAPUS.
 *
 * Dioptimalkan untuk layar mobile:
 * 1. Seleksi persisten saat diketuk (tidak langsung hilang saat jari diangkat).
 * 2. Hit area tombol hapus (✕) & resize dibuat besar (36px+) agar mudah dipencet jari.
 * 3. Batas tepi (safety margin) mencegah logo & tombol terpotong di tepi preview.
 * 4. Mendukung cubit (pinch-to-zoom) dua jari untuk memperbesar/memperkecil di HP.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";

import { getAccessToken } from "@/lib/backend-api";

export interface LogoState {
  url: string;
  cx: number;
  cy: number;
  scale: number; // fraksi lebar kotak preview
}

export function DraggableLogoLayer({
  clipId,
  boxW,
  boxH,
  logo,
  onChange,
  onDelete,
}: {
  clipId: string;
  boxW: number;
  boxH: number;
  logo: LogoState;
  onChange: (l: LogoState) => void;
  onDelete?: () => void;
}) {
  const [draft, setDraft] = useState<LogoState>(logo);
  const [terpilih, setTerpilih] = useState(false);
  const dragRef = useRef<{
    mode: "move" | "resize";
    px: number;
    py: number;
    cx: number;
    cy: number;
    scale: number;
  } | null>(null);
  const pinchRef = useRef<{ dist: number; startScale: number } | null>(null);
  const simpanTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setDraft(logo), [logo]);

  // Klik di luar area logo mematikan seleksi
  useEffect(() => {
    function onDocClick(e: MouseEvent | TouchEvent) {
      const target = e.target as HTMLElement | null;
      if (!target?.closest("[data-logo-layer]")) {
        setTerpilih(false);
      }
    }
    window.addEventListener("pointerdown", onDocClick);
    return () => window.removeEventListener("pointerdown", onDocClick);
  }, []);

  const simpan = useCallback(
    (l: LogoState) => {
      if (simpanTimer.current) clearTimeout(simpanTimer.current);
      simpanTimer.current = setTimeout(async () => {
        try {
          const token = await getAccessToken();
          const res = await fetch(`/api/logo/${clipId}/pos`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ cx: l.cx, cy: l.cy, scale: l.scale }),
          });
          if (!res.ok) {
            // fallback coba endpoint POST jika PATCH belum ter-cache
            await fetch(`/api/logo/${clipId}`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({ png_b64: "", cx: l.cx, cy: l.cy, scale: l.scale }),
            });
          }
        } catch {
          toast.error("Posisi logo gagal disimpan");
        }
      }, 600);
    },
    [clipId],
  );

  // Batas aman agar logo & tombol tidak pernah terpotong di tepi video
  // Minimal 10% dari tepi samping dan 12% dari tepi atas/bawah
  const clampPosisi = (cx: number, cy: number, scale: number) => {
    const halfW = scale / 2;
    const marginX = 0.10;
    const marginY = 0.12;
    const minX = halfW + marginX;
    const maxX = 1 - halfW - marginX;
    const minY = halfW + marginY;
    const maxY = 1 - halfW - marginY;
    return {
      cx: Math.max(minX, Math.min(maxX, cx)),
      cy: Math.max(minY, Math.min(maxY, cy)),
    };
  };

  useEffect(() => {
    const safe = clampPosisi(logo.cx, logo.cy, logo.scale);
    setDraft({ ...logo, ...safe });
  }, [logo]);

  const onPointerDown = (mode: "move" | "resize") => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setTerpilih(true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = {
      mode,
      px: e.clientX,
      py: e.clientY,
      cx: draft.cx,
      cy: draft.cy,
      scale: draft.scale,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = (e.clientX - d.px) / boxW;
    const dy = (e.clientY - d.py) / boxH;

    if (d.mode === "move") {
      const rawCx = d.cx + dx;
      const rawCy = d.cy + dy;
      const { cx, cy } = clampPosisi(rawCx, rawCy, draft.scale);
      setDraft((s) => ({ ...s, cx, cy }));
    } else {
      const pertambahan = (dx + dy) * 1.2;
      const scale = Math.max(0.08, Math.min(0.5, d.scale + pertambahan));
      const { cx, cy } = clampPosisi(draft.cx, draft.cy, scale);
      setDraft((s) => ({ ...s, scale, cx, cy }));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    try {
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
    dragRef.current = null;
    onChange(draft);
    simpan(draft);
  };

  // Dukungan gesture cubit (pinch-to-zoom) dua jari untuk HP
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      setTerpilih(true);
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      if (!t1 || !t2) return;
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      pinchRef.current = { dist, startScale: draft.scale };
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchRef.current) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      if (!t1 || !t2) return;
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      const ratio = dist / (pinchRef.current.dist || 1);
      const newScale = Math.max(0.08, Math.min(0.5, pinchRef.current.startScale * ratio));
      const { cx, cy } = clampPosisi(draft.cx, draft.cy, newScale);
      const updated = { ...draft, scale: newScale, cx, cy };
      setDraft(updated);
      onChange(updated);
    }
  };

  const onTouchEnd = () => {
    if (pinchRef.current) {
      pinchRef.current = null;
      simpan(draft);
    }
  };

  const w = Math.max(32, boxW * draft.scale);

  return (
    <div
      data-logo-layer
      className="absolute z-30 touch-none select-none"
      style={{
        left: `${draft.cx * 100}%`,
        top: `${draft.cy * 100}%`,
        width: w,
        transform: "translate(-50%, -50%)",
      }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div
        className="relative group cursor-move"
        onPointerDown={onPointerDown("move")}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <img
          src={draft.url}
          alt="Custom Logo"
          draggable={false}
          className="w-full object-contain pointer-events-none drop-shadow-md"
        />

        {terpilih ? (
          <>
            {/* Bingkai seleksi aktif */}
            <span className="pointer-events-none absolute -inset-1 rounded-lg border-2 border-dashed border-white shadow-[0_0_8px_rgba(0,0,0,0.8)]" />

            {/* Tombol Hapus Logo (✕) — Hitbox 36px untuk sentuhan jari HP */}
            {onDelete ? (
              <button
                type="button"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                aria-label="Hapus logo"
                title="Hapus logo"
                className="absolute top-0 right-0 translate-x-1/3 -translate-y-1/3 z-40 flex size-9 items-center justify-center cursor-pointer touch-manipulation active:scale-90 transition-transform"
              >
                <span className="grid size-6 place-items-center rounded-full border-2 border-white bg-red-600 text-white shadow-lg">
                  <X className="size-3.5 stroke-[3]" />
                </span>
              </button>
            ) : null}

            {/* Tombol Resize — Hitbox 36px untuk sentuhan jari HP */}
            <button
              type="button"
              onPointerDown={onPointerDown("resize")}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              aria-label="Ubah ukuran logo"
              title="Tarik untuk ubah ukuran"
              className="absolute bottom-0 right-0 translate-x-1/3 translate-y-1/3 z-40 flex size-9 cursor-nwse-resize items-center justify-center touch-manipulation active:scale-95 transition-transform"
            >
              <span className="grid size-6 place-items-center rounded-full border-2 border-white bg-accent text-white shadow-lg">
                <span className="size-2 rounded-full bg-white" />
              </span>
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
