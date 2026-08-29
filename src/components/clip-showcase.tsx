import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay, Pagination } from "swiper/modules";
import "swiper/css";
import "swiper/css/pagination";

import { CaptionPreview, defaultCaptionStyle } from "@/components/caption-preview";
import { demoClips } from "@/data/demo-clips";
import { Badge } from "@/components/ui/badge";
import { motion } from "motion/react";

export function ClipShowcase() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-24">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="max-w-xl"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Hasil</p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
          Setiap klip datang dengan metadata.
        </h2>
        <p className="mt-3 text-muted-foreground">
          Judul, deskripsi, hashtag, dan alasan AI memilih momen itu.
        </p>
      </motion.div>

      <div className="mt-10">
        <Swiper
          modules={[Autoplay, Pagination]}
          grabCursor
          centeredSlides
          slidesPerView={1.15}
          spaceBetween={16}
          loop
          autoplay={{ delay: 4200, disableOnInteraction: false }}
          pagination={{ clickable: true }}
          breakpoints={{ 640: { slidesPerView: 2.2 }, 1024: { slidesPerView: 3 } }}
          className="!pb-10"
        >
          {[...demoClips, ...demoClips].map((clip, i) => (
            <SwiperSlide key={`${clip.id}-${i}`}>
              <article className="overflow-hidden rounded-3xl border border-border bg-card p-3 shadow-sm transition-shadow hover:shadow-md">
                <CaptionPreview clip={clip} style={defaultCaptionStyle} />
                <div className="p-2 pt-3">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="secondary" className="text-[10px]">
                      {clip.range}
                    </Badge>
                    <span className="font-display text-sm font-bold text-accent">
                      {clip.score}/100
                    </span>
                  </div>
                  <h3 className="mt-2 text-sm font-semibold tracking-tight">{clip.title}</h3>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {clip.description}
                  </p>
                </div>
              </article>
            </SwiperSlide>
          ))}
        </Swiper>
      </div>
    </section>
  );
}
