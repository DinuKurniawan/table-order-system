# AUDIT UI/UX DAN AKSESIBILITAS TERHADAP DESIGN-SYSTEM

**Tanggal:** 19 November 2026
**Mode:** read-only terhadap kode aplikasi — tidak ada perubahan `src/**`, `prisma/**`, atau konfigurasi.
**Acuan:** `DESIGN-SYSTEM.md` v1.0 (391 baris), `PRD.md`, `ARCHITECTURE.md`.
**Alat:** Playwright 1.65.1 (Chrome), axe-core 4.14.1, Next.js 16.4.6 production build, PostgreSQL 18.3 lokal.
**Data uji:** `prisma/seed.ts` + `prisma/seed-demo.ts` (500 pesanan, 8 produk, 10 meja) di database sementara `coffeeshop_ui_audit` (di-drop setelah audit).
**Tangkapan layar:** 54 berkas PNG di `UI-AUDIT-SCREENSHOTS/` (3 viewport × 18 halaman), 3,3 MB.

> Catatan nama berkas: karakter `/` tidak valid pada nama file Windows, sehingga nama yang diminta ditulis `AUDIT-UI-UX-DAN-AKSESIBILITAS-TERHADAP-DESIGN-SYSTEM.md`.

---

## 1. Ringkasan

**11 temuan: 4 Tinggi, 5 Sedang, 2 Rendah.**

Fondasi visualnya kuat — token warna/radius/shadow benar-benar dipakai lewat `@theme`, `prefers-reduced-motion` dihormati, semua halaman punya `<html lang="id">`, dan format `Rp 22.000` serta `19 Sep 2026, 18.39 WIB` konsisten. Masalahnya bukan "tampilan generik", melainkan **kontras yang gagal di mana-mana, pemetaan status yang bercabang, dan kontrol yang tidak bisa dioperasikan pembaca layar atau jari**.

| # | Temuan | Tingkat | Bukti terkuat |
|---|---|---|---|
| UI-01 | Kontras teks putih pada kartu statistik & badge status gagal WCAG AA | **Tinggi** | Putih di atas lime **2,04:1**, biru **2,72:1**, hijau **2,23:1**; axe: **136 node** kontras di 12 halaman |
| UI-02 | Status pesanan tidak memakai satu pemetaan baku; 3 salinan label + warna menyimpang dari §6.3 | **Tinggi** | `AWAITING_VERIFICATION` biru di spec, **oranye** di kasir, **indigo** di detail; 3 label berbeda untuk status yang sama |
| UI-03 | Label form & nama aksesibel hilang; tidak ada `role="alert"` | **Tinggi** | axe `label` **critical 12**, `select-name` **critical 1**, `button-name` **critical 2**; `role="alert"` = **0** di seluruh `src` |
| UI-04 | Target sentuh 24–36 px, jauh di bawah 44/52 px | **Tinggi** | Tombol admin **28 px**, ikon meja **24×24**, header kasir **36 px**; 81 target kecil di `/admin/stock` |
| UI-05 | Matriks state tidak lengkap (error/loading) | Sedang | Antrean kasir tanpa cabang error → tampil "Belum ada pesanan"; keranjang berkedip "Keranjang Kosong" |
| UI-06 | Tabel admin tidak berubah jadi kartu di 360 px; detail kasir meluber | Sedang | `min-w-[720/760px]`; `scrollWidth` 375 px pada viewport 360 px |
| UI-07 | Jalan buntu alur customer (kode akses, pesanan kedaluwarsa) | Sedang | `accessToken` 32 hex tidak pernah ditampilkan; kartu "Pesanan dibatalkan" tanpa CTA |
| UI-08 | Cetak: tipografi struk di bawah spec, pilihan lebar tidak persisten, lembar QR A4 tidak ada | Sedang | 58 mm pakai **10 px** (spec 11–12), `padding 4mm 3mm`; tidak ada `@page A4` |
| UI-09 | Kontrol mati & nilai internal bocor ke UI | Sedang | "Nonaktifkan meja" tanpa aksi; search topbar tanpa handler; dropdown menampilkan `all`, `newest` |
| UI-10 | Drift token & nilai hardcoded | Rendah | `accent-blue` `#3FA2F7` vs `#45A5F5`; **67 hex** di 8 berkas; **135** nilai px arbitrer; **59** teks < 12 px |
| UI-11 | Landmark, heading, judul halaman | Rendah | Menu customer tanpa `h1`; dashboard `h1 → h3`; semua halaman admin berjudul sama |

---

## 2. Metode dan Batas Pengujian

| Aspek | Detail |
|---|---|
| Viewport | 360×800 (customer), 768×900 (tablet), 1280×900 (admin/kasir) |
| Halaman | 18: landing, login, menu, keranjang, gerbang pesanan, lacak pesanan, 9 halaman admin, 3 halaman kasir |
| Autentikasi | Login nyata sebagai `admin` (SUPER_ADMIN) dan `kasir` (CASHIER) lewat UI |
| axe | Tag `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa` di 360 & 1280; tag `best-practice` di 4 halaman utama |
| Ukur manual | `scrollWidth` vs `innerWidth`, bounding box target sentuh, nama aksesibel, ukuran font terhitung |
| Data | 500 pesanan demo; 50 `AWAITING_VERIFICATION` (sumber antrean kasir), 417 pembayaran `APPROVED` |

