# LOGIKA BISNIS & KONKURENSI — Laporan Audit

Tanggal: 2026-11-19
Mode: **read-only terhadap kode aplikasi** (tidak ada perubahan pada `src/**`, `prisma/**`, atau konfigurasi).
Ruang lingkup: `src/server/**`, route handler yang memanggilnya, `src/lib/tx.ts`, `prisma/schema.prisma`, serta cron `src/app/api/cron/expire-orders/route.ts`.
Perubahan yang dibuat hanya satu berkas tes audit: `tests/integration/business-concurrency.test.ts` (3 tes, semuanya **merah** pada kode saat ini).

## 1. Ringkasan

Total temuan: **16** — **2 Tinggi, 3 Sedang, 8 Rendah, 3 Informasi**. Tidak ada temuan Kritis.

Kabar baik: inti konkurensi sudah benar. Semua transisi `Order.status` melewati `order-state.ts` dan `UPDATE ... WHERE version = ? AND status = ?`; stok memakai `UPDATE ... WHERE stock >= qty`; approve/reject memakai optimistic locking; transaksi penjualan dibuat di transaksi DB yang sama dengan approve dan unik per `(orderId, kategori)`; cron idempoten; harga selalu dihitung ulang dari DB.

Risiko utama bukan kerusakan data, melainkan **pesanan macet** dan **kegagalan checkout**:
1. Kode pesanan hanya 2 byte acak (65.536 kombinasi/hari). Saat bentrok, checkout mengembalikan **HTTP 500** karena `P2002` dikira bentrok `Idempotency-Key` (K-01).
2. Pesanan berstatus `AWAITING_VERIFICATION` **tidak pernah kedaluwarsa**, pelanggan tidak bisa membatalkan, dan admin tidak punya jalur pembatalan. Stok terkunci sampai kasir bertindak (K-02).

## 2. Jawaban Ringkas atas 9 Pertanyaan Audit

| # | Pertanyaan | Jawaban | Bukti |
|---|---|---|---|
| 1 | Semua perubahan status lewat `order-state.ts`? Transisi ilegal? | **Ya untuk service yang dipakai route.** Tidak ada `prisma.order.update` di luar service; semua `updateMany` menyertakan `version` + status asal. `canAdvance` hanya mengizinkan `ACCEPTED→PREPARING→READY→COMPLETED`; lompatan ditolak 409. | `cashier-orders.ts:261,399,487`; `orders.ts:240,335,384`; `finance.ts:567`; `order-state.ts:28-45` |
| 2 | Stok atomik? Balance benar? Negatif / kembar? | **Reservasi & penyesuaian atomik** (`WHERE stock >= qty`, `RETURNING stock`). Balance per mutasi benar. Stok tidak bisa negatif. Pengembalian hanya terjadi setelah transisi status menang, jadi tidak kembar — **kecuali** bila `trackStock` produk diubah di tengah siklus (K-03). | `stock.ts:154-183,206-225,270-275` |
| 3 | Approve/reject optimistic lock? Idempoten? Dua kasir? | **Ya.** `UPDATE ... WHERE id AND version AND status`; yang kalah dapat 409 `ALREADY_PROCESSED`. Efek samping (payment, transaction, audit) hanya dari pemenang. Sudah diuji di `tests/cashier-orders.test.ts` tes 1. | `cashier-orders.ts:261-302,399-438` |
| 4 | Transaksi penjualan satu transaksi dengan approve? Unik? Koreksi pembatalan? | **Ya.** `tx.transaction.upsert` di dalam transaksi approve; unik `(orderId, category)`. Refund memakai `EXPENSE` + upsert, tetapi **layanannya tidak dipanggil route mana pun** (K-11). | `cashier-orders.ts:288-302`; `finance.ts:542-620`; `schema.prisma:201` |
| 5 | Cron aman ganda? Stok kembali tepat sekali? | **Ya.** Kandidat dibaca di luar, tetapi tiap pesanan dikunci ulang dengan `version`, `status`, dan `expiresAt`. Dua instance: satu menang, satu `count=0`. Stok hanya dikembalikan pemenang. | `orders.ts:367-418` |
| 6 | Total selalu dihitung server? Harga klien? | **Ya.** Klien hanya mengirim `productId`, `quantity`, `note`; harga diambil dari DB, `subtotal/total` dihitung server, snapshot disimpan. | `api/public/orders/route.ts:29-60,149-182` |
| 7 | Operasi multi-tabel tanpa `$transaction`? Deadlock? | Semua mutasi multi-tabel memakai `runInTransaction`; pengecualian: `recordRefundForOrder` (dead code, K-16) dan pembersihan R2 di luar transaksi (disengaja). **Deadlock mungkin** karena urutan kunci produk mengikuti urutan item dari klien (K-04). | `tx.ts:33-66`; `stock.ts:203-225`; `api/public/orders/route.ts:219-257` |
| 8 | Zona waktu Asia/Jakarta? Bug pergantian hari/bulan? | **Benar** untuk laporan: offset tetap +7 (WIB tanpa DST), batas hari/bulan dihitung manual, `date_trunc` digeser +7 jam. **Bug kecil**: kode pesanan memakai tanggal UTC, bukan WIB (K-10). | `finance.ts:23,71-129,146-178`; `dashboard.ts:129-180`; `api/public/orders/route.ts:188` |
| 9 | Kasus tepi? | Keranjang kosong, qty 0/negatif/>100, item >50, produk duplikat: **ditolak 400**. Upload melebihi batas: **409** dan dihitung server. Produk/meja dinonaktifkan di tengah checkout: **lolos** (K-05). Countdown habis saat upload: **bisa lolos** (K-06). | `api/public/orders/route.ts:34-60,169-176`; `orders.ts:185-208,218-260` |

