# AI-AGENT.md — Aturan Kerja untuk Agen AI Coding

Dokumen ini dibaca **pertama kali** oleh setiap agen AI (Claude Code, Cursor, Copilot, dll) yang bekerja pada repositori ini. Isinya adalah aturan wajib. Bila terjadi konflik, urutan prioritas: **instruksi eksplisit pengguna → AI-AGENT.md → PRD.md → ARCHITECTURE.md → DESIGN-SYSTEM.md**.

> Salin juga ke `AGENTS.md` / `CLAUDE.md` di root repositori agar otomatis terbaca oleh tool.

---

## 1. Konteks Proyek (Ringkas)

Aplikasi web pemesanan makanan & minuman. Customer memindai QR di meja, memesan, membayar, dan mengunggah bukti. Kasir memverifikasi (setuju/tolak) lalu mencetak pesanan. Super Admin mengelola menu, kasir, stok, keuangan, dan QR meja. Semua pembaruan **realtime** tanpa refresh.

**Stack:** Next.js App Router (TypeScript strict) · Prisma + PostgreSQL · Cloudflare R2 · Pusher Channels · sharp (AVIF) · Tailwind + shadcn/ui · TanStack Query · Zustand · Zod · Recharts.

**Dokumen acuan:** `PRD.md` (apa), `ARCHITECTURE.md` (bagaimana), `DESIGN-SYSTEM.md` (tampilan), `PROMPTS.md` (urutan pengerjaan).

---

## 2. Perintah Standar

```bash
npm run dev            # server pengembangan
npm run typecheck      # tsc --noEmit
npm run lint           # eslint
npm run test           # node:test (integrasi & regresi di tests/)
npm run test:unit      # Vitest (kualitas/konkurensi di quality/)
npm run test:e2e       # playwright
npm run db:migrate     # prisma migrate dev
npm run db:seed        # seed idempoten
npm run db:studio      # prisma studio
npm run build          # build produksi
```

Sebelum menyatakan pekerjaan selesai, **wajib** lulus: `typecheck`, `lint`, `test`, `test:unit`. Untuk perubahan alur utama juga `test:e2e`.

---

## 3. Aturan Emas (Tidak Boleh Dilanggar)

1. **Server adalah sumber kebenaran.** Harga, total, stok, dan status dihitung/divalidasi di server. Jangan percaya data dari klien.
2. **Arsitektur berlapis:** `route handler / server action` → `server/services` → `Prisma`. UI tidak memanggil Prisma. Logika bisnis tidak boleh ada di handler atau komponen.
3. **Setiap endpoint** wajib: (a) `requireRole`/pemeriksaan token, (b) validasi Zod, (c) error terstandar `AppError`.
4. **Event Pusher hanya dikirim setelah transaksi DB commit** (gunakan `afterCommit`). Payload kecil (id + ringkasan). Klien menanggapi dengan `invalidateQueries`.
5. **Transisi status pesanan** hanya lewat `server/domain/order-state.ts`. Dilarang meng-update `status` langsung dengan `prisma.order.update` di tempat lain.
6. **Stok** hanya berubah lewat `stock.service` memakai update atomik `WHERE stock >= qty`. Setiap perubahan menulis `StockMovement`. Stok tidak boleh negatif.
7. **Approve/reject** wajib optimistic locking (`version` + `status` di klausa WHERE) dan idempoten.
8. **Pemasukan penjualan** dibuat dalam transaksi yang sama dengan approve, unik per `orderId`.
9. **Semua gambar** (menu, bukti bayar, QRIS, lampiran) melewati `upload.service` → validasi magic bytes → AVIF → R2. Dilarang menyimpan file asli atau menerima tipe lain.
10. **Bukti bayar selalu di bucket privat**; akses hanya presigned URL singkat dari endpoint kasir/admin.
11. **Tidak ada rahasia di klien.** Hanya `NEXT_PUBLIC_*` yang boleh terbuka. Jangan commit `.env`.
12. **Jangan menambah dependensi** tanpa alasan tertulis; periksa dulu apakah sudah ada solusi di stack.

