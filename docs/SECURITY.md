# SECURITY — Coffeeshop Order System

Dokumen keputusan keamanan yang mengikat. Sumber temuan: `AUDIT-REPORT-KEAMANAN.md`.
Status perbaikan per temuan dicatat di bagian "Status Perbaikan" laporan tersebut.

## Keputusan & Risiko yang Diterima

- **SEC-01 (2026-11-20).** Akun Super Admin yang sudah ada sebelum migrasi tidak otomatis diberi
  `mustChangePassword=true`; seeder hanya menandai akun baru. Operator wajib mengganti password akun
  lama secara manual (endpoint `POST /api/auth/change-password` atau reset oleh admin).
- **SEC-02/SEC-07 (2026-11-20).** Rotasi `SESSION_SECRET` membatalkan seluruh sesi aktif (JWT lama
  tidak lagi valid) — diterima sebagai efek yang diinginkan. `CRON_SECRET` baru harus disinkronkan
  ke penjadwal (Vercel Cron / cron-job.org) sebelum rotasi.
- **SEC-07 (2026-11-20).** Perbandingan token memakai HMAC-SHA256 dengan kunci acak per proses.
  Artinya token tidak bisa dibandingkan lintas proses; semua verifikasi tetap di proses yang sama.
- **SEC-05 (2026-11-20).** Langganan `private-table-<token>` tidak diberi masa berlaku. Token meja
  tercetak di QR dan dipakai berulang oleh pelanggan yang sah, sehingga expiry akan memutus alur
  normal. Mitigasi: rate limit per IP/user, pemeriksaan meja aktif setiap auth, dan payload event
  meja dibatasi ke `productId` + `available` (tanpa stok pasti, pesanan, atau data internal).
- **SEC-09 (2026-11-20).** Token akses pesanan disimpan sebagai SHA-256 (`accessTokenHash`). Pesanan
  lama memakai fallback plaintext sampai backfill selesai. Rencana contract (belum dieksekusi):
  1. Deploy migrasi expand `20261120140000_order_access_token_hash`.
  2. Jalankan `npx tsx scripts/backfill-access-token-hash.ts`; pastikan 0 kandidat tersisa.
  3. Tunggu satu siklus deploy dengan kode fallback.
  4. Pindahkan `prisma/migrations-pending/20261201000000_order_drop_access_token/migration.sql`
     ke `prisma/migrations/`, hapus field `accessToken` dari `schema.prisma` dan cabang plaintext
     di `accessTokenMatches()`, lalu `npx prisma migrate deploy`.
  5. Token akses baru diturunkan dari `Idempotency-Key` + `SESSION_SECRET`; rotasi
     `SESSION_SECRET` membuat replay idempotensi lama mengembalikan token yang tidak cocok.

- **SEC-04 (2026-11-20).** CSP dibuat di `src/proxy.ts` dengan nonce per permintaan dan
  `script-src 'strict-dynamic'` tanpa `'unsafe-inline'`. Origin R2 dibatasi dari env
  (`R2_PUBLIC_BASE_URL` + `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`), bukan wildcard.
  `style-src 'unsafe-inline'` diterima karena Tailwind/Recharts/komponen UI menulis style inline.
  **Status: Report-Only secara default.** Dengan Cache Components, shell halaman PPR
  (`/order/[code]`, `/cashier/orders/[id]`, dll.) diprerender saat build sehingga skripnya
  tidak bisa membawa nonce per permintaan; `'strict-dynamic'` akan memblokir skrip tersebut.
  `CSP_ENFORCE=true` menyalakan penegakan (hanya aman setelah prerender statis/PPR dimatikan
  atau nonce bisa diterapkan ke shell). `CSP_REPORT_ONLY=true` memaksa Report-Only walau
  enforcement aktif. `/api/cron` tanpa Origin tetap diizinkan, dan redirect dini dari proxy
  tidak membawa header CSP karena tidak merender HTML.

