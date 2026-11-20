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
