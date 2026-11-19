# AUDIT DATABASE DAN PERFORMA

Tanggal: 2026-11-19
Mode: **read-only terhadap kode aplikasi** — tidak ada perubahan `src/**`, `prisma/**`, atau konfigurasi.
Cakupan: `prisma/schema.prisma`, seluruh migrasi, query service/route, `ARCHITECTURE.md` §6, `PRD.md` §7, bundle hasil `next build`, dan cache/invalidasi.

Metodologi pengukuran:

- Database uji: PostgreSQL 18.3 lokal, database sementara `coffeeshop_perf_audit` (dibuat dari nol, **di-drop setelah audit**). Database remote `db.prisma.io` tidak disentuh.
- Seed 500 pesanan × 90 hari memakai skrip yang sudah ada, `prisma/seed-demo.ts` (1,3 detik).
- Uji skala: ditambah 45.000 pesanan sintetis (total 45.500 pesanan, 135.895 item, 41.717 pembayaran, 34.167 transaksi, 50.012 mutasi stok, ukuran DB 112 MB).
- Waktu service diukur 25–30 run (p50/p95). Waktu HTTP diukur dengan `next start` + `curl` terhadap DB lokal yang sama.
- EXPLAIN memakai `EXPLAIN (ANALYZE, BUFFERS)`; angka "SQL" adalah execution time PostgreSQL, angka "Prisma" adalah waktu dari aplikasi.

## 1. Ringkasan

Total temuan: **8** — **2 Tinggi, 3 Sedang, 2 Rendah, 1 Informasi**.

Fondasi database baik: skema sesuai PRD §7, seluruh indeks wajib ARCHITECTURE §6.2 ada, migrasi berjalan dari database kosong tanpa drift, agregasi dashboard memakai SQL `GROUP BY` (bukan loop di Node), dan daftar transaksi/stok memakai pagination serta batch lookup (bukan N+1).

Masalah utama ada di **beban query dan batas data**:

1. **D-01** — Dashboard tidak punya cache sama sekali (bertentangan dengan ARCHITECTURE §6.4) dan query best-seller/composition memindai seluruh `OrderItem`. Pada 45.500 pesanan, `year` p50 **974 ms**, spike HTTP **732–767 ms**; rencana PostgreSQL dapat berubah menjadi nested loop 41.717 iterasi.
2. **D-02** — Antrean kasir mengambil semua baris tanpa `take`. Pada data uji: 15.166 baris, respons HTTP **218 ms / 3,34 MB** untuk satu request.

Keduanya akan makin buruk secara linear terhadap jumlah pesanan dan diperparah invalidasi realtime yang memicu refetch berulang.

## 2. Jawaban Ringkas atas 7 Pertanyaan Audit