**Batas yang harus diketahui:**

1. **R2 tidak dikonfigurasi** pada lingkungan audit → viewer bukti bayar menampilkan kotak hitam, QRIS tidak tampil. Ini kondisi lingkungan, bukan temuan kode; tetapi memperlihatkan bahwa **kegagalan memuat bukti tidak punya pesan pemulihan** (lihat UI-07).
2. **Tidak ada pesanan `AWAITING_PAYMENT`** di seed (semua sudah dibayar/kedaluwarsa), sehingga countdown, unggah ulang setelah ditolak, dan keadaan "waktu habis" hanya diverifikasi dari kode, bukan dijalankan.
3. **Cetak fisik** (kertas 58/80 mm, A4) tidak diuji; hanya CSS `@page`, ukuran font, dan padding.
4. Kontras di dalam `<canvas>`/SVG Recharts tidak terukur oleh axe; angka kontras chart dihitung manual dari token.
5. axe tidak dapat menilai kontras teks di atas gambar (foto produk, QRIS).

---

## 3. Matriks 8 Area Audit

| # | Area | Verdict | Ringkas |
|---|---|---|---|
| 1 | Token (warna/radius/shadow/tipografi) | **Sebagian** | Token dipakai benar lewat `@theme`, tetapi 4 nilai token menyimpang dari spec dan 67 hex/135 px hardcoded menduplikasinya |
| 2 | State loading/kosong/error/sukses | **Sebagian** | 14/18 halaman punya skeleton + empty; 3 halaman tanpa state error; 1 halaman tanpa skeleton |
| 3 | Pemetaan status baku | **Tidak** | Tidak ada komponen bersama `OrderStatusBadge`; 3 map label, 3 map warna, 1 status dengan 3 warna berbeda |
| 4 | Responsif 360/768/1280 | **Sebagian** | Customer & dashboard baik; tabel admin tetap tabel 6–7 kolom di 360 px; detail kasir meluber 15 px |
| 5 | Aksesibilitas | **Tidak** | Kontras gagal masif, 15 kontrol tanpa nama/label, 0 `role="alert"`, target sentuh 24–36 px |
| 6 | Copy & format | **Sebagian** | `Rp`/WIB/`id-ID` konsisten; nilai internal `all`/`newest` bocor; waktu relatif tidak dipakai di kartu antrean |
| 7 | Cetak | **Tidak** | Struk ada dan `@page` benar, tetapi font 10 px, padding melebihi area cetak, lebar tidak tersimpan, **lembar QR A4 tidak ada** |
| 8 | Alur customer end-to-end | **Sebagian** | Bahagia path lulus; kehilangan cookie = pesanan tidak bisa dibuka lagi; kedaluwarsa = jalan buntu tanpa CTA |

---

## 4. Token

### 4.1 Drift token (spec vs implementasi)

| Token | DESIGN-SYSTEM | `globals.css` | Dampak |
|---|---|---|---|
| `accent-blue` | `#45A5F5` | `#3FA2F7` | Kartu "Menunggu Verifikasi" beda dari acuan; keduanya tetap gagal kontras |
| `primary` (shadcn) | `primary-600` = `#4B2FE0` | `#4B22C7` | Dua ungu berbeda di satu layar (tombol vs kartu) |
| `text-muted` | `#8A8AA0` | `#6B6B80` | Implementasi **lebih aman** (5,20:1 vs 3,37:1) — spec-nya yang salah |
| `--radius` | 12 px | 16 px | Radius dasar dialog/input membesar tanpa aturan |
| `radius-pill` | 999 px | 9999 px | Tidak terlihat, tetapi menyimpang |
| `accent-blue` (kartu) | teks putih | teks putih 85% | Opasitas menurunkan kontras dari 2,72 → ±2,3 |

Temuan penting: **DESIGN-SYSTEM §2.1 sendiri menetapkan `text-muted #8A8AA0` yang hanya 3,37:1 di atas putih** — gagal aturan AA-nya sendiri. Kode sudah memilih `#6B6B80` (5,20:1). Jangan "memperbaiki" ke arah spec.

### 4.2 Nilai hardcoded

**67 warna hex di 8 berkas** (di luar `globals.css`):

| Berkas | Hex | Contoh |
|---|---|---|
| `dashboard-manager.tsx` | 18 | `#4B2FE0`, `#45A5F5`, `#0E8F66`, `#EDEDF3` |
| `pill-badge.tsx` | 15 | satu-satunya definisi badge semantik, ditulis sebagai hex |
| `finance-chart.tsx` | 12 | `#0E8F66`, `#F59A2B`, `#5B5B73` |
| `sales-chart.tsx` | 10 | `#4B2FE0`, `#E7E7EF` |
| `global-error.tsx` | 8 | palet "krem" yang tidak ada di design system |
| `cashier-manager.tsx` | 2 | `#0E8F66`, `#C22F35` |
| `admin-shell.tsx`, `realtime-test` | 1+1 | `#8A3FD1` (cincin avatar — memang disebut spec) |

