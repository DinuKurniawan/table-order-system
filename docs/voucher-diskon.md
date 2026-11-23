# Voucher Diskon — Spesifikasi Fitur

**Status:** Draf spesifikasi (belum diimplementasikan)
**Diperbarui:** 23 November 2026 — kode wajib diinput customer; admin dapat mengisi sendiri atau generate; kuota terakhir diselesaikan atomik dengan overlay untuk checkout yang kalah.
**Rute:** `/admin/vouchers`
**Terkait:** `PRD.md` §9.1 (Harga & Total), §9.4 (Keuangan), `DESIGN-SYSTEM.md`

---

## 1. Latar Belakang

Menu **Voucher Diskon** sudah ada di sidebar admin (`src/components/admin/admin-shell.tsx`), tetapi halamannya masih placeholder (`src/app/admin/vouchers/page.tsx`). Belum ada model Prisma, validator, service, API, maupun integrasi ke alur checkout.

Dokumen ini mendefinisikan isi menu, model data, aturan bisnis, API, integrasi, dan kriteria penerimaan agar implementasi tidak melebar.

## 2. Tujuan

1. Admin dapat membuat, mengubah, menonaktifkan, dan menghapus kode voucher.
2. Admin menentukan kode voucher dengan dua cara: **isi sendiri** atau **generate kode acak**.
3. Customer **wajib memasukkan kode voucher secara manual** saat checkout; tidak ada auto-apply dan tidak ada daftar kode publik.
4. Diskon dihitung **hanya di server** dari data DB; nominal dari client diabaikan.
5. Kuota voucher tidak pernah terlampaui meskipun checkout bersamaan.
6. Pendapatan di modul keuangan tetap akurat (net setelah diskon).
7. Semua mutasi sensitif tercatat di `AuditLog`.

## 3. Di Luar Lingkup (v1)

- Voucher per kategori/produk/varian size.
- Penggabungan beberapa voucher dalam satu order (stacking).
- Auto-apply voucher tanpa kode.
- Katalog/daftar voucher yang bisa dilihat customer.
- Tautan promo yang otomatis menerapkan kode (`?voucher=...`).
- Limit per customer (customer anonim, tidak ada akun).
- Kampanye terjadwal otomatis, email/push promo, ekspor CSV.
- Voucher fisik/barcode.
- Multi-cabang.

Tambahkan hanya jika ada kebutuhan operasional nyata.

---

## 4. Keputusan Bisnis (default)

| Topik | Keputusan |
| --- | --- |
| Jumlah voucher per order | 1 |
| Pembuatan kode | Admin isi sendiri **atau** generate acak (default generate) |
| Format kode generate | 8 karakter dari `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (tanpa `I O 0 1`) |
| Input customer | Manual, case-insensitive, tanpa auto-apply |
| Kuota | Dipesan saat checkout, dilepas saat order `CANCELLED`/expired |
| Kuota terakhir diperebutkan | Pemenang = checkout yang **pertama berhasil commit klaim atomik**; yang kalah menerima 409 + overlay |
| Maks. diskon | Wajib untuk tipe `PERCENT`, opsional untuk `FIXED` |
| Edit setelah ada pemakaian | Kode, tipe, nilai, `maxDiscount`, `minSpend` terkunci |
| Hapus | Hanya jika `usedCount = 0`; selain itu nonaktifkan |
| Pembulatan persen | `Math.floor`, lalu cap `maxDiscount`, lalu clamp ke subtotal |
| Batas periode | Inklusif (`startsAt <= now <= endsAt`) |
| Zona waktu | Simpan UTC, input/tampil WIB |
| Pencatatan pendapatan | `Transaction.amount = order.total` (net), diskon bukan expense |

---

## 5. UX Halaman Admin

### 5.1 Header

- Judul: **Voucher Diskon**
- Subtitle: kelola kode promo, kuota, dan masa berlaku.
- Aksi utama: **Tambah Voucher** (tombol primer).

### 5.2 Kartu Statistik

| Kartu | Metrik |
| --- | --- |
| Voucher Aktif | jumlah voucher berstatus `AKTIF` |
| Pemakaian Bulan Ini | jumlah redemption bulan berjalan (belum dilepas) |
| Total Diskon Bulan Ini | Σ `discountAmount` redemption bulan berjalan |
| Akan Berakhir | voucher aktif dengan `endsAt` ≤ 7 hari |

Gunakan `SectionCard`/`StatCard` yang sudah ada. Angka memakai `tabular-nums`.

### 5.3 Toolbar

- Pencarian: kode atau deskripsi (debounce 300 ms).
- Tab status: `Semua`, `Aktif`, `Terjadwal`, `Berakhir`, `Habis`, `Nonaktif`.
- Sort: `Terbaru`, `Paling banyak dipakai`, `Berakhir terdekat`.
- Pagination: 10/20 per halaman.

### 5.4 Tabel

| Kolom | Contoh |
| --- | --- |
| Kode | `K7MQH4PX` + tombol copy |
| Diskon | `20% maks Rp10.000` / `Rp5.000` |
| Min. Belanja | `Rp25.000` / `—` |
| Kuota | `12/50` / `∞` |
| Periode | `01 Des 2026 – 31 Des 2026` (WIB) |
| Status | pill status |
| Dipakai | jumlah redemption aktif |
| Aksi | menu: Detail, Edit, Duplikat, Aktif/Nonaktif, Hapus |

Status diturunkan di server dengan urutan prioritas:

1. `NONAKTIF` — `isActive = false`
2. `BERAKHIR` — `now > endsAt`
3. `TERJADWAL` — `now < startsAt`
4. `HABIS` — `quota != null && usedCount >= quota`
5. `AKTIF`

### 5.5 Dialog Tambah/Edit

**Identitas**
- Mode kode: radio **Generate acak** (default) / **Isi sendiri**.
- Mode generate:
  - Sistem membuat 8 karakter dari alfabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`.
  - Karakter `I`, `O`, `0`, `1` tidak dipakai agar tidak salah baca.
  - Tombol **Generate ulang** selama form belum disimpan.
  - Tombol **Salin** untuk dibagikan manual (WhatsApp, cetak, dsb.).
