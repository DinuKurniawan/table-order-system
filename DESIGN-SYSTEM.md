# DESIGN-SYSTEM.md — Sistem Desain Aplikasi Pemesanan F&B

**Versi:** 1.0 | **Tanggal:** 16 November 2026 | **Acuan visual:** dashboard "Jobie" (sidebar ungu indigo, kartu statistik berwarna, grafik garis halus, kartu putih membulat).

Tiga permukaan UI, satu bahasa visual:

| Permukaan | Perangkat utama | Karakter |
| --- | --- | --- |
| **Admin** (Super Admin) | Desktop ≥ 1280 px | Padat informasi, dashboard, tabel |
| **Kasir** | Tablet landscape (≈ 1024–1280 px) | Besar, cepat disentuh, kontras tinggi, notifikasi jelas |
| **Customer** | Ponsel 320–430 px | Mobile-first, ringan, satu tangan, cepat dimuat |

---

## 1. Prinsip Desain

1. **Jelas dulu, hias kemudian.** Status pesanan dan tombol aksi harus terbaca dalam sekilas.
2. **Warna bermakna.** Warna dipakai untuk status dan hierarki, bukan dekorasi.
3. **Satu aksi utama per layar.** Tombol primer ungu; aksi destruktif terpisah dan butuh konfirmasi.
4. **Realtime yang tenang.** Perubahan otomatis disertai animasi halus dan penyorotan singkat, tanpa membuat tata letak melompat.
5. **Selalu ada umpan balik.** Setiap aksi punya state loading, sukses, dan gagal.
6. **Inklusif.** Kontras WCAG AA, target sentuh ≥ 44 px, tidak mengandalkan warna saja.

---

## 2. Design Tokens

### 2.1 Warna

**Merek / Primer (indigo-ungu, dari sidebar & kartu utama)**

| Token | Hex | Penggunaan |
| --- | --- | --- |
| `primary-950` | `#2A1275` | Teks di atas latar terang bernuansa merek, gradasi gelap |
| `primary-800` | `#3B1BA3` | **Sidebar**, header kuat |
| `primary-600` | `#4B2FE0` | **Tombol primer**, kartu statistik indigo, seri grafik utama |
| `primary-400` | `#7D66F0` | Hover/aksen, seri grafik sekunder |
| `primary-200` | `#CFC6FA` | Toggle aktif latar, ring fokus lembut |
| `primary-50` | `#F0EDFE` | Latar pil, hover baris tabel, chip terpilih |

**Aksen kartu statistik (dari gambar acuan)**

| Token | Hex | Penggunaan |
| --- | --- | --- |
| `accent-blue` | `#45A5F5` | Kartu "Menunggu Verifikasi", info |
| `accent-green` | `#1FC58E` | Kartu "Pendapatan", sukses, seri grafik hijau |
| `accent-lime` | `#8DC63F` | Kartu "Stok", stok aman |
| `accent-orange` | `#F59A2B` | Peringatan, donut |
| `accent-red` | `#E5484D` | Error, ditolak, seri "Pengeluaran" |

**Netral**

| Token | Hex | Penggunaan |
| --- | --- | --- |
| `bg-app` | `#F1F1F5` | Latar halaman |
| `surface` | `#FFFFFF` | Kartu, dialog |
| `surface-muted` | `#F6F6FA` | Input latar, area sekunder |
| `border` | `#E6E6EE` | Garis tipis kartu/tabel |
| `text-strong` | `#1B1B2B` | Judul, angka |
| `text` | `#3D3D52` | Teks isi |
| `text-muted` | `#8A8AA0` | Label, teks bantu |
| `search-bg` | `#E4E4EA` | Kolom pencarian topbar (pil abu) |

**Semantik (pemetaan)**

| Makna | Latar | Teks/ikon |
| --- | --- | --- |
| Sukses | `#E3F8F1` | `#0E8F66` |
| Info | `#E4F2FE` | `#1E7BD0` |
| Peringatan | `#FEF1DF` | `#B26A0C` |
| Bahaya | `#FDE8E9` | `#C22F35` |
| Netral | `#EDEDF3` | `#5B5B73` |

