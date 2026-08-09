import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "motion/react";
import { Download, Pause, Play, Shapes, Type } from "lucide-react";

import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import {
  CaptionPreview,
  defaultCaptionStyle,
  type CaptionStyle,
} from "@/components/caption-preview";
import { captionPresets, demoClips } from "@/data/demo-clips";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

const title = "Caption Studio — CortexClip";
const description =
  "Atur gaya caption karaoke CortexClip secara langsung: warna, ukuran, jumlah kata per baris, posisi, dan overlay ikon otomatis.";

export const Route = createFileRoute("/studio")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Studio,
});

function Studio() {
  const [clipIndex, setClipIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [style, setStyle] = useState<CaptionStyle>(defaultCaptionStyle);
  const clip = demoClips[clipIndex]!;

  const set = <K extends keyof CaptionStyle>(key: K, value: CaptionStyle[K]) =>
    setStyle((s) => ({ ...s, [key]: value }));

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-5 py-12">
        <header className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
            Caption Studio
          </p>
          <h1 className="mt-3 text-3xl font-bold sm:text-4xl">
            Rancang gaya caption karaoke kamu.
          </h1>
          <p className="mt-3 text-muted-foreground">
            Semua perubahan langsung terlihat di pratinjau 9:16. Simpan sebagai brand kit supaya
            setiap render berikutnya otomatis memakai gaya yang sama.
          </p>
        </header>

        <div className="mt-10 grid gap-8 lg:grid-cols-[340px_1fr]">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mx-auto w-full max-w-[320px] lg:sticky lg:top-24 lg:self-start"
          >
            <CaptionPreview clip={clip} style={style} playing={playing} className="shadow-lift" />
            <div className="mt-3 flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPlaying((p) => !p)}
                className="flex-1"
              >
                {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
                {playing ? "Jeda" : "Putar"}
              </Button>
              <Button
                variant="accent"
                size="sm"
                className="flex-1"
                onClick={() => toast.success("Preset caption disimpan ke brand kit.")}
              >
                <Download className="size-4" /> Simpan preset
              </Button>
            </div>
          </motion.div>

          <div className="space-y-8">
            <section>
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Type className="size-4 text-accent" /> Klip
              </h2>
              <Tabs
                value={String(clipIndex)}
                onValueChange={(v) => setClipIndex(Number(v))}
                className="mt-3"
              >
                <TabsList className="w-full">
                  {demoClips.map((c, i) => (
                    <TabsTrigger key={c.id} value={String(i)} className="flex-1 text-xs">
                      Klip {i + 1}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              <div className="mt-4 rounded-2xl border border-border bg-card p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{clip.range}</Badge>
                  <Badge variant="secondary">{clip.hook}</Badge>
                  <span className="ml-auto font-display text-lg font-bold text-accent">
                    {clip.score}/100
                  </span>
                </div>
                <h3 className="mt-3 font-semibold">{clip.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{clip.description}</p>
                <p className="mt-2 text-xs text-muted-foreground">{clip.hashtags.join("  ")}</p>
              </div>
            </section>

            <section>
              <h2 className="text-sm font-semibold">Preset gaya</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {captionPresets.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setStyle((s) => ({ ...s, accent: p.accent, base: p.base }))}
                    className={
                      style.accent === p.accent
                        ? "flex items-center gap-2 rounded-full border-2 border-accent bg-card px-3 py-1.5 text-xs font-medium"
                        : "flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                    }
                  >
                    <span
                      className="size-3 rounded-full border border-border"
                      style={{ backgroundColor: p.accent }}
                    />
                    {p.label}
                  </button>
                ))}
              </div>
            </section>

            <section className="grid gap-6 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Ukuran teks · {style.fontSize}px</Label>
                <Slider
                  className="mt-3"
                  min={18}
                  max={48}
                  step={1}
                  value={[style.fontSize]}
                  onValueChange={([v]) => set("fontSize", v!)}
                />
              </div>
              <div>
                <Label className="text-xs">Kata per baris · {style.wordsPerLine}</Label>
                <Slider
                  className="mt-3"
                  min={1}
                  max={5}
                  step={1}
                  value={[style.wordsPerLine]}
                  onValueChange={([v]) => set("wordsPerLine", v!)}
                />
              </div>
              <div>
                <Label className="text-xs">Posisi vertikal · {style.position}%</Label>
                <Slider
                  className="mt-3"
                  min={35}
                  max={80}
                  step={1}
                  value={[style.position]}
                  onValueChange={([v]) => set("position", v!)}
                />
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="stroke" className="text-xs">
                    Garis tepi hitam
                  </Label>
                  <Switch
                    id="stroke"
                    checked={style.stroke}
                    onCheckedChange={(v) => set("stroke", v)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="overlays" className="flex items-center gap-1.5 text-xs">
                    <Shapes className="size-3.5" /> Overlay ikon
                  </Label>
                  <Switch
                    id="overlays"
                    checked={style.showOverlays}
                    onCheckedChange={(v) => set("showOverlays", v)}
                  />
                </div>
              </div>
            </section>

            <p className="text-xs text-muted-foreground">
              Pratinjau ini memakai transkrip contoh dengan timestamp per kata — struktur data yang
              sama dipakai mesin render untuk membakar caption ke video akhir.
            </p>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
