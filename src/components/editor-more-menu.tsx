"use client";
/**
 * Tombol titik-tiga DI KANAN PREVIEW (di luar kotak video — sesuai
 * permintaan: "kasih tombol titik tiga di kanan nya preview alias
 * diluar preview"). Ditekan → memunculkan sheet 3 tombol:
 *   1. Manual Tracking  — klik subjek, AI mengikuti geraknya (scene)
 *   2. Edit Transkrip    — perbaiki kata yang salah baca STT
 *   3. Add Custom Logo  — logo brand (PREMIUM), drag di preview
 */
import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Crosshair, FileText, ImageIcon, MoreVertical, X } from "lucide-react";

export type MoreAction = "manual-track" | "edit-transkrip" | "custom-logo";

export function EditorMoreMenu({ onAction }: { onAction: (a: MoreAction) => void }) {
  const [open, setOpen] = useState(false);

  const items: { id: MoreAction; label: string; Icon: typeof Crosshair; premium?: boolean }[] = [
    { id: "manual-track", label: "Manual Tracking", Icon: Crosshair },
    { id: "edit-transkrip", label: "Edit Transkrip", Icon: FileText },
    { id: "custom-logo", label: "Add Custom Logo", Icon: ImageIcon, premium: true },
  ];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Menu lanjutan"
        aria-expanded={open}
        className="grid size-9 place-items-center rounded-xl border border-border bg-card text-foreground transition-colors hover:border-accent/60 hover:text-accent active:scale-95"
      >
        {open ? <X className="size-4" /> : <MoreVertical className="size-4" />}
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="absolute right-0 top-11 z-30 w-52 overflow-hidden rounded-2xl border border-border bg-card shadow-xl shadow-black/25"
          >
            {items.map((it) => (
              <button
                key={it.id}
                type="button"
                onClick={() => {
                  setOpen(false);
                  onAction(it.id);
                }}
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-medium transition-colors hover:bg-surface"
              >
                <it.Icon className="size-4 shrink-0 text-accent" />
                <span className="min-w-0 flex-1 truncate">{it.label}</span>
                {it.premium ? (
                  <span className="shrink-0 rounded-full bg-accent/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-accent">
                    Premium
                  </span>
                ) : null}
              </button>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