Rasio kontras: teks isi ≥ 4.5:1, teks besar/ikon ≥ 3:1. Teks putih pada `primary-600`, `accent-blue`, `accent-green`, `accent-lime` harus **tebal ≥ 600 atau ≥ 18 px** (cek kontras `accent-lime`; bila kurang, gunakan `#6FA82A` untuk teks).

### 2.2 Tipografi

Font: **Poppins** (via `next/font`), cadangan `ui-sans-serif, system-ui`. Angka tabular (`font-variant-numeric: tabular-nums`) untuk harga dan statistik.

| Token | Ukuran / Tinggi baris | Bobot | Penggunaan |
| --- | --- | --- | --- |
| `display` | 40 / 48 | 700 | Angka KPI besar (kartu statistik) |
| `h1` | 28 / 36 | 600 | Judul halaman (topbar: 22–24) |
| `h2` | 20 / 28 | 600 | Judul kartu ("Statistik Penjualan") |
| `h3` | 16 / 24 | 600 | Sub-judul, nama produk |
| `body` | 14 / 22 | 400 | Teks isi |
| `body-strong` | 14 / 22 | 500–600 | Label penting |
| `caption` | 12 / 18 | 400 | Meta, waktu relatif, label sumbu |
| `overline` | 11 / 16 | 500 | Label kecil kapital |

Customer mobile: `body` 15–16 px agar nyaman dibaca; harga `h3` tebal.

### 2.3 Spasi, Radius, Bayangan

Skala spasi (kelipatan 4): `4, 8, 12, 16, 20, 24, 32, 40, 56`. Jarak antar kartu 20–24 px; padding kartu 20–24 px.

| Token | Nilai | Penggunaan |
| --- | --- | --- |
| `radius-sm` | 8 px | Input kecil, chip |
| `radius-md` | 12 px | Tombol, input |
| `radius-lg` | 16 px | Kartu statistik, kartu produk |
| `radius-xl` | 20 px | Kartu bagian (SectionCard), dialog |
| `radius-pill` | 999 px | Pencarian, badge, toggle, tombol "Lihat Semua" |
| `shadow-card` | `0 2px 12px rgba(30, 20, 90, .06)` | Kartu putih |
| `shadow-pop` | `0 8px 28px rgba(30, 20, 90, .16)` | Tooltip grafik, dropdown, dialog |
| `shadow-float` | `0 6px 18px rgba(75, 47, 224, .35)` | Tombol keranjang mengambang |

### 2.4 Gerak

| Token | Nilai |
| --- | --- |
| `duration-fast` | 120 ms |
| `duration-base` | 200 ms |
| `duration-slow` | 350 ms |
| `ease-standard` | `cubic-bezier(.2, .8, .2, 1)` |

Aturan: transisi hover/fokus 120–200 ms; angka KPI *count-up* 600 ms saat berubah; kartu baru masuk dengan *fade + slide-down* 200 ms dan sorotan latar `primary-50` selama 2 detik. Hormati `prefers-reduced-motion` (matikan animasi non-esensial).

### 2.5 Implementasi Token (CSS Variables + Tailwind)

```css
/* src/app/globals.css */
:root {
  --primary-950:#2A1275; --primary-800:#3B1BA3; --primary-600:#4B2FE0;
  --primary-400:#7D66F0; --primary-200:#CFC6FA; --primary-50:#F0EDFE;
  --accent-blue:#45A5F5; --accent-green:#1FC58E; --accent-lime:#8DC63F;
  --accent-orange:#F59A2B; --accent-red:#E5484D;
  --bg-app:#F1F1F5; --surface:#FFFFFF; --surface-muted:#F6F6FA; --border:#E6E6EE;
  --text-strong:#1B1B2B; --text:#3D3D52; --text-muted:#8A8AA0; --search-bg:#E4E4EA;
  --radius-md:12px; --radius-lg:16px; --radius-xl:20px;
  --shadow-card:0 2px 12px rgba(30,20,90,.06);
  --shadow-pop:0 8px 28px rgba(30,20,90,.16);
}
```