Karena `pill-badge.tsx` memakai hex, **seluruh badge semantik** (sukses/info/peringatan/bahaya/netral) tidak bisa diubah lewat token dan tidak otomatis ikut tema gelap.

**135 nilai px arbitrer**, terbanyak: `dashboard-manager` 26, `admin-shell` 17, `order-tracking` 7, `cashier-order-detail` 7, `finance-manager` 7.

**59 ukuran font < 12 px** (`text-[9px]`, `[10px]`, `[11px]`): `dashboard-manager` 12, `admin-shell` 10, `audit-manager` 4, `finance-manager` 4, `stock-manager` 4. Spec hanya mengizinkan `overline` 11 px; 9–10 px tidak ada di skala.

### 4.3 Radius, bayangan, tipografi

- `StatCard`: `rounded-[20px] p-6 text-3xl sm:text-4xl` → spec §5.3 minta **tinggi 104, radius 16, padding 20, angka `display` 40/48**. Akibat terlihat di `/admin` 1280: `Rp 394.000` **pecah dua baris** dan kartu memanjang.
- Bayangan ditulis ulang sebagai arbitrary value di `stat-card.tsx` (`shadow-[0_8px_20px_rgba(...)]` 4 varian) padahal ada `--shadow-card`.
- `SectionCard` memakai `rounded-[20px]` (benar) tetapi `p-6` (24) sementara spec 24 — konsisten; `EmptyState` `rounded-[18px]` tidak ada di skala radius.

---

## 5. Matriks State Halaman × State

`✓` ada dan sesuai · `△` ada tapi tidak sesuai/tidak lengkap · `✗` tidak ada · `n/a` tidak relevan

| Halaman | Loading | Kosong | Error | Sukses / toast |
|---|---|---|---|---|
| `/` landing | n/a | n/a | n/a | n/a |
| `/login` | ✓ spinner tombol | n/a | △ inline, **tanpa `role="alert"`** | → redirect |
| `/m/[token]` menu | ✓ `isLoading` + kartu | ✓ "Menu tidak ditemukan" | ✓ + tombol "Coba Lagi" | n/a |
| `/m/[token]/cart` | **✗** (tanpa gate `cartReady`) | ✓ (tetapi berkedip saat load) | △ hanya toast | → redirect |
| `/order/[code]` gerbang | ✓ spinner tombol | n/a | △ inline, tanpa `role="alert"`, input tanpa label | → `router.refresh()` |
| `/order/[code]` lacak | n/a (data awal server) | n/a | △ toast saja; gagal muat senyap | ✓ 4 toast (unggah, batal, status) |
| `/admin` | ✓ skeleton per bagian | ✓ per bagian | ✓ 6/7 bagian punya "Coba lagi"; **KPI hanya "—"** | n/a (read-only) |
| `/admin/menu` | ✓ `TableSkeleton` | ✓ | △ `EmptyState` tanpa tombol ulang | ✓ toast |
| `/admin/stock` | ✓ | ✓ | △ `EmptyState` tanpa tombol ulang | ✓ toast |
| `/admin/finance` | ✓ | ✓ | △ `EmptyState` tanpa tombol ulang | ✓ toast |
| `/admin/cashiers` | ✓ | ✓ | △ `EmptyState` tanpa tombol ulang | ✓ toast |
| `/admin/tables` | ✓ | ✓ | △ `EmptyState` tanpa tombol ulang | ✓ toast |
| `/admin/settings` | △ `isLoading` tanpa skeleton | n/a | △ | ✓ toast |
| `/admin/settings/audit` | ✓ | ✓ | ✓ + "Coba lagi" | n/a |
| `/admin/settings/realtime-test` | n/a | n/a | n/a | n/a |
| `/cashier` | ✓ skeleton kartu | ✓ per tab | **✗ tidak ada cabang `isError`** | ✓ toast realtime |
| `/cashier/orders/[id]` | ✓ fallback `dynamic()` | ✓ "Belum ada pembayaran" | △ toast | ✓ toast |
| `/cashier/orders/[id]/print` | n/a (RSC) | n/a | 404 → `notFound()` | n/a |

**Bukti UI-05 (antrean kasir):** `cashier-dashboard.tsx:105-109` hanya mengambil `{ data, isLoading }`. Bila `GET /api/cashier/orders` gagal, `data` tetap `undefined`, `orders` menjadi `[]` (`:165`), dan layar menampilkan **"Belum ada pesanan yang menunggu verifikasi."** — kasir mengira antrean kosong padahal server mati, tanpa tombol coba lagi.

