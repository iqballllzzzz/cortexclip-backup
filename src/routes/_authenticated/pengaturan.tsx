/**
 * Halaman PENGATURAN — profil (foto, username), ganti kata sandi (2x),
 * bahasa (22 pilihan). Permintaan pengguna: "tombol pengaturan yang disitu
 * bisa atur foto profil akun, username akun, ubah password dengan memasukkan
 * password yang baru dua kali, terus ada juga ubah bahasa".
 *
 * Foto disimpan ke Supabase Storage (bucket video-uploads, folder
 * {userId}/profil/avatar.jpg), username ke profiles.display_name,
 * kata sandi lewat supabase.auth.updateUser.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, Languages, LockKeyhole, UserRound } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useI18n, BAHASA, type KodeBahasa } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/pengaturan")({
  component: HalamanPengaturan,
});

function HalamanPengaturan() {
  const { t, lang, setLang, } = useI18n();
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [username, setUsername] = useState<string>("");
  const [avatarUrl, setAvatarUrl] = useState<string>("");
  const [sandi1, setSandi1] = useState("");
  const [sandi2, setSandi2] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      if (!u) return;
      setUserId(u.id);
      setEmail(u.email ?? "");
      void supabase
        .from("profiles")
        .select("display_name, avatar_url")
        .eq("id", u.id)
        .single()
        .then(({ data: prof }: { data: { display_name: string | null; avatar_url: string | null } | null }) => {
          if (prof) {
            setUsername(prof.display_name ?? "");
            setAvatarUrl(prof.avatar_url ?? "");
          }
        });
    });
  }, []);

  async function simpanProfil() {
    setSibuk(true);
    try {
      const pembaruan: { display_name?: string; avatar_url?: string } = {};
      if (username.trim()) pembaruan.display_name = username.trim();
      const { error } = await supabase
        .from("profiles")
        .update(pembaruan)
        .eq("id", userId);
      if (error) throw error;
      toast.success(t("set.tersimpan"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("umum.gagal"));
    } finally {
      setSibuk(false);
    }
  }

  async function pilihFoto(file: File) {
    if (!userId) return;
    setSibuk(true);
    try {
      const jalur = `${userId}/profil/avatar-${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("video-uploads")
        .upload(jalur, file, { contentType: file.type, upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage
        .from("video-uploads")
        .getPublicUrl(jalur);
      const url = pub.publicUrl;
      const { error: dbErr } = await supabase
        .from("profiles")
        .update({ avatar_url: url })
        .eq("id", userId);
      if (dbErr) throw dbErr;
      setAvatarUrl(url);
      toast.success(t("set.tersimpan"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("umum.gagal"));
    } finally {
      setSibuk(false);
    }
  }

  async function gantiSandi() {
    if (sandi1.length < 8) {
      toast.error(t("set.sandi_pendek"));
      return;
    }
    if (sandi1 !== sandi2) {
      toast.error(t("set.sandi_tidak_sama"));
      return;
    }
    setSibuk(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: sandi1 });
      if (error) throw error;
      toast.success(t("set.sandi_berhasil"));
      setSandi1("");
      setSandi2("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("set.sandi_salah"));
    } finally {
      setSibuk(false);
    }
  }

  const inisial = (username || email || "?").charAt(0).toUpperCase();

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-6">
      <button
        type="button"
        onClick={() => window.history.back()}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> {t("umum.kembali")}
      </button>

      <h1 className="mt-3 font-display text-2xl font-bold tracking-tight">
        {t("set.judul")}
      </h1>

      {/* ===== PROFIL ===== */}
      <section className="mt-6 rounded-2xl border border-border bg-card p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <UserRound className="size-4 text-accent" /> {t("set.profil")}
        </h2>

        <div className="mt-4 flex items-center gap-4">
          <Avatar className="size-16 border border-border">
            {avatarUrl ? (
              <AvatarImage src={avatarUrl} alt={username || email} />
            ) : null}
            <AvatarFallback className="font-display text-lg font-bold">
              {inisial}
            </AvatarFallback>
          </Avatar>
          <div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void pilihFoto(f);
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={sibuk}
              onClick={() => fileRef.current?.click()}
            >
              {t("set.unggah_foto")}
            </Button>
            <p className="mt-1.5 text-xs text-muted-foreground">{email}</p>
          </div>
        </div>

        <div className="mt-4 space-y-1.5">
          <Label htmlFor="username">{t("set.username")}</Label>
          <Input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={t("set.username")}
          />
          <p className="text-xs text-muted-foreground">{t("set.username_bantuan")}</p>
        </div>

        <Button
          type="button"
          className="mt-4"
          disabled={sibuk}
          onClick={() => void simpanProfil()}
        >
          {t("umum.simpan")}
        </Button>
      </section>

      {/* ===== SANDI ===== */}
      <section className="mt-4 rounded-2xl border border-border bg-card p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <LockKeyhole className="size-4 text-accent" /> {t("set.ganti_sandi")}
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="sandi1">{t("set.sandi_baru")}</Label>
            <Input
              id="sandi1"
              type="password"
              value={sandi1}
              onChange={(e) => setSandi1(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sandi2">{t("set.sandi_konfirmasi")}</Label>
            <Input
              id="sandi2"
              type="password"
              value={sandi2}
              onChange={(e) => setSandi2(e.target.value)}
            />
          </div>
        </div>
        <Button
          type="button"
          className="mt-4"
          disabled={sibuk || !sandi1 || !sandi2}
          onClick={() => void gantiSandi()}
        >
          <Check className="size-4" /> {t("set.ganti_sandi")}
        </Button>
      </section>

      {/* ===== BAHASA ===== */}
      <section className="mt-4 rounded-2xl border border-border bg-card p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Languages className="size-4 text-accent" /> {t("set.bahasa")}
        </h2>
        <div className="mt-4 max-w-xs">
          <Select value={lang} onValueChange={(v) => setLang(v as KodeBahasa)}>
            <SelectTrigger aria-label={t("set.bahasa")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {BAHASA.map((b) => (
                <SelectItem key={b.kode} value={b.kode}>
                  {b.asli} — {b.nama}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("set.bahasa_bantuan")}
          </p>
        </div>
      </section>
    </div>
  );
}
