# PRD — Sistem Pemesanan Makanan & Minuman via QR Meja (Realtime)

**Versi:** 1.0 | **Tanggal:** 16 November 2026 | **Status:** Draft siap dikembangkan

---

## 1. Ringkasan

Aplikasi web pemesanan makanan dan minuman untuk kafe/restoran. Customer memindai **QR/Barcode di meja**, memilih menu, membayar (transfer/QRIS) lalu **mengunggah bukti pembayaran**. **Kasir** menerima notifikasi pesanan secara **realtime**, memverifikasi bukti bayar (setuju/tolak), lalu **mencetak pesanan**. **Super Admin** mengelola menu, kasir, stok, keuangan, dan QR meja melalui dashboard.

Seluruh perubahan status tampil **tanpa refresh halaman** (Pusher).

### 1.1 Tujuan

1. Menghilangkan antrean pemesanan manual di kasir.
2. Pembayaran terverifikasi dan tercatat otomatis ke modul keuangan.
3. Stok selalu akurat dan terpantau.
4. Semua pihak (customer, kasir, admin) melihat status terbaru secara realtime.

### 1.2 Di Luar Lingkup (v1)

- Payment gateway otomatis (Midtrans/Xendit); v1 memakai verifikasi manual bukti transfer.
- Aplikasi mobile native.
- Multi-cabang/multi-tenant.
- Login/akun customer (customer anonim lewat QR meja).
- Resep/bahan baku (stok dihitung per produk, bukan per bahan).

---

## 2. Peran Pengguna

| Peran | Akses | Autentikasi |
| --- | --- | --- |
| **Super Admin** | Semua modul dashboard | Username + password |
| **Kasir** | Antrean pesanan, verifikasi bayar, cetak | Nama kasir (username) + password, dibuat oleh Super Admin |
| **Customer** | Menu, keranjang, bayar, upload bukti, lacak status | Tanpa login; identitas = token meja + kode pesanan |

---

## 3. Tech Stack

| Lapisan | Teknologi |
| --- | --- |
| Framework | Next.js (App Router, TypeScript, Server Components + Route Handlers + Server Actions) |
| Database | PostgreSQL + Prisma ORM |
| Storage | Cloudflare R2 (S3-compatible, `@aws-sdk/client-s3`) |
| Realtime | Pusher Channels (`pusher` server, `pusher-js` client) |
| Konversi gambar | `sharp` → AVIF |
| UI | Tailwind CSS + shadcn/ui, Recharts (grafik), lucide-react (ikon) |
| State/data client | TanStack Query (cache + invalidasi via event Pusher), Zustand (keranjang) |
| Validasi | Zod |
| Auth | Session cookie httpOnly (JWT via `jose`) + hash password `argon2`/`bcryptjs`, middleware role guard |
| QR | `qrcode` (generate PNG/SVG) |
| Cetak | CSS `@media print` struk 58/80 mm (`window.print`) |

---

## 4. Alur Utama

### 4.1 Alur Customer

1. Scan QR meja → buka `/m/{tableToken}` (meja terdeteksi otomatis).
2. Telusuri menu (tab: Makanan, Kopi, Non Kopi), cari, lihat stok.
3. Tambah ke keranjang (qty, catatan per item).
4. Checkout → isi nama (opsional), catatan → pesanan dibuat berstatus `AWAITING_PAYMENT`, stok **direservasi**.
5. Halaman pembayaran: total, QRIS/rekening, **batas waktu 15 menit**.
6. Upload bukti bayar (dikonversi ke AVIF) → status `AWAITING_VERIFICATION`.
7. Menunggu verifikasi (halaman live):
   - **Disetujui** → `ACCEPTED` (pesanan diterima) → `PREPARING` → `READY` → `COMPLETED`.
   - **Ditolak** → `PAYMENT_REJECTED` + alasan; customer boleh upload ulang (maks 3x), setelah itu atau jika waktu habis → `CANCELLED`, stok dikembalikan.

### 4.2 Alur Kasir

