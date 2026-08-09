import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay, EffectCoverflow, Pagination } from "swiper/modules";
import "swiper/css";
import "swiper/css/pagination";
import "swiper/css/effect-coverflow";

import { CaptionPreview, defaultCaptionStyle } from "@/components/caption-preview";
import { demoClips } from "@/data/demo-clips";
import { Badge } from "@/components/ui/badge";

export function ClipShowcase() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-20">
      <div className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Hasil</p>
        <h2 className="mt-3 text-3xl font-bold sm:text-4xl">
          Setiap klip datang lengkap dengan metadata.
        </h2>
        <p className="mt-3 text-muted-foreground">
          Judul, deskripsi, hashtag, rentang waktu asal, dan alasan kenapa AI memilih momen itu.
        </p>
      </div>

      <div className="mt-10">
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
              <article className="rounded-2xl border border-border bg-card p-3">
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
      </div>
    </section>
  );
}
