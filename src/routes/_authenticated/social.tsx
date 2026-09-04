import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft,
  Ban,
  Check,
  CircleAlert,
  Clock3,
  ExternalLink,
  Loader2,
  Send,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { AppNav } from "@/components/app-nav";
import { PageLoading } from "@/components/page-loading";
import { Button } from "@/components/ui/button";
import {
  socialCancel,
  socialClips,
  socialConnect,
  socialDisconnect,
  socialList,
  socialPlatforms,
  socialSchedule,
  type PlatformStatus,
  type PublishJob,
  type SocialAccount,
  type SocialClip,
  type SocialPlatform,
  type SocialProject,
} from "@/lib/social-api";

export const Route = createFileRoute("/_authenticated/social")({
  head: () => ({
    meta: [
      { title: "Social Auto Publishing — CortexClip" },
      {
        name: "description",
        content: "Sambungkan TikTok & YouTube, lalu jadwalkan klip tayang otomatis.",
      },
    ],
  }),
  component: SocialPage,
});

/* --------------------------------------------------------------- logo SVG */
/* Logo dibuat inline sebagai SVG, bukan emoji atau ikon generik: keduanya
   adalah merek yang harus dikenali seketika oleh pengguna. */

function LogoYouTube({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1C24 15.9 24 12 24 12s0-3.9-.5-5.8ZM9.5 15.6V8.4l6.3 3.6-6.3 3.6Z" />
    </svg>
  );
}

function LogoTikTok({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M16.6 5.8a5.4 5.4 0 0 1-1.2-3.3h-3.2v13a2.6 2.6 0 1 1-1.9-2.5V9.7a5.9 5.9 0 1 0 5 5.8V9.9a8.6 8.6 0 0 0 4.9 1.6V8.2a5.4 5.4 0 0 1-3.6-2.4Z" />
    </svg>
  );
}

const PLATFORM_META: Record<
  SocialPlatform,
  { nama: string; Logo: typeof LogoYouTube; catatan: string }
> = {
  youtube: {
    nama: "YouTube",
    Logo: LogoYouTube,
    catatan: "Tayang sebagai Shorts (video vertikal)",
  },
  tiktok: {
    nama: "TikTok",
    Logo: LogoTikTok,
    catatan: "Tayang di profil TikTok kamu",
  },
};

/* TikTok punya banyak jalur masuk; pengguna memilih yang dia pakai supaya tahu
   akun mana yang harus dipilih di layar TikTok nanti. */
const LOGIN_LABEL: Record<string, string> = {
  google: "Google",
  facebook: "Facebook",
  email: "Email & password",
  phone: "Nomor telepon",
  apple: "Apple",
  twitter: "X / Twitter",
};

const JAM_PILIHAN = [6, 7, 9, 11, 12, 15, 17, 18, 19, 20, 21, 22];