1. Login → halaman antrean. Pesanan baru masuk **realtime** + bunyi notifikasi + badge.
2. Buka detail pesanan → cek item & total.
3. Cek bukti pembayaran (zoom) → bandingkan nominal.
4. Pilih **Setuju** (pesanan diterima) atau **Tolak** (wajib pilih/isi alasan: nominal tidak sesuai, bukti buram, dll).
5. Jika setuju → **Cetak pesanan** (struk/ticket dapur) → ubah status ke Preparing → Ready → Completed.

### 4.3 State Machine Pesanan

```
AWAITING_PAYMENT ──upload bukti──▶ AWAITING_VERIFICATION
AWAITING_PAYMENT ──timeout/batal──▶ CANCELLED
AWAITING_VERIFICATION ──setuju──▶ ACCEPTED ──▶ PREPARING ──▶ READY ──▶ COMPLETED
AWAITING_VERIFICATION ──tolak──▶ PAYMENT_REJECTED ──upload ulang──▶ AWAITING_VERIFICATION
PAYMENT_REJECTED ──lewat batas/maks upload──▶ CANCELLED
```

Transisi di luar peta ini **ditolak** server (validasi di service layer).

---

## 5. Kebutuhan Fungsional

### 5.1 Super Admin — Ringkasan (Dashboard)

- **FR-A1** Kartu statistik: Pesanan Hari Ini, Pendapatan Hari Ini, Menunggu Verifikasi, Stok Menipis. Semua realtime.
- **FR-A2** Grafik "Statistik Penjualan" (Pemasukan / Pengeluaran / Jumlah Pesanan), filter Hari Ini, Minggu Ini, Bulan Ini, Tahun Ini; toggle series; tooltip.
- **FR-A3** Kartu profil admin + donut ringkas komposisi penjualan per kategori (Makanan, Kopi, Non Kopi).
- **FR-A4** "Aktivitas Terbaru": pesanan masuk, verifikasi, stok menipis, transaksi, dengan waktu relatif ("12 menit lalu"), scroll tak terbatas.
- **FR-A5** "Menu Terlaris" (kartu horizontal) dan "Kasir Aktif / Meja Aktif" (kartu horizontal).
- **FR-A6** Pencarian global di topbar (menu, pesanan, meja), ikon notifikasi dengan badge.

### 5.2 Super Admin — Manajemen Makanan & Minuman

- **FR-M1** CRUD produk: nama, deskripsi, harga, gambar (AVIF), kategori, status aktif/nonaktif, SKU opsional.
- **FR-M2** Struktur kategori: **Makanan**; **Minuman → Kopi** dan **Non Kopi**. Field `type` (FOOD/DRINK) dan `subtype` (COFFEE/NON_COFFEE) pada kategori.
- **FR-M3** Tabel dengan pencarian, filter kategori, filter status, paginasi, sort.
- **FR-M4** Toggle "tersedia" cepat; produk nonaktif atau stok 0 tampil "Habis" di customer.
- **FR-M5** Soft delete (produk yang pernah dipesan tidak dihapus permanen).

### 5.3 Super Admin — Manajemen Kasir

- **FR-K1** CRUD kasir: nama kasir, username, password (hash), status aktif.
- **FR-K2** Reset password; password tidak pernah ditampilkan ulang.
- **FR-K3** Nonaktifkan kasir = sesi aktif langsung tidak valid.
- **FR-K4** Riwayat aktivitas kasir (jumlah verifikasi setuju/tolak, last login).

### 5.4 Super Admin — Manajemen Stok

- **FR-S1** Stok per produk (angka), batas minimum (`lowStockThreshold`).
- **FR-S2** Penyesuaian stok: Barang Masuk, Koreksi, Rusak/Waste dengan catatan; semua tercatat di `StockMovement`.
- **FR-S3** Stok berkurang otomatis saat checkout (reservasi) dan kembali otomatis jika pesanan dibatalkan.
- **FR-S4** Peringatan stok menipis (badge + event realtime + aktivitas terbaru).
- **FR-S5** Riwayat pergerakan stok per produk dengan filter tanggal.
- **FR-S6** Opsi produk tanpa pelacakan stok (`trackStock=false`, misal produk selalu tersedia).