## 3. Temuan

### K-01 — Bentrok kode pesanan menghasilkan HTTP 500 (Tinggi)
**Lokasi:** `src/app/api/public/orders/route.ts:188-190, 296-319`; `prisma/schema.prisma:133`

Kode pesanan = `ORD-<tanggal UTC>-<2 byte hex>` → hanya **65.536** kemungkinan per tanggal. `Order.code` unik. Jika `tx.order.create` gagal `P2002` karena `code`, blok catch menganggapnya bentrok `Idempotency-Key`, mencari order berdasarkan key tersebut, tidak menemukan apa pun, lalu meneruskan error ke `handleApiError` → **500**. Tidak ada regenerasi kode/retry.

Probabilitas bentrok (birthday): 100 pesanan/hari ≈ 7,3%; 200 ≈ 26%; 300 ≈ 49,7%; 500 ≈ 85%.

**Reproduksi otomatis:** `tests/integration/business-concurrency.test.ts` — `[K-01]`.
**Hasil aktual:** checkout kedua `500`, log `Unique constraint failed on the fields: (code)`.
**Hasil diharapkan:** checkout kedua `201` dengan kode berbeda (server regenerasi maksimal beberapa kali), atau `409` yang jelas—bukan 500.

**Perbaikan:**
- Naikkan entropi (minimal 6 byte / 12 hex, atau `nanoid(10)`).
- Tangani `P2002` berdasarkan `err.meta.target`: bila `code`, ulangi pembuatan kode (bounded retry); bila `idempotencyKey`, jalankan jalur replay.
- Tambahkan indeks/constraint yang sudah ada; tidak perlu ubah skema.

### K-02 — Pesanan `AWAITING_VERIFICATION` tidak punya jalur terminal (Tinggi)
**Lokasi:** `src/server/domain/order-state.ts:14-25`; `src/server/services/orders.ts:367-371`; `src/server/services/finance.ts:559-565`

