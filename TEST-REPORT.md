# TEST-REPORT — Step 17: Kualitas

Tanggal: 19 November 2026
Lingkungan: Windows, Node 26, Next.js 16.4.6, PostgreSQL (remote), Chrome headless.

## Ringkasan

| Pemeriksaan | Hasil | Target |
| --- | --- | --- |
| Unit/integrasi `node:test` | 61/61 lulus | Lulus |
| Unit/integrasi Vitest | 10/10 lulus (4 berkas) | Lulus |
| E2E Playwright | 3/3 lulus (realtime aktif) | Lulus |
| E2E mode CI (realtime dimatikan) | 3/3 lulus | Lulus |
| Typecheck | Lulus | Lulus |
| Production build | Exit 0 | Lulus |
| Lighthouse mobile `/m/[token]` — Performance | **100** | — |
| Lighthouse mobile — Accessibility | **100** | ≥ 95 |
| Lighthouse mobile — Best Practices | **100** | — |
| LCP mobile (simulasi 4G) | **1.077 ms** | < 2.500 ms |
| CLS / TBT | 0 / 37 ms | — |
| Dashboard 500 pesanan, p95 | 81–299 ms | < 300 ms |

## 1. Unit & Integrasi

### Suite lama (`npm run test`, `node:test`)

61 tes lulus, mencakup auth/RBAC, menu, checkout, stok, pelacakan pesanan, kasir, dashboard, keuangan, pipeline gambar, dan regresi keamanan (`tests/security.test.ts`).

### Suite baru (`npm run test:unit`, Vitest)

| Berkas | Cakupan |
| --- | --- |
| `quality/order-state.test.ts` | Approve bersamaan hanya sukses sekali; reject idempoten + stok tidak dikembalikan ganda; transisi status ilegal ditolak; urutan ACCEPTED → PREPARING → READY → COMPLETED |
| `quality/checkout-concurrency.test.ts` | Dua checkout bersamaan memperebutkan stok 1: tepat satu `201`, satu `409`; stok 0; replay `Idempotency-Key` mengembalikan kode sama tanpa memotong stok lagi |
| `quality/finance.test.ts` | Agregasi income/expense/net/count dan bucket harian pada rentang kustom |
| `quality/image-auth.test.ts` | PNG → AVIF (magic bytes, format HEIF, resize 800 px, ukuran turun); tolak buffer non-gambar; argon2id verify; `authorizeRole` menolak tamu/role salah |

Konfigurasi: `vitest.config.ts` (alias `@`, `.env` via `dotenv/config`, tes dijalankan serial karena memakai satu database).

## 2. E2E Playwright

Berkas: `e2e/order-flow.spec.ts`, konfigurasi `playwright.config.ts` (Chrome, workers 1, trace saat gagal).

1. **Happy path realtime** — customer context memindai `/m/[token]`, menambah menu, checkout, unggah bukti; cashier context login, membuka antrean, menyetujui, dan membuka struk cetak. Halaman customer berubah ke “Pembayaran terverifikasi” tanpa refresh melalui Pusher.
2. **Tolak → unggah ulang → setujui** — kasir menolak dengan preset alasan; customer melihat status ditolak dan sisa kesempatan; bukti baru diunggah; kasir menyetujui.
3. **Kedaluwarsa & pengembalian stok** — pesanan dibuat via UI, `expiresAt` dimundurkan, cron `/api/cron/expire-orders` dipanggil; status menjadi `CANCELLED` dan stok produk kembali dari 49 → 50.

Dua browser context dipakai pada skenario 1 dan 2 untuk membuktikan sinkronisasi realtime. Mode CI menyetel `DISABLE_REALTIME=true`; tes melakukan reload eksplisit sebagai fallback, dan tetap lulus. Mode realtime dengan kredensial Pusher asli juga lulus 3/3.

## 3. Performa

### Halaman menu customer

Optimasi:
- Render katalog awal di server (`src/server/services/menu.ts` + `src/app/m/[token]/page.tsx`), sehingga HTML pertama sudah berisi produk; sebelumnya katalog menunggu fetch client.
- `next/image` dengan `sizes`, gambar pertama `priority`, sisanya lazy.
- Filter kategori/search tetap di API; data awal dipakai sebagai `initialData` TanStack Query (`staleTime` 60 dtk).
- Recharts dipisah dengan `dynamic import` di dashboard (`sales-chart.tsx`) dan keuangan (`finance-chart.tsx`).
- Viewer zoom bukti bayar dipisah ke `proof-viewer.tsx` dan dimuat dinamis.
- Font memakai `next/font` subset Latin (sudah ada).