**Bukti UI-05 (keranjang):** `cart/page.tsx:136` memeriksa `totalItems === 0` tanpa menunggu `cartReady` (`:38`, `:49`). Render pertama (SSR + paint pertama) selalu "Keranjang Kosong", lalu item muncul setelah efek `localStorage` — kilatan state salah pada setiap muat halaman.

---

## 6. Pemetaan Status

### 6.1 Status pesanan

Spec §6.3: `AWAITING_PAYMENT` peringatan/oranye · `AWAITING_VERIFICATION` **info/biru + titik berdenyut** · `PAYMENT_REJECTED` bahaya/merah · `ACCEPTED` sukses/hijau · `PREPARING` indigo · `READY` hijau tua tebal · `COMPLETED` netral · `CANCELLED` netral coret.

| Status | Customer (`order-tracking.tsx:34`) | Kasir (`cashier-dashboard.tsx:71`) | Detail kasir (`cashier-order-detail.tsx:47`) |
|---|---|---|---|
| `AWAITING_PAYMENT` | "Menunggu Pembayaran" | — (tidak ada) | "Menunggu pembayaran" |
| `AWAITING_VERIFICATION` | "Menunggu Verifikasi" | "Menunggu verifikasi" + **oranye** (`:82`) | "Menunggu verifikasi" + **badge indigo** (`:180`) |
| `PAYMENT_REJECTED` | "Bukti Pembayaran Ditolak" | "Ditolak" + merah | "Pembayaran ditolak" |
| `ACCEPTED` | "Diterima" | "Diterima" + biru | "Diterima" |
| `PREPARING` | "Diproses" | "Diproses" + indigo | "Diproses" |
| `READY` | "Siap" | "Siap" + `text-emerald-700` | "Siap" |
| `COMPLETED` | "Selesai" | "Selesai" + netral | "Selesai" |
| `CANCELLED` | "Dibatalkan" | "Dibatalkan" + netral | "Dibatalkan" |

Tiga masalah sekaligus:

1. **Tiga sumber kebenaran** — label beda kapitalisasi dan diksi untuk status yang sama. Tidak ada `OrderStatusBadge` bersama, padahal §12 mewajibkannya.
2. **Warna menyimpang** — `AWAITING_VERIFICATION` seharusnya biru/info, di kasir justru oranye (warna "peringatan"); di halaman detail semua status memakai badge indigo yang sama sehingga warna kehilangan makna.
3. **Tidak ada titik berdenyut** untuk status menunggu verifikasi, padahal itu penanda "butuh tindakan" utama di permukaan kasir.

Badge stok sudah benar: teks + warna (`Aman`/`Menipis`/`Habis`) dari satu fungsi `statusPill()` (`stock-manager.tsx:86`).

### 6.2 Badge realtime

| Elemen | Spec | Aktual |
|---|---|---|
| `ConnectionIndicator` | titik 8 px + "Terhubung"/"Menghubungkan…"/"Terputus" | Teks "**Realtime Aktif**" (admin & kasir) |
| Verifikasi baru | badge angka merah di tab | badge ungu `primary-600` (masih terbaca) |
| Sorotan kartu baru | 2 detik `primary-50` | **8 detik** (`cashier-dashboard.tsx:124`) |

---

## 7. Responsif

### 7.1 Hasil per permukaan

| Permukaan | 360 px | 768 px | 1280 px |
|---|---|---|---|
| Customer menu | ✓ tanpa overflow; chip kategori terpotong di tepi kanan tanpa indikator geser; cart bar selalu tampil | ✓ 2 kolom | ✓ (konten melebar penuh) |
| Customer cart | ✗ state kosong berkedip | ✓ | ✓ |
| Lacak pesanan | ✓ | ✓ | ✓ |
| Login | △ badge "Akses Terproteksi" menimpa deskripsi | ✓ | ✓ |
| Admin dashboard | ✓ scroll horizontal pada kartu "Menu Terlaris" (sesuai desain); kartu statistik menumpuk | ✓ | △ nilai `Rp` pecah 2 baris |
| Admin menu/stock/finance/cashiers/audit | **✗ tabel 6–7 kolom dengan scroll horizontal**, bukan kartu bertumpuk | **✗** masih tabel `min-w` | ✓ |
| Admin tables | △ grid 2 kolom QR; tombol 24 px | ✓ | ✓ |
| Kasir antrean | ✓ kartu 1 kolom | ✓ | ✓ 3 kolom (spec: 2 panel daftar+detail) |
| Kasir detail | **✗ `scrollWidth` 375 px** (melebihi 360) | ✓ | ✓ |

Spec §5.8: *"Paginasi di bawah; mobile berubah menjadi kartu bertumpuk."* Implementasi tetap `<table class="w-full min-w-[720px]">` di dalam `overflow-x-auto` pada semua lebar.

### 7.2 Bukti overflow

`/cashier/orders/[id]` @360: `document.documentElement.scrollWidth = 375` vs `innerWidth = 360`. Penyebab: header memakai `justify-between` tanpa `flex-wrap` dan judul "Panel Antrean Kasir" + kontrol kanan tidak menyusut. Terlihat pada `UI-AUDIT-SCREENSHOTS/cashier-detail-360.png`: judul terpotong di kiri ("Antrean Kasir" terlipat) dan tombol "Keluar" terdorong keluar layar.