`expireOrders` hanya membatalkan `AWAITING_PAYMENT` dan `PAYMENT_REJECTED`. `cancelOrderByCustomer` hanya menerima `AWAITING_PAYMENT`. `CANCELLABLE_BY_ADMIN` hanya `ACCEPTED/PREPARING/READY/COMPLETED` (dan layanannya tidak dipanggil route). Jadi setelah pelanggan mengunggah bukti, satu-satunya jalan keluar adalah kasir menekan approve/reject. Bila kasir tidak bertindak, pesanan dan **stok yang sudah direservasi tertahan selamanya**.

**Skenario uji manual (Kritis/Tinggi):**
1. Checkout produk tracked stok 10 sebanyak 2 → stok 8, status `AWAITING_PAYMENT`.
2. Unggah bukti → status `AWAITING_VERIFICATION`.
3. Jangan sentuh pesanan; tunggu melewati `expiresAt`; jalankan `GET /api/cron/expire-orders` (atau tunggu cron).
4. **Diharapkan:** pesanan otomatis `CANCELLED`, stok kembali 10, atau minimal admin dapat membatalkannya.
5. **Aktual:** status tetap `AWAITING_VERIFICATION`, `cancelled: 0`, stok tetap 8. Pelanggan juga mendapat 409 bila mencoba cancel.

**Perbaikan:**
- Tambahkan SLA verifikasi (mis. `expiresAt + N menit`): cron membatalkan `AWAITING_VERIFICATION` yang melewati SLA, mengembalikan stok, dan menandai payment `REJECTED`/`EXPIRED`.
- Alternatif minimal: izinkan admin membatalkan `AWAITING_VERIFICATION` lewat `cancelAcceptedOrder` yang sudah ada, dan buat route-nya.
- Audit setiap pembatalan otomatis.

### K-03 — `trackStock` dapat diubah tanpa konsistensi stok; pembatalan menambah stok hantu (Sedang)
**Lokasi:** `src/lib/validators/product.ts:66`; `src/server/services/products.ts:249`; `src/server/services/stock.ts:197-211`

Ada dua jalur mengubah `trackStock`:
- `updateStockSettings` (`stock.ts:330-422`): mengunci baris, menolkan stok saat tracking dimatikan, dan menulis `StockMovement`.
- `updateProduct` (`products.ts:238-255`): hanya menulis `trackStock`, tanpa menolak, tanpa menyesuaikan stok, tanpa movement.

`releaseStock` membaca `product.trackStock` **saat pembatalan**, bukan saat reservasi. Item yang dulu tidak dilacak (tidak pernah direservasi) akan ditambahkan ke stok bila produk sudah dilacak saat batal → stok fisik menggelembung.

**Reproduksi otomatis:** `tests/integration/business-concurrency.test.ts` — `[K-03]`.
**Hasil aktual:** stok 10 menjadi **12** setelah pembatalan order yang itemnya tidak pernah direservasi.
**Hasil diharapkan:** tetap 10.

**Perbaikan:**
- Larang perubahan `trackStock` lewat `updateProduct`; arahkan ke `updateStockSettings`.
- Simpan penanda reservasi per item (mis. `reservedQty`/`stockReserved`) atau tulis `ORDER_RESERVE` dengan `orderId`, lalu `releaseStock` hanya mengembalikan yang benar-benar pernah direservasi.
- Saat tracking dimatikan, rekonsiliasi order terbuka (tolak, atau catat adjustment eksplisit).

### K-04 — Deadlock dari urutan kunci produk yang dikendalikan klien (Sedang)
**Lokasi:** `src/app/api/public/orders/route.ts:219-257`; `src/server/services/stock.ts:203-225`; `src/lib/tx.ts:48-54`