```ts
// tailwind.config.ts (potongan)
extend: {
  colors: {
    primary: { 950:'var(--primary-950)', 800:'var(--primary-800)', 600:'var(--primary-600)',
               400:'var(--primary-400)', 200:'var(--primary-200)', 50:'var(--primary-50)',
               DEFAULT:'var(--primary-600)' },
    accent: { blue:'var(--accent-blue)', green:'var(--accent-green)',
              lime:'var(--accent-lime)', orange:'var(--accent-orange)', red:'var(--accent-red)' },
    app:'var(--bg-app)', surface:'var(--surface)', muted:'var(--surface-muted)',
  },
  borderRadius: { md:'12px', lg:'16px', xl:'20px' },
  boxShadow: { card:'var(--shadow-card)', pop:'var(--shadow-pop)' },
  fontFamily: { sans:['var(--font-poppins)','ui-sans-serif','system-ui'] },
}
```

Peta ke variabel shadcn/ui: `--primary` = `primary-600`, `--ring` = `primary-200`, `--background` = `bg-app`, `--card` = `surface`, `--destructive` = `accent-red`, `--radius` = `12px`.

---

## 3. Grid dan Breakpoint

| Breakpoint | Lebar | Perilaku |
| --- | --- | --- |
| `sm` | ≥ 640 | Customer: 2 kolom kartu menu |
| `md` | ≥ 768 | Kasir/tablet: daftar + detail berdampingan |
| `lg` | ≥ 1024 | Admin: sidebar tetap |
| `xl` | ≥ 1280 | Dashboard 2 kolom penuh |
| `2xl` | ≥ 1536 | Lebar konten maksimal 1440 px, terpusat |

Admin: sidebar 215 px + konten fluid; padding konten 24–32 px. < 1024 px sidebar menjadi drawer.

---

## 4. Ikonografi

- Pustaka: **lucide-react**, goresan 1.75–2 px, ukuran 16/20/24.
- Ikon menu: Ringkasan `LayoutDashboard`, Menu `UtensilsCrossed`, Kasir `Users`, Stok `Boxes`, Keuangan `Wallet`, Meja & Barcode `QrCode`, Pengaturan `Settings`.
- Kartu statistik: ikon putih 24 px dalam **kotak outline putih transparan** 48×48 px, radius 12 px (sesuai gambar).
- Ikon tidak pernah berdiri sendiri tanpa label/`aria-label` pada aksi penting.

---

## 5. Komponen — Admin Shell

### 5.1 Sidebar

- Lebar 215 px, latar `primary-800`, sudut kanan-atas melengkung 40 px, logo kiri atas (tinggi 40 px), nama merek tebal putih.
- Item: tinggi 48 px, ikon 20 px + label 14/500, warna putih 80% opasitas, hover 100% + latar `rgba(255,255,255,.08)`.
- **Item aktif:** pill putih melebar sampai tepi kanan sidebar (menyambung dengan latar konten), teks & ikon `primary-800`, radius kiri 999 px; ada lekukan terbalik (curved cutout) di atas/bawah pill bila memungkinkan, jika tidak cukup pill sederhana.
- Footer: teks kecil 11 px `primary-200` ("Dashboard Admin · © 2026").
- Mobile: dibuka sebagai `Sheet` dari kiri.

### 5.2 Topbar

Tinggi 72 px, latar transparan di atas `bg-app`. Kiri: hamburger + judul halaman (`h1`, 22–24). Tengah: pencarian pil `search-bg`, tinggi 44 px, ikon cari kanan, placeholder "Cari sesuatu di sini…". Kanan: ikon pesan & notifikasi dalam lingkaran putih 44 px dengan **badge ungu** (`primary-600`, teks putih 11 px, di pojok kanan-atas), lalu avatar bulat 40 px + nama (14/600) + peran (11, `text-muted`).

### 5.3 StatCard

- Ukuran fleksibel, tinggi 104 px, radius 16, padding 20, latar warna solid (`primary-600` / `accent-blue` / `accent-green` / `accent-lime`).
- Kiri: kotak ikon outline putih. Kanan (rata kanan): label 14/500 putih 90% di atas, angka `display` putih.
- Varian: `trend` opsional (▲ 12% vs kemarin) 12 px di bawah angka; state loading = skeleton putih transparan.
- Pemetaan: **Pesanan Hari Ini** → indigo; **Menunggu Verifikasi** → biru (berdenyut halus bila > 0); **Pendapatan Hari Ini** → hijau (format Rp, singkat `Rp 1,2 jt` bila ≥ 7 digit di layar kecil); **Stok Menipis** → lime.