- Mode isi sendiri:
  - Wajib 4–24 karakter, regex `^[A-Z0-9_-]+$`.
  - Otomatis diubah ke huruf besar saat disimpan dan dicocokkan.
  - Jika kode duplikat, server mengembalikan 409 dan form menampilkan pesan.
- Kode bersifat unik secara global dan _case-insensitive_ (`kopi20` = `KOPI20`).
- Setelah voucher punya pemakaian, kode tidak dapat diubah.
- Deskripsi: opsional, maks. 160 karakter, untuk catatan internal admin (tidak ditampilkan ke customer).

**Diskon**
- Tipe: `PERCENT` / `FIXED`.
- Nilai: persen 1–100 atau rupiah 1–1.000.000.000.
- Maks. diskon: wajib untuk `PERCENT`, minimal 1, tidak boleh 0.
- Preview: `Belanja Rp50.000 → diskon Rp10.000 → total Rp40.000`.

**Syarat**
- Min. belanja: ≥ 0, dihitung dari subtotal sebelum diskon.
- Kuota total: kosong = tanpa batas; jika diisi ≥ 1 dan tidak boleh lebih kecil dari `usedCount`.

**Periode**
- Mulai & berakhir: wajib, `startsAt < endsAt`, input WIB.
- Toggle aktif.

**Mode edit**
- Jika `usedCount > 0`: kode, tipe, nilai, `maxDiscount`, `minSpend` disabled.
- Boleh ubah: deskripsi, `endsAt` (hanya memperpanjang), kuota (hanya menaikkan), status aktif.

### 5.6 Drawer Detail

- Ringkasan konfigurasi + pembuat + waktu dibuat/diubah.
- Metrik: terpakai, sisa kuota, total diskon, rata-rata subtotal order memakai voucher.
- Riwayat pemakaian (paginated): waktu, kode order, meja, nama customer, nominal diskon, status order.
- Aksi: Edit, Duplikat, Nonaktifkan.

### 5.7 State Wajib

- Skeleton saat memuat.
- Empty state saat belum ada voucher.
- Error state + tombol coba lagi.
- Toast sukses/gagal untuk setiap mutasi.
- Konfirmasi untuk nonaktif dan hapus.
- Aksesibilitas: kontras AA, target sentuh ≥ 44 px, navigasi keyboard, label form eksplisit.

---

## 6. Model Data