Checkout mengunci baris `Product` dalam urutan item dari request. Dua keranjang `[A, B]` dan `[B, A]` yang berjalan bersamaan dapat saling menunggu → PostgreSQL membatalkan satu transaksi (`40P01`, Prisma `P2034`). `runInTransaction` tidak melakukan retry, dan `handleApiError` memetakannya ke 500. Hal yang sama dapat terjadi antara checkout dan pembatalan (`releaseStock` mengunci sesuai urutan `orderItem`).

**Skenario uji manual:**
1. Dua produk tracked dengan stok besar.
2. Kirim dua `POST /api/public/orders` bersamaan: keranjang 1 `[P1, P2]`, keranjang 2 `[P2, P1]`; ulangi 20–50 kali.
3. **Diharapkan:** keduanya 201, atau minimal yang kalah 409/503 dengan pesan retry.
4. **Aktual:** sebagian request 500 `Transaction failed due to a write conflict or a deadlock`.

**Perbaikan:**
- Urutkan item berdasarkan `productId` sebelum `reserveStock`/`releaseStock`, sehingga semua transaksi mengunci dalam urutan global yang sama.
- Retry `P2034` maksimal 2–3 kali dengan backoff kecil di `runInTransaction`.

### K-05 — TOCTOU produk/meja dinonaktifkan di tengah checkout (Rendah)
**Lokasi:** `src/app/api/public/orders/route.ts:130-176,193-257`; `src/server/services/stock.ts:152`

Produk dan meja dibaca **di luar** transaksi. Di dalam transaksi:
- Produk tracked: `reserveStock` memeriksa `isActive`/`deletedAt` — aman, tetapi kegagalan dilaporkan sebagai `STOCK_INSUFFICIENT` (pesan menyesatkan).
- Produk **non-tracked**: `reserveStock` langsung `return null` tanpa memeriksa `isActive`/`deletedAt` → order tetap dibuat untuk produk yang baru dinonaktifkan.
- Meja: tidak ada pemeriksaan ulang sama sekali → order bisa dibuat untuk meja yang baru dinonaktifkan.

**Perbaikan:** ulangi `SELECT ... FOR SHARE` produk+meja di dalam transaksi, atau masukkan `isActive`/`deletedAt` ke kondisi insert/relasi; seragamkan error menjadi `PRODUCT_UNAVAILABLE`/`TABLE_INACTIVE`.

### K-06 — Bukti bayar dapat diterima setelah `expiresAt` (Rendah)
**Lokasi:** `src/server/services/orders.ts:193-200,218-260`

Pemeriksaan kedaluwarsa hanya dilakukan sebelum file diproses. Di dalam transaksi, syaratnya hanya status dan `version`; `expiresAt` tidak diperiksa ulang. Bila batas waktu lewat selama unggah (file besar/jaringan lambat) dan cron belum sempat berjalan, bukti tetap masuk dan status menjadi `AWAITING_VERIFICATION`.

**Perbaikan:** tambahkan `expiresAt: { gt: new Date() }` pada `updateMany` di dalam transaksi (atau `AND "expiresAt" > NOW()`), lalu perlakukan `count=0` sebagai `ORDER_EXPIRED` dan hapus objek.

### K-07 — `StockMovement` reservasi tidak menyimpan `orderId` (Rendah)
**Lokasi:** `src/server/services/stock.ts:175-183`

`ORDER_RESERVE` hanya menulis `note` berisi kode order; `orderId` dibiarkan `null`. Akibatnya laporan mutasi tidak bisa menghubungkan reservasi ke pesanan, dan rekonsiliasi/deteksi drift bergantung pada parsing string.

**Reproduksi otomatis:** `tests/integration/business-concurrency.test.ts` — `[K-07]`.
**Hasil aktual:** `orderId = null`; **diharapkan:** `orderId` terisi.

**Perbaikan:** tambahkan parameter `orderId` ke `reserveStock` dan tulis ke `StockMovement` (schema sudah menyediakan kolomnya).

### K-08 — Urutan ledger stok dapat menyesatkan (Rendah)
**Lokasi:** `prisma/schema.prisma:116`; `src/server/services/stock.ts:154-183,206-225`

