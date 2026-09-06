/**
 * Tabel kesehatan SEMUA model AI: berapa kali berhasil, berapa kali gagal.
 *
 * Kenapa komponen sendiri dan bukan menumpang `top_models`?
 *   `top_models` dihitung dari usage_log, yang mencatat satu baris per langkah
 *   pipeline dengan model PEMENANG failover. Model yang dicoba lalu gagal
 *   sebelum pemenang tidak pernah muncul di sana — padahal itu yang perlu
 *   dilihat admin. Data di sini berasal dari counter di dalam Hydra: setiap
 *   percobaan endpoint, sukses maupun gagal, ikut terhitung.
 */
import { useMemo, useState } from "react";
import { AlertTriangle, Check, Cpu, KeyRound, Loader2, Timer, X, Zap } from "lucide-react";

import { ujiSemuaModel, type ModelStat } from "@/lib/admin-api";
import { Button } from "@/components/ui/button";

function waktuRelatif(epoch: number): string {
  if (!epoch) return "belum pernah";
  const detik = Math.max(0, Math.floor(Date.now() / 1000 - epoch));
  if (detik < 60) return `${detik}s lalu`;
  if (detik < 3600) return `${Math.floor(detik / 60)}m lalu`;
  if (detik < 86400) return `${Math.floor(detik / 3600)}j lalu`;
  return `${Math.floor(detik / 86400)}h lalu`;
}

type Saring = "semua" | "terpakai" | "bermasalah" | "belum-aktif";

const SARINGAN: { id: Saring; label: string }[] = [
  { id: "semua", label: "Semua" },
  { id: "terpakai", label: "Pernah dipakai" },
  { id: "bermasalah", label: "Bermasalah" },
  { id: "belum-aktif", label: "Belum aktif" },
];