```prisma
enum VoucherType {
  PERCENT
  FIXED
}

model Voucher {
  id           String   @id @default(cuid())
  code         String   @unique
  description  String?
  type         VoucherType
  value        Int      // PERCENT: 1..100, FIXED: rupiah
  maxDiscount  Int?     // cap untuk PERCENT
  minSpend     Int      @default(0)
  quota        Int?     // null = unlimited
  usedCount    Int      @default(0)
  startsAt     DateTime
  endsAt       DateTime
  isActive     Boolean  @default(true)
  createdById  String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  redemptions  VoucherRedemption[]
  orders       Order[]

  @@index([isActive, startsAt, endsAt])
}

model VoucherRedemption {
  id             String    @id @default(cuid())
  voucherId      String
  voucher        Voucher   @relation(fields: [voucherId], references: [id])
  orderId        String    @unique
  order          Order     @relation(fields: [orderId], references: [id], onDelete: Cascade)
  codeSnapshot   String
  discountAmount Int
  releasedAt     DateTime?
  createdAt      DateTime  @default(now())

  @@index([voucherId, createdAt])
  @@index([releasedAt])
}
```

Perubahan pada `Order`:

```prisma
voucherId    String?
voucher      Voucher? @relation(fields: [voucherId], references: [id])
voucherCode  String?  // snapshot kode saat checkout
discount     Int      @default(0)
```

`total = subtotal - discount` dan tidak boleh negatif.

Migrasi dibuat dengan `npm run db:migrate` (lokal). Jangan jalankan terhadap database produksi.

---

## 7. Aturan Bisnis

### 7.1 Kode voucher

- Customer **tidak pernah menerima diskon tanpa memasukkan kode**. Tidak ada tombol "pakai promo", tidak ada kode yang terisi otomatis, dan tidak ada endpoint publik yang menampilkan daftar kode.
- Kode yang di-generate memakai `nanoid` dengan alfabet kustom:
  ```ts
  import { customAlphabet } from "nanoid";
  const generateVoucherCode = customAlphabet(
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789",
    8
  );
  ```
  Entropi 32⁸ ≈ 1,1 × 10¹² kombinasi; cukup untuk mencegah tebakan acak bila digabung rate limit.
- Admin boleh mengisi kode sendiri (mis. `KOPI20`) selama lolos validasi; kode manual yang mudah ditebak memperbesar risiko brute force, jadi UI menampilkan peringatan ringan.
- Normalisasi input customer dan input admin: `trim().toUpperCase()`.
- Unik secara global; pengecekan duplikat dilakukan di server (bukan hanya client).
- Jika generate bentrok (`P2002`), server mencoba ulang maksimal 5 kali sebelum mengembalikan error.
- Kode tidak diubah setelah voucher memiliki `usedCount > 0`.
- Kode hanya ditampilkan di admin dan di halaman order milik customer yang memakainya.

### 7.2 Validasi pemakaian

- Customer wajib mengetik kode lalu menekan **Terapkan**; diskon baru aktif setelah server menyatakan kode valid.
- Hanya voucher `isActive`, dalam periode, dan kuota tersedia yang dapat dipakai.
- Satu order maksimal satu voucher.
- Kode tidak valid, nonaktif, atau kedaluwarsa → pesan generik `Kode voucher tidak valid atau sudah tidak berlaku`.
- Kuota habis saat checkout → 409 dengan kode `VOUCHER_QUOTA_EXHAUSTED` agar UI dapat menampilkan overlay (lihat §9.3).
- Min. belanja tidak terpenuhi → pesan spesifik yang menyebut nominal minimum.

### 7.3 Perhitungan diskon

```
subtotal = Σ harga server × qty
if type == PERCENT:
  diskon = floor(subtotal * value / 100)
  if maxDiscount != null: diskon = min(diskon, maxDiscount)
else:
  diskon = value
diskon = min(diskon, subtotal)
total  = subtotal - diskon
```

- `minSpend` dibandingkan dengan subtotal **sebelum** diskon.
- Harga selalu dihitung ulang dari DB (produk, size, kategori), bukan payload client.

### 7.4 Kuota & konkurensi

Reservasi kuota memakai conditional update di transaksi yang sama dengan pembuatan order:

```ts
const claimed = await tx.voucher.updateMany({
  where: {
    id: voucher.id,
    isActive: true,
    startsAt: { lte: now },
    endsAt: { gte: now },
    OR: [{ quota: null }, { usedCount: { lt: tx.voucher.fields.quota } }],
  },
  data: { usedCount: { increment: 1 } },
});
if (claimed.count === 0) {
  throw new AppError(
    "VOUCHER_QUOTA_EXHAUSTED",
    "Voucher baru saja habis dipakai pelanggan lain",
    409
  );
}
```