- **SEC-10 (2026-11-20).** `R2_BUCKET_PRIVATE` wajib berbeda dari `R2_BUCKET_PUBLIC`.
  `GET /api/health` menguji objek probe tanpa tanda tangan ke endpoint storage privat;
  status 403/404 = lulus, status lain = gagal, error jaringan = `skipped`.
  Bila CI/staging tidak punya akses keluar, jalankan manual:
  `curl -I https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com/<R2_BUCKET_PRIVATE>/probe`
  dan pastikan 403/404.

- **SEC-13 (2026-11-20).** `TRUSTED_PROXY` wajib diisi eksplisit saat `NODE_ENV=production`
  (`vercel`/`cloudflare`/`none`/jumlah hop); startup gagal bila kosong agar IP klien tidak
  salah dipetakan. Bila IP tetap tidak terdeteksi, `getClientIp` memakai bucket fallback
  `unknown:<hash(user-agent + accept-language)>` alih-alih satu bucket global, dan
  `GET /api/health` melaporkan `unknownIpRequests` + peringatan. Set platform dengan benar:
  Vercel `vercel`, Cloudflare `cloudflare`, reverse proxy sendiri = jumlah hop.

- **SEC-12 (2026-11-20).** `npm audit` dan `npm audit --omit=dev` sama-sama melaporkan
  0 kerentanan. `vitest` 5.1.1 (menambal tinypool), `@types/node` 26, `shadcn` dipindah ke
  devDependencies (CLI saja; tidak ada impor runtime), dan override `effect` 3.22.5 +
  `minimatch` 11.0.9 untuk rantai bawaan Prisma/ts-morph. CI memblokir high runtime lewat
  `npm audit --omit=dev --audit-level=high`; job terjadwal mingguan menjalankan audit penuh
  (informatif, `continue-on-error`). **Tinjau ulang: 2027-02-20** — atau lebih cepat bila
  advisory baru menyentuh rantai Prisma/Next. Bila sisa moderate dev-only muncul kembali,
  terima hanya untuk rantai tooling yang tidak dieksekusi di produksi dan catat di sini.

- **SEC-14 (2026-11-20).** Cookie sesi production bernama `__Host-session_token` (Secure,
  `Path=/`, tanpa Domain, httpOnly, `SameSite=Lax`); development/test memakai
  `session_token` karena prefix `__Host-` mensyaratkan HTTPS. Nama cookie adalah satu
  fungsi di `src/lib/session-cookie.ts` dan dipakai proxy, auth, serta tes. **Deploy yang
  mengganti nama cookie akan me-logout semua pengguna** (cookie lama dihapus saat logout).
  Logout tetap stateless: tidak menaikkan `tokenVersion` agar perangkat lain tidak
  terputus. Risiko diterima: JWT yang dicuri tetap valid sampai `exp` (12 jam); mitigasi =
  nonaktifkan kasir/admin atau reset password (menaikkan `tokenVersion` dan memutus semua
  sesi), plus rotasi `SESSION_SECRET` bila perlu.

- **SEC-15 (2026-11-20).** `readJson` membatasi body JSON secara streaming
  (default 256 KB, checkout publik 64 KB). Content-Length yang lebih besar ditolak lebih awal,
  tetapi penghitung byte saat stream tetap menegakkan batas bila header dipalsukan; pelanggaran
  menghasilkan `413 PAYLOAD_TOO_LARGE`. Upload multipart juga memakai penghitung byte streaming
  (`readFormData`, 12 MB) sehingga Content-Length palsu tidak bisa memicu buffer besar; validasi
  ukuran file 10 MB tetap di `src/lib/image.ts`.

- **SEC-16 (2026-11-20).** Aturan `Cache-Control` terpusat di `next.config.ts`:
  `private, no-store` untuk `/api/admin/*`, `/api/cashier/*`, `/api/public/orders/*`,
  `/api/auth/*`, `/api/upload/*`, dan `/api/pusher/auth`. `/api/public/menu` memakai `no-store`
  karena stok/ketersediaan berubah realtime; caching pendek akan menampilkan menu basi. Tes
  `tests/cache-control.test.ts` memindai route handler pada kelompok tersebut agar route baru
  tidak lolos tanpa header.