### 5.5 Super Admin — Manajemen Keuangan

- **FR-F1** Pemasukan otomatis tercatat saat pembayaran disetujui (tautan ke pesanan).
- **FR-F2** Pemasukan manual (lainnya) dan Pengeluaran manual (kategori: Bahan Baku, Gaji, Listrik/Air, Sewa, Operasional, Lainnya) dengan lampiran bukti opsional.
- **FR-F3** Ringkasan: total pemasukan, pengeluaran, laba bersih per rentang tanggal; grafik tren.
- **FR-F4** Tabel transaksi dengan filter (jenis, kategori, tanggal), ekspor CSV.
- **FR-F5** Pembatalan pesanan setelah disetujui menghasilkan transaksi koreksi (refund), bukan menghapus data.

### 5.6 Super Admin — Manajemen Barcode Meja

- **FR-T1** CRUD meja (nomor/nama meja, area opsional, status aktif).
- **FR-T2** Setiap meja punya `token` acak unik; QR memuat URL `{BASE_URL}/m/{token}`.
- **FR-T3** Pratinjau QR, unduh PNG/SVG satuan, cetak lembar QR (A4 grid) semua meja dengan label "Meja X".
- **FR-T4** Regenerasi token (QR lama menjadi tidak valid).
- **FR-T5** Pengaturan metode bayar: gambar QRIS, rekening bank (nama bank, no rekening, atas nama), instruksi.

### 5.7 Kasir

- **FR-C1** Antrean pesanan realtime dengan tab: Perlu Verifikasi, Diproses, Siap, Selesai/Ditolak.
- **FR-C2** Notifikasi pesanan/bukti bayar baru: toast + suara + badge (suara bisa dimatikan).
- **FR-C3** Detail pesanan: meja, item, catatan, total, waktu, bukti bayar (viewer zoom, presigned URL privat).
- **FR-C4** Setuju: konfirmasi → status `ACCEPTED`, catat pemasukan, trigger cetak.
- **FR-C5** Tolak: wajib alasan (preset + teks bebas), customer diberi tahu realtime.
- **FR-C6** Cetak pesanan: layout struk 58/80 mm berisi nomor pesanan, meja, waktu, item+catatan, total, status bayar. Tombol Cetak Ulang.
- **FR-C7** Ubah status Preparing → Ready → Completed.
- **FR-C8** Pesanan yang sudah ditangani kasir lain tidak bisa diproses ganda (optimistic locking, lihat 9.3).

### 5.8 Customer

- **FR-U1** Landing `/m/{token}`: nama kafe, nomor meja, daftar menu (tab kategori, pencarian).
- **FR-U2** Keranjang (Zustand + localStorage per meja): ubah qty, catatan, hapus, total.
- **FR-U3** Checkout membuat pesanan + reservasi stok; stok tak cukup → pesan jelas dan keranjang disesuaikan.
- **FR-U4** Halaman bayar: total, QRIS/rekening, countdown, tombol salin nomor rekening.
- **FR-U5** Upload bukti (JPG/PNG/WEBP/HEIC maks 10 MB), pratinjau, dikonversi ke AVIF di server.
- **FR-U6** Halaman status realtime `/order/{code}`: stepper (Menunggu Pembayaran → Menunggu Verifikasi → Diterima → Diproses → Siap), alasan penolakan, tombol upload ulang.
- **FR-U7** Pesanan aktif tetap bisa dibuka lagi (kode pesanan tersimpan di cookie/localStorage).

### 5.9 Fitur Pendukung — Konversi Gambar ke AVIF