- Jika `updateMany` tidak didukung untuk field reference pada versi Prisma saat ini, gunakan raw SQL `UPDATE ... WHERE used_count < quota RETURNING`.
- `VoucherRedemption` dibuat di transaksi yang sama.
- Idempotency checkout: replay `Idempotency-Key` mengembalikan order lama tanpa menambah `usedCount`.

#### Skenario kuota terakhir: 9/10

Voucher `kuota = 10`, `usedCount = 9`. Customer A dan B checkout hampir bersamaan dengan kode yang sama.

| Urutan | Customer A | Customer B | Status DB |
| --- | --- | --- | --- |
| 1 | Validasi kode → tersedia | Validasi kode → tersedia | `usedCount = 9` |
| 2 | `UPDATE ... WHERE usedCount < quota` → 1 baris | Menunggu row lock | `usedCount = 10` |
| 3 | Buat order + redemption + reservasi stok, commit | `UPDATE` lanjut → 0 baris | `usedCount = 10` |
| 4 | Order dibuat dengan diskon | Transaksi rollback, terima 409 | `usedCount = 10` |
| 5 | — | Overlay **Voucher baru saja habis** | — |

Aturan penetapan pemenang:

- **Pemenang adalah checkout yang pertama berhasil meng-commit klaim kuota atomik**, bukan yang request-nya lebih dulu dikirim, bukan `createdAt`, dan bukan perbandingan timestamp aplikasi.
- Di PostgreSQL `READ COMMITTED`, `UPDATE` kedua menunggu lock baris lalu mengevaluasi ulang `usedCount < quota`; hasilnya 0 baris. Tidak ada dua pemenang dan `usedCount` tidak pernah melebihi `quota`.
- Yang kalah **tidak boleh** mendapat order, `VoucherRedemption`, atau reservasi stok. Seluruh transaksi di-rollback.
- Jangan mencoba "menghibur" yang kalah dengan diskon lain atau retry otomatis; tampilkan overlay dan biarkan customer memilih.
- Pemeriksaan kuota di endpoint preview bersifat informatif. Keputusan final selalu terjadi di checkout.
- Definisi "tercepat" ini adil secara teknis: pemenang adalah pemilik commit pertama, sehingga hasilnya deterministik dan tidak bergantung jam server atau latensi jaringan.
- Opsional (defense-in-depth): tambahkan constraint DB `CHECK (quota IS NULL OR used_count <= quota)` lewat migrasi SQL manual.
- Untuk double-click customer yang sama, `Idempotency-Key` yang sama membuat request kedua menjadi replay order yang sudah dibuat, bukan klaim kuota kedua.
- Test wajib: `tests/voucher-concurrency.test.ts` menjalankan dua checkout paralel pada kondisi 9/10 dan memastikan tepat satu sukses.

#### Urutan operasi dalam transaksi checkout

1. Cek `Idempotency-Key` → jika sudah ada order, kembalikan order tersebut (replay).
2. Hitung subtotal dari DB.
3. Klaim kuota voucher secara atomik (langkah di atas).
4. Buat `Order` + `OrderItem`.
5. Reservasi stok.
6. Buat `VoucherRedemption` + `AuditLog`.
7. Commit; event realtime dikirim setelah commit.

Jika langkah 3 gagal, langkah 4–6 tidak pernah dijalankan dan tidak ada efek samping yang tersisa.

### 7.5 Pelepasan kuota

- Dipicu saat order masuk `CANCELLED` karena batal customer, expired, atau pembatalan kasir.
- Idempoten: `updateMany` redemption `WHERE releasedAt IS NULL`, lalu decrement `usedCount` (tidak pernah < 0).
- `PAYMENT_REJECTED` tidak melepas kuota karena customer masih boleh unggah ulang.

### 7.6 Edit & hapus

- Setelah `usedCount > 0`, field harga terkunci; perubahan tercatat di audit.
- Hapus hanya jika `usedCount = 0` dan tidak ada redemption. Jika tidak, kembalikan 409 dengan pesan untuk menonaktifkan.
- Voucher nonaktif tidak membatalkan diskon pada order yang sudah dibuat.

