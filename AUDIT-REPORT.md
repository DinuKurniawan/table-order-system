# AUDIT-REPORT — Coffeeshop Order System

Tanggal: 2026-11-19
Mode: **read-only** (tidak ada perubahan kode sumber)
Ruang lingkup: `src/`, `prisma/`, `tests/`, `quality/`, konfigurasi root
Acuan: `AI-AGENT.md` > `PRD.md` > `ARCHITECTURE.md` > `DESIGN-SYSTEM.md`

## 1. Ringkasan Eksekutif

Repo sehat secara struktur: typecheck & build lolos, auth berbasis DB, reservasi stok atomik, dan header keamanan lengkap sudah benar. Namun ada cacat kontrak validasi yang dapat **menghapus stok produk**, alur checkout yang **menolak produk non-tracked**, dan beberapa race/kebocoran event. Kualitas gerbang CI belum hijau: lint 14 error, test 2 gagal. Total temuan: **25** — 2 Kritis, 8 Tinggi, 9 Sedang, 6 Rendah.
Risiko utama: (1) setiap toggle aktif produk mereset stok ke 0; (2) produk `trackStock=false` tidak bisa dipesan sama sekali; (3) event realtime terkirim sebelum transaksi commit.

## 2. Hasil Perintah

| Perintah | Hasil | Catatan |
|---|---|---|
| `npm run typecheck` | **LULUS** | 0 error |
| `npm run lint` | **GAGAL** (exit 1) | 14 error, 30 warning |
| `npm run test` | **GAGAL** | 61 tes, 59 lulus, 2 gagal (isolasi tes) |
| `npm run build` | **LULUS** | semua route terkompilasi |
| `npx prisma validate` | **LULUS** | warning: `package.json#prisma` deprecated |
| `npm audit` | **16 kerentanan** | 2 critical, 3 high, 11 moderate |
| `npm audit --omit=dev` | **7 kerentanan** | 0 critical, 3 high, 4 moderate |

## 3. Temuan

Urutan: Kritis → Tinggi → Sedang → Rendah. Estimasi: S ≤ 30 menit, M ≤ 2 jam, L > 2 jam.