export function ModelHealthTable({
  data,
  onSelesaiUji,
}: {
  data: ModelStat[];
  /** dipanggil setelah uji selesai supaya halaman memuat ulang angkanya */
  onSelesaiUji?: () => void;
}) {
  const [saring, setSaring] = useState<Saring>("semua");
  const [menguji, setMenguji] = useState(false);
  const [hasilUji, setHasilUji] = useState<string | null>(null);

  async function jalankanUji() {
    setMenguji(true);
    setHasilUji(null);
    try {
      const r = await ujiSemuaModel();
      setHasilUji(
        `${r.hidup} hidup / ${r.mati} mati dari ${r.diuji} model diuji (${r.detik}s)`,
      );
      onSelesaiUji?.();
    } catch (e) {
      setHasilUji(e instanceof Error ? e.message : "Uji model gagal");
    } finally {
      setMenguji(false);
    }
  }

  const { baris, ringkas } = useMemo(() => {
    const total_ok = data.reduce((s, m) => s + m.ok_total, 0);
    const total_gagal = data.reduce((s, m) => s + m.fail_total, 0);
    const terpakai = data.filter((m) => m.total > 0).length;
    const siap = data.filter((m) => m.configured).length;

    let b = data;
    if (saring === "terpakai") b = data.filter((m) => m.total > 0);
    else if (saring === "bermasalah")
      b = data.filter((m) => m.fail_total > 0 || m.dead || m.cooldown_remaining > 0);
    else if (saring === "belum-aktif") b = data.filter((m) => !m.configured);

    return {
      baris: b,
      ringkas: { total_ok, total_gagal, terpakai, siap, semua: data.length },
    };
  }, [data, saring]);

  return (
    <div>
      {/* ringkasan angka besar */}
      <div className="flex flex-wrap gap-x-7 gap-y-3">
        {[
          ["Model terdaftar", String(ringkas.semua)],
          ["Siap dipakai", String(ringkas.siap)],
          ["Pernah dipakai", String(ringkas.terpakai)],
          ["Total berhasil", ringkas.total_ok.toLocaleString("id-ID")],
          ["Total gagal", ringkas.total_gagal.toLocaleString("id-ID")],
        ].map(([label, nilai]) => (
          <div key={label}>
            <p className="text-[11px] text-muted-foreground">{label}</p>
            <p className="mt-0.5 font-display text-lg font-bold tabular-nums">{nilai}</p>
          </div>
        ))}
      </div>

      {/* uji semua model — satu-satunya cara mengisi angka model cadangan,
          karena failover membuat model pertama nyaris selalu menang */}
      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <Button
          variant="outline"
          size="sm"
          className="rounded-full"
          onClick={() => void jalankanUji()}
          disabled={menguji}
        >
          {menguji ? <Loader2 className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />}
          {menguji ? "Menguji semua model…" : "Uji semua model"}
        </Button>
        {hasilUji ? (
          <span className="text-[12px] text-muted-foreground">{hasilUji}</span>
        ) : (
          <span className="text-[11.5px] text-muted-foreground">
            menembak 1 prompt kecil ke tiap model, hasilnya masuk hitungan di bawah
          </span>
        )}
      </div>

      {/* saringan */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {SARINGAN.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSaring(s.id)}
            className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors ${
              saring === s.id
                ? "bg-accent text-accent-foreground"
                : "border border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {baris.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          Tidak ada model pada saringan ini.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border overflow-hidden rounded-xl border border-border">
          {baris.map((m) => {
            const gagalTotal = m.total > 0 && m.ok_total === 0;
            const belumAktif = !m.configured;
            return (
              <li key={`${m.provider}/${m.model}`} className="bg-card px-3.5 py-2.5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <Cpu
                    className={`size-3.5 shrink-0 ${
                      gagalTotal
                        ? "text-destructive"
                        : belumAktif
                          ? "text-muted-foreground/50"
                          : "text-muted-foreground"
                    }`}
                  />
                  <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">
                    {m.provider}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[12px]" title={m.model}>
                    {m.model}
                  </span>

                  {/* SUKSES / GAGAL — inti panel ini */}
                  <span className="flex shrink-0 items-center gap-1 text-[12px] font-semibold tabular-nums text-[var(--color-success,#16a34a)]">
                    <Check className="size-3.5" />
                    {m.ok_total.toLocaleString("id-ID")}
                  </span>
                  <span
                    className={`flex shrink-0 items-center gap-1 text-[12px] font-semibold tabular-nums ${
                      m.fail_total > 0 ? "text-destructive" : "text-muted-foreground/60"
                    }`}
                  >
                    <X className="size-3.5" />
                    {m.fail_total.toLocaleString("id-ID")}
                  </span>

                  {m.ok_total > 0 ? (
                    <span className="flex shrink-0 items-center gap-1 text-[11.5px] text-muted-foreground tabular-nums">
                      <Timer className="size-3" />
                      {(m.avg_latency_ms / 1000).toFixed(1)}s
                    </span>
                  ) : null}

                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      belumAktif
                        ? "bg-muted text-muted-foreground"
                        : gagalTotal
                          ? "bg-destructive/12 text-destructive"
                          : m.dead
                            ? "bg-destructive/12 text-destructive"
                            : m.cooldown_remaining > 0
                              ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                              : m.total === 0
                                ? "bg-muted text-muted-foreground"
                                : m.reliability >= 95
                                  ? "bg-accent/12 text-accent"
                                  : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {belumAktif
                      ? "tanpa API key"
                      : gagalTotal
                        ? "GAGAL TOTAL"
                        : m.dead
                          ? "dimatikan"
                          : m.cooldown_remaining > 0
                            ? `jeda ${m.cooldown_remaining}s`
                            : m.total === 0
                              ? "siap, belum dipakai"
                              : `${m.reliability}%`}
                  </span>

                  {m.keys > 1 ? (
                    <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                      <KeyRound className="size-3" />
                      {m.keys}
                    </span>
                  ) : null}
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 pl-6 text-[11px] text-muted-foreground">
                  <span>berhasil terakhir: {waktuRelatif(m.last_ok_at)}</span>
                  {m.fail_total > 0 ? (
                    <span>gagal terakhir: {waktuRelatif(m.last_fail_at)}</span>
                  ) : null}
                </div>

                {m.last_error ? (
                  <p className="mt-1 flex items-start gap-1.5 break-words pl-6 font-mono text-[11px] leading-snug text-destructive/85">
                    <AlertTriangle className="mt-px size-3 shrink-0" />
                    <span className="min-w-0">{m.last_error.slice(0, 220)}</span>
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
