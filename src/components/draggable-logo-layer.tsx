"use client";
/**
 * LOGO LAYER — logo custom di atas preview, bisa di-DRAG & resize.
 *
 * Drag langsung di preview (permintaan pengguna: "drag nya langsung di
 * previewnya... munculin kotak yang bisa gedein kecilin logo"). Posisi &
 * skala dinormalisasi (0..1) terhadap kotak preview, lalu disimpan via
 * PATCH /api/logo/{clip_id} (debounce 700ms). Render unduhan memakai
 * nilai yang sama — preview == unduhan.
 *
 * Kotak seleksi ala CapCut/Canva: bingkai putus-putus + pegangan resize
 * di pojok kanan-bawah; drag badan untuk pindah.
 */
import { useCallback, useEffect, useRef, useState } from "react";
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
}: {
  clipId: string;
  boxW: number;
  boxH: number;
  logo: LogoState;
  onChange: (l: LogoState) => void;
}) {
  const [draft, setDraft] = useState<LogoState>(logo);
  const dragRef = useRef<{ mode: "move" | "resize"; px: number; py: number; cx: number; cy: number; scale: number } | null>(null);
  const [aktif, setAktif] = useState(false);
  const simpanTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setDraft(logo), [logo]);

  const simpan = useCallback(
    (l: LogoState) => {
      if (simpanTimer.current) clearTimeout(simpanTimer.current);
      simpanTimer.current = setTimeout(async () => {
        try {
          const token = await getAccessToken();
          const res = await fetch(`/api/logo/${clipId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ png_b64: "", cx: l.cx, cy: l.cy, scale: l.scale }),
          });
          if (!res.ok) {
            // backend butuh png_b64; posisi update pakai endpoint ringkas
            const res2 = await fetch(`/api/logo/${clipId}/pos`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({ cx: l.cx, cy: l.cy, scale: l.scale }),
            });
            if (!res2.ok) throw new Error("gagal");
          }
        } catch {
          toast.error("Posisi logo gagal tersimpan");
        }
      }, 700);
    },
    [clipId],
  );

  const onPointerDown = (mode: "move" | "resize") => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setAktif(true);
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
      const cx = Math.max(0.04, Math.min(0.96, d.cx + dx));
      const cy = Math.max(0.04, Math.min(0.96, d.cy + dy));
      setDraft((s) => ({ ...s, cx, cy }));
    } else {
      const pertumbuhan = dx + dy;
      const scale = Math.max(0.05, Math.min(1.0, d.scale + pertumbuhan));
      setDraft((s) => ({ ...s, scale }));
    }
  };

  const onPointerUp = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setAktif(false);
    onChange(draft);
    simpan(draft);
  };

  const w = boxW * draft.scale;

  return (
    <div
      className="absolute z-25 touch-none select-none"
      style={{
        left: `${draft.cx * 100}%`,
        top: `${draft.cy * 100}%`,
        width: w,
        transform: "translate(-50%, -50%)",
      }}
      onPointerDown={onPointerDown("move")}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="relative">
        <img
          src={draft.url}
          alt="Logo"
          draggable={false}
          className="w-full cursor-move object-contain"
          style={{ pointerEvents: "none" }}
        />
        {aktif ? (
          <>
            <span className="pointer-events-none absolute -inset-1.5 rounded-md border-2 border-dashed border-white/90" />
            <button
              type="button"
              onPointerDown={onPointerDown("resize")}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              aria-label="Ubah ukuran logo"
              className="absolute -bottom-2 -right-2 grid size-5 cursor-nwse-resize place-items-center rounded-full border-2 border-white bg-accent"
            >
              <span className="size-1 rounded-full bg-white" />
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