| # | Pertanyaan | Jawaban | Bukti |
|---|---|---|---|
| 1 | Skema vs PRD §7 / ARCHITECTURE §6.2: indeks hilang, relasi/onDelete salah, unik kurang? | **Tidak ada yang hilang dari spesifikasi.** Semua indeks wajib ada (`Order(status, createdAt)`, `Order.code` unik, `Payment(orderId)`, `Transaction(type, occurredAt)`, `StockMovement(productId, createdAt)`, `Product(categoryId, isActive)`, `AuditLog(entity, entityId)`). Unik `Table.token`, `Order.code`, `Order.idempotencyKey`, dan `Transaction(orderId, category)` ada. Gap hanya **indeks tambahan yang dibutuhkan query aktual** (D-04), bukan pelanggaran spesifikasi. | `prisma/schema.prisma:70,103,118,125,133,153-154,184,201-203,232`; `ARCHITECTURE.md:242-252` |
| 2 | Migrasi bisa dijalankan dari DB kosong? Ada yang merusak / tidak kompatibel mundur? | **Bisa.** 4 migrasi berhasil dari database kosong; `prisma migrate diff` → *No difference detected*. Tidak ada DROP/ALTER destruktif; kolom baru nullable; unique index pada kolom nullable aman. Risiko operasional: `CREATE INDEX` non-concurrent mengunci tulis (D-08). | `prisma/migrations/*`; hasil `migrate deploy` & `migrate diff` |
| 3 | N+1, findMany tanpa select/take, include terlalu dalam, count berulang? Agregasi dashboard SQL? | **N+1 ada di dua tempat:** `expireOrders` (transaksi per pesanan) dan checkout (2 query per item). **Tanpa `take`:** antrean kasir (D-02), kandidat expiry (D-03). `findMany` lain memakai `select` sempit; tidak ada include berlapis. Count dashboard dijalankan sekali per section. Agregasi dashboard **ya, SQL** (`GROUP BY`, `date_trunc`). | `orders.ts:367-418`; `route.ts:219-257`; `cashier-orders.ts:109-147`; `dashboard.ts:125-272` |
| 4 | EXPLAIN 5 query tersering; ada seq scan mencurigakan? | **Ada.** `OrderItem` 135.895 baris + `Order` 37.981 baris dipindai untuk best-seller/composition; `Payment` 41.717 baris dipindai untuk tally kasir; antrean riwayat memindai 30.370 `Order` lalu sort. Query menu, riwayat stok, dan daftar transaksi memakai index. Detail di §4. | `EXPLAIN` §4 |
| 5 | Seed 500 pesanan × 90 hari dan ukur endpoint dashboard? | **Sudah ada** (`prisma/seed-demo.ts`); dijalankan: 500 pesanan, dashboard `year` **5,7 ms**, kasir **2,8 ms**. Pada 45.500 pesanan: dashboard `year` **974 ms** p50, kasir **201 ms**, HTTP kasir **218 ms / 3,18 MiB**. | §5 |
| 6 | Bundle besar? Komponen berat belum dynamic import? Gambar? Re-render? Waterfall? | **Bundle terbesar:** halaman diagnostik `realtime-test` **291,1 KB gz** (membawa chunk `pusher` server 149,7 KB ke klien), `admin/menu` 209,2 KB, `admin/finance` 184,6 KB. Recharts **sudah** dynamic import (105,3 KB gz dimuat saat dibutuhkan), `ProofViewer` juga dynamic. Font Poppins 5 bobot ±193 KB. Dashboard admin **client-only** → waterfall HTML → JS → API → DB. | §6 |
| 7 | Cache tag/revalidate konsisten dengan invalidasi? | **Tidak ada cache server sama sekali.** Tidak ditemukan `unstable_cache`, `revalidateTag`, `revalidatePath`, atau `"use cache"` di `src/**`. ARCHITECTURE §6.4 mewajibkan cache 15 detik tag `dashboard` + `revalidateTag` saat event. Yang ada hanya cache klien React Query (`staleTime` 30 detik) dan invalidasi realtime. | `grep` kosong; `providers.tsx:10-16`; `ARCHITECTURE.md:267-269` |

## 3. Temuan

### D-01 — Dashboard memindai seluruh riwayat dan tidak di-cache (Tinggi)
**Lokasi:** `src/server/services/dashboard.ts:125-272`; `src/app/admin/page.tsx:1-5`; `src/components/admin/dashboard-manager.tsx:280-299`; `ARCHITECTURE.md:267-269`

Tiga agregasi dashboard memindai data penuh:

- `best seller`: `OrderItem` JOIN `Order` JOIN `Product`, filter `o.status <> 'CANCELLED'` (tidak sargable) lalu `GROUP BY`.
- `composition`: join yang sama, agregasi ulang.
- `series`: `GROUP BY date_trunc` atas `Transaction`/`Order`; pada rentang `year` filter mencakup hampir semua baris sehingga seq scan wajar, tetapi hasilnya dihitung ulang setiap request.

Tidak ada cache server. Halaman `/admin` adalah komponen klien (`DashboardManager`) sehingga alurnya: HTML → unduh JS → hidrasi → `GET /api/admin/dashboard` → query DB. Setiap navigasi/refetch membayar penuh.

**Angka terukur (45.500 pesanan / 135.895 item):**

| Pengukuran | p50 | p95 / max |
|---|---|---|
| `getDashboard("today")` | 73,1 ms | 91,2 ms |
| `getDashboard("month")` | 110,8 ms | 183,6 ms |
| `getDashboard("year")` | **974,3 ms** | **1.083,9 ms** |
| Query best-seller (Prisma) | **858,0 ms** | 1.030,1 ms |
| Query composition (Prisma) | 239,9 ms | 279,4 ms |
| HTTP `/api/admin/dashboard?range=year` | 89–110 ms (normal) | **732–767 ms** (2 dari 12 request) |