### 5.4 SectionCard

Latar putih, radius 20, `shadow-card`, padding 24. Header: judul `h2` kiri, kontrol kanan (toggle, dropdown periode, tombol "Lihat Semua").

### 5.5 Kartu Profil + Donut + Aktivitas

- Foto bulat 88 px dengan **cincin gradien** `primary-600 → #8A3FD1` tebal 6 px, nama 18/600, peran `text-muted`.
- 3 donut kecil 56 px (Makanan `accent-orange`, Kopi `accent-green`, Non Kopi `accent-teal #25B7A6`), persen di tengah 12/600, label di bawah 11 px.
- Daftar **Aktivitas Terbaru**: item tinggi ±64 px, ikon dalam kotak putih 40 px berbayang tipis, teks 12 px (dua baris), waktu relatif `text-muted`; area scroll tinggi tetap dengan *fade* di bawah dan tombol panah-bawah bulat melayang untuk menggulir.

### 5.6 Grafik Statistik Penjualan (Recharts)

- Garis halus (`type="monotone"`), tebal 3 px, tanpa titik; titik aktif lingkaran 10 px putih dengan ring `primary-600`.
- Seri: Pemasukan `primary-600`, Pesanan `accent-green`, Pengeluaran `accent-red` (sesuai legenda & toggle).
- Grid putus-putus `#E8E8F0`, label sumbu 11 px `text-muted`, garis bantu vertikal putus-putus pada hover.
- **Tooltip:** kartu putih radius 12, `shadow-pop`, tanggal di atas (12), dua nilai berdampingan dengan penanda bulat berwarna + angka 16/600 + label 11.
- Kontrol: toggle switch per seri (warna seri saat aktif, abu saat mati) dan dropdown pil "Bulan Ini" dengan chevron.
- Legenda di bawah tengah; tinggi grafik 300 px (desktop), 220 px (mobile).

### 5.7 Kartu Horizontal (Menu Terlaris, Kasir & Meja Aktif)

- Menu Terlaris: kartu 300×~200, gambar/ikon produk di kanan atas dalam kotak 40×40 radius 10, nama produk (16/600), harga (13/600 `primary-800`), deskripsi 2 baris (12 `text-muted`), baris bawah: pil kategori (latar `primary-50`, teks `primary-600`, 12/500) + jumlah terjual kanan.
- Kasir/Meja Aktif: kartu ±200×88, avatar/ikon berwarna 56 px radius 12 (warna berbeda per item), nama 14/600, sub-info (mis. "21 pesanan") `primary-600` 12/500.
- Scroll horizontal dengan `snap-x`, tombol "Lihat Semua" (outline pill `primary-600`, panah kanan), indikator titik carousel (aktif `primary-600`).

### 5.8 Tabel Data

Header latar `surface-muted`, teks 12/600 `text-muted` kapital kecil; baris tinggi 56 px, garis `border`, hover `primary-50`; kolom aksi rata kanan dengan ikon tombol (edit, hapus). Paginasi di bawah; mobile berubah menjadi kartu bertumpuk. Selalu ada *empty state* dan *skeleton*.

---

## 6. Komponen Umum

### 6.1 Tombol

| Varian | Gaya | Penggunaan |
| --- | --- | --- |
| Primer | Latar `primary-600`, teks putih, radius 12, tinggi 44 (kasir 52) | Aksi utama |
| Sekunder | Outline `primary-600`, teks `primary-600` | Aksi alternatif, "Lihat Semua" (pill) |
| Ghost | Tanpa latar, hover `primary-50` | Aksi tersier |
| Sukses | `accent-green` | "Setuju" pembayaran |
| Bahaya | `accent-red` | "Tolak", hapus |
| Ikon | 40×40 lingkaran/rounded | Edit, tutup |

State: hover (gelap 6%), fokus (ring 3 px `primary-200`), disabled (opasitas 45%), loading (spinner + teks tetap, cegah klik ganda).