- **FR-I1** Semua upload gambar (menu, bukti bayar, QRIS, lampiran pengeluaran) melewati pipeline: validasi → resize → AVIF → R2.
- **FR-I2** Input: JPG, JPEG, PNG, WEBP, GIF (frame pertama), HEIC/HEIF (jika libvips mendukung), TIFF, BMP.
- **FR-I3** Validasi magic bytes (bukan hanya ekstensi), batas ukuran 10 MB, batas dimensi (maks 4096 px sisi terpanjang sebelum resize).
- **FR-I4** Output AVIF: gambar menu maks lebar 1200 px (quality ≈ 55); bukti bayar maks 1600 px (quality ≈ 60, teks tetap terbaca); thumbnail 320 px untuk daftar.
- **FR-I5** Hapus metadata EXIF, rotasi otomatis sesuai orientasi.
- **FR-I6** Nama file acak (`nanoid`), key R2 terstruktur: `products/`, `proofs/`, `payment-methods/`, `expenses/`.
- **FR-I7** Tampilkan `<img>` AVIF dengan fallback aman (semua browser modern mendukung AVIF; sertakan `Accept` check bila perlu).

---

## 6. Spesifikasi Realtime (Pusher)

### 6.1 Channel

| Channel | Tipe | Pelanggan |
| --- | --- | --- |
| `private-cashier` | private | Kasir & Super Admin |
| `private-admin` | private | Super Admin |
| `private-order-{code}` | private | Customer pemilik pesanan (auth lewat cookie token pesanan) |
| `private-table-{token}` | private | Customer di meja (update ketersediaan menu/stok) |

Endpoint auth: `/api/pusher/auth` — memeriksa sesi role atau kepemilikan pesanan sebelum menandatangani.

### 6.2 Event

| Event | Channel | Pemicu | Payload (kecil, hanya id & ringkasan) |
| --- | --- | --- | --- |
| `order.created` | cashier, admin | Checkout | `{orderId, code, tableNo, total}` |
| `payment.uploaded` | cashier, admin | Bukti diunggah | `{orderId, code, attempt}` |
| `order.status_changed` | cashier, admin, order-{code} | Setuju/tolak/ubah status | `{orderId, code, status, reason?}` |
| `stock.changed` | admin, table-* | Reservasi/penyesuaian | `{productId, stock, available}` |
| `stock.low` | admin | Stok ≤ minimum | `{productId, name, stock}` |
| `transaction.created` | admin | Pemasukan/pengeluaran | `{id, type, amount}` |
| `kpi.updated` | admin | Setelah perubahan relevan | `{}` (client refetch) |

Aturan: payload < 10 KB; client menerima event lalu **invalidate query TanStack** (sumber kebenaran tetap DB). Trigger dilakukan **setelah** transaksi DB commit. Saat koneksi putus/pulih, client otomatis refetch (`pusher.connection.bind('connected')`).

---

## 7. Model Data (Prisma)

```prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }

enum Role { SUPER_ADMIN CASHIER }
enum CategoryType { FOOD DRINK }
enum DrinkSubtype { COFFEE NON_COFFEE }
enum OrderStatus { AWAITING_PAYMENT AWAITING_VERIFICATION PAYMENT_REJECTED ACCEPTED PREPARING READY COMPLETED CANCELLED }
enum PaymentStatus { PENDING APPROVED REJECTED }
enum TxType { INCOME EXPENSE }
enum StockMoveType { PURCHASE ADJUSTMENT WASTE ORDER_RESERVE ORDER_RELEASE }

model User {
  id           String   @id @default(cuid())
  name         String
  username     String   @unique
  passwordHash String
  role         Role
  isActive     Boolean  @default(true)
  tokenVersion Int      @default(0)   // naikkan untuk invalidasi sesi
  lastLoginAt  DateTime?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  verifications Payment[] @relation("VerifiedBy")
  auditLogs    AuditLog[]
}

model Category {
  id        String        @id @default(cuid())
  name      String
  type      CategoryType
  subtype   DrinkSubtype?          // wajib bila type = DRINK
  sortOrder Int           @default(0)
  products  Product[]
  @@unique([name, type])
}

model Product {
  id          String   @id @default(cuid())
  name        String
  description String?
  price       Int                     // rupiah, tanpa desimal
  imageKey    String?                 // key R2 (AVIF)
  thumbKey    String?
  categoryId  String
  category    Category @relation(fields: [categoryId], references: [id])
  isActive    Boolean  @default(true)
  trackStock  Boolean  @default(true)
  stock       Int      @default(0)
  lowStockThreshold Int @default(5)
  deletedAt   DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  orderItems  OrderItem[]
  movements   StockMovement[]
  @@index([categoryId, isActive])
}

model StockMovement {
  id        String        @id @default(cuid())
  productId String
  product   Product       @relation(fields: [productId], references: [id])
  type      StockMoveType
  quantity  Int                       // + masuk, - keluar
  balance   Int                       // stok setelah perubahan
  note      String?
  orderId   String?
  userId    String?
  createdAt DateTime      @default(now())
  @@index([productId, createdAt])
}

model Table {
  id        String  @id @default(cuid())
  name      String  @unique            // "Meja 1"
  area      String?
  token     String  @unique            // acak 16+ karakter
  isActive  Boolean @default(true)
  orders    Order[]
  createdAt DateTime @default(now())
}

model Order {
  id            String      @id @default(cuid())
  code          String      @unique     // contoh: ORD-241116-A7K2
  accessToken   String                  // rahasia customer untuk lacak pesanan
  tableId       String
  table         Table       @relation(fields: [tableId], references: [id])
  customerName  String?
  note          String?
  subtotal      Int
  total         Int
  status        OrderStatus @default(AWAITING_PAYMENT)
  expiresAt     DateTime                // batas bayar
  version       Int         @default(0) // optimistic locking
  items         OrderItem[]
  payments      Payment[]
  transactions  Transaction[]
  printedAt     DateTime?
  printCount    Int         @default(0)
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt
  @@index([status, createdAt])
}

model OrderItem {
  id          String  @id @default(cuid())
  orderId     String
  order       Order   @relation(fields: [orderId], references: [id], onDelete: Cascade)
  productId   String
  product     Product @relation(fields: [productId], references: [id])
  nameSnapshot  String
  priceSnapshot Int
  quantity    Int
  note        String?
}

model Payment {
  id           String        @id @default(cuid())
  orderId      String
  order        Order         @relation(fields: [orderId], references: [id], onDelete: Cascade)
  attempt      Int           @default(1)
  proofKey     String                    // key R2 privat (AVIF)
  status       PaymentStatus @default(PENDING)
  rejectReason String?
  verifiedById String?
  verifiedBy   User?         @relation("VerifiedBy", fields: [verifiedById], references: [id])
  verifiedAt   DateTime?
  createdAt    DateTime      @default(now())
  @@index([orderId])
}

model Transaction {
  id         String   @id @default(cuid())
  type       TxType
  category   String                    // "Penjualan", "Bahan Baku", dst
  amount     Int
  note       String?
  attachKey  String?
  orderId    String?
  order      Order?   @relation(fields: [orderId], references: [id])
  createdById String?
  occurredAt DateTime @default(now())
  createdAt  DateTime @default(now())
  @@index([type, occurredAt])
}

model PaymentMethod {
  id        String  @id @default(cuid())
  kind      String                     // QRIS | BANK
  label     String
  accountNo String?
  accountName String?
  imageKey  String?                    // gambar QRIS (AVIF)
  isActive  Boolean @default(true)
  sortOrder Int     @default(0)
}

model Setting {
  key   String @id
  value Json                           // nama kafe, logo, timeout bayar, maks upload ulang, footer struk
}

model AuditLog {
  id        String   @id @default(cuid())
  userId    String?
  user      User?    @relation(fields: [userId], references: [id])
  action    String                     // "payment.approve", "stock.adjust", dst
  entity    String
  entityId  String
  meta      Json?
  createdAt DateTime @default(now())
  @@index([entity, entityId])
}
```

---

## 8. Peta Route

### 8.1 Halaman