`EXPLAIN` best-seller: `Parallel Seq Scan on "OrderItem"` 135.895 baris + `Parallel Seq Scan on "Order"` ±38–42 ribu baris; hash join 61–140 ms. Setelah prepared statement mencapai ambang generic plan, rencana berubah menjadi **Nested Loop ±38–42 ribu iterasi** + `external merge Disk: 7.448 kB` → **300,5 ms** SQL. Inilah sumber spike 732 ms di HTTP.

**Reproduksi:**
1. Isi DB dengan `npm run db:seed` lalu `npm run db:seed:demo`; tambah data hingga puluhan ribu pesanan.
2. Buka `/admin`, pilih rentang **Tahun**.
3. **Diharapkan (ARCHITECTURE §6.4):** satu request ±100 ms, hasil 15 detik di-cache, event realtime hanya `revalidateTag`.
4. **Aktual:** 0,73–1,08 detik; spike berulang pada request ke-6 dan seterusnya; setiap kali dashboard di-invalidate, query penuh dijalankan lagi.

**Perbaikan:** bungkus tiap section dengan `unstable_cache(..., { revalidate: 15, tags: ["dashboard"] })`, panggil `revalidateTag("dashboard")` dari event yang relevan; pre-agregasi `OrderItem` per produk dalam CTE/query terpisah sebelum join `Order`; pertimbangkan `plan_cache_mode=force_custom_plan` atau query dengan bentuk yang tidak memicu nested loop; di atas ±1 juta pesanan tambahkan tabel ringkasan harian seperti disebut ARCHITECTURE §6.4.

### D-02 — Antrean kasir mengambil semua baris tanpa batas (Tinggi)
**Lokasi:** `src/server/services/cashier-orders.ts:109-147`

Tiga `findMany` (verifikasi, diproses, siap) tidak memakai `take`. Hanya riwayat yang dibatasi 50. Jumlah baris mengikuti seluruh backlog, dan endpoint ini di-refetch setiap event realtime (dashboard kasir tidak memakai debounce).

**Angka terukur:**

- Baris pada data uji: **3.800** menunggu verifikasi, **7.544** diproses, **3.772** siap, 50 riwayat → **15.166 baris**.
- `listCashierOrders()` p50 **201,1 ms**, p95 **248,9 ms**.
- HTTP `GET /api/cashier/orders`: **218 ms**, ukuran **3.337.797 byte (3,18 MiB)**.
- JSON service: **3.259,6 KB**.

Distribusi status pada seed sintetis memang seragam (1/12 per status); backlog produksi normal lebih kecil. Namun kode tidak punya batas, jadi satu backlog yang macet (mis. kasir tidak masuk) langsung menghasilkan respons multi-megabyte dan memperlambat semua tab kasir.

**Reproduksi:**
1. Buat 1.000+ pesanan berstatus `AWAITING_VERIFICATION`.
2. Buka `/cashier`, lihat Network: `GET /api/cashier/orders`.
3. **Diharapkan:** payload terbatas (mis. 50 per kolom + “muat lagi”).
4. **Aktual:** seluruh baris dikirim; UI dan JSON tumbuh linear.

**Perbaikan:** `take: 50` per kolom + cursor/“muat lagi”; hitung total dengan `count` terpisah; kirim ringkasan (id, kode, meja, total, waktu) dan muat detail saat diklik.

### D-03 — `expireOrders` memproses tiap pesanan dengan transaksi terpisah (Sedang)
**Lokasi:** `src/server/services/orders.ts:367-418`

Cron mengambil **semua** kandidat tanpa `take`, lalu menjalankan `runInTransaction` per pesanan (update status + audit + rilis stok + movement). Tidak ada batas batch.

**Angka terukur:** 3.736 kandidat kedaluwarsa diproses **20,22 detik** (≈5,4 ms/pesanan, ±5 query/pesanan → ±18.000 roundtrip). Pada runtime serverless dengan batas 10–60 detik, sebagian kandidat tidak pernah diproses dan tertinggal ke run berikutnya.

**Reproduksi:**
1. Buat 3.000+ pesanan `AWAITING_PAYMENT` dengan `expiresAt` lampau.
2. Panggil endpoint cron expiry.
3. **Diharapkan:** selesai < 5 detik atau diproses bertahap.
4. **Aktual:** > 20 detik, satu request.

**Perbaikan:** `take: 200` per run; update massal satu statement dengan `FOR UPDATE SKIP LOCKED`; kumpulkan item lalu rilis stok per produk dengan `UPDATE ... FROM (VALUES ...)` dan `createMany` movement; ulangi run berikutnya.

