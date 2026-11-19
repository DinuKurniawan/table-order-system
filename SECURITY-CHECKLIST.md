# SECURITY-CHECKLIST

Tanggal audit: 19 November 2026
Lingkungan: Next.js 16.4.6, PostgreSQL (Prisma), Cloudflare R2, Pusher
Metode: audit kode + uji otomatis (`tests/security.test.ts`) + uji manual browser/HTTP

## Ringkasan hasil

| Area | Status | Bukti |
| --- | --- | --- |
| Otorisasi route & server action | Lulus | Semua route admin memakai `requireRole(["SUPER_ADMIN"])`; route kasir `requireRole(["CASHIER","SUPER_ADMIN"])`. Tidak ada server action. |
| Validasi input | Lulus | Zod pada login, checkout, akses pesanan, pembayaran, upload, keuangan, audit. Checkout membatasi panjang string, jumlah item (1–50), qty (1–100), dan menolak produk duplikat. |
| Kebocoran data sensitif | Lulus | `passwordHash` tidak pernah di-select pada DTO; `accessToken`/`proofKey` hanya untuk endpoint ber-guard; respons API diuji tidak memuat ketiganya. |
| Rate limit terdistribusi | Lulus | Tabel PostgreSQL `RateLimit` + upsert atomik. Login per IP+username (5/15 menit) dan per IP (20/15 menit); checkout 20/menit per IP + 10/menit per meja; menu 120/menit; akses pesanan 10/10 menit; bukti bayar 10/menit; upload admin 30/menit. |
| Security headers & CSP | Lulus | `next.config.ts` memasang CSP, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `frame-ancestors`, `Permissions-Policy`, COOP, HSTS (produksi). |
| CSRF mutasi berbasis cookie | Lulus | `src/proxy.ts` menolak POST/PUT/PATCH/DELETE `/api/*` dengan `Origin` beda host atau `Sec-Fetch-Site` cross-site. |
| Bucket pembayaran privat | Lulus | Bukti bayar disimpan di `R2_BUCKET_PRIVATE`; URL publik langsung 404; URL presigned 60 detik hanya dari endpoint kasir/admin. |
| Audit log perubahan penting | Lulus | Pembuatan/kedaluwarsa/pembatalan pesanan, unggah/verifikasi pembayaran, cetak struk, stok, keuangan, kasir, produk, kategori, meja, pengaturan tercatat di `AuditLog`. Halaman `/admin/settings/audit` dengan filter pengguna/aksi/tanggal + paginasi. |
| Penanganan error terpusat | Lulus | `error.tsx`, `not-found.tsx`, `global-error.tsx`; `handleApiError` menyembunyikan detail internal; logger JSON terstruktur meredaksi kata kunci sensitif. |

## Uji skenario wajib

| # | Skenario | Hasil | Bukti |
| --- | --- | --- | --- |
| 1 | IDOR `/order/[code]` tanpa token | Ditolak | Halaman menampilkan gate "Masukkan kode akses"; API mengembalikan `401 UNAUTHORIZED` tanpa token, `403 FORBIDDEN` untuk token salah. Test: `tests/security.test.ts` #1, `tests/order-tracking.test.ts` #1. |
| 2 | Kasir membuka `/admin` | Ditolak | Browser kasir diarahkan ke `/cashier`; `GET /api/admin/audit` dan `/api/admin/dashboard` mengembalikan `403 FORBIDDEN`. |
| 3 | Token meja palsu | Ditolak | `POST /api/public/orders` → `400` dan tidak ada order dibuat; `GET /api/public/menu?token=palsu` → `400`. Test #2 dan #7. |
| 4 | Unggahan file berbahaya | Ditolak | File PHP dengan magic byte palsu ditolak `validateImage` (`400 BAD_REQUEST`) sebelum menyentuh R2; tidak ada baris `Payment` tersimpan. Test #4. |
| 5 | Approve pembayaran bersamaan | Ditolak/di-serialisasi | Dua approve paralel: hanya satu sukses, satu `409 CONFLICT`; transaksi penjualan tidak dobel. `tests/cashier-orders.test.ts` #1. |
| 6 | Replay checkout (double submit) | Ditolak | `Idempotency-Key` wajib (16–120 karakter). Request kedua mengembalikan kode order yang sama (`200`) tanpa order/stok kedua; stok hanya berkurang sekali. Tanpa header → `400`. Test #3. |
| 7 | Akses langsung URL bukti bayar | Ditolak | `GET https://pub-*.r2.dev/proofs/.../proof.avif` → `404`; presigned URL dari `/api/cashier/orders/[id]/proof` → `200 image/avif`, berlaku 60 detik. |
| 8 | Mutasi lintas situs (CSRF) | Ditolak | `POST /api/public/orders` dengan `Origin: https://evil.example` → `403 {"code":"CSRF"}`; dengan `Origin: http://localhost:3000` → lanjut ke validasi (`400`). |
| 9 | Rate limit login | Ditolak | Percobaan ke-1..5 → `401`, percobaan ke-6 → `429` dengan `Retry-After`. Test #5. |
| 10 | Filter audit & kebocoran hash | Lulus | Filter aksi `order.expire` mempersempit 285 → 2 entri di UI; API mengembalikan hanya aksi tersebut; respons tidak memuat `passwordHash`. Test #9. |

## Header keamanan (terverifikasi via HTTP)

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: <R2_PUBLIC_ORIGIN> https://*.r2.cloudflarestorage.com; font-src 'self' data:; connect-src 'self' https://*.pusher.com wss://*.pusher.com https://*.r2.cloudflarestorage.com <R2_PUBLIC_ORIGIN>; media-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
X-Frame-Options: DENY
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
Cross-Origin-Opener-Policy: same-origin
Strict-Transport-Security: max-age=31536000; includeSubDomains   (produksi)
```

CSP mengizinkan `https://*.pusher.com`, `wss://*.pusher.com`, dan domain publik R2 (`R2_PUBLIC_BASE_URL`). `frame-ancestors 'none'` + `X-Frame-Options: DENY` mencegah clickjacking.

## Perintah verifikasi

```bash
npm run test        # 61/61 lulus (termasuk tests/security.test.ts)
npm run typecheck   # lulus
npm run build       # exit 0
```

Catatan: `npm run lint` masih gagal karena 13 error lama di `settings-manager.tsx`, `tables-manager.tsx`, dan halaman menu customer (bukan berkas baru pada hardening ini). Berkas baru (`audit-manager.tsx`, `rate-limiter.ts`, `logger.ts`, `proxy.ts`, `audit.ts`, `tests/security.test.ts`) bersih dari error lint.

## Batasan yang diketahui

- CSP memakai `'unsafe-inline'` untuk script agar halaman yang di-cache/static tetap berfungsi. Peningkatan berikutnya: nonce per-request (mengorbankan static rendering) atau hash inline script.
- `getClientIp` memercayai `x-forwarded-for`/`x-real-ip`; pastikan hanya reverse proxy tepercaya yang dapat menetapkan header tersebut di produksi.
- Pembersihan baris `RateLimit` kedaluwarsa dijalankan oleh cron `/api/cron/expire-orders`; tanpa cron tabel akan tumbuh perlahan.
- URL presigned berlaku 60 detik dan tidak di-cache; jangan menyimpan URL tersebut di log.
- Uji manual dilakukan pada dev server lokal; ulangi uji header dan konfigurasi env (`NEXT_PUBLIC_PUSHER_KEY` = `PUSHER_KEY`, origin R2) di lingkungan produksi.
