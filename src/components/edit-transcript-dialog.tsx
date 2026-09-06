"use client";
/**
 * EDIT TRANSCRIP — perbaiki kata yang salah baca STT.
 *
 * Teks yang dikoreksi langsung dipakai subtitle karaoke (preview live
 * overlay) DAN render unduhan (backend memakai caption_words yang sama).
 * Waktu per kata tidak diubah — hanya teksnya — supaya sinkron karaoke
 * tetap presisi.
 */
import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { FileText, Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { getAccessToken } from "@/lib/backend-api";
import type { LiveWord } from "@/components/live-caption-overlay";

export function EditTranscriptDialog({
  clipId,
  words,
  onClose,
  onSaved,
}: {
  clipId: string;
  words: LiveWord[];
  onClose: () => void;
  onSaved: (words: LiveWord[]) => void;
}) {
  const [teks, setTeks] = useState<string[]>(
    () => words.map((w) => w.word),
  );
  const [saving, setSaving] = useState(false);

  const berubah = useMemo(
    () => teks.some((t, i) => t !== (words[i]?.word ?? "")),
    [teks, words],
  );

  async function simpan() {
    setSaving(true);
    try {
      const baru: LiveWord[] = teks.map((t, i) => ({
        word: t.trim() || words[i]?.word || "...",
        start: words[i]?.start ?? 0,
        end: words[i]?.end ?? 0,
      }));
      const token = await getAccessToken();
      const res = await fetch(`/api/clips/${clipId}/words`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ words: baru }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || "Gagal menyimpan transkrip");
      }
      onSaved(baru);
      toast.success(`Transkrip tersimpan — ${baru.length} kata`);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] grid place-items-center p-4">
      <motion.button
        aria-label="Tutup"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-foreground/40 backdrop-blur-[2px]"
      />
      <motion.div
        initial={{ y: 24, opacity: 0, scale: 0.98 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="relative flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-2xl"
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
          <FileText className="size-4 shrink-0 text-accent" />
          <p className="flex-1 truncate font-display text-sm font-bold tracking-tight">
            Edit Transkrip
          </p>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
            aria-label="Tutup"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
            Perbaiki kata yang tidak sama dengan yang diucapkan. Waktu tiap
            kata tidak berubah — sinkron karaoke tetap presisi.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {teks.map((t, i) => (
              <input
                key={i}
                value={t}
                onChange={(e) =>
                  setTeks((arr) => arr.map((v, j) => (j === i ? e.target.value : v)))
                }
                className="w-[86px] rounded-lg border border-border bg-background px-2 py-1.5 text-[12px] outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent/30"
                aria-label={`Kata ${i + 1}`}
              />
            ))}
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-border px-4 py-2 text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={!berubah || saving}
            onClick={() => void simpan()}
            className="flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-[12.5px] font-semibold text-accent-foreground transition-all hover:brightness-105 active:scale-95 disabled:opacity-50"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Simpan
          </button>
        </div>
      </motion.div>
    </div>
  );
}