| ID | Tingkat | Kategori | Lokasi (file:line) | Masalah | Dampak | Bukti | Saran | Est. |
|---|---|---|---|---|---|---|---|---|
| K-01 | Kritis | Validasi/Data | `src/lib/validators/product.ts:50`; `src/server/services/products.ts:221,236-255`; `src/components/admin/menu-manager.tsx:405-409` | `productUpdateSchema = productCreateSchema.partial()` — `.partial()` hanya membuat field opsional, **nilai `.default()` tetap diisi**. `parse({isActive:false})` menghasilkan `{isActive:false, trackStock:true, stock:0, lowStockThreshold:5}`; `updateProduct` menulis semua field itu. | Setiap toggle aktif/nonaktif produk **mereset stok jadi 0** dan memaksa tracking aktif. Edit produk juga mengirim `stock` lama (`menu-manager.tsx:520-545`) sehingga penjualan bersamaan tertimpa. Kerugian stok/uang nyata. | `productUpdateSchema.parse({name:"X"})` → `{"name":"X","isActive":true,"trackStock":true,"stock":0,"lowStockThreshold":5}`; route PATCH hanya `productUpdateSchema.parse(body)` lalu service menulis seluruh `data`. | Buat schema update eksplisit tanpa `.default()` (semua field `.optional()`), dan di service tulis hanya key yang ada (`data.stock !== undefined ? ... : {}`). Hapus `stock` dari payload edit UI; stok hanya lewat modul stok. | M |
| K-02 | Kritis | Logika bisnis | `src/app/api/public/orders/route.ts:171,221-240`; `src/server/services/orders.ts:161-166` | Pre-check menghormati `trackStock` (baris 171), tetapi reservasi atomik `UPDATE "Product" SET stock = stock - qty WHERE stock >= qty` **tidak** memfilter `trackStock`. `releaseStock` juga menambah stok tanpa syarat. | Produk `trackStock=false` (stok 0) selalu gagal checkout dengan "Stok tidak cukup" → kategori produk non-tracked tidak bisa dipesan sama sekali (alur utama mati). Jika `trackStock` dimatikan setelah order, pembatalan menggelembungkan stok. | Query reservasi tidak punya klausa `AND "trackStock" = true`; pre-check di baris 171 membuktikan niat bisnis berbeda. | Filter `WHERE id = ... AND trackStock = true AND stock >= qty`; jika `trackStock=false`, lewati reservasi & movement; samakan di `releaseStock`. | S |
| T-01 | Tinggi | Validasi/Data | `src/app/api/admin/settings/route.ts:22`; `src/server/services/settings.ts:70-87` | `appSettingsSchema.partial()` — alasan sama dengan K-01: default (`namaKafe`, `timeoutBayarMenit`, `maksUploadUlang`, `footerStruk`, `isOrderingOpen`) ikut terisi. `updateSettings` meng-upsert **semua** key hasil parse. | `PATCH {"isOrderingOpen":false}` juga mereset nama kafe, footer struk, batas upload, dan timeout pembayaran ke default → konfigurasi rusak, pesanan bisa kedaluwarsa lebih cepat. Belum terpicu dari UI saat ini (UI mengirim payload penuh). | `appSettingsSchema.partial().parse({isOrderingOpen:false})` mengembalikan seluruh default; `Object.entries(partial)` menulis semuanya. | Schema update terpisah tanpa default, atau `.partial()` pada schema yang sudah `z.object` tanpa `.default()`; tulis hanya key yang dikirim. | S |
| T-02 | Tinggi | Konkurensi/Stok | `src/server/services/stock.ts:233-264` | `updateStockSettings` membaca `product.stock` **di luar transaksi**, lalu menulis `stock` absolut (termasuk `0`) tanpa guard versi. | Reservasi checkout yang berjalan bersamaan tertimpa → stok "hidup kembali" atau hilang; stok fisik tidak cocok. Korupsi data stok. | Baca `findFirst` (baris 240) lalu `prisma.$transaction` berisi update absolut; tidak ada `version`/`updatedAt` check. | Bungkus baca+tulis dalam satu `$transaction` dengan `SELECT ... FOR UPDATE` atau `updateMany({ where: { id, stock: oldStock } })` dan ulangi bila 0 baris. | M |
| T-03 | Tinggi | Transaksi/Realtime | `src/lib/after-commit.ts:19-23`; `src/app/api/public/orders/route.ts:254,263,287` | `afterCommit` hanya `queueMicrotask`, bukan hook pasca-commit. Dipanggil **di dalam** `prisma.$transaction`. | Event `order.created`/`stock.changed` bisa terkirim sebelum commit atau saat transaksi rollback → kasir refetch dan tidak melihat order, lalu tidak ada event susulan; klien melihat stok hantu. | Implementasi `queueMicrotask(fn)`; pemanggilan berada di callback `$transaction` (baris 254/263/287). | Kumpulkan callback di arraylokal dan jalankan **setelah** `await prisma.$transaction(...)` selesai; atau gunakan event outbox. | S |
| T-04 | Tinggi | Auth/Sesi | `src/app/api/pusher/auth/route.ts:55-59` | Otorisasi channel Pusher hanya `verifySessionToken` (signature JWT), tanpa cek DB `isActive`/`tokenVersion`, padahal route & halaman lain memakai `requireRole`. | Kasir yang dinonaktifkan / password direset tetap bisa mengotorisasi `private-cashier`/`private-admin` selama JWT belum kedaluwarsa → kebocoran data pesanan (nama pelanggan, kode order). | Hanya `verifySessionToken(token)`; `requireRole` tidak dipakai; socket lama juga tidak diputus saat deaktivasi. | Panggil `authenticateSession`/cek `user.isActive` + `tokenVersion` di route auth Pusher; putus channel saat `user.deactivated`. | S |
| T-05 | Tinggi | Tooling/Kualitas | `.audit-lint.txt`; `src/components/admin/settings-manager.tsx:42,62`; `src/components/admin/tables-manager.tsx:46,52,89,285`; `src/app/admin/settings/realtime-test/page.tsx` | `npm run lint` exit 1: 14 error (dominasi `@typescript-eslint/no-explicit-any`, `react-hooks/rules-of-hooks` di halaman realtime-test, `set-state-in-effect` di `menu-client.tsx:61`, kutip tak ter-escape di `tables-manager.tsx:211`). | Gerbang kualitas gagal; CI/PR tidak bisa hijau; hook yang dipanggil di callback berpotensi crash runtime. | Output lint: `✖ 44 problems (14 errors, 30 warnings)`. | Ganti `any` dengan tipe DTO; pindahkan hook ke level komponen; escape kutip; tuntaskan `set-state-in-effect` (baca localStorage di initializer/lazy state). | M |
| T-06 | Tinggi | Pengujian | `tests/dashboard.test.ts:11,107,140`; `tests/stock.test.ts:24-37` | Tes gagal karena `findFirst({role:"SUPER_ADMIN"})` menangkap user yang sedang dibuat/dihapus tes lain (paralel), memicu `Payment_verifiedById_fkey`. Tambahan laten: tes mengharap aksi audit `order.created`, kode menulis `order.create` (S-05). | Suite merah → regresi tidak terdeteksi; setelah isolasi diperbaiki tes tetap gagal karena mismatch aksi. | Stack trace `Foreign key constraint violated on the constraint: Payment_verifiedById_fkey` di `cashier-orders.ts:278`. | Gunakan user fixture deterministik per file (buat sendiri, jangan `findFirst`); hentikan `fileParallelism` atau isolasi DB; samakan nama aksi audit. | S |
| T-07 | Tinggi | Keamanan | `src/lib/rate-limiter.ts:142-147` | `getClientIp` mengambil hop pertama `x-forwarded-for` (paling kiri) yang dikendalikan klien. | Rate limit login/checkout/upload bisa dilewati dengan header palsu bila proxy tidak menimpa header → brute force & spam. | Kode `split(",")[0]`. | Ambil hop tepercaya terakhir (atau header platform seperti `x-vercel-forwarded-for`/`cf-connecting-ip`); jangan percaya hop kiri. | S |
| T-08 | Tinggi | Dependensi | `package.json`; `.audit-audit-prod.json` | `npm audit --omit=dev`: 3 high (`prisma`, `@prisma/config`, `deepmerge-ts`) + 4 moderate. `prisma` CLI berada di `dependencies`. | Kerentanan rantai pasok produksi; paket CLI memperbesar permukaan deploy. | Ringkasan audit tersimpan di `.audit-audit*.json`. | Pindahkan `prisma` ke `devDependencies`; upgrade Prisma mayor; evaluasi `shadcn`/`ts-morph` (dev). | M |
| S-01 | Sedang | Validasi/Data | `src/lib/validators/table.ts:11`; `src/server/services/tables.ts` | `tableUpdateSchema = tableInputSchema.partial()` mewarisi `isActive:true`; `PATCH {name}` mengaktifkan kembali meja nonaktif. | Meja nonaktif bisa tiba-tiba menerima QR/order lagi; efek samping tersembunyi. | `tableUpdateSchema.parse({name:"Y"})` → `{"name":"Y","isActive":true}`. | Schema update tanpa default; UI sudah mengirim `isActive` eksplisit sehingga aman. | S |
| S-02 | Sedang | Logika/UI | `src/server/services/cashier-orders.ts:127-145` | Riwayat dibatasi `take: 50`, tetapi `counts.history = history.length`. | Badge jumlah riwayat salah saat >50 order; kasir mengira data hilang. | Baris 130 `take: 50`, baris 144 memakai panjang array. | `prisma.order.count({ where: { status: { in: HISTORY } } })` untuk counts; tambahkan pagination. | S |
| S-03 | Sedang | Realtime | `src/lib/pusher-server.ts:64-69` | `pusher.trigger(...)` tidak di-`await` dan tanpa `.catch`; `emitToChannel` fire-and-forget. | Promise rejection tak tertangani; kegagalan Pusher tidak tercatat, event hilang diam-diam. | Blok `try { pusher.trigger }` tanpa await/catch pada promise. | `void pusher.trigger(...).catch(err => logger.warn(...))`. | S |
| S-04 | Sedang | Kontrak API | `src/lib/errors.ts:3`; `src/lib/api.ts:10-31` | Kode error tidak sesuai AI-AGENT: `UNAUTHORIZED`/`BAD_REQUEST`/`INTERNAL_SERVER_ERROR` vs `UNAUTHENTICATED`/`VALIDATION_ERROR`/`INTERNAL`/`ALREADY_PROCESSED`/`STOCK_INSUFFICIENT`/`ORDER_EXPIRED`/`INVALID_TRANSITION`/`UPLOAD_INVALID`; envelope `{error, code}` vs standar `{error:{code,message}}`. | Klien tidak bisa membedakan stok habis vs konflik vs transisi invalid; UI hanya menampilkan pesan generik. | Enum kode di `errors.ts`; `handleApiError` mengembalikan `{error: message, code}`. | Standarkan enum + bentuk envelope; petakan `ZodError` → `VALIDATION_ERROR`, stok → `STOCK_INSUFFICIENT`, transisi → `INVALID_TRANSITION`. | M |
| S-05 | Sedang | Audit/Log | `src/app/api/public/orders/route.ts:275`; `tests/dashboard.test.ts:140` | Aksi audit ditulis `order.create`, sementara event/tes memakai `order.created`. | Filter/aktivitas dashboard tidak konsisten; tes rapuh; jejak audit tidak seragam. | String literal `"order.create"` vs `"order.created"`. | Tetapkan konstanta aksi audit; ganti ke `order.created`. | S |
| S-06 | Sedang | Arsitektur | `src/server/domain/` (hanya `.gitkeep`); tidak ada `src/server/queries/`; `src/lib/realtime-events.ts` | Melanggar Golden Rule 5 AI-AGENT & `ARCHITECTURE.md:99-101`: tidak ada state machine (`order-state.ts`), pricing, stock-policy; read-model dashboard tidak dipisah; `realtime-events.ts` hanya tipe, literal channel/event tersebar di service. | Transisi status tersebar & mudah menyimpang; sulit diuji murni; rename channel berisiko. | Direktori kosong; `emitToChannel("private-cashier", "order.created", ...)` literal di banyak file. | Ekstrak `domain/order-state.ts` (transisi + guard), `queries/dashboard.ts`; jadikan konstanta channel/event sebagai nilai runtime. | L |
| S-07 | Sedang | Pengujian | `package.json` scripts; `vitest.config.ts:11` | `npm test` memakai `tsx --test` (node:test), sedangkan AI-AGENT mewajibkan Vitest; `test:unit` Vitest hanya memindai `quality/**`, bukan `tests/` atau unit service. | Dua runner paralel, cakupan unit sesungguhnya tidak ada; kerentanan `vitest` critical tidak relevan produksi tetapi menandakan dependensi usang. | Script `test` vs `test:unit`; `include: ["quality/**/*.test.ts"]`. | Satukan ke Vitest dengan dua project (unit & integrasi) atau perbarui dokumen; hapus runner ganda. | M |
| S-08 | Sedang | Keamanan | `src/proxy.ts:25-28` | Pemeriksaan origin CSRF memakai `host`/`x-forwarded-host` dari request. | Bila proxy tidak menimpa header, origin dapat dipalsukan → CSRF pada route mutasi berbasis cookie. | Perbandingan `originHost` dengan `req.headers.get("x-forwarded-host") ?? req.headers.get("host")`. | Gunakan `NEXT_PUBLIC_APP_URL`/allowlist host tetap, bukan header request. | S |
| S-09 | Sedang | UX/Error | `src/app/m/[token]/page.tsx:21` | `getPublicMenu({token}).catch(() => null)` menelan semua error. | Token tidak valid, tabel nonaktif, dan DB down tampil sama: "Menu tidak ditemukan" — menyulitkan diagnosis & menyesatkan pelanggan. | `.catch(() => null)` tanpa membedakan `AppError`. | Tangkap `AppError` tertentu (token invalid → halaman khusus); biarkan error lain naik ke `error.tsx`. | S |
| R-01 | Rendah | Gaya/Kualitas | `src/components/admin/tables-manager.tsx:211`; `src/app/admin/settings/realtime-test/page.tsx:10,13,20` | 30 warning lint: unused vars/imports, `any`, kutip tak ter-escape, `RealTimeEvent` tak terpakai. | Noise; menutupi warning baru. | `.audit-lint.txt` (30 warning). | Bersihkan impor/variabel mati; tambahkan tipe DTO. | S |
| R-02 | Rendah | Dependensi | `package.json` | `prisma` (CLI) di `dependencies`. | Memperbesar artefak & audit produksi. | — | Pindahkan ke `devDependencies`. | S |
| R-03 | Rendah | Duplikasi | `src/lib/pusher-client.ts:12-20`; `src/lib/realtime-events.ts:11-19` | `RealTimeEvent` didefinisikan dua kali. | Risiko drift saat menambah event. | Dua union identik. | Impor dari satu modul. | S |
| R-04 | Rendah | Ketahanan UI | `src/app/m/[token]/menu-client.tsx:61` | `JSON.parse(saved).items as CartItems` tanpa validasi bentuk. | localStorage korup/versi lama dapat menghasilkan item tanpa `quantity`/`price` → tampilan/keranjang rusak. | Cast `as` langsung. | Validasi dengan Zod atau cek `typeof` per field sebelum dipakai. | S |
| R-05 | Rendah | Konfigurasi | `package.json#prisma` | `prisma validate` memperingatkan konfigurasi `package.json#prisma` deprecated (Prisma 7). | Akan gagal saat upgrade Prisma. | Output `npx prisma validate`. | Migrasi ke `prisma.config.ts`. | S |
| R-06 | Rendah | Observabilitas | `src/app/api/auth/*` (login) | Login sukses/gagal tidak tercatat di `AuditLog`; hanya rate limit. | Investigasi insiden akun lemah. | Tidak ada `auditLog.create` pada alur login. | Catat `auth.login`/`auth.login_failed` (tanpa password). | S |