### 7.7 Keuangan

- Approve pembayaran mencatat `Transaction(INCOME, "Penjualan", order.total, orderId)` seperti sekarang.
- Diskon **tidak** dicatat sebagai pengeluaran; pendapatan yang dilaporkan adalah net.
- Analitik voucher memakai `VoucherRedemption.discountAmount`, bukan `Transaction`.

---

## 8. API & Service

### 8.1 Route

| Method | Route | Akses | Fungsi |
| --- | --- | --- | --- |
| GET | `/api/admin/vouchers` | SUPER_ADMIN | list + filter + statistik ringkas |
| POST | `/api/admin/vouchers` | SUPER_ADMIN | create; `code` opsional → server generate jika kosong |
| GET | `/api/admin/vouchers/[id]` | SUPER_ADMIN | detail |
| PATCH | `/api/admin/vouchers/[id]` | SUPER_ADMIN | update dengan guard |
| DELETE | `/api/admin/vouchers/[id]` | SUPER_ADMIN | hapus dengan guard |
| GET | `/api/admin/vouchers/[id]/redemptions` | SUPER_ADMIN | riwayat pemakaian |
| POST | `/api/public/vouchers/validate` | publik + rate limit | preview diskon |

Semua route admin wajib `requireRole(["SUPER_ADMIN"])`, `readJson`, dan `handleApiError` seperti route admin lain.

### 8.2 Kontrak publik `validate`

Request:

```json
{
  "tableToken": "...",
  "code": "K7MQH4PX",
  "items": [{ "productId": "...", "quantity": 2, "size": "LARGE" }]
}
```

Kode dinormalisasi `trim().toUpperCase()` sebelum dicari. Jika field `code` kosong/tidak dikirim, tidak ada diskon yang dihitung.

Response sukses:

```json
{
  "data": {
    "code": "K7MQH4PX",
    "subtotal": 50000,
    "discount": 10000,
    "total": 40000
  }
}
```

- Rate limit: per IP dan per meja (mis. 10/menit), dengan jeda singkat saat limit tercapai.
- Kode tidak dikenal/nonaktif/kedaluwarsa: pesan generik `Kode voucher tidak valid atau sudah tidak berlaku`.
- Kuota habis: `409` dengan kode `VOUCHER_QUOTA_EXHAUSTED`.
- Min. belanja tidak terpenuhi: pesan spesifik yang menyebut nominal minimum.
- Endpoint ini **tidak** memesan kuota; reservasi hanya terjadi saat checkout.
- Endpoint ini tidak pernah mengembalikan daftar kode, sisa kuota, atau informasi internal voucher.
- Customer tidak dapat melewati input kode: checkout tanpa `voucherCode` selalu dihitung tanpa diskon.

Format error mengikuti `src/lib/api.ts`:

```json
{
  "error": {
    "code": "VOUCHER_QUOTA_EXHAUSTED",
    "message": "Voucher baru saja habis dipakai pelanggan lain"
  }
}
```

Hanya `VOUCHER_QUOTA_EXHAUSTED` yang memicu overlay. Error validasi lain ditampilkan inline di dekat input.

### 8.3 File baru

- `src/lib/voucher-code.ts` — alfabet, generator, normalisasi, dan skema kode.
- `src/lib/validators/voucher.ts` — skema create/update/apply.
- `src/lib/errors.ts` — tambah `VOUCHER_QUOTA_EXHAUSTED` ke `AppErrorCode`.
- `src/server/services/vouchers.ts` — CRUD, list+stats, validasi, reserve/release.
- `src/components/admin/vouchers-manager.tsx` — halaman client.
- `src/components/admin/voucher-dialog.tsx` — form tambah/edit.
- `src/components/admin/voucher-detail.tsx` — drawer riwayat (boleh digabung bila kecil).
- `src/components/customer/voucher-quota-overlay.tsx` — overlay kuota habis (dipakai cart).
- `src/app/admin/vouchers/page.tsx` — server component, preload halaman pertama seperti `/admin/tables`.

Helper harga bersama (mis. `src/server/services/order-pricing.ts`) dipakai oleh preview dan checkout agar tidak ada dua jalur perhitungan.

### 8.4 Audit

| Action | Entity |
| --- | --- |
| `voucher.create` | `Voucher` |
| `voucher.update` | `Voucher` |
| `voucher.deactivate` | `Voucher` |
| `voucher.delete` | `Voucher` |
| `voucher.redeem` | `Order` |
| `voucher.release` | `Order` |