### 6.2 Form

Input tinggi 44, latar `surface-muted`, border `border`, radius 12; fokus border `primary-600` + ring; label 13/500 di atas; pesan error 12 `accent-red` dengan ikon; bantuan 12 `text-muted`. Pemilih gambar: `ImageUploader` dengan area *drag & drop* putus-putus radius 16, pratinjau, progres, catatan "Akan dikonversi ke AVIF". Input harga: awalan "Rp", format ribuan otomatis.

### 6.3 Badge & Status

**Status Pesanan** (teks UI → warna):

| Status | Label UI | Gaya |
| --- | --- | --- |
| `AWAITING_PAYMENT` | Menunggu Pembayaran | Peringatan (oranye) |
| `AWAITING_VERIFICATION` | Menunggu Verifikasi | Info (biru), titik berdenyut |
| `PAYMENT_REJECTED` | Pembayaran Ditolak | Bahaya (merah) |
| `ACCEPTED` | Pesanan Diterima | Sukses (hijau) |
| `PREPARING` | Sedang Diproses | Indigo (`primary-50`/`primary-600`) |
| `READY` | Siap Diambil/Disajikan | Hijau tua tebal |
| `COMPLETED` | Selesai | Netral |
| `CANCELLED` | Dibatalkan | Netral coret/abu |

**Status Stok:** Aman (hijau), Menipis (oranye), Habis (merah). **Peran:** Super Admin (indigo), Kasir (biru). Badge: pil, tinggi 24–28, teks 12/500, selalu menyertakan **teks** (bukan warna saja).

### 6.4 Dialog, Sheet, Toast

- Dialog: radius 20, `shadow-pop`, maks lebar 480 (form) / 720 (detail); tombol primer kanan bawah, batal di kirinya. Konfirmasi destruktif menyebutkan objek ("Hapus 'Es Kopi Susu'?").
- Sheet samping untuk form panjang di admin; *bottom sheet* untuk customer di ponsel.
- Toast (sonner) kanan-atas (desktop) / atas (mobile), 4 detik; error tidak hilang otomatis bila membutuhkan tindakan.

### 6.5 Skeleton, Empty, Error

- Skeleton: blok `surface-muted` dengan *shimmer* lembut, bentuk menyerupai konten asli.
- Empty state: ilustrasi/ikon sederhana, judul, deskripsi, tombol aksi ("Belum ada produk. Tambah produk pertama").
- Error per kartu: pesan singkat + tombol "Coba lagi"; satu bagian gagal tidak merusak halaman.

### 6.6 ConnectionIndicator

Titik 8 px + teks 11: hijau "Terhubung", kuning "Menghubungkan…", merah "Terputus — memuat ulang otomatis". Ditaruh di topbar admin/kasir.

---

## 7. Permukaan Customer (Mobile-First)

- **Header:** logo + nama kafe, badge "Meja 5" (pil `primary-50`), pencarian pil.
- **Tab kategori** sticky: Semua · Makanan · Kopi · Non Kopi; chip terpilih `primary-600` teks putih, tak terpilih putih berborder.
- **Kartu menu:** gambar kiri 96×96 radius 12 (AVIF, *lazy*), nama 15/600, deskripsi 2 baris 12, harga 14/700 `primary-800`; kanan bawah tombol **+** bulat 36 px atau stepper (− qty +). Habis: gambar abu, label "Habis", tombol nonaktif.
- **Keranjang mengambang:** pil `primary-600` lebar penuh (margin 16) di bawah: "🛒 3 item · Rp 58.000 →" dengan `shadow-float`; muncul bila keranjang tidak kosong.
- **Keranjang/Checkout:** daftar item dengan stepper & catatan, ringkasan total, tombol primer "Pesan & Bayar" lebar penuh.
- **Pembayaran:** total besar (28/700), gambar QRIS berbingkai, kartu rekening dengan tombol **Salin**, *countdown* (merah < 3 menit), area unggah bukti, tombol "Kirim Bukti Pembayaran".
- **Status live:** **stepper vertikal** (Menunggu Pembayaran → Menunggu Verifikasi → Diterima → Diproses → Siap), langkah aktif berdenyut, selesai bercentang hijau; kartu merah dengan alasan saat ditolak + tombol "Unggah Ulang"; nomor pesanan besar bisa disalin.
- Bagian bawah aman dari *notch* (`env(safe-area-inset-bottom)`); target sentuh ≥ 44 px; berat halaman awal minimal.