| Route | Peran |
| --- | --- |
| `/m/[token]` | Customer — menu |
| `/m/[token]/cart` | Customer — keranjang & checkout |
| `/order/[code]` | Customer — bayar, upload bukti, status live |
| `/login` | Admin & Kasir |
| `/admin` (Ringkasan), `/admin/menu`, `/admin/cashiers`, `/admin/stock`, `/admin/finance`, `/admin/tables`, `/admin/settings` | Super Admin |
| `/cashier`, `/cashier/orders/[id]`, `/cashier/orders/[id]/print` | Kasir |

### 8.2 API (Route Handlers)

| Endpoint | Fungsi |
| --- | --- |
| `POST /api/auth/login`, `POST /api/auth/logout` | Sesi |
| `GET /api/public/menu?table=token` | Menu + ketersediaan |
| `POST /api/public/orders` | Checkout (validasi harga & stok di server) |
| `POST /api/public/orders/[code]/payment` | Upload bukti (multipart) |
| `GET /api/public/orders/[code]` | Status (butuh `accessToken`) |
| `POST /api/cashier/orders/[id]/approve` / `reject` / `status` | Verifikasi & progres |
| `GET /api/cashier/orders/[id]/proof` | Presigned URL bukti (berumur 60 detik) |
| `/api/admin/{products,categories,cashiers,stock,transactions,tables,payment-methods,settings,dashboard}` | CRUD & agregasi |
| `POST /api/upload/image` | Upload + konversi AVIF (internal) |
| `POST /api/pusher/auth` | Otorisasi channel |
| `GET /api/cron/expire-orders` | Batalkan pesanan kedaluwarsa & kembalikan stok (dijadwalkan tiap menit, dilindungi `CRON_SECRET`) |

---

## 9. Aturan Bisnis Kritis

### 9.1 Harga & Total

Harga selalu dihitung ulang di **server** dari DB; nilai dari client diabaikan. Snapshot nama & harga disimpan di `OrderItem`.

### 9.2 Stok & Reservasi

Dalam satu transaksi DB saat checkout: `UPDATE Product SET stock = stock - qty WHERE id = ? AND stock >= qty` (atomic); jika 0 baris terpengaruh → gagal. Catat `StockMovement(ORDER_RESERVE)`. Stok dikembalikan (`ORDER_RELEASE`) saat `CANCELLED`/kedaluwarsa.

### 9.3 Concurrency Verifikasi

Approve/reject memakai `updateMany({ where: { id, version, status: 'AWAITING_VERIFICATION' }, data: { ..., version: { increment: 1 } } })`. Jika `count = 0` → kasir lain sudah memproses; UI menampilkan pesan.

### 9.4 Keuangan

Approve → buat `Transaction(INCOME, "Penjualan", total, orderId)` dalam transaksi DB yang sama dengan perubahan status (idempoten: unik per `orderId` untuk jenis penjualan).

### 9.5 Kedaluwarsa

`expiresAt = createdAt + 15 menit` (dapat diatur). Setelah bukti diunggah, timer dihentikan sampai kasir memutuskan.

---

## 10. Spesifikasi UI/UX — Dashboard Super Admin (acuan gambar "Jobie")

Adaptasi tata letak dashboard acuan ke konteks F&B:

**Gaya umum**

- Sidebar kiri **ungu indigo tua** (`#3B1BA3` – `#4B22C7`), lebar ±215 px, sudut kanan atas melengkung; logo di kiri atas; item menu aktif berupa **pill putih** yang menyambung ke konten (ikon + label), item lain teks putih transparan.
- Latar konten abu muda (`#F1F1F5`), kartu putih radius 16–20 px dengan bayangan lembut, font geometris sans (Poppins).
- Topbar: tombol hamburger, judul halaman, kolom pencarian pil abu, ikon pesan & notifikasi dengan **badge ungu**, avatar + nama + peran.
- Footer sidebar: nama aplikasi & hak cipta kecil.

**Menu sidebar (urutan)**: Ringkasan · Menu (Makanan & Minuman) · Kasir · Stok · Keuangan · Meja & Barcode · Pengaturan.

**Bagian halaman Ringkasan**