`StockMovement.createdAt` memakai `@default(now())`, yang di PostgreSQL adalah **waktu mulai transaksi**, bukan waktu statement. Pada transaksi bersamaan, dua movement dapat tersimpan dengan `balance` yang benar tetapi urutan `createdAt` terbalik dari urutan kunci baris. `listStockMovements` mengurutkan `createdAt desc`, sehingga saldo terlihat melompat (mis. 6 → 8).

**Perbaikan:** isi `createdAt` dengan `clock_timestamp()` lewat raw insert, atau tambahkan kolom sequence/`id` yang monoton dan urutkan berdasarkan itu; jangan mengandalkan `now()` untuk ledger.

### K-09 — KPI “pesanan hari ini” menghitung pesanan `CANCELLED` (Rendah)
**Lokasi:** `src/server/services/dashboard.ts:129-138`

Subquery `pesananHariIni` hanya memfilter `createdAt`; tidak ada filter status. Seri pesanan juga menghitung semua status. Dampak: KPI dan grafik membengkak oleh pesanan batal; keputusan operasional (mis. “rame hari ini”) menyesatkan. `komposisi` hanya mengecualikan `CANCELLED`, tetapi masih memasukkan `AWAITING_PAYMENT`/`PAYMENT_REJECTED`.

**Perbaikan:** sepakati definisi (mis. hanya `COMPLETED` untuk penjualan; semua kecuali `CANCELLED` untuk traffic), lalu terapkan filter status yang sama di KPI, seri, dan komposisi.

### K-10 — Tanggal pada kode pesanan memakai UTC, bukan WIB (Rendah)
**Lokasi:** `src/app/api/public/orders/route.ts:188`

`now.toISOString().slice(0,10)` menghasilkan tanggal UTC. Antara 00:00–06:59 WIB, kode pesanan menampilkan tanggal kemarin. Ini juga memperluas ruang bentrok K-01 melintasi dua hari bisnis WIB.

**Perbaikan:** format tanggal dengan offset +7 (fungsi yang sama dengan `finance.ts`) atau simpan `createdAt` dan turunkan kode dari WIB.

### K-11 — Pembatalan/refund setelah ACCEPTED adalah dead code (Rendah)
**Lokasi:** `src/server/services/finance.ts:494-536,542-620`

`cancelAcceptedOrder` sudah benar secara transaksional: kunci versi, `upsert` Refund `EXPENSE`, audit, `releaseStock`, emit realtime. Namun **tidak ada route atau pemanggil** — grep hanya menemukan definisinya. Artinya admin tidak dapat membatalkan pesanan yang sudah dibayar dari aplikasi, dan koreksi keuangan tidak pernah berjalan.

**Perbaikan:** buat route admin (mis. `POST /api/admin/orders/[id]/cancel`) + UI, atau hapus layanan bila fitur memang tidak diperlukan. Bila diaktifkan, masukkan juga `AWAITING_VERIFICATION` (lihat K-02).

### K-12 — `markOrderPrinted` tidak memeriksa status (Rendah)
**Lokasi:** `src/server/services/cashier-orders.ts:514-549`

Endpoint cetak menerima pesanan dalam status apa pun (`AWAITING_PAYMENT`, `CANCELLED`, `PAYMENT_REJECTED`) dan menaikkan `printCount`. Tidak merusak data, tetapi struk dapat dicetak untuk pesanan yang belum dibayar/batal, dan metrik cetak menjadi tidak bermakna.

**Perbaikan:** batasi ke `ACCEPTED/PREPARING/READY/COMPLETED` atau definisikan ulang sebagai “cetak struk apa pun” secara eksplisit.

### K-13 — Soft delete produk menyembunyikan stok tanpa penyesuaian (Rendah)
**Lokasi:** `src/server/services/products.ts:309-319`