![Detail kasir 360px](./UI-AUDIT-SCREENSHOTS/cashier-detail-360.png)

### 7.3 Tabel admin @360

![Admin menu 360px](./UI-AUDIT-SCREENSHOTS/admin-menu-360.png)

Kartu "Produk" yang terlihat adalah **kolom pertama** dari tabel 6 kolom yang dipotong; pengguna harus menggeser horizontal untuk melihat harga/stok/aksi. Jumlah target kecil per halaman (lebar < 44 px): `/admin/stock` **81**, `/admin/menu` **56**, `/admin/tables` **34**, `/admin/finance` **19**.

### 7.4 Kartu statistik

![Dashboard 1280px](./UI-AUDIT-SCREENSHOTS/admin-dashboard-1280.png)

Nilai `Rp 394.000` pecah menjadi `Rp` + `394.000` karena kolom kanan hanya ±150 px (ikon 56 + padding 24×2 + angka 36 px). Spec meminta angka `display` 40/48 dengan tinggi kartu 104 — implementasi `text-3xl/4xl` tanpa `min-h` justru mendorong kartu lebih tinggi daripada spec saat nilai panjang.

---

## 8. Aksesibilitas

### 8.1 Kontras (dihitung dari token, WCAG 2.x)

| Pasangan | Rasio | Ambang | Verdict |
|---|---|---|---|
| Putih di `accent-lime #8DC63F` | **2,04:1** | 4,5 (teks) / 3 (besar) | Gagal total |
| Putih di `accent-green #1FC58E` | **2,23:1** | 4,5 | Gagal |
| Putih di `accent-blue #3FA2F7` | **2,72:1** | 4,5 | Gagal |
| Putih 85% di `accent-blue` | ±2,3:1 | 4,5 | Gagal (lebih buruk) |
| Putih di `primary-600 #4B2FE0` | 7,55:1 | 4,5 | Lulus |
| `#0E8F66` di `#E3F8F1` (badge sukses) | 3,69:1 | 4,5 | Gagal |
| `#1E7BD0` di `#E4F2FE` (info) | 3,84:1 | 4,5 | Gagal |
| `#B26A0C` di `#FEF1DF` (peringatan) | 3,80:1 | 4,5 | Gagal |
| `#C22F35` di `#FDE8E9` (bahaya) | 4,77:1 | 4,5 | Lulus |
| `text-muted #6B6B80` di putih | 5,20:1 | 4,5 | Lulus |
| `text-muted` spec `#8A8AA0` di putih | 3,37:1 | 4,5 | **Spec salah** |
| `primary-400 #7D66F0` di putih | 4,17:1 | 4,5 | Gagal bila dipakai teks |

Perbaikan yang terukur: teks `#1B1B2B` di atas lime = **8,30:1**, di atas biru = **6,24:1**, di atas hijau = **7,62:1**. Untuk badge semantik: `#0A6E4F` (5,65:1), `#14639F` (5,56:1), `#8A5A08` (5,32:1). Catatan: saran spec "gunakan `#6FA82A` untuk teks" tetap gagal (putih di atasnya hanya 2,87:1).

### 8.2 Ringkasan axe (WCAG A/AA)

| Halaman | Rule | Node |
|---|---|---|
| `/admin` | color-contrast 10 · label-content-name-mismatch 2 · scrollable-region-focusable 2 · **select-name 1** | 15 |
| `/admin/menu` | **button-name 2** · color-contrast 8 · lcnm 2 | 12 |
| `/admin/stock` | **label 12** · color-contrast 13 · lcnm 2 | 27 |
| `/admin/finance` | color-contrast 15 · lcnm 2 · scrollable 1 | 18 |
| `/admin/cashiers` | color-contrast 2 · lcnm 2 | 4 |
| `/admin/tables` | color-contrast 1 · lcnm 2 | 3 |
| `/admin/settings` | color-contrast 2 · lcnm 2 | 4 |
| `/admin/settings/audit` | color-contrast 26 · lcnm 2 | 28 |
| `/admin/settings/realtime-test` | color-contrast 4 · lcnm 2 | 6 |
| `/cashier` | **color-contrast 51** | 51 |
| `/cashier/orders/[id]` | color-contrast 3 | 3 |
| `/cashier/orders/[id]/print` | color-contrast 1 | 1 |
| `/`, `/login`, menu, cart, gerbang & lacak pesanan | — | 0 |

`label-content-name-mismatch` dipicu tombol lonceng/pesan yang punya badge angka: nama aksesibel "Notifikasi" tidak memuat teks terlihat "4", sehingga pembaca layar tidak mengumumkan jumlah.

### 8.3 Label & nama aksesibel (critical)