Sertakan `voucherCode`, nominal diskon, dan `orderCode` di `meta` bila relevan.

---

## 9. Integrasi

### 9.1 Cart customer

`src/app/m/[token]/cart/cart-client.tsx`:

- Input **Punya kode voucher?** + tombol **Terapkan**. Customer harus mengetik kode sendiri; tidak ada kode yang terisi otomatis.
- Input dinormalisasi uppercase, spasi di awal/akhir dibuang.
- Panggil endpoint validate dengan item keranjang hanya setelah tombol **Terapkan** ditekan.
- Tampilkan baris `Subtotal`, `Diskon (KODE)`, `Total`.
- Tombol hapus kode.
- Kode yang gagal validasi tidak boleh ikut checkout; tampilkan pesan error di dekat input.
- Saat checkout, kirim `voucherCode` di body `POST /api/public/orders`.
- Jika validasi ulang gagal karena kuota habis, tampilkan overlay §9.3; error lain tampil inline.
- Kode tidak disimpan di URL dan tidak diterapkan otomatis saat halaman dibuka.
- `Idempotency-Key` dirotasi saat kode voucher diterapkan/dihapus, karena isi request checkout berubah.

### 9.2 Checkout

`src/app/api/public/orders/route.ts`:

- Terima `voucherCode` opsional.
- Hitung subtotal dari DB, lalu validasi + reservasi voucher dalam transaksi.
- Simpan `discount`, `total`, `voucherId`, `voucherCode`, dan `VoucherRedemption`.
- Kuota gagal → 409 `VOUCHER_QUOTA_EXHAUSTED`, order tidak dibuat, stok tidak direservasi.
- Event realtime yang ada tidak perlu diubah.

### 9.3 Overlay kuota habis (customer)

Memicu: response `409` dengan `error.code = "VOUCHER_QUOTA_EXHAUSTED"` saat checkout (dan boleh juga saat preview).

Tampilan:

- Dialog blocking `role="alertdialog"`, `aria-modal`, focus trap, tidak auto-dismiss.
- Ikon peringatan, judul **Voucher baru saja habis**.
- Deskripsi: `Kode K7MQH4PX baru saja mencapai batas pemakaian. Pesanan belum dibuat dan stok belum dipotong.`
- Ringkasan: `Total tanpa voucher: Rp 50.000` (harga kembali normal).
- Aksi primer: **Lanjutkan tanpa voucher** → hapus kode, hitung ulang total, tutup overlay, fokus ke tombol checkout. Tidak auto-submit.
- Aksi sekunder: **Ubah kode** → kosongkan input, fokus ke input voucher, tetap di cart.
- Tombol checkout disabled selama request berjalan untuk mencegah spam.
- Jangan retry otomatis dan jangan menampilkan error mentah/server stack.
- Setelah customer memilih, request checkout berikutnya memakai `Idempotency-Key` baru.

Edge case:

- Jika response sukses tapi jaringan putus, retry dengan key yang sama akan mengembalikan order yang sama (bukan overlay).
- Jika voucher ternyata masih tersedia karena order pemenang dibatalkan, customer dapat menerapkan ulang kode secara manual; tidak ada klaim otomatis.
- Overlay tidak ditampilkan untuk kode salah, nonaktif, kedaluwarsa, atau min. belanja kurang.

### 9.4 Halaman order customer

`src/server/services/orders.ts` (`CustomerOrderDTO`) dan `src/app/order/[code]/page.tsx`:

- Tambah `discount` dan `voucherCode`.
- Tampilkan rincian subtotal/diskon/total.
- Nominal pembayaran mengikuti `total`.

### 9.5 Kasir & struk

- DTO antrean kasir (`cashier-orders.ts`) menampilkan voucher + diskon.
- Halaman detail dan print (`/cashier/orders/[id]/print`) menampilkan baris diskon.
- Approve tetap memakai `order.total`.

### 9.6 Dashboard

- Tidak wajib menambah kartu baru.
- Jika ingin metrik promo, tambahkan nanti dengan query `VoucherRedemption`; jangan ubah definisi pendapatan.

---

## 10. Keamanan