Produk yang pernah dipesan di-soft-delete (`deletedAt`, `isActive=false`) tanpa `StockMovement`. Stok yang tersisa hilang dari halaman stok (`listStockProducts` memfilter `deletedAt: null`) dan tidak pernah direkonsiliasi. Hard delete juga menghapus seluruh `StockMovement` produk (baris 326), menghilangkan jejak audit.

**Perbaikan:** saat menghapus produk tracked dengan stok > 0, tulis `ADJUSTMENT`/`WASTE` beserta alasannya; pertahankan movement untuk audit (jangan `deleteMany`).

### K-14 — `adjustStock` memeriksa `trackStock` di luar transaksi (Informasi)
**Lokasi:** `src/server/services/stock.ts:246-275`

Pre-check `trackStock` dan `deletedAt` dilakukan di luar transaksi; `UPDATE` di dalam transaksi tidak menyertakan kedua kondisi itu. Bila admin menonaktifkan tracking/menghapus produk di antara keduanya, penyesuaian tetap berjalan dan menulis movement untuk produk yang sudah tidak dilacak.

**Perbaikan:** tambahkan `AND "trackStock" = true AND "deletedAt" IS NULL` ke `UPDATE`, dan petakan `0 rows` ke 409.

### K-15 — Query cron tidak memakai indeks `expiresAt` dan tidak dibatasi (Informasi)
**Lokasi:** `src/server/services/orders.ts:370-378`; `prisma/schema.prisma:153-154`

Kandidat diambil dengan `status IN (...) AND expiresAt <= now`. Indeks yang ada `(status, createdAt)` dan `(createdAt)`; tidak ada indeks `expiresAt`. Semua kandidat diproses satu per satu tanpa `LIMIT`. Secara fungsional aman (idempoten), tetapi biaya query/loop tumbuh seiring data. `SKIP LOCKED` tidak diperlukan untuk correctness, hanya untuk throughput multi-instance.

**Perbaikan:** tambahkan `@@index([status, expiresAt])`, batasi batch (mis. 200), dan pertimbangkan `FOR UPDATE SKIP LOCKED` bila cron dapat overlap.

### K-16 — `recordRefundForOrder` memakai check-then-create di luar transaksi (Informasi)
**Lokasi:** `src/server/services/finance.ts:494-536`

Fungsi ini membaca `existing`, lalu `create` tanpa transaksi/unique-catch. Dua panggilan bersamaan dapat sama-sama lolos pengecekan; yang kalah mendapat `P2002` (unique `orderId_category`) dan error mentah. Saat ini fungsi tidak dipanggil siapa pun, jadi dampaknya nol — tetapi berbahaya bila nanti diaktifkan.

**Perbaikan:** gunakan `upsert` (seperti `cancelAcceptedOrder`) atau bungkus dalam transaksi dan tangani `P2002` sebagai `created: false`.

## 4. Yang Sudah Benar (diverifikasi)