## 4. Yang Sudah Baik

1. Otorisasi berlapis: `requireRole` selalu cek DB (`isActive` + `tokenVersion`), dan deaktivasi/reset password menaikkan `tokenVersion` — pencabutan sesi nyata untuk API & halaman.
2. Reservasi stok atomik via SQL + `Idempotency-Key`; dibuktikan `quality/checkout-concurrency.test.ts` (hanya satu checkout sukses saat stok 1, replay tidak memotong dua kali).
3. Token akses pesanan acak 128-bit, dibandingkan constant-time, disimpan di cookie `httpOnly`; unggah bukti dibatasi rate limit, magic bytes, konversi AVIF, dan lampiran keuangan disimpan di bucket privat.
4. Header keamanan lengkap (CSP tanpa `unsafe-eval` di produksi, HSTS, `frame-ancestors 'none'`, `object-src 'none'`) + pemeriksaan origin untuk mutasi.
5. Tidak ada secret ter-commit (`.env*` di-ignore, hanya `.env.example`); env divalidasi Zod; DTO tidak pernah mengekspos `passwordHash`/`accessToken` kecuali endpoint ber-guard.

## 5. Tidak Sempat Diperiksa

- Komponen UI admin/cashier di luar yang terkait temuan (mis. `finance-manager.tsx`, `cashier-order-detail.tsx`, `print-runner.tsx`) — tidak dibaca baris per baris.
- `e2e/*.spec.ts` dan `e2e/helpers.ts` (hanya cuplikan), `scripts/`, `.github/workflows/`.
- Migrasi individual di `prisma/migrations/` (hanya `schema.prisma` & `seed.ts`).
- `docs/`, `public/`, `lighthouse-menu.json`, `test-results/`.
- Uji runtime nyata (browser, Pusher, R2) — audit statis + suite tes yang ada.