- Otorisasi role di setiap route handler, bukan hanya UI.
- Zod untuk semua input; batas panjang dan rentang nilai.
- Rate limit endpoint publik (per IP + per meja); pesan error tidak membocorkan sisa kuota. `VOUCHER_QUOTA_EXHAUSTED` hanya dikirim saat kuota benar-benar habis.
- Kode generate acak 8 karakter (32 alfabet) untuk mempersulit brute force; kode manual yang lemah tetap diperbolehkan tetapi diberi peringatan di UI admin.
- Jangan tampilkan daftar kode aktif, sisa kuota, atau detail internal di endpoint publik.
- Jangan pernah menerima `discount`/`total` dari client; hanya `voucherCode`.
- Jangan catat kode voucher mentah di log publik/error tracking; gunakan `voucherId` atau kode tersamar.
- Semua mutasi admin diaudit.
- CSRF tetap mengandalkan `sameSite` + pemeriksaan origin yang sudah ada.

---

## 11. Kriteria Penerimaan

- [ ] Admin dapat membuat voucher persen dan nominal; kode duplikat ditolak 409.
- [ ] Admin dapat memilih **Generate acak** (8 karakter, tanpa `I O 0 1`) atau **Isi sendiri**.
- [ ] Kode hasil generate berbeda antar voucher dan lolos pengecekan unik server.
- [ ] Kode manual tidak valid (karakter/panjang) ditolak dengan pesan per field.
- [ ] Validasi menolak `startsAt >= endsAt`, persen di luar 1–100, dan `maxDiscount` kosong untuk persen.
- [ ] Customer wajib mengetik kode; checkout tanpa kode tidak mendapat diskon.
- [ ] Input kode case-insensitive (`k7mqh4px` diterima untuk `K7MQH4PX`).
- [ ] Customer dapat menerapkan kode valid dan melihat subtotal/diskon/total.
- [ ] Kode salah/nonaktif/kedaluwarsa ditolak dengan pesan generik.
- [ ] Tidak ada endpoint publik yang menampilkan daftar kode atau menerapkan kode otomatis.
- [ ] Checkout menyimpan diskon dan `total = subtotal - discount`.
- [ ] Dua checkout bersamaan tidak dapat melewati kuota.
- [ ] Skenario 9/10: tepat satu checkout sukses, satu menerima `409 VOUCHER_QUOTA_EXHAUSTED`; `usedCount` berakhir `10`, bukan `11`.
- [ ] Checkout yang kalah tidak membuat order, `VoucherRedemption`, atau reservasi stok.
- [ ] Customer yang kalah melihat overlay **Voucher baru saja habis** dan dapat memilih lanjut tanpa voucher atau ubah kode.
- [ ] Overlay tidak auto-dismiss, tidak retry otomatis, dan fokus keyboard terperangkap di dialog.
- [ ] Replay idempotency tidak menambah pemakaian.
- [ ] Batal/expired melepas kuota tepat satu kali.
- [ ] Voucher nonaktif/berakhir ditolak untuk order baru, order lama tetap valid.
- [ ] Field harga terkunci setelah pemakaian pertama.
- [ ] Hapus voucher terpakai ditolak dengan pesan jelas.
- [ ] Struk, halaman order, dan kasir menampilkan diskon.
- [ ] `Transaction.amount` sama dengan `order.total` (net).
- [ ] Audit log tercatat untuk semua mutasi.
- [ ] UI memiliki skeleton, empty, error, toast, dan konfirmasi.
- [ ] `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e` lulus di lingkungan lokal.

---

## 12. Rencana Implementasi

1. **Skema & validasi** — enum/model/migrasi, generator kode, validator Zod, unit test matematika diskon.
2. **Service & API admin** — CRUD + guard + statistik + audit, integration test.
3. **UI admin** — server page, manager, dialog, drawer, state lengkap.
4. **Checkout** — helper harga bersama, endpoint validate, reservasi kuota atomik, idempotensi.
5. **Race kuota** — kode error `VOUCHER_QUOTA_EXHAUSTED`, overlay customer, tombol lanjut/ubah kode.
6. **Distribusi tampilan** — cart, halaman order, kasir, struk, release kuota.
7. **Verifikasi** — test konkurensi 9/10 (dua request paralel), e2e admin→customer→kasir, typecheck, lint, update dokumen.

Pengujian hanya di lokal memakai `.env.development`/`.env.test`. Tidak ada deploy atau push ke produksi sebagai bagian dari pekerjaan ini.
