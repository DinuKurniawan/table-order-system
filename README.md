# Pemesanan F&B via QR Meja

Aplikasi pemesanan makanan & minuman via QR meja dengan verifikasi pembayaran oleh kasir dan update realtime.

![Next.js](https://img.shields.io/badge/Next.js-16.4.6-black?style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square)
![Prisma](https://img.shields.io/badge/Prisma-6.19.3-2D3748?style=flat-square)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square)
![Cloudflare R2](https://img.shields.io/badge/Cloudflare%20R2-F38020?style=flat-square)
![Pusher](https://img.shields.io/badge/Pusher%20Channels-300D4F?style=flat-square)
![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-4.3.3-06B6D4?style=flat-square)
![Status](https://img.shields.io/badge/status-In%20Development-F59A2B?style=flat-square)

---

## Tentang Proyek

Pemesanan manual di kasir kafe menimbulkan antrean, salah catat pesanan, dan rekap pembayaran yang tersebar. Aplikasi ini memindahkan proses pemesanan ke meja: customer memindai QR, memilih menu, membayar transfer/QRIS, lalu mengunggah bukti bayar. Kasir memverifikasi bukti tersebut sebelum pesanan diproses.

Sistem berjalan sebagai satu aplikasi Next.js (modular monolith). Route Handler menerima permintaan, memvalidasi input dengan Zod, lalu memanggil service layer yang memegang aturan bisnis dan transaksi Prisma. Database PostgreSQL adalah sumber kebenaran; Pusher hanya mengirim sinyal perubahan agar klien mengambil ulang data terbaru.

Tiga peran yang dilayani:

- **Super Admin** — mengelola menu, kategori, kasir, stok, keuangan, meja/QR, dan pengaturan.
- **Kasir** — memverifikasi bukti pembayaran, memproses status pesanan, dan mencetak pesanan.
- **Customer** — tanpa login; identitasnya adalah token meja pada QR dan kode pesanan.

---

## Alur Pemesanan

Alur target sesuai `PRD.md`. Status implementasi tiap tahap ada di bagian [Fitur](#fitur).

```mermaid
flowchart TD
  A["Customer memindai QR di meja"] --> B["Buka halaman menu /m/{token}"]
  B --> C["Pilih menu dan isi keranjang"]
  C --> D["Checkout: pesanan dibuat (AWAITING_PAYMENT)"]
  D --> E["Upload bukti pembayaran"]
  E --> F["Status AWAITING_VERIFICATION"]
  F --> G{"Kasir verifikasi bukti"}
  G -- "Setuju" --> H["ACCEPTED"]
  H --> I["PREPARING"]
  I --> J["READY"]
  J --> K["COMPLETED"]
  K --> L["Kasir mencetak pesanan"]
  G -- "Tolak + alasan" --> M["PAYMENT_REJECTED"]
  M --> N{"Masih ada sisa waktu / kuota upload?"}
  N -- "Ya" --> E
  N -- "Tidak" --> O["CANCELLED, stok dikembalikan"]
```

---

## Fitur

Status diambil dari kode yang ada di repositori per Step 22.

### Super Admin

| Fitur | Status |
| --- | --- |
| Login username/password, sesi cookie httpOnly (JWT) | Selesai |
| Proteksi rute `/admin/*` + pemeriksaan role di server | Selesai |
| Shell dashboard (sidebar, topbar, responsif, drawer mobile) | Selesai |
| CRUD kategori (aturan DRINK wajib subtype, FOOD tanpa subtype) | Selesai |
| CRUD produk: harga, gambar AVIF, stok awal, toggle aktif, soft/hard delete | Selesai |
| Tabel menu: pencarian, filter status, sort, paginasi server-side | Selesai |
| Upload gambar ke R2 + konversi AVIF + thumbnail | Selesai |
| Pencatatan AuditLog untuk aksi kategori, produk, akun kasir, stok, keuangan, dan pesanan | Selesai |
| Halaman audit log: filter pengguna/aksi/tanggal + paginasi | Selesai |
| Manajemen kasir: tambah, ubah nama, toggle status, reset password, soft/hard delete | Selesai |
| Kartu statistik dashboard dari data nyata | Selesai |
| Dashboard analitik realtime: KPI, grafik 3 seri, komposisi kategori, menu terlaris, aktivitas | Selesai |
| Manajemen stok & riwayat pergerakan | Selesai |
| Laporan keuangan: ringkasan, grafik arus kas, jurnal manual, refund, ekspor CSV | Selesai |
| Manajemen meja & QR code | Selesai |
| Halaman pengaturan kafe | Selesai |
| Infrastruktur realtime: Pusher server/client, auth endpoint, events constants, afterCommit helper | Selesai |
| Cron kedaluwarsa pesanan (`/api/cron/expire-orders`, tiap menit) | Selesai |
| Hardening: rate limit terdistribusi, CSP/CSRF, security headers, bukti bayar privat | Selesai |

### Kasir

| Fitur | Status |
| --- | --- |
| Login dan layout panel kasir terproteksi | Selesai |
| Antrean pesanan realtime (tab verifikasi/diproses/siap/riwayat, badge & suara) | Selesai |
| Verifikasi bukti bayar (setuju/tolak + alasan, optimistic locking) | Selesai |
| Cetak struk thermal 58/80 mm (cetak ulang, printedAt & printCount) | Selesai |

### Customer

| Fitur | Status |
| --- | --- |
| Halaman menu via QR meja | Selesai |
| Keranjang & checkout | Selesai |
| Upload bukti pembayaran | Selesai |
| Unggah ulang bukti setelah ditolak & pembatalan pesanan | Selesai |
| Pelacakan status pesanan realtime | Selesai |
| Halaman meja mobile-first (320-430px) | Selesai |

---

## Tech Stack

| Lapisan | Teknologi | Kegunaan |
| --- | --- | --- |
| Framework | Next.js 16 (App Router) + React 19 | Server Component, Route Handler, rendering |
| Bahasa | TypeScript 5 (strict) | Tipe statis di seluruh kode |
| Database | PostgreSQL | Penyimpanan data transaksional |
| ORM | Prisma 6.19.3 | Skema, migrasi, query bertipe |
| Validasi | Zod 4 | Validasi input API & form |
| Autentikasi | `jose` (JWT), `argon2` | Sesi cookie httpOnly, hash password |
| Storage | Cloudflare R2 (`@aws-sdk/client-s3`) | Penyimpanan gambar publik & privat |
| Konversi gambar | `sharp` | Resize dan konversi ke AVIF |
| Realtime | Pusher Channels (`pusher`, `pusher-js`) | Sinyal perubahan data ke klien (signal-only; klien invalidate cache TanStack Query lalu ambil data terbaru) |
| State & data client | TanStack Query, localStorage | Cache server state, state keranjang |
| After-transaction hook | `afterCommit` | Emit event setelah `$transaction` Prisma commit sukses |
| Form | React Hook Form + `@hookform/resolvers` | Form produk & validasi klien |
| UI | Tailwind CSS 4, shadcn/ui (Base UI), lucide-react | Komponen dan styling |
| Grafik | Recharts | Grafik dashboard & keuangan (dimuat dinamis) |
| QR | `qrcode` | Pembuatan QR meja |
| Notifikasi | Sonner | Toast |
| Pengujian unit & integrasi | `tsx` + `node:test`, Vitest | Aturan bisnis, stok, pembayaran, keuangan, gambar, auth |
| Pengujian E2E | Playwright | Alur customer → kasir dengan dua browser context + realtime |
| Performa | Lighthouse (mobile) | Audit `/m/[token]`: LCP, aksesibilitas, best practices |

---

## Prasyarat

- **Node.js 20 atau lebih baru.** Repositori memakai `@types/node` v20 dan tidak memiliki `engines` di `package.json` maupun berkas `.nvmrc`.
- **PostgreSQL** yang dapat diakses (lokal, Neon, Supabase, atau Prisma Postgres).
- **Akun Cloudflare R2** dengan dua bucket: satu publik (gambar produk) dan satu privat (bukti bayar).
- **Akun Pusher Channels** beserta `app_id`, `key`, `secret`, dan cluster.
- **Google Chrome** untuk `npm run test:e2e` dan `npm run lighthouse:menu` di lingkungan lokal.

---

## Memulai

```bash
# 1. Clone repositori
git clone <url-repositori> coffeeshop
cd coffeeshop

# 2. Pasang dependensi
npm install

# 3. Salin berkas environment
cp .env.example .env

# 4. Isi variabel di .env (lihat tabel Variabel Lingkungan)

# 5. Jalankan migrasi database (sekaligus generate Prisma Client)
npm run db:migrate

# 6. Isi data awal
npm run db:seed

# 7. Jalankan server pengembangan
npm run dev
```

Buka `http://localhost:3000`. Halaman login ada di `http://localhost:3000/login`.

Catatan:

- `npm run test` dan `npm run test:unit` memuat `.env` melalui `dotenv`, jadi berkas `.env` harus sudah terisi.
- `npm run test:e2e` memakai Chrome terpasang, database yang sudah dimigrasi + di-seed, dan server di `http://localhost:3000` (Playwright menjalankan `npm run dev`, atau `npm run start` saat `CI=true`).
- Variabel lingkungan divalidasi Zod di `src/lib/env.ts`; aplikasi gagal start bila variabel wajib kosong.

---

## Variabel Lingkungan

Contoh nilai di bawah adalah nilai palsu. Jangan menyimpan kredensial asli di repositori.

| Nama | Wajib | Deskripsi | Contoh |
| --- | --- | --- | --- |
| `DATABASE_URL` | Wajib | Connection string PostgreSQL untuk aplikasi | `postgresql://user:password@localhost:5432/coffeeshop?schema=public` |
| `DIRECT_URL` | Wajib untuk Prisma CLI | Connection string langsung (tanpa pooler) untuk migrasi | `postgresql://user:password@localhost:5432/coffeeshop?schema=public` |
| `APP_BASE_URL` | Opsional (default `http://localhost:3000`) | Base URL aplikasi untuk tautan QR | `http://localhost:3000` |
| `SESSION_SECRET` | Wajib | Kunci penandatangan JWT, minimal 32 karakter | `contoh-secret-acak-minimal-32-karakter` |
| `CRON_SECRET` | Wajib | Rahasia untuk endpoint terjadwal, minimal 8 karakter | `contoh-cron-secret-123` |
| `R2_ACCOUNT_ID` | Wajib | Account ID R2, boleh ID saja atau URL endpoint penuh | `https://abcd1234.r2.cloudflarestorage.com` |
| `R2_ACCESS_KEY_ID` | Wajib | Access key R2 | `contoh-access-key` |
| `R2_SECRET_ACCESS_KEY` | Wajib | Secret key R2 | `contoh-secret-key` |
| `R2_BUCKET_PUBLIC` | Wajib | Nama bucket publik (gambar produk, QRIS) | `coffeeshop-public` |
| `R2_BUCKET_PRIVATE` | Wajib | Nama bucket privat (bukti bayar) | `coffeeshop-private` |
| `R2_PUBLIC_BASE_URL` | Wajib | Domain publik bucket (R2 public URL / custom domain) | `https://pub-contoh.r2.dev` |
| `PUSHER_APP_ID` | Wajib | App ID Pusher | `1234567` |
| `PUSHER_KEY` | Wajib | Key Pusher (server) | `contoh-pusher-key` |
| `PUSHER_SECRET` | Wajib | Secret Pusher (server) | `contoh-pusher-secret` |
| `PUSHER_CLUSTER` | Wajib | Cluster Pusher | `ap1` |
| `NEXT_PUBLIC_PUSHER_KEY` | Wajib | Key Pusher untuk browser | `contoh-pusher-key` |
| `NEXT_PUBLIC_PUSHER_CLUSTER` | Wajib | Cluster Pusher untuk browser | `ap1` |
| `SEED_ADMIN_USERNAME` | Opsional | Username Super Admin saat seeder dijalankan (default `admin`) | `admin_kafe` |
| `SEED_ADMIN_PASSWORD` | Opsional | Password Super Admin saat seeder dijalankan (default `Admin123456!`) | `kata-sandi-kuat-anda` |
| `R2_FORCE_PATH_STYLE` | Opsional | `true` untuk MinIO/CI yang memakai path-style URL; kosong untuk R2 | `true` |
| `DISABLE_REALTIME` | Opsional | `true` untuk mematikan Pusher (dipakai E2E/CI) | `true` |

Semua variabel di atas tercantum di `.env.example`. `SEED_ADMIN_USERNAME` dan `SEED_ADMIN_PASSWORD` hanya dipakai saat akun Super Admin dibuat pertama kali.

### Cron kedaluwarsa pesanan

`vercel.json` menjadwalkan `GET /api/cron/expire-orders` setiap menit. Vercel Cron mengirim
`Authorization: Bearer <CRON_SECRET>`. Paket Hobby Vercel hanya mendukung cron harian; untuk
interval per menit gunakan paket Pro, atau panggil endpoint yang sama dari penjadwal eksternal
(cron-job.org, GitHub Actions, dsb.) dengan header tersebut.

---

## Akun Awal (seed)

1. Tambahkan ke `.env`:

   ```env
   SEED_ADMIN_USERNAME="admin_kafe"
   SEED_ADMIN_PASSWORD="kata-sandi-kuat-anda"
   ```

2. Jalankan `npm run db:seed`.
3. Login di `/login` dengan kredensial tersebut. Super Admin diarahkan ke `/admin`, kasir ke `/cashier`.

Seeder bersifat idempoten: menjalankannya ulang tidak menggandakan data. Perlu diperhatikan, `prisma/seed.ts` hanya memakai `SEED_ADMIN_PASSWORD` saat akun Super Admin **dibuat pertama kali**; bila akun sudah ada, password lama tidak diubah.

> Ganti kata sandi bawaan seeder sebelum dipakai di lingkungan nyata. Jangan menuliskan kata sandi asli di README atau repositori.

---

## Struktur Proyek

```text
.
├── .github/workflows/ci.yml   # CI: Postgres + MinIO, tes, build, E2E, Lighthouse
├── prisma/
│   ├── schema.prisma          # Model & enum database
│   ├── migrations/            # Migrasi SQL
│   ├── seed.ts                # Data awal (admin, kategori, produk, meja, pengaturan)
│   └── seed-demo.ts           # Data demo 500 pesanan / 90 hari
├── public/                    # Aset statis
├── src/
│   ├── app/
│   │   ├── (auth)/login/      # Halaman login
│   │   ├── admin/             # Dashboard admin: menu, kasir, stok, keuangan, meja, pengaturan, audit
│   │   ├── m/[token]/         # Menu & keranjang customer via QR meja
│   │   ├── order/             # Halaman lacak pesanan customer + upload bukti
│   │   ├── api/
│   │   │   ├── admin/         # CRUD admin, dashboard, keuangan, stok, audit
│   │   │   ├── auth/          # Login & logout
│   │   │   ├── cashier/       # Antrean, verifikasi bayar, bukti, struk
│   │   │   ├── cron/          # Penjadwal kedaluwarsa pesanan
│   │   │   ├── public/        # Menu, pesanan, bukti bayar, akses pesanan
│   │   │   └── upload/        # Upload gambar (AVIF)
│   │   ├── cashier/           # Panel kasir
│   │   ├── layout.tsx         # Root layout + provider
│   │   └── page.tsx           # Landing page
│   ├── components/
│   │   ├── admin/             # AdminShell, StatCard, tabel menu, grafik dinamis
│   │   ├── cashier/           # Dashboard antrean, detail pesanan, viewer bukti dinamis
│   │   ├── ui/                # Komponen shadcn/ui
│   │   ├── image-uploader.tsx # Drag & drop + pratinjau upload
│   │   └── providers.tsx      # QueryClient + Toaster
│   ├── lib/
│   │   ├── auth.ts            # Hash password, autentikasi, requireRole
│   │   ├── session.ts         # JWT sesi di cookie httpOnly
│   │   ├── r2.ts              # Klien S3 untuk Cloudflare R2
│   │   ├── image.ts           # Validasi gambar & konversi AVIF
│   │   ├── rate-limiter.ts    # Rate limit terdistribusi (tabel PostgreSQL)
│   │   ├── validators/        # Skema Zod
│   │   ├── env.ts, db.ts, api.ts, errors.ts, utils.ts
│   │   ├── pusher-server.ts   # Instance Pusher useTLS, helper emitToChannel error best-effort
│   │   ├── pusher-client.ts   # Singleton pusher-js, hook usePusherChannel dan useRealtimeEvent, status koneksi untuk ConnectionIndicator, auto-invalidate QueryClient saat connected
│   │   ├── after-commit.ts    # Helper emit setelah transaction Prisma selesai
│   │   ├── order-access.ts    # Cookie & token akses pesanan customer
│   │   └── realtime-events.ts # Konstanta event dan channel
│   ├── server/services/       # Aturan bisnis & akses Prisma
│   └── middleware.ts          # Route guard /admin dan /cashier
├── tests/                     # Unit & integrasi (node:test)
├── quality/                   # Unit & integrasi (Vitest) + fixture DB
├── e2e/                       # Alur end-to-end (Playwright)
├── scripts/                   # Benchmark dashboard, Lighthouse, init bucket CI
├── .env.example               # Template variabel lingkungan
├── ARCHITECTURE.md            # Arsitektur & alur detail
├── DESIGN-SYSTEM.md           # Token desain & komponen
├── PRD.md                     # Kebutuhan produk
├── AI-AGENT.md                # Aturan kerja agen/kontributor
├── SECURITY-CHECKLIST.md      # Hasil audit keamanan
├── TEST-REPORT.md             # Hasil tes, performa, aksesibilitas
├── playwright.config.ts       # Konfigurasi E2E
├── vitest.config.ts           # Konfigurasi Vitest
└── README.md
```

---

## Arsitektur Singkat

```text
UI (app/, components/)
      │  fetch / form action
      ▼
Route Handler (app/api/**)
      │  requireRole → parse Zod → panggil service → map error
      ▼
Service (server/services/**)
      │  aturan bisnis, transaksi Prisma, AuditLog
      ▼
Prisma → PostgreSQL
      └─ lib/r2.ts → Cloudflare R2
```

- **UI tidak mengakses Prisma langsung.** Semua akses data melewati service.
- **Otorisasi dicek di server** pada setiap endpoint (`requireRole`), bukan hanya di middleware.
- **Realtime memakai prinsip "signal + refetch":** server mengirim event ringkas setelah commit, klien meng-invalidasi cache TanStack Query lalu mengambil data terbaru. Channel private diotorisasi di `/api/pusher/auth` (role staf, cookie pesanan, atau token meja aktif).
- Detail keputusan teknis, aturan impor antar layer, dan diagram sequence ada di [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Perintah Berguna

| Perintah | Kegunaan |
| --- | --- |
| `npm run dev` | Menjalankan server pengembangan |
| `npm run build` | Build produksi |
| `npm run start` | Menjalankan hasil build |
| `npm run lint` | Pemeriksaan ESLint |
| `npm run typecheck` | Pemeriksaan tipe (`tsc --noEmit`) |
| `npm run test` | Menjalankan seluruh tes di `tests/` (node:test) |
| `npm run test:unit` | Menjalankan suite Vitest di `quality/` |
| `npm run test:e2e` | Menjalankan alur Playwright di `e2e/` |
| `npm run db:migrate` | Membuat/menerapkan migrasi Prisma (dev) |
| `npm run db:seed` | Menjalankan seeder |
| `npm run db:seed:demo` | Mengisi data demo 500 pesanan / 90 hari (setelah `db:seed`) |
| `npm run bench:dashboard` | Benchmark agregasi dashboard (butuh data demo) |
| `npm run lighthouse:menu` | Audit Lighthouse mobile `/m/[token]` (server produksi berjalan) |
| `npm run db:studio` | Membuka Prisma Studio |
| `npm run db:generate` | Regenerasi Prisma Client |

---

## Dokumentasi

| Berkas | Isi |
| --- | --- |
| [PRD.md](PRD.md) | Kebutuhan produk, peran, alur, dan daftar fitur |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Layer, modul, alur data, dan keputusan teknis |
| [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) | Token warna, tipografi, radius, dan spesifikasi komponen |
| [AI-AGENT.md](AI-AGENT.md) | Aturan kerja, konvensi kode, dan definition of done |
| [AGENTS.md](AGENTS.md) | Catatan aturan otomatis untuk agen di repositori ini |
| [SECURITY-CHECKLIST.md](SECURITY-CHECKLIST.md) | Hasil audit keamanan dan batasan yang diketahui |
| [TEST-REPORT.md](TEST-REPORT.md) | Hasil tes, Lighthouse, aksesibilitas, dan benchmark dashboard |

> `PROMPTS.md` yang dirujuk pada rencana pengembangan tidak ada di repositori saat README ini ditulis, sehingga nomor step di bawah mengikuti riwayat pengerjaan yang dapat diverifikasi dari kode.

---

## Roadmap

- [x] Step 0 — Perencanaan: PRD, arsitektur, dan sistem desain
- [x] Step 1 — Inisialisasi Next.js, Tailwind, shadcn/ui, validasi env, util format
- [x] Step 2 — Skema Prisma, migrasi awal, dan seeder
- [x] Step 3 — Auth & RBAC: sesi cookie, `requireRole`, rate limit login
- [x] Step 4 — Layout dashboard Super Admin (AdminShell + komponen kartu)
- [x] Step 5 — Upload gambar, konversi AVIF, penyimpanan R2
- [x] Step 6 — Modul menu: kategori, produk, tabel, form, audit log
- [x] Step 7 — Modul kasir: akun, reset password, invalidasi sesi
- [x] Step 8 — *(indikatif)* Infrastruktur realtime (Pusher server/client, auth endpoint, events constants, afterCommit helper)
- [x] Step 9 — *(indikatif)* Sisi customer bagian 1 (mobile-first 320-430px, halaman meja & keranjang type fixes)
- [x] Step 10 — *(indikatif)* Sisi customer bagian 2 (lanjut pengembangan antar tab & diagnose)
- [x] Step 11 - Manajemen meja & QR
- [x] Step 12 - Pengaturan kafe
- [x] Step 13 - Halaman customer (menu & keranjang)
- [x] Step 14 - Checkout & reservasi stok
- [x] Step 15 - Realtime Pusher
- [x] Step 16 - Dashboard analitik: KPI realtime, grafik penjualan, menu terlaris, kasir & meja aktif
- [x] Step 17 - Cron kedaluwarsa pesanan
- [x] Step 18 - Modul kasir realtime, verifikasi pembayaran, dan cetak struk thermal
- [x] Step 19 - Modul stok: penyesuaian atomik, batas minimum, riwayat pergerakan, ekspor CSV
- [x] Step 20 - Modul keuangan: ringkasan, grafik arus kas, jurnal, refund, lampiran privat
- [x] Step 21 - Pengujian end-to-end dan hardening (rate limit terdistribusi, CSP/header, CSRF, audit log, bukti bayar privat) - lihat `SECURITY-CHECKLIST.md`
- [x] Step 22 - Kualitas: Vitest, Playwright E2E, Lighthouse mobile, aksesibilitas, seed demo 500 pesanan - lihat `TEST-REPORT.md`

---

## Screenshot

> **Catatan:** keempat berkas di bawah saat ini berupa **gambar placeholder** (kotak abu-abu berisi label), bukan tangkapan layar asli. Ganti dengan tangkapan layar sungguhan memakai nama berkas yang sama.

![Dashboard Super Admin](docs/screenshots/admin-dashboard.png)
![Katalog Menu](docs/screenshots/admin-menu.png)
![Panel Kasir](docs/screenshots/cashier-queue.png)
![Halaman Customer](docs/screenshots/customer-menu.png)

Halaman `/cashier`, menu customer `/m/[token]`, dan alur pelacakan pesanan sudah diimplementasikan; screenshot asli tinggal diambil dan menggantikan placeholder.

---

## Keamanan

- **Bukti pembayaran disimpan di bucket privat.** URL publik langsung mengembalikan 404; akses hanya lewat presigned URL 60 detik dari endpoint kasir/admin. Rute upload admin hanya menerima preset `product`, `qris`, dan `attachment` ke bucket publik.
- **Validasi di server, bukan hanya di klien.** Setiap endpoint memvalidasi input dengan Zod dan memeriksa role dengan `requireRole`.
- **RBAC berlapis.** Middleware menyaring rute, service memeriksa ulang role; `tokenVersion` di database memungkinkan pencabutan sesi aktif.
- **Rate limit terdistribusi.** Tabel PostgreSQL `RateLimit` dengan upsert atomik: login 5/15 menit per IP + username dan 20/15 menit per IP, checkout 20/menit per IP + 10/menit per meja, serta batas terpisah untuk menu, akses pesanan, bukti bayar, dan upload.
- **CSRF & security headers.** `src/proxy.ts` menolak mutasi lintas situs; `next.config.ts` memasang CSP, HSTS (produksi), `X-Frame-Options`, `Referrer-Policy`, dan `Permissions-Policy`.
- **Audit & error terpusat.** Aksi penting tercatat di `AuditLog` dan dapat difilter di `/admin/settings/audit`; `handleApiError` menyembunyikan detail internal dan logger meredaksi data sensitif.
- **`.env` tidak pernah di-commit.** `.gitignore` mengabaikan `.env*` kecuali `.env.example`. Jangan menaruh rahasia asli di dokumentasi.

Detail temuan, bukti uji, dan batasan ada di [SECURITY-CHECKLIST.md](SECURITY-CHECKLIST.md).

Melaporkan kerentanan: hubungi maintainer repositori secara privat (jangan membuka issue publik yang memuat detail eksploitasi).

---

## Kontribusi & Lisensi

1. Buat branch baru dari `main`.
2. Ikuti konvensi di [AI-AGENT.md](AI-AGENT.md) dan [ARCHITECTURE.md](ARCHITECTURE.md).
3. Jalankan `npm run typecheck`, `npm run lint`, dan `npm run test` sebelum mengirim perubahan.
4. Jelaskan perubahan beserta alasannya pada pull request.

Lisensi: belum ditentukan. Belum ada berkas `LICENSE` di repositori.
