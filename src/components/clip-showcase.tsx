import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay, EffectCoverflow, Pagination } from "swiper/modules";
import "swiper/css";
import "swiper/css/pagination";
import "swiper/css/effect-coverflow";

import { CaptionPreview, defaultCaptionStyle } from "@/components/caption-preview";
import { demoClips } from "@/data/demo-clips";
import { Badge } from "@/components/ui/badge";
import { motion } from "motion/react";
import { Flame, Sparkles } from "lucide-react";

export function ClipShowcase() {
  return (
    <section className="relative mx-auto max-w-6xl px-5 py-24">
      <div className="pointer-events-none absolute left-1/2 top-1/3 size-96 -translate-x-1/2 rounded-full bg-accent/5 blur-3xl" aria-hidden="true" />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.5 }}
        className="max-w-2xl"
      >
        <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-accent">
          <Sparkles className="size-3.5" /> Hasil
        </p>
        <h2 className="mt-3 text-3xl font-bold sm:text-4xl">
          Setiap klip datang lengkap <span className="text-gradient-amber">dengan metadata.</span>
        </h2>
        <p className="mt-3 text-muted-foreground">
          Judul, deskripsi, hashtag, rentang waktu asal, dan alasan kenapa AI memilih momen itu.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ duration: 0.6 }}
        className="mt-10"
      >
        <Swiper
          modules={[Autoplay, Pagination, EffectCoverflow]}
          effect="coverflow"
          grabCursor
          centeredSlides
          slidesPerView={1.15}
          spaceBetween={16}
          loop
          autoplay={{ delay: 4200, disableOnInteraction: false }}
          pagination={{ clickable: true }}
          coverflowEffect={{ rotate: 0, stretch: 0, depth: 120, modifier: 2, slideShadows: false }}
          breakpoints={{ 640: { slidesPerView: 2.1 }, 1024: { slidesPerView: 3 } }}
          className="!pb-12"
        >
          {[...demoClips, ...demoClips].map((clip, i) => (
            <SwiperSlide key={`${clip.id}-${i}`}>
              <article className="group relative overflow-hidden rounded-2xl border border-border bg-card p-3 card-hover-lift">
                <CaptionPreview clip={clip} style={defaultCaptionStyle} />
                <div className="p-2 pt-3">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="secondary" className="text-[10px]">
                      {clip.range}
                    </Badge>
                    <span className="flex items-center gap-1 font-display text-sm font-bold text-gradient-amber">
                      <Flame className="size-3.5" /> {clip.score}/100
                    </span>
                  </div>
                  <h3 className="mt-2 text-sm font-semibold">{clip.title}</h3>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {clip.description}
                  </p>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    {clip.hashtags.join(" ")}
                  </p>
                </div>
              </article>
            </SwiperSlide>
          ))}
        </Swiper>
      </motion.div>
    </section>
  );
}