### D-04 — Indeks kurang untuk pola query nyata (Sedang)
**Lokasi:** `prisma/schema.prisma:131-155,171-186`; `cashier-orders.ts:116-129`; `dashboard.ts:302-326`; `orders.ts:370-378`; `cashiers.ts:72-92`

Indeks wajib spesifikasi lengkap, tetapi empat pola query berjalan tanpa indeks pendukung:

| Pola | Plan aktual (45.500 pesanan) | Waktu SQL | Indeks yang disarankan |
|---|---|---|---|
| Tally verifikasi kasir: `Payment GROUP BY verifiedById, status` | **Seq Scan `Payment` 41.717 baris** | 10,3 ms | `(verifiedById, status) WHERE verifiedById IS NOT NULL` → uji: **Index Only Scan 5,1 ms** |
| Riwayat/antrean: `ORDER BY updatedAt` dengan filter status | **Seq Scan `Order` 30.370 baris + sort** | 13,4 ms | `(status, updatedAt)` |
| Cron expiry: `status IN (...) AND expiresAt <= now()` | Bitmap index status lalu filter 3.750 baris | 12,2 ms | `(status, expiresAt)` |
| Dashboard meja aktif: lateral `WHERE tableId = ? AND status IN (...) ORDER BY createdAt DESC` | Backward scan `Order_createdAt_idx`, 35 baris dibuang per meja | 1,3 ms (10 meja) | `(tableId, status, createdAt)` |

Catatan: `(status, updatedAt)` diuji pada data 45.500 baris; planner masih memilih seq scan karena 67% baris cocok (8,8 ms vs 13,4 ms), tetapi pada tabel produksi yang jauh lebih besar indeks ini menjaga `LIMIT 50` tetap konstan. Indeks `tableId` saat ini aman karena jumlah meja kecil; berisiko jika meja bertambah atau pesanan aktif menua.

**Perbaikan:** tambahkan empat indeks di atas lewat migrasi baru; verifikasi dengan `EXPLAIN` setelah `ANALYZE`. Jangan mengubah migrasi lama.

### D-05 — Checkout melakukan 2 query per item di dalam satu transaksi (Sedang)
**Lokasi:** `src/app/api/public/orders/route.ts:34-47,219-257`; `src/server/services/stock.ts:147-184`

Batas keranjang 50 item. Setiap item tracked menjalankan satu `UPDATE Product ... RETURNING` dan satu `INSERT StockMovement` secara berurutan, ditambah insert order, item, audit, dan pembacaan pengaturan. Maksimum ±**102 statement** dalam satu transaksi.

Pada DB lokal biayanya kecil, tetapi dengan latensi remote 5–20 ms per roundtrip, checkout 50 item dapat menambah **0,5–2 detik** dan memperpanjang lock transaksi. Ini juga memperbesar risiko timeout serverless.

**Reproduksi:** checkout 50 produk tracked, ukur durasi `POST /api/public/orders` dan jumlah query di log Prisma.
**Diharapkan:** jumlah query konstan terhadap jumlah item.
**Aktual:** bertambah 2 query per item.

**Perbaikan:** agregasi quantity per produk (schema sudah menolak duplikat), satu `UPDATE ... FROM (VALUES ...)` untuk semua produk, lalu satu `createMany` untuk movement; alternatif cepat: turunkan batas item menjadi 20.

### D-06 — Bundle besar, chunk server bocor ke klien, font berlebih (Rendah)
**Lokasi:** `src/app/admin/settings/realtime-test/page.tsx:1-8`; `src/app/layout.tsx:4-11`; `.next` hasil build

Ukuran JS awal per route (gzip, dari manifest build):

| Route | JS gz | Catatan |
|---|---|---|
| `/admin/settings/realtime-test` | **291,1 KB** | memuat chunk `pusher` server **149,7 KB** |
| `/admin/menu` | 209,2 KB | + chunk 33,9 KB |
| `/admin/finance` | 184,6 KB | Recharts tidak termasuk (async) |
| `/admin/cashiers` | 179,3 KB | |
| `/admin/tables` | 177,3 KB | |
| `/admin/stock` | 153,4 KB | |
| `/admin` | 151,4 KB | |
| `/admin/settings/audit` | 129,3 KB | |
| `/m/[token]` (publik) | 122,1 KB | |
| `/cashier` | 86,7 KB | |
| `/order/[code]` | 85,9 KB | |
| `/login` | 62,7 KB | |