1. **4 kartu statistik berwarna** (baris atas): Indigo = Pesanan Hari Ini; Biru = Menunggu Verifikasi; Hijau = Pendapatan Hari Ini; Hijau lemon = Stok Menipis. Ikon dalam kotak outline di kiri, label kecil + angka besar tebal di kanan.
2. **Kolom kiri — kartu profil**: foto bulat dengan cincin gradien, nama, peran "Super Admin", 3 donut kecil (persentase penjualan Makanan / Kopi / Non Kopi), lalu daftar "Aktivitas Terbaru" (ikon, teks, waktu relatif) yang bisa di-scroll dengan tombol panah bawah.
3. **Kolom kanan — "Statistik Penjualan"**: grafik garis halus (Recharts, `type="monotone"`), toggle seri (Pemasukan, Pengeluaran, Pesanan), dropdown periode ("Bulan Ini"), tooltip melayang berisi tanggal dan nilai, legenda di bawah, grid putus-putus.
4. **"Menu Terlaris"**: kartu horizontal bisa digeser (gambar/ikon produk, nama, harga, kategori sebagai pil, jumlah terjual).
5. **"Kasir & Meja Aktif"**: baris kartu kecil dengan avatar/ikon berwarna, nama, jumlah pesanan ditangani; tombol "Lihat Semua" dan indikator titik carousel.

**Responsif**: sidebar menjadi drawer di < 1024 px; kartu stat 2 kolom di tablet, 1 kolom di ponsel. Customer UI dirancang **mobile-first** (320–430 px). Kasir dioptimalkan tablet landscape.

**Kondisi UI wajib**: loading skeleton, empty state, error state, toast sukses/gagal, konfirmasi aksi destruktif, indikator koneksi realtime (titik hijau/merah).

---

## 11. Keamanan

- Hash password `argon2id` (atau bcrypt cost ≥ 12); tidak pernah dikembalikan di respons.
- Cookie sesi `httpOnly`, `secure`, `sameSite=lax`; `tokenVersion` untuk invalidasi paksa.
- Middleware Next.js + pengecekan role di **setiap** route handler/server action (jangan hanya di UI).
- Validasi Zod semua input; rate limit pada login, checkout, upload (misal Upstash Ratelimit atau tabel DB).
- Bucket R2: gambar menu publik (via domain kustom/CDN); **bukti bayar privat**, diakses presigned URL singkat.
- Token meja & kode pesanan: acak kriptografis (`nanoid` ≥ 16); `accessToken` pesanan terpisah dari kode.
- Upload: cek magic bytes, batas ukuran, tidak mempercayai `Content-Type`, nama file diganti.
- Header keamanan (CSP, X-Frame-Options), CSRF aman via sameSite + pengecekan Origin untuk mutasi.
- `AuditLog` untuk aksi sensitif (approve/reject, ubah stok, ubah kasir, keuangan).
- Rahasia hanya di server (`PUSHER_SECRET`, `R2_SECRET_ACCESS_KEY`).

---

## 12. Kebutuhan Non-Fungsional

| Aspek | Target |
| --- | --- |
| Latensi realtime (event → UI) | < 1 detik p95 |
| LCP halaman menu customer | < 2,5 detik pada 4G |
| Ukuran gambar menu | rata-rata < 80 KB (AVIF) |
| Ketersediaan | ≥ 99,5% |
| Konkurensi | ≥ 100 customer & 5 kasir bersamaan |
| Aksesibilitas | Kontras WCAG AA, target sentuh ≥ 44 px |
| Bahasa | Indonesia (struktur siap i18n) |
| Zona waktu | Simpan UTC, tampil Asia/Jakarta (WIB) |
| Mata uang | Rupiah, format `Rp 25.000` |

---

## 13. Variabel Lingkungan

```
DATABASE_URL=
DIRECT_URL=
APP_BASE_URL=
SESSION_SECRET=
CRON_SECRET=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_PUBLIC=
R2_BUCKET_PRIVATE=
R2_PUBLIC_BASE_URL=
PUSHER_APP_ID=
PUSHER_KEY=
PUSHER_SECRET=
PUSHER_CLUSTER=
NEXT_PUBLIC_PUSHER_KEY=
NEXT_PUBLIC_PUSHER_CLUSTER=
```