## 6. Asumsi

- Deployment di belakang proxy yang menimpa `X-Forwarded-For`/`Host` (mis. Vercel). Jika tidak, T-07 dan S-08 menjadi **Kritis** (rate-limit bypass & CSRF).
- UI admin saat ini mengirim payload penuh untuk settings; temuan T-01 belum terpicu dari UI, tetapi kontrak API tetap tidak aman untuk klien lain.
- Database produksi memiliki >50 order berstatus historis (S-02) dan minimal satu produk `trackStock=false` (K-02).
- Kegagalan tes T-06 adalah masalah isolasi tes, bukan bug produksi: route produksi memakai `userId` dari sesi yang tervalidasi DB.
- `npm audit` mencerminkan lockfile saat audit; sebagian besar perbaikan bersifat semver-major dan perlu uji regresi.

## 7. Status Perbaikan

Cabang: `fix/audit-2026-11`. Status awal semua temuan: **Belum**.

| ID | Tingkat | Status | Commit |
|---|---|---|---|
| K-01 | Kritis | Selesai | 5a3d554 |
| K-02 | Kritis | Selesai | e3e0d5f |
| T-01 | Tinggi | Selesai | ff6d40f |
| T-02 | Tinggi | Selesai | 84274c3 |
| T-03 | Tinggi | Selesai | 6848e64 |
| T-04 | Tinggi | Selesai | 8276566 |
| T-05 | Tinggi | Selesai | 0d42673 |
| T-06 | Tinggi | Selesai | ad17b1c |
| T-07 | Tinggi | Selesai | aaecfaa |
| T-08 | Tinggi | Selesai | d828c84 |
| S-01 | Sedang | Selesai | e4cc223 |
| S-02 | Sedang | Selesai | e4cc223 |
| S-03 | Sedang | Selesai | 6848e64 |
| S-04 | Sedang | Selesai | f2d7cc4 |
| S-05 | Sedang | Selesai | e4cc223 |
| S-06 | Sedang | Selesai | f2d7cc4 |
| S-07 | Sedang | Selesai | bee8058 |
| S-08 | Sedang | Selesai | ebca5ee |
| S-09 | Sedang | Selesai | 38bfffe |
| R-01 | Rendah | Selesai | 0d42673 |
| R-02 | Rendah | Selesai | bee8058 |
| R-03 | Rendah | Selesai | f2d7cc4 |
| R-04 | Rendah | Selesai | 38bfffe |
| R-05 | Rendah | Selesai | bee8058 |
| R-06 | Rendah | Selesai | f2d7cc4 |