| Lokasi | Masalah |
|---|---|
| `admin/stock-manager.tsx:410-442` (`ThresholdInput`) | 12 `<input type="number">` tanpa `<label>`, `aria-label`, atau `aria-labelledby` — hanya nilai mentah |
| `admin/dashboard-manager.tsx:509` | `<select>` pemilih periode tanpa nama aksesibel |
| `admin/menu-manager.tsx:297-322` | 2 trigger dropdown filter (`role="combobox"`) tanpa nama aksesibel — sekaligus menampilkan nilai internal `all`/`newest` |
| `admin/admin-shell.tsx:278-284` | Input pencarian hanya mengandalkan placeholder dan **tidak terhubung ke handler apa pun** |
| `order/[code]/access-form.tsx:70-77` | Input "Kode akses pesanan" hanya placeholder, tanpa label |
| `components/ui/input.tsx` | Tinggi default `h-8` (32 px) — semua form mewarisi target kecil |

### 8.4 Pengumuman status (live region)

- `aria-live` di seluruh `src`: **2** (stepper lacak pesanan `:182`, zoom bukti `proof-viewer.tsx:64`).
- `role="alert"`: **0**. Error login (`login/page.tsx:81-86`), kode akses salah (`access-form.tsx:79-83`), dan error field form tidak diumumkan — pengguna pembaca layar tidak tahu submit gagal.
- Antrean kasir: pesanan baru hanya lewat toast sonner + suara + sorotan visual. Bila suara dimatikan (spec mengizinkan), satu-satunya penanda adalah toast yang hilang setelah 4 detik.

### 8.5 Fokus & keyboard

- `outline-none` pada trigger dropdown profil (`admin-shell.tsx:325`) menghapus indikator fokus.
- `scrollable-region-focusable` (5 node): kontainer `.max-h-[320px]` (aktivitas dashboard) dan `.overflow-x-auto` (tabel) tidak bisa digulir dengan keyboard.
- Tidak ada **skip link** ("Lewati ke konten") dan tidak ada `aria-current` pada item sidebar aktif.
- Fokus ring bawaan shadcn = `ring-3 ring-ring/50` dengan `--ring: #4B22C7`, bukan `primary-200` 3 px seperti spec — kontras ring lebih tinggi, jadi ini penyimpangan yang aman.

### 8.6 Gerak

`globals.css:184-193` mematikan animation/transition saat `prefers-reduced-motion: reduce` — **sesuai spec**. Konsekuensi kecil: spinner `animate-spin` juga berhenti, sehingga indikator loading menjadi ikon statis.

### 8.7 Landmark & heading (best-practice)

- `/m/[token]`: **tidak ada `h1`** (judul "Menu Kafe" adalah `h2` di dalam SectionCard), dan cart bar `position: fixed` berada di luar landmark (`region`).
- `/admin`: `h1` topbar → `h3` judul kartu (melompati `h2`) — 1 node `heading-order`.
- Semua halaman admin memakai `document.title` yang sama: **"Sistem Pemesanan F&B via QR Meja"**; hanya kasir yang dinamis (`(50) Kasir`) dan menu (`Menu Kafe`).

---

## 9. Copy & Format

| Aturan (§10) | Status | Bukti |
|---|---|---|
| `Rp 25.000` | ✓ | `formatRupiah()` memakai `Intl.NumberFormat("id-ID")`; negatif → `-Rp` |
| Tanggal `16 Nov 2026` | ✓ | `formatWIB()` dengan `Asia/Jakarta` |
| Jam 24 jam `17.20 WIB` | ✓ | Titik sebagai pemisah, akhiran WIB |
| Waktu relatif "12 menit lalu" | △ | `relativeTime()` ada dan dipakai di detail kasir/stok/meja, tetapi **kartu antrean kasir menampilkan tanggal absolut** ("22 Agu 2026") padahal spec §8 minta waktu relatif |
| Bahasa Indonesia baku | △ | `Semua status`, `Terbaru` ditulis benar di `<SelectItem>`, tetapi trigger menampilkan nilai internal **`all`** dan **`newest`** |
| Nada & pesan error | △ | Copy error baik, tetapi tidak diumumkan (`role="alert"`) dan tidak semua punya aksi pemulihan |

Nilai internal yang bocor terlihat jelas di `UI-AUDIT-SCREENSHOTS/admin-menu-1280.png` (dua dropdown di bawah tab kategori).

---

## 10. Cetak

| Aspek | Spec §9 | Implementasi | Verdict |
|---|---|---|---|
| `@page` struk | `size: 80mm auto; margin: 0` | `@page { size: ${width}mm auto; margin: 0 }` (`print/page.tsx:36`) | ✓ |
| Lebar 58/80 mm | dua pilihan | dua tautan `?w=58|80` | ✓ |
| Penyimpanan pilihan | localStorage per perangkat | **query string**, kembali ke 58 mm setiap buka | ✗ |
| Font struk | 11–12 px monospace | **10 px** (58 mm), 11 px (80 mm) | ✗ |
| Area cetak 58 mm | ±48 mm | `width: 58mm; padding: 4mm 3mm` → konten 52 mm | △ berisiko terpotong |
| Sembunyikan non-struk | `@media print` | `print:hidden` pada header auth, toolbar, dan `print:p-0` pada `<main>` | ✓ |
| Item + catatan `>>` | ada | struk hanya mencetak `qty × nama`; **catatan item tidak dicetak** | ✗ |
| Lembar QR A4 2×3 | wajib | **tidak ada**; hanya unduh PNG/SVG per meja (`tables-manager.tsx:149-158`) | ✗ |
| Ruang potong 10 mm | ada | padding bawah 4 mm | ✗ |