---

## 4. Konvensi Kode

### 4.1 Umum

- TypeScript `strict`; **dilarang `any`** dan `@ts-ignore` (gunakan `unknown` + penyempitan, atau `@ts-expect-error` dengan alasan).
- Nama berkas `kebab-case`, komponen React `PascalCase`, fungsi/variabel `camelCase`, konstanta `UPPER_SNAKE_CASE`, enum Prisma sesuai schema.
- Fungsi kecil, satu tanggung jawab; hindari berkas > 300 baris.
- Komentar menjelaskan *mengapa*, bukan *apa*. Bahasa komentar & pesan UI: **Indonesia**; identifier kode: **Inggris**.
- Impor absolut memakai alias `@/`.

### 4.2 Next.js

- Default **Server Component**; tambahkan `"use client"` hanya bila perlu state/efek/event.
- Data awal diambil di server component; interaksi & realtime di client component dengan TanStack Query.
- Mutasi: Server Action atau Route Handler (konsisten per modul; publik & webhook/cron memakai Route Handler).
- Gunakan `loading.tsx`, `error.tsx`, `not-found.tsx` di tiap segmen utama.

### 4.3 Prisma

- Selalu pilih kolom yang dibutuhkan (`select`) pada daftar besar; hindari N+1 (gunakan `include` terarah atau query agregat).
- Operasi multi-tabel **wajib** `prisma.$transaction`.
- Migrasi kecil, bernama jelas; jangan mengedit migrasi yang sudah di-merge.
- Rupiah = `Int`. Waktu = UTC.

### 4.4 Zod & Error

- Skema di `lib/validators/*`, dipakai ulang oleh form (react-hook-form) dan API.
- Lempar `AppError(code, status, message)`; kode stabil sesuai ARCHITECTURE bagian 9. Jangan membocorkan pesan internal ke klien.

### 4.5 Realtime

- Nama channel/event hanya dari `lib/realtime-events.ts` (tipe ketat). Dilarang menulis string literal channel/event di tempat lain.
- Setiap `useRealtimeEvent` harus melakukan cleanup (unbind) dan menangani reconnect.

### 4.6 UI

- Ikuti `DESIGN-SYSTEM.md`: token warna/spasi/radius, komponen bersama, status & copy standar.
- Wajib ada state: loading (skeleton), kosong, error, sukses (toast).
- Mobile-first untuk customer; tablet landscape untuk kasir; desktop untuk admin.
- Aksesibilitas: label form, fokus terlihat, `aria-live` untuk perubahan status, target sentuh ≥ 44 px.

---

## 5. Alur Kerja Agen per Tugas

1. **Pahami.** Baca bagian PRD/ARCHITECTURE yang relevan. Tulis ringkasan 3–5 baris tentang apa yang akan diubah. Bila kebutuhan ambigu dan keputusan sulit dibatalkan → **tanya dulu**; bila bisa dipulihkan → pilih opsi paling masuk akal, catat asumsi.
2. **Rencanakan.** Daftar berkas yang akan dibuat/diubah dan urutan kerjanya. Untuk tugas > 5 berkas, tampilkan rencana sebelum menulis kode.
3. **Kerjakan kecil dan bertahap.** Satu fitur/lapisan per iterasi: schema → service (+tes) → API → UI → realtime.
4. **Tes.** Tulis/ubah tes bersama kodenya (lihat bagian 7). Jalankan perintah standar.
5. **Tinjau diri sendiri.** Periksa daftar *Definition of Done* (bagian 8).
6. **Laporkan.** Ringkasan singkat: apa yang berubah, cara menguji, asumsi, dan hal yang belum selesai.

---

## 6. Peta "Di Mana Saya Taruh Ini?"