Tidak ada temuan yang ditunda atau dinyatakan tidak berlaku. Seluruh 25 temuan selesai.

Catatan perbaikan K-01/K-02:

- Audit skema `.partial()` lain: `tableUpdateSchema` (S-01) sudah diperbaiki dengan field update eksplisit tanpa default (commit `e4cc223`). `cashierUpdateSchema`, `paymentMethodUpdateSchema`, dan `financeTransactionUpdateSchema` sudah memakai field `.optional()` eksplisit (aman); kategori tidak memakai `.partial()`. T-01 diperbaiki: skema update settings kini tanpa default dan merge per key.
- `scripts/audit-stock-drift.ts` dijalankan read-only: 13 produk tracked, 0 selisih stok vs saldo movement terakhir. Tidak ada koreksi DB yang dijalankan.
- T-07: `getClientIp` hanya memakai header proxy sesuai `TRUSTED_PROXY`; mode `none` mengabaikan semua header forwarded. Rate limit tetap terdistribusi di tabel PostgreSQL. Tes integrasi memakai `.env.test` (`TRUSTED_PROXY=1`) agar bucket per skenario terisolasi.
- T-08: 3 temuan high berasal dari rantai `prisma` → `@prisma/config` → `deepmerge-ts`. Override `deepmerge-ts` ke `^8.0.2` menghilangkan high tanpa bump major Prisma. Sisa 4 moderate (`shadcn` → `ts-morph` → `minimatch`) hanya tooling dev, tidak masuk runtime; CI menegakkan `npm audit --omit=dev --audit-level=high`.