Fakta tambahan: tombol "Nonaktifkan meja" di kartu QR (`tables-manager.tsx:136-140`) berisi komentar `// Toggle status meja` tanpa implementasi — UI menawarkan aksi yang tidak pernah terjadi.

---

## 11. Alur Customer End-to-End (ponsel)

| Langkah | Hasil | Bukti |
|---|---|---|
| Scan QR → `/m/[token]` | ✓ | Token meja valid; menu server-rendered, tanpa waterfall |
| Cari/filter menu | ✓ | Debounce tidak ada (audit performa), tetapi state loading/empty/error benar |
| Tambah item | ✓ | Tombol 44×44, `aria-label` per produk, stepper angka |
| Buka keranjang | △ | **Kedip "Keranjang Kosong"** sebelum item muncul; tidak ada skeleton |
| Isi nama/catatan | ✓ | `<label htmlFor>` benar |
| "Pesan & Bayar" | ✓ | Idempotency-Key, tombol nonaktif saat menyimpan, error via toast |
| Halaman pembayaran | ✓ (kode) | Total besar, QRIS/rekening, tombol salin 44 px, countdown |
| Countdown | △ | Merah hanya < **60 detik** (spec < 3 menit); tidak ada peringatan saat 3 menit |
| Unggah bukti gagal | ✓ | File tetap tersimpan, toast error, bisa ulang tanpa memilih ulang |
| Bukti terkirim | ✓ | Toast sukses + status berubah jadi "Menunggu Verifikasi" |
| Ditolak kasir | ✓ | Alasan ditampilkan + sisa kesempatan + tombol unggah ulang |
| Kedaluwarsa | **✗ jalan buntu** | Kartu "Pesanan dibatalkan" tanpa tombol "Pesan lagi" / "Kembali ke menu" (`order-tracking.tsx:382-394`) |
| Cookie hilang / ganti perangkat | **✗ jalan buntu permanen** | Halaman `/order/[code]` meminta "kode akses", yaitu `accessToken` 32 hex yang **tidak pernah ditampilkan ke customer** dan hanya disimpan sebagai cookie httpOnly (`api/public/orders/route.ts:74,191`) |
| Bukti gagal dimuat (R2 mati) | **✗ tanpa pemulihan** | Viewer menampilkan area hitam; tidak ada pesan "gagal memuat, coba lagi" |

Dua jalan buntu terakhir adalah yang paling mahal: customer yang membersihkan cookie atau membuka tautan dari perangkat lain **tidak akan pernah bisa membuka pesanannya lagi**, dan tidak ada jalur bantuan di layar gerbang.

---

## 12. Yang Sudah Benar (diverifikasi)

1. **Token benar-benar dipakai** — `@theme inline` memetakan primary/aksen/netral/radius/shadow ke utility Tailwind; bukan sekadar dokumentasi.
2. **`prefers-reduced-motion`** dihormati secara global (`globals.css:184`).
3. **`<html lang="id">`** di semua halaman; tidak ada `lang` yang salah.
4. **Format Rupiah & WIB** konsisten lewat satu util (`lib/utils.ts`), termasuk `Asia/Jakarta` dan `id-ID`.
5. **Badge stok** memakai teks + warna dari satu fungsi; tidak mengandalkan warna saja.
6. **Empty state deskriptif** di 8 halaman admin (judul + deskripsi + ikon), bukan sekadar "No data".
7. **Skeleton menyerupai konten** di dashboard (4 kartu 104 px), tabel (baris 12 px), dan daftar kartu kasir.
8. **Recharts & ProofViewer** sudah `dynamic()` — tidak memblokir first paint.
9. **Menu publik** memakai `next/image` dengan `sizes` dan `priority` untuk 2 item pertama.
10. **Dialog konfirmasi destruktif** ada di alur admin (menyebut nama objek), meski 7 tempat lain masih memakai `window.confirm`.
11. **Fokus keyboard** pada komponen shadcn (button/input/select/switch) memakai ring 3 px yang terlihat.
12. **Label form** di login, keranjang, keuangan, dan pengaturan sudah memakai `<label htmlFor>`.

---

## 13. Prioritas Perbaikan

### P0 — sebelum rilis (Tinggi)

