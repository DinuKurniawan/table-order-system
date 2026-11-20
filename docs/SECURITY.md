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