## 8. Baseline

Diambil dari log `.audit-*.txt/.json` pada kode yang sama (belum ada perubahan `src/`).
Typecheck: lulus, 0 error. Lint: gagal, 14 error / 30 warning. Test: 61 tes, 59 lulus, 2 gagal (`dashboard.test.ts` FK + aksi audit). Build: lulus. Audit: 16 kerentanan (2 critical, 3 high) - produksi 7 (0 critical, 3 high).

## 9. Re-audit Akhir (read-only)

Dijalankan pada HEAD `bee8058`, seluruh temuan "Selesai" diverifikasi ulang terhadap kode dan tes.

### 9.1 Gerbang Akhir

| Pemeriksaan | Hasil | Baseline |
|---|---|---|
| `npm run typecheck` | **LULUS**, 0 error | Lulus |
| `npm run lint` | **LULUS**, 0 error / 0 warning | 14 error / 30 warning |
| `npm test` (node:test) | **LULUS**, 114/114 | 61 tes, 59 lulus, 2 gagal |
| `npm run test:unit` (Vitest) | **LULUS**, 10/10 (4 berkas) | 10/10 (tidak dijalankan saat baseline) |
| `npm run build` | **LULUS**, semua route terkompilasi | Lulus |
| `npx prisma validate` | **LULUS**, tanpa warning deprecated | Lulus + warning |
| `npm audit --omit=dev --audit-level=high` | **LULUS** (exit 0), 0 high | 7 kerentanan (3 high) |