Hasil Lighthouse final (mobile, throttling 4G, CPU 4×):

| Metrik | Nilai |
| --- | --- |
| Performance | 100 |
| LCP | 1.077 ms |
| FCP | ±1.080 ms |
| TBT | 37 ms |
| CLS | 0 |
| Accessibility | 100 |
| Best Practices | 100 |

Reproduksi: `npm run build && npm start`, lalu `npm run lighthouse:menu` (menulis `lighthouse-menu.json` dan gagal bila LCP ≥ 2.500 ms atau a11y < 0,95).

### Dashboard 500 pesanan / 90 hari

Seed: `npm run db:seed:demo` → 500 pesanan, 467 pembayaran, 8 produk, 5 meja (≈100 detik). Benchmark: `npm run bench:dashboard` (30 iterasi setelah warm-up).

| Rentang | Median | p95 |
| --- | --- | --- |
| Hari ini | 84,5 ms | 142,0 ms |
| 7 hari | 70,9 ms | 298,7 ms |
| Bulan ini | 70,7 ms | 81,4 ms |
| Tahun ini | 71,0 ms | 88,7 ms |

Indeks ditambahkan pada migrasi `20261119101500_quality_indexes`:

```sql
CREATE INDEX "Payment_verifiedAt_idx" ON "Payment"("verifiedAt");
```

Indeks pendukung yang sudah ada dan dipakai dashboard: `Order(createdAt)`, `Order(status, createdAt)`, `Transaction(type, occurredAt)`, `Transaction(occurredAt)`, `OrderItem(orderId)`, `AuditLog(userId, createdAt)`, `AuditLog(action, createdAt)`. Tidak ada sequential scan baru yang terdeteksi pada volume 500 pesanan; variasi p95 berasal dari latensi jaringan database remote, bukan query yang tidak terindeks.

## 4. Aksesibilitas

Perbaikan yang diterapkan:
- Label form customer: `htmlFor`/`id` untuk nama pelanggan dan catatan umum; input file memiliki tombol pemicu berteks.
- Tombol ikon: `aria-label` untuk salin rekening, hapus bukti, zoom in/out/reset/fullscreen, kembali ke antrean, dan toggle kata sandi.
- `aria-live="polite"` untuk perubahan status pesanan di halaman pelacakan; toast Sonner sudah memakai live region.
- Target sentuh minimal 44 px pada alur customer dan kasir: tombol qty `size-11`, CTA `h-11`/`h-12`, tombol verifikasi `h-12`, tab kategori `min-h-11`.
- Kontras: token `--text-muted` dan `--muted-foreground` diubah dari `#8A8AA0` (3,37:1) menjadi `#6B6B80` (> 4,5:1 pada putih).
- Fokus terlihat memakai ring global komponen; `prefers-reduced-motion` menonaktifkan animasi/transisi.

Hasil Lighthouse: skor aksesibilitas 100 pada halaman menu customer. Pemeriksaan manual pada halaman login, keranjang, pelacakan, dan detail kasir tidak menemukan kontrol tanpa label atau target < 44 px pada alur utama.

## 5. CI

Berkas: `.github/workflows/ci.yml`. Job tunggal dengan service PostgreSQL 16 dan S3Mock (S3-compatible):

1. `npm ci`, `prisma migrate deploy`, `prisma generate`, seed, dan pembuatan bucket di S3Mock.
2. `npm run typecheck`, `npm run test`, `npm run test:unit`.
3. `npm run build`, lalu `npx playwright test` (Playwright menjalankan `npm start`).
4. `npm run lighthouse:menu` terhadap server produksi; gagal bila LCP ≥ 2.500 ms atau a11y < 0,95.
5. Artefak kegagalan diunggah (`test-results/`, `playwright-report/`, hasil Lighthouse).

## 6. Catatan & Keterbatasan

- `npm run lint` masih gagal karena 13 error lama di `settings-manager.tsx`, `tables-manager.tsx`, dan beberapa halaman UI customer; berkas baru pada Step 17 bersih. Lint belum dijadikan gate CI.
- Lighthouse hanya mengukur halaman menu customer (target PRD). Halaman admin/kasir diaudit manual, bukan Lighthouse.
- Cetak di E2E memverifikasi popup struk berisi kode pesanan; printer fisik tidak diuji.
- Mode CI mematikan Pusher dan memakai reload sebagai fallback. Jalur realtime dengan Pusher asli diuji terpisah dan lulus 3/3.
- Seed demo bersifat idempoten untuk prefiks `DEMO-`; data demo dapat dibuat ulang kapan saja.