---

## 14. Struktur Folder (usulan)

```
src/
  app/
    (public)/m/[token]/...        (public)/order/[code]/...
    (auth)/login/
    admin/(dashboard)/...         cashier/...
    api/...
  components/ui  components/admin  components/cashier  components/customer
  lib/
    db.ts  auth.ts  session.ts  rbac.ts
    r2.ts  image.ts  pusher-server.ts  pusher-client.ts
    validators/  utils/  constants.ts
  server/
    services/  (order, payment, stock, finance, table, product, cashier, dashboard)
    repositories/
  hooks/  stores/  types/
prisma/ schema.prisma  seed.ts
```

Prinsip: route handler tipis → panggil `services` (logika bisnis + transaksi) → Prisma. Setiap service memancarkan event Pusher **setelah commit**.

---

## 15. Milestone

| Fase | Isi | Estimasi |
| --- | --- | --- |
| 0 | Setup proyek, DB, auth, RBAC, layout dashboard | 3–4 hari |
| 1 | Pipeline gambar AVIF + R2, manajemen kategori/produk | 3–4 hari |
| 2 | Meja & QR, pengaturan metode bayar | 2 hari |
| 3 | Customer: menu, keranjang, checkout, bayar, upload bukti | 4–5 hari |
| 4 | Kasir: antrean realtime, verifikasi, cetak, progres status | 4–5 hari |
| 5 | Stok & reservasi, peringatan, cron kedaluwarsa | 3 hari |
| 6 | Keuangan + Ringkasan dashboard & grafik | 4 hari |
| 7 | Hardening: keamanan, rate limit, audit, tes, performa | 3–4 hari |
| 8 | Deploy, monitoring, dokumentasi, UAT | 2–3 hari |

Total ± 4–6 minggu (satu developer).

---

## 16. Kriteria Penerimaan (Ringkas)

1. Customer scan QR → pesan → upload bukti → kasir melihat pesanan **tanpa refresh** dalam < 1 detik.
2. Kasir setuju → status customer berubah **otomatis**, pemasukan tercatat, stok tidak berubah lagi (sudah direservasi), struk bisa dicetak.
3. Kasir tolak dengan alasan → customer melihat alasan dan dapat upload ulang; setelah batas, pesanan batal dan stok kembali.
4. Dua kasir menekan Setuju bersamaan → hanya satu berhasil.
5. Stok tidak pernah negatif meski 50 checkout bersamaan.
6. Semua upload gambar tersimpan sebagai `.avif` di R2; file non-gambar atau > 10 MB ditolak.
7. Bukti bayar tidak bisa diakses tanpa login kasir/admin (URL publik → 403).
8. Kasir nonaktif langsung terlempar ke login.
9. Dashboard Ringkasan, grafik, dan aktivitas terbaru ter-update otomatis saat ada pesanan/transaksi baru.
10. Regenerasi token meja membuat QR lama tidak valid.

---

## 17. Asumsi & Pertanyaan Terbuka

- Metode bayar v1: transfer bank/QRIS statis dengan bukti manual. Integrasi gateway dinilai di v2.
- Apakah perlu varian/topping (ukuran, gula, es)? Default v1: **tidak**, bisa ditambah via `ProductOption` di v2.
- Apakah perlu pajak/service charge? Default v1: tidak; sediakan field di `Setting` bila dibutuhkan.
- Printer: v1 memakai dialog cetak browser (thermal via driver OS). ESC/POS langsung (WebUSB/Bluetooth) opsional di v2.
- Hosting: Vercel membatasi body request ±4,5 MB; untuk bukti bayar, kompres sisi klien (target < 4 MB) atau gunakan hosting Node (VPS/Railway/Fly) bila ingin batas 10 MB.
- Jam operasional/penutupan toko otomatis belum termasuk; tombol "Tutup Pemesanan" manual disediakan di Pengaturan.