---

## 8. Permukaan Kasir (Tablet Landscape)

- Tata letak 2 panel: **kiri** daftar antrean (±38%), **kanan** detail pesanan.
- Header: nama kasir, ConnectionIndicator, tombol suara (ikon lonceng), logout. Tab: **Perlu Verifikasi** (badge merah angka) · Diproses · Siap · Riwayat.
- Kartu antrean besar (tinggi ≥ 88): kode, "Meja 5" tebal, waktu relatif, total, badge status. Yang menunggu verifikasi tertua di atas, tepi kiri kartu 4 px berwarna biru.
- **Pesanan baru:** kartu masuk dengan animasi + sorotan `primary-50` 2 detik, toast "Pesanan baru — Meja 5", suara pendek, judul tab "(2) Kasir".
- **Detail:** item (qty besar), catatan disorot kuning muda, total, **viewer bukti bayar** (zoom/pan, layar penuh) berdampingan dengan ringkasan nominal agar mudah dibandingkan.
- **Bilah aksi** menempel di bawah detail: **[ Tolak ]** (merah outline) dan **[ Setuju — Terima Pesanan ]** (hijau solid, tinggi 56). Setelah setuju: **[ Cetak ]** + tombol progres tunggal berikutnya (Proses → Siap → Selesai).
- Dialog Tolak: pilihan cepat (Nominal tidak sesuai · Bukti tidak jelas/buram · Bukan bukti pembayaran · Pembayaran belum masuk · Lainnya) + kolom teks; tombol "Kirim Penolakan" nonaktif sampai alasan dipilih.

---

## 9. Cetak

### 9.1 Struk Pesanan (thermal 58/80 mm)

- Lebar 58 mm (≈ 48 mm area cetak) atau 80 mm (≈ 72 mm); margin 0; font monospace (`ui-monospace, 'Courier New'`) 11–12 px; hitam putih murni, tanpa bayangan/warna.
- Susunan: nama kafe (tebal, tengah) → garis putus → **No. Pesanan** (besar) & **Meja** (besar, tebal) → tanggal/jam WIB → garis → item `2x Es Kopi Susu` + catatan (huruf kapital, ditandai `>>`) → garis → **TOTAL** → status **LUNAS** → footer ("Terima kasih") → ruang kosong 10 mm untuk potong.
- CSS: `@page { size: 80mm auto; margin: 0 }`, `@media print` sembunyikan semua kecuali `.receipt`, hindari pemisahan halaman di tengah item.
- Pilihan lebar kertas disimpan di pengaturan perangkat (localStorage).

### 9.2 Lembar QR Meja (A4)

Grid 2×3 per halaman; tiap sel: logo & nama kafe, QR 6–7 cm (margin tenang ≥ 4 modul), teks "Scan untuk memesan", label **Meja X** besar, URL pendek kecil di bawah. Garis potong tipis antar sel.

---

## 10. Salinan Teks (Copy) & Nada

Nada: ramah, singkat, sopan, Bahasa Indonesia baku sehari-hari ("Anda"/tanpa kata ganti bila memungkinkan). Format: `Rp 25.000`, tanggal `16 Nov 2026`, jam 24 jam `17.20 WIB`, waktu relatif "12 menit lalu".

**Pesan standar (peta kode error → teks):**

| Kode | Pesan untuk pengguna |
| --- | --- |
| `VALIDATION_ERROR` | Data belum lengkap atau tidak valid. Periksa kolom yang ditandai. |
| `UNAUTHENTICATED` | Sesi berakhir. Silakan masuk kembali. |
| `FORBIDDEN` | Anda tidak memiliki akses untuk tindakan ini. |
| `NOT_FOUND` | Data tidak ditemukan. |
| `ALREADY_PROCESSED` | Pesanan ini sudah diproses oleh kasir lain. |
| `STOCK_INSUFFICIENT` | Stok [nama] tidak mencukupi. Sisa [n]. |
| `ORDER_EXPIRED` | Waktu pembayaran habis. Pesanan dibatalkan. |
| `INVALID_TRANSITION` | Status pesanan tidak dapat diubah ke tahap ini. |
| `RATE_LIMITED` | Terlalu banyak percobaan. Coba lagi sebentar lagi. |
| `UPLOAD_INVALID` | Berkas harus berupa gambar (JPG, PNG, WEBP) maksimal 10 MB. |
| `INTERNAL` | Terjadi kesalahan. Silakan coba lagi. |