1. **Ganti teks kartu statistik menjadi gelap** (`#1B1B2B`) untuk lime/biru/hijau, atau turunkan kecerahan latar hingga putih mencapai 4,5:1. Perbaiki juga badge semantik di `pill-badge.tsx` ke `#0A6E4F/#14639F/#8A5A08`. Target: axe `color-contrast` = 0 di 12 halaman.
2. **Satu komponen `OrderStatusBadge`** dari peta tunggal (label + varian) dan hapus 3 map lokal. `AWAITING_VERIFICATION` = info/biru + titik berdenyut.
3. **Lengkapi nama aksesibel**: `<label>` untuk 12 input stok, `aria-label` untuk select periode & 2 trigger filter menu, label untuk input kode akses. Tambah `role="alert"` pada error login/akses dan `aria-live="polite"` pada hitungan antrean kasir.
4. **Naikkan target sentuh**: tombol admin minimal `h-11` (44), ikon meja `size-11`, header kasir `h-13` (52). Hitung ulang: target < 44 px harus 0 di `/admin/*`.

### P1 — sprint berikutnya (Sedang)

5. **State error antrean kasir** (`isError` → kartu "Gagal memuat antrean" + "Coba lagi"), dan **gate `cartReady`** sebelum merender state kosong keranjang.
6. **Tabel → kartu** di `< md` untuk menu/stok/keuangan/kasir/audit; perbaiki `flex-wrap` header kasir agar 360 px tidak meluber 15 px.
7. **Pulihkan akses pesanan**: tampilkan kode akses di halaman sukses checkout/struk, atau izinkan buka berdasarkan `code` + nomor meja. Tambah CTA "Pesan lagi" pada kartu kedaluwarsa.
8. **Cetak**: font struk 11–12 px, padding 3 mm, simpan lebar di localStorage, cetak catatan item, buat `QrSheet` A4 2×3 dengan `@page { size: A4; margin: 8mm }`.
9. **Hidupkan atau hapus kontrol mati**: search topbar, "Nonaktifkan meja"; ganti `window.confirm` dengan `AlertDialog`.

### P2 — backlog (Rendah)

10. **Satukan token**: `accent-blue`, `--primary`, `--radius`; pindahkan 67 hex ke token; ganti 135 px arbitrer dengan skala; naikkan 9–10 px ke minimum 11 px.
11. **Landmark & heading**: `h1` di menu customer, `h2` sebelum `h3` dashboard, `aria-current` di sidebar, skip link, `<title>` per halaman admin.

**Target terukur setelah perbaikan:** axe WCAG A/AA = 0 violation di 18 halaman; 0 target < 44 px di admin; `scrollWidth == innerWidth` di 360/768/1280; 0 overflow horizontal pada tabel (karena sudah berupa kartu).

---

## 14. Lampiran

### 14.1 Tangkapan layar

54 berkas di `UI-AUDIT-SCREENSHOTS/`, nama `<halaman>-<lebar>.png`, plus `report.json` berisi metrik mentah (overflow, target sentuh, nama aksesibel, font < 11 px, hasil axe per halaman).

Contoh yang dirujuk di laporan:

| Berkas | Menunjukkan |
|---|---|
| `admin-dashboard-1280.png` | Nilai `Rp` pecah 2 baris, kartu lime kontras 2,04:1, donut tidak sesuai token |
| `cashier-queue-1280.png` | 51 node kontras; badge "Menunggu verifikasi" oranye |
| `cashier-detail-360.png` | Overflow 375 px, judul terpotong, bukti bayar hitam |
| `admin-menu-360.png` | Tabel 6 kolom dipotong; dropdown `all`/`newest` |
| `admin-stock-360.png` | Tabel stok dipotong; input ambang tanpa label |
| `customer-menu-360.png` | Cart bar tampil saat keranjang kosong; chip kategori terpotong |
| `login-360.png` | Badge menimpa deskripsi |

![Antrean kasir 1280px](./UI-AUDIT-SCREENSHOTS/cashier-queue-1280.png)

### 14.2 Perintah reproduksi

```bash
# 1. Siapkan DB uji (jangan pakai DB remote)
createdb coffeeshop_ui_audit
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/coffeeshop_ui_audit \
  npx prisma migrate deploy
DATABASE_URL=... npx tsx --import dotenv/config prisma/seed.ts
DATABASE_URL=... npx tsx --import dotenv/config prisma/seed-demo.ts

# 2. Jalankan build produksi
npm run build
DATABASE_URL=... APP_BASE_URL=http://localhost:3011 npx next start -p 3011

# 3. Audit (Playwright + axe-core yang sudah terpasang)
node scripts/.tmp-ui-audit.mjs   # skrip sementara, dihapus setelah audit

# 4. Periksa kontras manual
node -e "…rasio kontras…"        # rumus WCAG 2.x, lihat §8.1
```

### 14.3 Catatan kebersihan

- Tidak ada berkas `src/**`, `prisma/**`, atau konfigurasi yang diubah.
- Database uji `coffeeshop_ui_audit` sudah di-drop; database remote `db.prisma.io` tidak disentuh.
- Skrip sementara `scripts/.tmp-ui-*.{ts,mjs}` dihapus setelah audit; yang tersisa hanya laporan ini dan folder `UI-AUDIT-SCREENSHOTS/`.
