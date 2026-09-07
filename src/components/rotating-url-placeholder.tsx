import { useEffect, useState } from "react";
import { Youtube, Twitter, Music2, Instagram } from "lucide-react";

const PLATFORMS = [
  { label: "Tempel link YouTube Anda", icon: Youtube, color: "text-red-500" },
  { label: "Tempel link Twitter Anda", icon: Twitter, color: "text-sky-400" },
  { label: "Tempel link TikTok Anda", icon: Music2, color: "text-white" },
  { label: "Tempel link Instagram Anda", icon: Instagram, color: "text-pink-500" },
];

/**
 * Placeholder input yang berganti-ganti tiap 2.5 detik:
 * "Tempel link YouTube Anda → Twitter → TikTok → Instagram → …"
 */
export function RotatingUrlPlaceholder() {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % PLATFORMS.length), 2500);
    return () => clearInterval(t);
  }, []);

  const current = PLATFORMS[idx]!;
  const Icon = current.icon;

  return (
    <span className="flex min-w-0 items-center gap-1.5 text-foreground/50">
      <Icon className={`size-3.5 shrink-0 ${current.color}`} />
      <span className="truncate">{current.label}</span>
    </span>
  );
}