| Kebutuhan | Lokasi |
| --- | --- |
| Aturan transisi status, hitung total, kebijakan stok | `src/server/domain/` |
| Logika use-case & transaksi | `src/server/services/` |
| Query agregat dashboard | `src/server/queries/` |
| Handler HTTP | `src/app/api/**/route.ts` |
| Skema validasi | `src/lib/validators/` |
| Adaptor R2 / Pusher / sharp / QR | `src/lib/*` |
| Definisi channel & event | `src/lib/realtime-events.ts` |
| Komponen UI umum | `src/components/ui`, `components/shared` |
| Komponen per peran | `components/{admin,cashier,customer}` |
| Tes | `tests/{unit,integration,e2e}` |

---

## 7. Standar Pengujian

| Jenis | Wajib untuk |
| --- | --- |
| Integrasi (node:test + DB uji, `tests/**`) | Service: checkout & reservasi, approve/reject, cron kedaluwarsa, stok, keuangan, auth, kontrak API |
| Kualitas/konkurensi (Vitest + DB uji, `quality/**`) | Uji beban/konkurensi dan regresi lintas modul |
| Unit murni (Vitest) | `domain/*` (state machine, pricing), util, validator, `image.ts` |
| E2E (Playwright, 2 browser context) | Scan → pesan → upload → kasir melihat realtime → setuju → cetak; alur tolak → upload ulang; kedaluwarsa |

Dua runner memang dipisah berdasarkan direktori: `npm test` (node:test) untuk integrasi/regresi,
`npm run test:unit` (Vitest) untuk kualitas/konkurensi. Keduanya wajib hijau sebelum menandai selesai.

Tes konkurensi yang **harus ada:** (1) 20 checkout paralel untuk stok 5 → maksimal 5 sukses, stok ≥ 0; (2) dua approve bersamaan → satu sukses; (3) cron dijalankan dua kali → stok dikembalikan sekali.

Gunakan database terpisah untuk tes; reset antar suite. Jangan memakai data/produk sungguhan.

---

## 8. Definition of Done

- [ ] Memenuhi kriteria di PRD/PROMPTS untuk fitur terkait.
- [ ] `typecheck`, `lint`, `test` hijau (dan `test:e2e` untuk alur utama).
- [ ] Tidak ada `any`, `console.log` sisa, atau kode mati.
- [ ] Input divalidasi Zod; role dicek di server; tidak ada data sensitif di respons/log.
- [ ] Transaksi, locking, dan event realtime sesuai aturan emas.
- [ ] UI: loading/kosong/error/sukses, responsif, sesuai design system, aksesibel.
- [ ] Aksi penting tercatat di `AuditLog`.
- [ ] Migrasi & seed berjalan dari database kosong.
- [ ] Dokumentasi diperbarui (README / dokumen terkait) bila perilaku berubah.

---

## 9. Larangan Keras

- Menghapus/menimpa data produksi, menjalankan `prisma migrate reset` atau `db push --force-reset` di luar lokal/uji.
- Menonaktifkan pemeriksaan keamanan, validasi, atau tes agar "lulus".
- Mengirim event Pusher sebelum commit, atau mengandalkan payload event sebagai sumber data.
- Menyimpan password/token/URL presigned dalam log, respons, atau repo.
- Membuat bucket bukti bayar publik atau menyimpan bukti bayar di bucket publik.
- Mengubah `status` pesanan, `stock`, atau membuat `Transaction` penjualan di luar service yang ditentukan.
- Menambah fitur di luar lingkup PRD tanpa persetujuan (catat sebagai saran).
- Mengarang fakta/API pustaka: bila ragu, baca dokumentasi resmi atau kode pustaka yang terpasang.

---

## 10. Menangani Ketidakpastian

| Situasi | Tindakan |
| --- | --- |
| Persyaratan bertentangan antar dokumen | Ikuti prioritas di bagian atas; laporkan konflik |
| Keputusan sulit dibatalkan (skema DB, format data, kontrak API) | Berhenti dan tanya |
| Keputusan mudah dibatalkan (nama variabel, tata letak kecil) | Putuskan sendiri, catat asumsi |
| Tes gagal bukan karena perubahan Anda | Laporkan, jangan menyembunyikan atau mematikan tes |
| Batasan platform (mis. batas body Vercel, sharp) | Jelaskan batasan + opsi solusi, jangan diam-diam mengubah spesifikasi |