- CSS total 113,1 KB mentah / **17,4 KB gz**.
- Recharts **105,3 KB gz** dimuat terpisah saat grafik dibuka — sudah benar.
- `ProofViewer` juga sudah `dynamic()`.
- Font Poppins diminta 5 bobot (300–700): 5 berkas woff2 ±38,3 KB = **±193 KB**, plus 4 subset kecil ±31 KB.
- Gambar: 7 pemakaian `<img>`; sebagian wajar (preview blob, zoom bukti bayar). Hanya menu publik memakai `next/image`; thumbnail dashboard memakai `loading="lazy"` tetapi tanpa `width/height` (risiko CLS).

Halaman `realtime-test` tidak tertaut dari UI, memanggil `emitToChannel` dari komponen klien (tidak pernah mengirim event karena kredensial server tidak tersedia), dan menambah 149,7 KB chunk server ke bundle. Hapus halaman atau pindahkan ke server action.

**Perbaikan:** hapus/relokasi halaman diagnostik; kurangi bobot font menjadi 2–3 atau variable font; pertahankan `dynamic()` untuk chart; gunakan `next/image` + `sizes` untuk thumbnail R2.

### D-07 — Pencarian menu mengirim satu request per ketikan (Rendah)
**Lokasi:** `src/app/m/[token]/menu-client.tsx:65-86,144-145`; `src/app/api/public/menu/route.ts:12-14`

`queryKey` memuat `searchQuery` yang diubah langsung di `onChange`, tanpa debounce/`useDeferredValue`. Setiap karakter memicu `GET /api/public/menu`. Tiap request melakukan:

1. `INSERT ... ON CONFLICT` ke `RateLimit` (rate limiter DB),
2. lookup meja berdasarkan token,
3. query produk.

Menu hangat terukur 6,1–6,8 ms per request (cold 56 ms), tetapi 10 ketikan = 10 request + 10 tulis `RateLimit`. Batas 120/menit per IP juga dibagi seluruh pelanggan di balik NAT kafe yang sama, sehingga beberapa pelanggan dapat saling menolak (429).

**Reproduksi:** buka menu, ketik “kopi susu” cepat, lihat Network — 9 request berurutan.
**Diharapkan:** 1 request setelah jeda 300 ms.
**Aktual:** 1 request per karakter.

**Perbaikan:** debounce 300 ms atau `useDeferredValue`; naikkan/partisi rate limit menu per token meja alih-alih IP saja.

### D-08 — Migrasi aman tetapi `CREATE INDEX` memblokir tulis (Informasi)
**Lokasi:** `prisma/migrations/20261119062417_dashboard_indexes`, `20261119093000_security_hardening`, `20261119101500_quality_indexes`

Diverifikasi pada database kosong: keempat migrasi berhasil, lalu `prisma migrate diff` melaporkan tidak ada perbedaan dengan schema. Tidak ada operasi destruktif; `idempotencyKey` nullable + unique index aman untuk baris lama; aplikasi versi lama tetap dapat menulis karena kolom baru opsional.

Risiko operasional: semua `CREATE INDEX` memakai bentuk non-concurrent (Prisma default) sehingga mengunci penulisan tabel selama pembuatan. Pada `Order`/`AuditLog` produksi yang besar, jalankan manual `CREATE INDEX CONCURRENTLY` atau terapkan pada jendela sepi. Tidak ada down migration (Prisma forward-only); siapkan prosedur rollback manual.

## 4. EXPLAIN — 5 Query Tersering