function jamLokal(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const JOB_TONE: Record<PublishJob["status"], { label: string; cls: string }> = {
  scheduled: { label: "Terjadwal", cls: "text-muted-foreground" },
  rendering: { label: "Menyiapkan video", cls: "text-accent" },
  uploading: { label: "Mengunggah", cls: "text-accent" },
  published: { label: "Sudah tayang", cls: "text-[var(--color-success)]" },
  failed: { label: "Gagal", cls: "text-destructive" },
  canceled: { label: "Dibatalkan", cls: "text-muted-foreground line-through" },
};

/* ------------------------------------------------------------------- page */

function SocialPage() {
  const { user } = Route.useRouteContext();

  const [loading, setLoading] = useState(true);
  const [platforms, setPlatforms] = useState<Record<SocialPlatform, PlatformStatus> | null>(null);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [jobs, setJobs] = useState<PublishJob[]>([]);

  // langkah 1: sambungkan
  const [pilihPlatform, setPilihPlatform] = useState<SocialPlatform | null>(null);
  const [namaProfil, setNamaProfil] = useState("");
  const [metodeLogin, setMetodeLogin] = useState("google");
  const [connecting, setConnecting] = useState(false);

  // langkah 2: pilih klip
  const [projects, setProjects] = useState<SocialProject[]>([]);
  const [clips, setClips] = useState<SocialClip[]>([]);
  const [pilihKlip, setPilihKlip] = useState<Set<string>>(new Set());
  const [pilihAkun, setPilihAkun] = useState<Set<string>>(new Set());

  // langkah 3: jadwal
  const [jamDipilih, setJamDipilih] = useState<Set<number>>(new Set());
  const [scheduling, setScheduling] = useState(false);
  const [hasil, setHasil] = useState<PublishJob[] | null>(null);

  const muat = useCallback(async () => {
    try {
      const [pf, ls] = await Promise.all([socialPlatforms(), socialList()]);
      setPlatforms(pf);
      setAccounts(ls.accounts);
      setJobs(ls.jobs);
      // akun tersambung dicentang otomatis — biasanya itu yang dimaksud
      setPilihAkun(
        new Set(ls.accounts.filter((a) => a.status === "connected").map((a) => a.id)),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal memuat data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void muat();
  }, [muat]);

  const tersambung = useMemo(
    () => accounts.filter((a) => a.status === "connected"),
    [accounts],
  );

  // muat proyek hanya setelah ada akun tersambung (layar berikutnya)
  useEffect(() => {
    if (tersambung.length === 0) return;
    socialClips()
      .then((d) => {
        setProjects(d.projects);
        setClips(d.clips);
      })
      .catch(() => {});
  }, [tersambung.length]);

  // tab OAuth mengirim postMessage saat selesai → muat ulang daftar akun
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      const d = e.data as { type?: string; ok?: boolean } | null;
      if (d && d.type === "cortexclip:social") {
        void muat();
        toast[d.ok ? "success" : "error"](
          d.ok ? "Akun sosial media tersambung." : "Koneksi gagal — coba lagi.",
        );
      }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [muat]);

  async function handleConnect() {
    if (!pilihPlatform) return;
    if (namaProfil.trim().length < 2) {
      toast.error("Tulis nama profil sosial media dulu.");
      return;
    }
    setConnecting(true);
    try {
      const r = await socialConnect(
        pilihPlatform,
        namaProfil.trim(),
        pilihPlatform === "tiktok" ? metodeLogin : undefined,
      );
      // dibuka di tab baru: OAuth tidak boleh di iframe, dan pengguna
      // tidak kehilangan halaman ini
      window.open(r.auth_url, "_blank", "noopener,width=520,height=680");
      toast.info("Selesaikan login di jendela yang terbuka.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal memulai koneksi");
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect(a: SocialAccount) {
    try {
      await socialDisconnect(a.id);
      toast.success(`${PLATFORM_META[a.platform].nama} diputuskan.`);
      void muat();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal memutuskan");
    }
  }

  async function handleSchedule() {
    if (pilihAkun.size === 0) {
      toast.error("Pilih minimal satu akun tujuan.");
      return;
    }
    if (pilihKlip.size === 0) {
      toast.error("Pilih minimal satu klip.");
      return;
    }
    setScheduling(true);
    try {
      const r = await socialSchedule(
        [...pilihAkun],
        [...pilihKlip],
        jamDipilih.size > 0 ? [...jamDipilih] : undefined,
      );
      setHasil(r.jobs);
      setPilihKlip(new Set());
      toast.success(`${r.dibuat} jadwal dibuat.`);
      void muat();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menjadwalkan");
    } finally {
      setScheduling(false);
    }
  }

  async function handleCancel(j: PublishJob) {
    try {
      await socialCancel(j.id);
      toast.success("Dibatalkan — tidak akan tayang.");
      void muat();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal membatalkan");
    }
  }

  function toggle<T>(set: Set<T>, v: T, setter: (s: Set<T>) => void) {
    const n = new Set(set);
    if (n.has(v)) n.delete(v);
    else n.add(v);
    setter(n);
  }

  const displayName = user.email?.split("@")[0] ?? "Creator";
  const klipPerProyek = useMemo(() => {
    const m = new Map<string, SocialClip[]>();
    for (const c of clips) {
      const arr = m.get(c.project_id) ?? [];
      arr.push(c);
      m.set(c.project_id, arr);
    }
    return m;
  }, [clips]);

  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      <AppNav displayName={displayName} themeToggle />

      <main className="mx-auto max-w-[900px] px-4 pb-28 pt-8 sm:px-6 sm:pt-10">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link to="/dashboard">
            <ArrowLeft className="size-4" /> Kembali ke dashboard
          </Link>
        </Button>

        <h1 className="mt-4 font-display text-[26px] font-bold leading-tight tracking-tight sm:text-[34px]">
          Social Auto Publishing
        </h1>
        <p className="mt-2 max-w-[52ch] text-[14px] leading-relaxed text-muted-foreground">
          Klip kamu tayang sendiri ke TikTok dan YouTube pada jadwal yang kamu atur. Judul,
          deskripsi, dan hashtag dibuat otomatis dari isi klip.
        </p>

        {loading ? (
          <PageLoading label="Memuat akun sosial" />
        ) : (
          <>
            {/* ═══ LANGKAH 1 — SAMBUNGKAN ═══ */}
            <section className="mt-9 border-t border-border pt-7">
              <h2 className="font-display text-lg font-bold tracking-tight">
                Sambungkan sosial media anda terlebih dahulu
              </h2>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                Bisa lebih dari satu — sambungkan YouTube dan TikTok sekaligus kalau mau.
              </p>

              {/* akun yang sudah tersambung */}
              {accounts.length > 0 ? (
                <ul className="mt-5 overflow-hidden rounded-2xl border border-border">
                  {accounts.map((a) => {
                    const M = PLATFORM_META[a.platform];
                    return (
                      <li
                        key={a.id}
                        className="flex items-center gap-3 border-b border-border bg-card px-4 py-3.5 last:border-0"
                      >
                        <M.Logo className="size-5 shrink-0 text-foreground" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[14px] font-semibold tracking-tight">
                            {a.account_name || a.profile_name}
                          </p>
                          <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                            {M.nama}
                            {a.status === "connected" ? (
                              <span className="text-[var(--color-success)]"> · tersambung</span>
                            ) : (
                              <span> · {a.status}</span>
                            )}
                            {a.login_method ? ` · via ${LOGIN_LABEL[a.login_method] ?? a.login_method}` : ""}
                          </p>
                          {a.error_message ? (
                            <p className="mt-1 flex items-start gap-1.5 text-[12px] leading-snug text-amber-600 dark:text-amber-400">
                              <CircleAlert className="mt-0.5 size-3 shrink-0" />
                              {a.error_message}
                            </p>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleDisconnect(a)}
                          className="shrink-0 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-surface hover:text-destructive"
                          aria-label={`Putuskan ${M.nama}`}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}

              {/* pilih platform */}
              <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
                {(["youtube", "tiktok"] as SocialPlatform[]).map((pf) => {
                  const M = PLATFORM_META[pf];
                  const st = platforms?.[pf];
                  const aktif = pilihPlatform === pf;
                  return (
                    <button
                      key={pf}
                      type="button"
                      aria-pressed={aktif}
                      onClick={() => setPilihPlatform(aktif ? null : pf)}
                      className={`flex items-center gap-3 rounded-2xl border px-4 py-4 text-left transition-colors ${
                        aktif
                          ? "border-accent bg-accent/8"
                          : "border-border bg-card hover:border-accent/45"
                      }`}
                    >
                      <M.Logo className="size-7 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-semibold tracking-tight">
                          {M.nama}
                        </span>
                        <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground">
                          {st && !st.siap ? "Belum aktif di server" : M.catatan}
                        </span>
                      </span>
                      {aktif ? <Check className="size-4 shrink-0 text-accent" /> : null}
                    </button>
                  );
                })}
              </div>

              {/* form nama profil + connect */}
              <AnimatePresence>
                {pilihPlatform ? (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="mt-4 rounded-2xl border border-border bg-card px-4 py-4 sm:px-5 sm:py-5">
                      <label className="block text-[13px] font-semibold tracking-tight">
                        Nama profil {PLATFORM_META[pilihPlatform].nama} kamu
                      </label>
                      <input
                        value={namaProfil}
                        onChange={(e) => setNamaProfil(e.target.value)}
                        placeholder={
                          pilihPlatform === "youtube" ? "Nama channel kamu" : "@username kamu"
                        }
                        className="mt-2 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-accent"
                      />

                      {pilihPlatform === "tiktok" ? (
                        <>
                          <p className="mt-4 text-[13px] font-semibold tracking-tight">
                            Kamu biasa login TikTok pakai apa?
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {(platforms?.tiktok.login_methods ?? Object.keys(LOGIN_LABEL)).map(
                              (m) => (
                                <button
                                  key={m}
                                  type="button"
                                  aria-pressed={metodeLogin === m}
                                  onClick={() => setMetodeLogin(m)}
                                  className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors ${
                                    metodeLogin === m
                                      ? "border-accent bg-accent/10 text-accent"
                                      : "border-border text-muted-foreground hover:border-accent/45"
                                  }`}
                                >
                                  {LOGIN_LABEL[m] ?? m}
                                </button>
                              ),
                            )}
                          </div>
                        </>
                      ) : null}

                      <Button
                        variant="accent"
                        disabled={connecting || !platforms?.[pilihPlatform]?.siap}
                        onClick={() => void handleConnect()}
                        className="mt-5 w-full whitespace-nowrap"
                      >
                        {connecting ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <ExternalLink className="size-4" />
                        )}
                        Connect
                      </Button>

                      <p className="mt-2.5 text-[12px] leading-relaxed text-muted-foreground">
                        Pilih akun yang sesuai dengan nama akun yang anda masukkan di atas, dan
                        yang mau dipakai untuk auto publish.
                      </p>

                      {platforms?.[pilihPlatform] && !platforms[pilihPlatform].siap ? (
                        <p className="mt-3 flex items-start gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/8 px-3 py-2.5 text-[12px] leading-relaxed text-amber-700 dark:text-amber-400">
                          <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                          {platforms[pilihPlatform].alasan}
                        </p>
                      ) : null}
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </section>

            {/* ═══ LANGKAH 2 & 3 — hanya setelah ada akun tersambung ═══ */}
            {tersambung.length > 0 ? (
              <>
                <section className="mt-10 border-t border-border pt-7">
                  <h2 className="font-display text-lg font-bold tracking-tight">
                    Pilih proyek yang mau di-auto publish
                  </h2>
                  <p className="mt-1.5 text-[13px] text-muted-foreground">
                    Satu per satu, atau langsung semuanya per proyek.
                  </p>

                  {/* akun tujuan */}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {tersambung.map((a) => {
                      const M = PLATFORM_META[a.platform];
                      const on = pilihAkun.has(a.id);
                      return (
                        <button
                          key={a.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() => toggle(pilihAkun, a.id, setPilihAkun)}
                          className={`flex items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors ${
                            on
                              ? "border-accent bg-accent/10 text-accent"
                              : "border-border text-muted-foreground hover:border-accent/45"
                          }`}
                        >
                          <M.Logo className="size-3.5" />
                          {a.account_name || a.profile_name}
                        </button>
                      );
                    })}
                  </div>

                  {projects.length === 0 ? (
                    <p className="mt-5 rounded-2xl border border-dashed border-border px-5 py-10 text-center text-[13px] text-muted-foreground">
                      Belum ada proyek selesai. Buat klip dulu di dashboard.
                    </p>
                  ) : (
                    <div className="mt-5 space-y-3">
                      {projects.map((pr) => {
                        const ks = klipPerProyek.get(pr.id) ?? [];
                        if (ks.length === 0) return null;
                        const semuaOn = ks.every((c) => pilihKlip.has(c.id));
                        return (
                          <div
                            key={pr.id}
                            className="overflow-hidden rounded-2xl border border-border"
                          >
                            <div className="flex items-center gap-3 bg-surface/50 px-4 py-3">
                              <p className="min-w-0 flex-1 truncate text-[14px] font-semibold tracking-tight">
                                {pr.title}
                              </p>
                              <button
                                type="button"
                                onClick={() => {
                                  const n = new Set(pilihKlip);
                                  for (const c of ks) {
                                    if (semuaOn) n.delete(c.id);
                                    else n.add(c.id);
                                  }
                                  setPilihKlip(n);
                                }}
                                className="shrink-0 whitespace-nowrap text-[12px] font-semibold text-accent underline-offset-2 hover:underline"
                              >
                                {semuaOn ? "Kosongkan" : `Pilih semua (${ks.length})`}
                              </button>
                            </div>
                            <ul>
                              {ks.map((c) => {
                                const on = pilihKlip.has(c.id);
                                const dur = Math.round(c.end_time - c.start_time);
                                return (
                                  <li key={c.id} className="border-t border-border">
                                    <button
                                      type="button"
                                      aria-pressed={on}
                                      onClick={() => toggle(pilihKlip, c.id, setPilihKlip)}
                                      className="flex w-full items-center gap-3 bg-card px-4 py-3 text-left transition-colors hover:bg-surface/60"
                                    >
                                      <span
                                        className={`grid size-5 shrink-0 place-items-center rounded-md border transition-colors ${
                                          on
                                            ? "border-accent bg-accent text-accent-foreground"
                                            : "border-border"
                                        }`}
                                      >
                                        {on ? <Check className="size-3.5" /> : null}
                                      </span>
                                      <span className="min-w-0 flex-1">
                                        <span className="block truncate text-[13px] font-medium">
                                          {c.title || `Klip ${dur}s`}
                                        </span>
                                        <span className="mt-0.5 block text-[11px] text-muted-foreground">
                                          {dur}s
                                          {c.rendered_url ? " · sudah dirender" : " · dirender saat tayang"}
                                        </span>
                                      </span>
                                    </button>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                {/* ═══ JADWAL ═══ */}
                {pilihKlip.size > 0 ? (
                  <section className="mt-10 border-t border-border pt-7">
                    <h2 className="font-display text-lg font-bold tracking-tight">
                      Atur jadwal publish
                      <span className="ml-2 text-[13px] font-medium text-muted-foreground">
                        opsional
                      </span>
                    </h2>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                      Pilih jam yang kamu mau. Kalau dibiarkan kosong, sistem menyebar sendiri ke
                      jam-jam ramai penonton.
                    </p>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {JAM_PILIHAN.map((j) => {
                        const on = jamDipilih.has(j);
                        return (
                          <button
                            key={j}
                            type="button"
                            aria-pressed={on}
                            onClick={() => toggle(jamDipilih, j, setJamDipilih)}
                            className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-[12px] font-semibold tabular-nums transition-colors ${
                              on
                                ? "border-accent bg-accent/10 text-accent"
                                : "border-border text-muted-foreground hover:border-accent/45"
                            }`}
                          >
                            {String(j).padStart(2, "0")}:00
                          </button>
                        );
                      })}
                    </div>

                    <Button
                      variant="accent"
                      disabled={scheduling}
                      onClick={() => void handleSchedule()}
                      className="mt-5 whitespace-nowrap"
                    >
                      {scheduling ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Send className="size-4" />
                      )}
                      Setuju — jadwalkan {pilihKlip.size} klip
                    </Button>
                  </section>
                ) : null}

                {/* konfirmasi hasil */}
                <AnimatePresence>
                  {hasil && hasil.length > 0 ? (
                    <motion.section
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="mt-8 rounded-2xl border border-accent/30 bg-accent/6 px-5 py-5"
                    >
                      <p className="font-display text-[15px] font-bold tracking-tight">
                        Proyek anda akan otomatis ter-publish
                      </p>
                      <ul className="mt-3 space-y-1.5">
                        {hasil.slice(0, 8).map((j) => (
                          <li key={j.id} className="text-[13px] text-muted-foreground">
                            <span className="font-semibold text-foreground">
                              {PLATFORM_META[j.platform].nama}
                            </span>{" "}
                            · {jamLokal(j.scheduled_at)} — {j.title}
                          </li>
                        ))}
                      </ul>
                      <div className="mt-4 flex gap-2.5">
                        <Button variant="outline" onClick={() => setHasil(null)}>
                          Tutup
                        </Button>
                        <Button variant="ghost" asChild>
                          <Link to="/dashboard">Kembali ke dashboard</Link>
                        </Button>
                      </div>
                    </motion.section>
                  ) : null}
                </AnimatePresence>
              </>
            ) : null}

            {/* ═══ DAFTAR TERJADWAL ═══ */}
            {jobs.length > 0 ? (
              <section className="mt-10 border-t border-border pt-7">
                <h2 className="font-display text-lg font-bold tracking-tight">
                  Proyek yang dipublish
                </h2>
                <ul className="mt-4 overflow-hidden rounded-2xl border border-border">
                  {jobs.map((j) => {
                    const M = PLATFORM_META[j.platform];
                    const tone = JOB_TONE[j.status];
                    const bisaBatal = j.status === "scheduled" || j.status === "failed";
                    return (
                      <li
                        key={j.id}
                        className="flex items-center gap-3 border-b border-border bg-card px-4 py-3.5 last:border-0"
                      >
                        <M.Logo className="size-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-semibold tracking-tight">
                            {j.title || "Klip"}
                          </p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-muted-foreground">
                            <span className={`font-medium ${tone.cls}`}>{tone.label}</span>
                            <span className="opacity-40">·</span>
                            <span className="inline-flex items-center gap-1 tabular-nums">
                              <Clock3 className="size-3" />
                              {jamLokal(j.scheduled_at)}
                            </span>
                            {j.remote_url ? (
                              <>
                                <span className="opacity-40">·</span>
                                <a
                                  href={j.remote_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="whitespace-nowrap font-semibold text-accent underline-offset-2 hover:underline"
                                >
                                  Lihat
                                </a>
                              </>
                            ) : null}
                          </p>
                          {j.error_message ? (
                            <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-destructive">
                              {j.error_message}
                            </p>
                          ) : null}
                        </div>
                        {bisaBatal ? (
                          <button
                            type="button"
                            onClick={() => void handleCancel(j)}
                            className="shrink-0 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-surface hover:text-destructive"
                            aria-label="Batal tayangkan"
                            title="Batal tayangkan"
                          >
                            <Ban className="size-4" />
                          </button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