### 9.2 Verifikasi Skenario Asli

| ID | Verdict | Bukti |
|---|---|---|
| K-01 | Terverifikasi | `productUpdateSchema` hanya field opsional tanpa default; `tests/product-update.test.ts` (a) PATCH `{isActive:false}` tidak menyentuh stok/field lain, (c) toggle UI mengirim `{isActive}` saja. |
| K-02 | Terverifikasi | `tests/order-stock-tracking.test.ts`: (a) non-tracked stok 0 checkout berhasil, (b) 20 checkout paralel stok 5 → maksimal 5 sukses & stok ≥ 0, (c) batal tidak mengubah stok non-tracked. |
| T-01 | Terverifikasi | `tests/settings.test.ts`: PATCH satu field tidak mengubah field lain (merge per key, tanpa default). |
| T-02 | Terverifikasi | `tests/stock-settings.test.ts`: transaksi pesaing memegang row lock; `SELECT ... FOR UPDATE` di dalam `runInTransaction` mencegah tulis absolut menimpa reservasi. |
| T-03 | Terverifikasi | `src/lib/tx.ts`: callback `after()` dijalankan setelah commit sukses, dibuang saat rollback; tidak ada `emitToChannel` di dalam `$transaction`. `tests/realtime-commit.test.ts` lulus. |
| T-04 | Terverifikasi | `tests/pusher-auth.test.ts`: kasir nonaktif & tokenVersion lama ditolak 403; route memakai `authenticateSession`. |
| T-05 | Terverifikasi | Lint 0 error / 0 warning (baseline 14/30). |
| T-06 | Terverifikasi | Suite penuh 114/114; fixture user dibuat per tes, aksi audit `order.created` konsisten. |
| T-07 | Terverifikasi | `tests/client-ip.test.ts`: XFF palsu diabaikan; mode `none` tidak membedakan bucket; Vercel/Cloudflare hanya memakai header tepercaya. |
| T-08 | Terverifikasi | `npm audit --omit=dev`: 0 high. Sisa 4 moderate dev-only (`shadcn` → `ts-morph` → `minimatch`), CI menggagalkan high. |
| S-01 | Terverifikasi | `tests/table-update.test.ts`: `parse({name})` tidak menambah `isActive`; PATCH nama tidak mengaktifkan ulang meja nonaktif. |
| S-02 | Terverifikasi | `tests/cashier-orders.test.ts` kasus 5: 51 order riwayat → daftar tetap 50, badge `counts.history` memakai `prisma.order.count`. |
| S-03 | Terverifikasi | `src/lib/pusher-server.ts`: `void pusher.trigger(...).catch(...)`; kegagalan emit tercatat dan tidak menggagalkan request. |
| S-04 | Terverifikasi | `src/lib/errors.ts` + `src/lib/api.ts`: kode sesuai ARCHITECTURE §9, envelope `{error:{code,message,fields?}}`; tes auth/security/image/menu lulus dengan kode baru. |
| S-05 | Terverifikasi | Aksi audit tunggal `order.created`; dashboard, filter audit, dan tes memakai nilai sama. |
| S-06 | Terverifikasi | `src/server/domain/order-state.ts` menjadi sumber transisi/guard; `tests/order-state.test.ts` lulus; channel/event memakai `CHANNELS`/`REALTIME_EVENTS`. |
| S-07 | Terverifikasi | AI-AGENT §7 mendokumentasikan pembagian runner: `tests/**` node:test, `quality/**` Vitest; keduanya wajib hijau. |
| S-08 | Terverifikasi | `tests/request-origin.test.ts`: Origin jahat ditolak 403 meski `Host` dipalsukan; allowlist dari env, bukan header request. |
| S-09 | Terverifikasi | `src/app/m/[token]/page.tsx`: `AppError NOT_FOUND` → `notFound()` (404), error lain dilempar ke `error.tsx`; menu route mengembalikan 404 untuk token palsu. |
| R-01 | Terverifikasi | Lint 0 warning. |
| R-02 | Terverifikasi | `prisma` hanya di `devDependencies` (lock root disesuaikan). |
| R-03 | Terverifikasi | `RealTimeEvent` hanya didefinisikan di `src/lib/realtime-events.ts`; `pusher-client.ts` mengimpor ulang. |
| R-04 | Terverifikasi | `src/lib/cart.ts` memvalidasi localStorage dengan Zod; `tests/cart.test.ts` menolak JSON rusak/quantity negatif dan membersihkan field ekstra. |
| R-05 | Terverifikasi | `prisma.config.ts` menggantikan `package.json#prisma`; `prisma validate` tanpa warning deprecated. |
| R-06 | Terverifikasi | `tests/auth.test.ts` memastikan `auth.login` dan `auth.login_failed` tercatat tanpa password. |

### 9.3 Kesimpulan

Semua 25 temuan berstatus **Selesai** dan **Terverifikasi**. Tidak ada regresi pada skenario asli, tidak ada temuan baru yang menghalangi, dan seluruh gerbang kualitas hijau. Sisa 4 kerentanan moderate hanya rantai tooling dev (`shadcn`/`ts-morph`/`minimatch`), tanpa jalur runtime produksi.