| # | Query | Plan utama | Waktu SQL | Verdict |
|---|---|---|---|---|
| 1 | Antrean kasir — riwayat 50 (`ORDER BY updatedAt DESC`) | **Seq Scan `Order`** 30.370 baris + top-N sort | 11,8 ms (Prisma 128,8 ms) | **Mencurigakan**; tambah `(status, updatedAt)` |
| 2 | Daftar menu publik | Seq Scan `Product` 12 + `Category` 3 | 0,05 ms (service 1,2 ms) | Wajar (tabel kecil) |
| 3 | Ringkasan dashboard — composition/best seller | **Parallel Seq Scan `OrderItem` 135.895 + `Order` ±38–42 ribu**; hash join | 62–140 ms per agregat; best-seller Prisma 858 ms | **Mencurigakan**; cache + pra-agregasi |
| 3b | Best seller setelah generic plan | **Nested Loop ±38–42 ribu iterasi** + external merge 7.448 kB | 300,5 ms | Konfirmasi plan flip |
| 4 | Riwayat stok per produk | Index Scan Backward `(productId, createdAt)`, 500 baris | 0,9 ms (service 5,2 ms) | Baik |
| 5 | Daftar transaksi halaman 1 | Index Scan Backward `Transaction_occurredAt_idx` + incremental sort | 0,04 ms (service 2,6 ms) | Baik |
| — | KPI dashboard (today) | 3 index scan + seq scan `Product` 12 baris | 0,7 ms | Baik |
| — | Tally verifikasi kasir | **Seq Scan `Payment` 41.717 baris** | 10,3 ms | **Mencurigakan**; partial index |
| — | Kandidat expiry | Bitmap index status + filter `expiresAt` 3.750 baris | 12,2 ms | Cukup; tambah `(status, expiresAt)` |
| — | Meja aktif dashboard | Backward `Order_createdAt_idx` 10×, 35 baris dibuang/meja | 1,3 ms | Aman untuk 10 meja; rapuh jika meja banyak |

Seq scan yang wajar: `Product`/`Category` (belasan baris) dan `Order`/`Transaction` pada rentang tanggal yang mencakup hampir seluruh tabel (tidak ada jalur index yang lebih murah). Seq scan yang perlu ditindak: `Payment` (tally), `Order` (riwayat), dan `OrderItem` (agregasi berulang).

## 5. Benchmark

### 5.1 Data 500 pesanan × 90 hari (seed yang sudah ada)

| Operasi | p50 | p95 |
|---|---|---|
| `getDashboard("today")` | 4,0 ms | 7,4 ms |
| `getDashboard("month")` | 2,6 ms | 3,2 ms |
| `getDashboard("year")` | 5,7 ms | 6,4 ms |
| `listCashierOrders` | 2,8 ms | 3,4 ms |
| `getPublicMenu` | 1,3 ms | 1,6 ms |
| `listStockProducts` | 0,9 ms | 1,1 ms |
| `listStockMovements` | 1,0 ms | 1,1 ms |
| `listFinanceTransactions` | 1,4 ms | 1,7 ms |
| `getFinanceOverview` | 0,6 ms | 0,9 ms |

DB 10.134 kB. Pada skala ini tidak ada masalah performa.

### 5.2 Data 45.500 pesanan × 90 hari

| Operasi | p50 | p95 |
|---|---|---|
| `getDashboard("today")` | 73,1 ms | 91,2 ms |
| `getDashboard("month")` | 110,8 ms | 183,6 ms |
| `getDashboard("year")` | **974,3 ms** | **1.083,9 ms** |
| `listCashierOrders` | **201,1 ms** | **248,9 ms** |
| `getPublicMenu` | 1,2 ms | 1,4 ms |
| `listStockProducts` | 0,8 ms | 1,0 ms |
| `listStockMovements` | 5,2 ms | 11,0 ms |
| `listFinanceTransactions` | 2,6 ms | 3,0 ms |
| `getFinanceOverview` | 8,4 ms | 28,5 ms |

DB 112 MB. Kenaikan paling tajam: dashboard `year` **×171**, kasir **×72**, sementara menu/stok/keuangan tetap wajar.

### 5.3 HTTP (server produksi lokal, DB 45.500 pesanan)

| Endpoint | Waktu | Ukuran |
|---|---|---|
| `GET /api/public/menu?token=...` | 6,1–6,8 ms (warm), 56 ms (cold) | kecil |
| `POST /api/auth/login` | 129 ms | — |
| `GET /api/admin/dashboard?range=month` | 87–205 ms | 14.713 B |
| `GET /api/admin/dashboard?range=year` | 89–110 ms, spike **732–767 ms** | 14.713 B |
| `GET /api/admin/stock` | 8,5 ms | kecil |
| `GET /api/admin/finance/transactions` | 37,9 ms | — |
| `GET /api/cashier/orders` | **218 ms** | **3.337.797 B** |

### 5.4 Cron expiry

| Metrik | Nilai |
|---|---|
| Kandidat | 3.736 |
| Waktu total | **20,22 s** |
| Rata-rata | 5,4 ms/pesanan |
| Perkiraan query | ±18.000 |