1. **State machine** — `NEXT_STATUS` satu sumber; `advanceOrderStatus` memvalidasi `canAdvance` dan mengunci ulang `version` + status. Tidak ada jalur `AWAITING_PAYMENT → COMPLETED`; endpoint progres hanya menerima `PREPARING/READY/COMPLETED`, dan status asal harus cocok.
2. **Stok tidak negatif** — reservasi dan penyesuaian memakai `UPDATE ... WHERE stock >= qty` + `RETURNING`; 20 checkout paralel untuk stok 5 sudah diuji dan menghasilkan tepat 5 sukses (`tests/order-stock-tracking.test.ts`).
3. **Approve/reject** — optimistic locking benar; dua kasir bersamaan → satu sukses, satu `ALREADY_PROCESSED`; double-click tidak menggandakan `Payment`, `Transaction`, atau audit.
4. **Keuangan** — penjualan `INCOME` dibuat di transaksi yang sama dengan approve, `upsert` pada `(orderId, "Penjualan")`; refund `EXPENSE` juga `upsert`; transaksi penjualan tidak dapat diedit/dihapus manual.
5. **Cron** — idempoten karena transisi status bersyarat; stok hanya dikembalikan oleh pemenang; aman dijalankan ganda.
6. **Harga** — total dihitung dari harga DB; klien tidak bisa mengirim `price`, `subtotal`, `total`, `status`, atau `version` yang memengaruhi order.
7. **Zona waktu** — offset +7 tetap konsisten untuk WIB (tanpa DST); batas hari/bulan dan `date_trunc` digeser dengan benar; hanya kode pesanan yang memakai UTC (K-10).
8. **Validasi keranjang** — kosong, qty 0/negatif/>100, >50 item, dan produk duplikat ditolak 400; idempotensi checkout mengembalikan order yang sama untuk key+meja yang sama.
9. **Upload** — batas percobaan dihitung ulang di dalam transaksi; file yatim dihapus bila transaksi gagal; dua unggahan bersamaan hanya satu yang menang (`version`).

## 5. Tes Konkurensi

Berkas: `tests/integration/business-concurrency.test.ts` (baru, tidak mengubah kode aplikasi).

Perintah:
```bash
npx tsx --env-file=.env.test --import dotenv/config --test tests/integration/business-concurrency.test.ts
```

Hasil saat ini: **3 tes, 0 lulus, 3 gagal** — sesuai temuan.

| Tes | Temuan | Aktual | Harapan |
|---|---|---|---|
| `[K-01] kode pesanan bentrok…` | K-01 | HTTP **500** (unique `code`) | 201 dengan kode baru |
| `[K-03] pembatalan tidak boleh menambah stok…` | K-03 | stok **12** | stok **10** |
| `[K-07] StockMovement ORDER_RESERVE…` | K-07 | `orderId = null` | `orderId = order.id` |

Catatan: tes ini sengaja merah dan akan ikut terjaring `npm test` (`tests/**/*.test.ts`). Jadikan gerbang “harus hijau sebelum rilis”, atau pindahkan ke job audit terpisah bila pipeline utama harus tetap hijau.

## 6. Prioritas Perbaikan

1. **Sebelum rilis:** K-01 (retry/entropi kode) dan K-02 (SLA verifikasi + jalur pembatalan admin).
2. **Sprint berikutnya:** K-03 (reservasi eksplisit per item), K-04 (urutkan kunci + retry `P2034`), K-06 (`expiresAt` di dalam transaksi).
3. **Backlog:** K-05, K-07–K-13; K-08 dan K-15 saat volume transaksi naik.
4. **Bersihkan:** K-11 (dead code) dan K-16 sebelum fitur refund diaktifkan.

## 7. Lampiran — Bukti Baca Kode

Berkas utama yang diperiksa: `order-state.ts`, `orders.ts`, `cashier-orders.ts`, `stock.ts`, `finance.ts`, `dashboard.ts`, `products.ts`, `settings.ts`, `tx.ts`, `api/public/orders/route.ts`, `api/cron/expire-orders/route.ts`, `prisma/schema.prisma`, `lib/validators/{order,product,stock,finance}.ts`.

Perintah kunci:
```bash
# semua update status order
Select-String -Path src -Include *.ts -Recurse -Pattern '\.order\.(update|updateMany|upsert)'
# semua titik transaksi
Select-String -Path src -Include *.ts -Recurse -Pattern '\$transaction|runInTransaction'
# pemanggil layanan refund
Select-String -Path src -Include *.ts -Recurse -Pattern 'cancelAcceptedOrder|recordRefundForOrder'
# tes audit
npx tsx --env-file=.env.test --import dotenv/config --test tests/integration/business-concurrency.test.ts
```

Tidak ada perubahan pada kode aplikasi. Laporan ini dan berkas tes bersifat untracked.