**Contoh label:** tombol "Pesan & Bayar", "Kirim Bukti Pembayaran", "Unggah Ulang", "Setuju — Terima Pesanan", "Tolak Pembayaran", "Cetak Pesanan", "Tambah Produk", "Barang Masuk". Status customer: "Menunggu verifikasi kasir…", "Pesanan Anda diterima! Sedang disiapkan.", "Pembayaran ditolak: [alasan]. Silakan unggah ulang bukti yang benar."

---

## 11. Aksesibilitas

- Kontras WCAG AA; periksa teks putih di atas `accent-lime` dan `accent-blue`.
- Fokus selalu terlihat (ring 3 px `primary-200` + garis dalam `primary-600`); urutan tab logis.
- Semua kontrol punya label; ikon-saja memakai `aria-label`.
- Perubahan realtime diumumkan via `aria-live="polite"` (status pesanan), pesan error `role="alert"`.
- Status tidak hanya warna: selalu teks/ikon.
- Target sentuh ≥ 44×44 px (kasir ≥ 52); jarak antar target ≥ 8 px.
- `prefers-reduced-motion` dihormati; suara notifikasi bisa dimatikan dan tidak menjadi satu-satunya penanda (ada sorotan visual + badge).
- Zoom hingga 200% tanpa kehilangan fungsi; tidak mengunci orientasi.

---

## 12. Daftar Komponen yang Harus Dibangun

| Komponen | Lokasi | Dipakai oleh |
| --- | --- | --- |
| `AdminShell`, `Sidebar`, `Topbar` | `components/admin` | Admin |
| `StatCard`, `SectionCard`, `PillBadge` | `components/shared` | Admin |
| `SalesChart`, `CategoryDonut`, `ActivityFeed`, `HorizontalCardList` | `components/admin` | Ringkasan |
| `DataTable`, `TableSkeleton`, `EmptyState`, `ErrorCard` | `components/shared` | Semua |
| `ImageUploader`, `PriceInput`, `ConfirmDialog` | `components/shared` | Admin, Customer |
| `ConnectionIndicator`, `RealtimeToast` | `components/shared` | Admin, Kasir |
| `OrderStatusBadge`, `StockBadge` | `components/shared` | Semua |
| `MenuCard`, `CategoryTabs`, `CartBar`, `CartItemRow`, `OrderStepper`, `PaymentPanel`, `Countdown` | `components/customer` | Customer |
| `OrderQueue`, `OrderCard`, `ProofViewer`, `ApproveRejectBar`, `RejectDialog` | `components/cashier` | Kasir |
| `Receipt`, `QrSheet` | `components/shared` (cetak) | Kasir, Admin |

Setiap komponen: tipe props jelas, varian lewat `cva`, mendukung state loading/kosong/error bila relevan, dan memiliki contoh pada halaman `/admin/settings/design` (galeri komponen internal, opsional) atau Storybook.

---

## 13. Checklist Tinjauan Desain

- [ ] Memakai token, bukan nilai hex/px sembarang.
- [ ] Tampilan sesuai permukaan (customer mobile, kasir tablet, admin desktop) dan responsif.
- [ ] Ada state loading, kosong, error, sukses.
- [ ] Status memakai pemetaan baku (bagian 6.3) dengan label teks.
- [ ] Animasi realtime halus dan menghormati *reduced motion*.
- [ ] Kontras & target sentuh memenuhi standar.
- [ ] Teks UI memakai copy standar Bahasa Indonesia dan format Rp/waktu WIB.
- [ ] Cetak diuji pada kertas 58/80 mm dan A4 (QR terbaca ponsel).