## 6. Yang Sudah Benar (diverifikasi)

1. **Skema sesuai PRD §7** — model, enum, dan relasi utama sama; tambahan kolom (`printedAt`, `printCount`, `idempotencyKey`) dan indeks tambahan tidak melanggar.
2. **Indeks wajib ARCHITECTURE §6.2 lengkap** — termasuk `Order(status, createdAt)`, `Payment(orderId)`, `Transaction(type, occurredAt)`, `StockMovement(productId, createdAt)`, `Product(categoryId, isActive)`, `AuditLog(entity, entityId)`.
3. **Constraint unik penting ada** — `Order.code`, `Table.token`, `Table.name`, `User.username`, `Order.idempotencyKey`, `Transaction(orderId, category)`.
4. **`onDelete` konsisten** — `OrderItem`/`Payment` cascade, `Transaction`/`AuditLog` set null, `Product`/`Table` restrict (riwayat tidak ikut terhapus).
5. **Agregasi dashboard memakai SQL** (`$queryRaw`, `GROUP BY`, `date_trunc`), bukan mengambil semua baris ke Node; KPI 0,7 ms.
6. **Tidak ada N+1 di daftar keuangan/stok** — `toRows` mengumpulkan `userId`/`orderId` lalu satu query `IN`; riwayat stok juga mem-batch nama pengguna dan kode pesanan.
7. **Pagination** — transaksi, audit, dan riwayat pesanan memakai `skip/take` + count terpisah.
8. **Menu publik tidak waterfall** — katalog awal dirender server (`instant = false`) dan dipakai sebagai `initialData`; tidak ada fetch ganda saat mount.
9. **Komponen berat sudah dynamic** — Recharts dan `ProofViewer` dimuat terpisah; CSS 17,4 KB gz.
10. **Rate limiter terdistribusi di DB** — tidak bisa dilewati dengan menambah instance; tabel `RateLimit` punya indeks `resetAt` dan pembersihan cron.
11. **Migrasi reproduksibel** — dari DB kosong ke schema penuh tanpa drift.

## 7. Prioritas Perbaikan

1. **Segera (Tinggi):** D-01 (cache 15 detik + rewrite best-seller) dan D-02 (batasi antrean kasir).
2. **Sprint berikutnya (Sedang):** D-03 (batch expiry), D-04 (4 indeks), D-05 (batch checkout).
3. **Backlog (Rendah):** D-06 (hapus halaman diagnostik, kurangi font), D-07 (debounce pencarian).
4. **Operasional:** D-08 saat menerapkan migrasi indeks ke produksi (CONCURRENTLY + jendela sepi).

Target angka setelah perbaikan:

- Dashboard `year` ≤ 150 ms p95 (cache hangat ≤ 20 ms).
- `/api/cashier/orders` ≤ 100 ms dan ≤ 300 KB.
- Cron expiry ≤ 5 detik per batch.
- JS awal `/admin/settings/realtime-test` hilang; route admin lain turun 30–40 KB setelah font dirampingkan.

## 8. Perintah Verifikasi

```bash
# migrasi dari database kosong
DATABASE_URL=postgresql://... npx prisma migrate deploy
DATABASE_URL=postgresql://... npx prisma migrate diff \
  --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --exit-code

# seed 500 pesanan x 90 hari (sudah tersedia)
npm run db:seed && npm run db:seed:demo

# benchmark service
npm run bench:dashboard

# EXPLAIN manual
psql "$DATABASE_URL" -c 'EXPLAIN (ANALYZE, BUFFERS) SELECT ...'

# ukur endpoint
curl -s -o /dev/null -w '%{time_total}s %{size_download}B\n' \
  -b cookies.txt 'http://localhost:3000/api/cashier/orders'
```

## 9. Lampiran

- `npm run build` sukses (Next.js 16.4.6, Prisma 6.19.3); angka bundle diambil dari manifest `.next/server/app/**/page_client-reference-manifest.js` dan ukuran chunk sebenarnya (gzip level 9).
- Database uji dibuat dan di-drop selama audit; tidak ada data remote yang berubah.
- Tidak ada berkas aplikasi yang diubah. Satu-satunya berkas baru: `AUDTI-DATABASE-DAN-PERFORMA.md`.
- Temuan realtime (refetch saat reconnect, payload `stock.changed`, dsb.) ada di `AUDIT-REALTIME.md` dan tidak diulang di sini.
