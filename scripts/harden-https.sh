#!/usr/bin/env bash
# Tambah header keamanan + upgrade-insecure-requests ke blok HTTPS nginx.
#
# Kenapa: Chrome melaporkan "koneksi tidak aman" karena mixed content. Semua
# sumber daya kami sendiri sudah https (dibuktikan lewat Chrome DevTools
# Protocol: 0 permintaan http:// pada landing, /docs, /auth, /dashboard,
# /editor). Sisa risikonya adalah URL http:// yang MASUK dari data lama
# (preview_url domain lama, katalog b-roll, tempel-an user).
#
# `upgrade-insecure-requests` membuat browser MENAIKKAN setiap permintaan
# http:// pada halaman kita menjadi https:// sebelum dikirim — jadi mixed
# content tidak mungkin terjadi lagi, apa pun isi datanya.
#
# HSTS ditambahkan juga supaya kunjungan berikutnya langsung https.
set -eu

CONF=/etc/nginx/sites-available/cortexclip
STAMP=$(date +%Y%m%d-%H%M%S)
cp "$CONF" "${CONF}.bak-${STAMP}"
echo "backup: ${CONF}.bak-${STAMP}"

if grep -q "upgrade-insecure-requests" "$CONF"; then
  echo "header sudah ada — dilewati"
else
  # sisipkan setelah baris ssl_dhparam (di dalam blok server HTTPS)
  python3 - "$CONF" <<'PY'
import sys
p = sys.argv[1]
lines = open(p).read().split("\n")
out = []
done = False
for ln in lines:
    out.append(ln)
    if not done and "ssl_dhparam" in ln:
        out += [
            "",
            "    # Anti mixed content: browser menaikkan setiap permintaan http://",
            "    # pada halaman ini menjadi https:// sebelum dikirim.",
            '    add_header Content-Security-Policy "upgrade-insecure-requests" always;',
            "    # Kunjungan berikutnya langsung https (termasuk subdomain).",
            '    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;',
            '    add_header X-Content-Type-Options "nosniff" always;',
            '    add_header Referrer-Policy "strict-origin-when-cross-origin" always;',
        ]
        done = True
open(p, "w").write("\n".join(out))
print("header disisipkan" if done else "GAGAL: ssl_dhparam tidak ditemukan")
PY
fi

nginx -t
systemctl reload nginx
echo "nginx dimuat ulang"