---

## 11. Pembagian Peran Agen (bila memakai multi-agen)

| Peran | Tugas | Keluaran |
| --- | --- | --- |
| **Planner** | Memecah tugas dari PROMPTS.md, menentukan berkas & urutan | Rencana + daftar risiko |
| **Builder** | Menulis kode sesuai rencana, satu lapisan per iterasi | Perubahan kode + tes |
| **Reviewer** | Memeriksa terhadap Aturan Emas, keamanan, konkurensi, a11y | Daftar temuan berprioritas |
| **Tester** | Menulis & menjalankan tes konkurensi/E2E, melaporkan hasil | Laporan tes |

Aturan serah-terima: Builder tidak me-review dirinya sendiri untuk perubahan keamanan/keuangan/stok; Reviewer tidak mengubah kode kecuali diminta; setiap serah-terima menyertakan templat di bawah.

### Templat Serah-Terima

```text
Tugas      : [ID/Step PROMPTS.md]
Perubahan  : [berkas utama + ringkasan]
Cara uji   : [perintah / langkah manual]
Asumsi     : [daftar]
Risiko     : [konkurensi, keamanan, migrasi]
Belum      : [yang belum dikerjakan]
```

---

## 12. Templat Prompt Siap Pakai untuk Agen

**Mengerjakan sebuah step**

```text
Kerjakan STEP [N] dari PROMPTS.md. Baca AI-AGENT.md, bagian PRD/ARCHITECTURE yang relevan, lalu tampilkan rencana berkas yang akan diubah. Setelah saya setuju (atau jika tugas kecil, langsung), implementasikan bertahap: schema → service+tes → API → UI → realtime. Akhiri dengan ringkasan, cara uji, dan hasil typecheck/lint/test.
```

**Review**

```text
Review perubahan terbaru terhadap Aturan Emas di AI-AGENT.md. Fokus: (1) validasi & otorisasi, (2) transaksi/locking/idempotensi, (3) event Pusher setelah commit, (4) kebocoran data sensitif, (5) state UI & aksesibilitas. Keluarkan temuan berprioritas (Kritis/Tinggi/Sedang/Rendah) dengan lokasi berkas dan saran perbaikan, lalu perbaiki yang Kritis.
```

**Debug**

```text
Bug: [deskripsi, langkah reproduksi, error/screenshot]. Temukan akar masalah (bukan hanya gejala), tulis tes yang gagal terlebih dahulu, perbaiki, pastikan tes lulus, dan jelaskan penyebabnya dalam 3 kalimat.
```

**Refactor aman**

```text
Refactor [bagian] tanpa mengubah perilaku. Pastikan tes yang ada hijau sebelum dan sesudah; tambahkan tes bila cakupan kurang. Jangan melanggar batas layer. Laporkan perubahan struktur.
```

---

## 13. Konvensi Git

- Cabang: `feat/<modul>-<ringkas>`, `fix/<ringkas>`, `chore/<ringkas>`.
- Commit (Conventional Commits, Inggris/Indonesia konsisten): `feat(order): reserve stock at checkout`, `fix(payment): guard double approve`.
- Satu PR = satu tujuan; sertakan templat serah-terima di deskripsi PR; PR kecil (< ±500 baris bersih) bila memungkinkan.
- Jangan commit: `.env*`, berkas besar/biner uji, kredensial, dump data pelanggan.

---

## 14. Daftar Kode Error Standar

`VALIDATION_ERROR` · `UNAUTHENTICATED` · `FORBIDDEN` · `NOT_FOUND` · `CONFLICT` · `ALREADY_PROCESSED` · `STOCK_INSUFFICIENT` · `ORDER_EXPIRED` · `INVALID_TRANSITION` · `RATE_LIMITED` · `UPLOAD_INVALID` · `INTERNAL`

Gunakan kode yang ada; tambah kode baru hanya bila benar-benar perlu dan perbarui ARCHITECTURE.md serta peta pesan di DESIGN-SYSTEM.md.
