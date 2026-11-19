# AUDIT DEPENDENSI, BUILD, DAN KONFIGURASI

**Tanggal:** 19 November 2026
**Mode:** read-only terhadap kode aplikasi — tidak ada perubahan `src/**`, `prisma/**`, atau konfigurasi.
**Acuan:** `AI-AGENT.md` §2, `ARCHITECTURE.md`, `PRD.md`, `SECURITY-CHECKLIST.md`, `README.md`.
**Lingkungan:** Windows 11, Node **26.12.1**, npm 11, PostgreSQL 18 lokal, Next.js **16.4.6**.
**Perintah yang dijalankan:** `npm run typecheck` (0 error), `npm run lint` (0 error), `npm run build` (exit 0), `npx prisma validate` (valid), `npm outdated`, `npm audit`, `npm audit --omit=dev`, `npm ls`, pembacaan statis seluruh konfigurasi.

> **Tidak dijalankan:** `npm test`, `npm run test:unit`, `npm run test:e2e`. Ketiganya menulis ke database yang ditunjuk `DATABASE_URL` di `.env` — yaitu **`db.prisma.io` (remote)**, bukan database lokal. Menjalankannya akan membuat dan menghapus data di database remote. Ini sendiri merupakan temuan C-03.

---

## 1. Ringkasan

**15 temuan: 4 Tinggi, 8 Sedang, 3 Rendah.**

| # | Temuan | Tingkat | Bukti |
|---|---|---|---|
| C-01 | Batas body Vercel 4,5 MB vs upload 10 MB; bukti pembayaran customer dikirim tanpa kompresi | **Tinggi** | `MAX_IMAGE_SIZE_BYTES = 10 MB`, `MAX_UPLOAD_BYTES = 12 MB`, tidak ada `compressOnClientIfNeeded` di `order-tracking.tsx` |
| C-02 | `TRUSTED_PROXY` default `none` → semua klien jadi IP `"unknown"` di Vercel | **Tinggi** | `client-ip.ts:62-66`, `.env.example:11` |
| C-03 | `npm test` dan `test:unit` memakai `DATABASE_URL` dari `.env` remote; fixture membuat/menghapus data | **Tinggi** | `.env.test` hanya berisi `TRUSTED_PROXY=1`; `quality/fixtures.ts` menulis `category/product/order` |
| C-04 | 5 dependensi tidak terpakai, 1 duplikat fungsi hashing, 2 CVE critical di devDependencies | **Tinggi** | `bcryptjs`, `@types/bcryptjs`, `cn`, `date-fns`, `zustand` = 0 impor; `vitest`/`tinypool` critical |
| C-05 | `shadcn` diletakkan di `dependencies` → 4 moderate vuln masuk audit runtime | Sedang | `npm audit --omit=dev` → 4 moderate, semuanya rantai `shadcn → ts-morph → minimatch` |
| C-06 | Migrasi tidak dijalankan pada deploy; `DIRECT_URL` wajib di schema tetapi opsional di validator | Sedang | `.github/workflows/ci.yml:66` hanya di job test; `schema.prisma:6` vs `env.ts:5` |
| C-07 | ESLint hanya punya 1 aturan arsitektur; tidak ada batas layer & tidak ada `server-only` | Sedang | `eslint.config.mjs:8-23` hanya melarang `$transaction`; `server-only` = 0 impor |
| C-08 | Dua jalur bypass konfigurasi: `SKIP_ENV_VALIDATION` dan fallback `SESSION_SECRET` hardcoded | Sedang | `env.ts:40-42`, `proxy.ts:54-57` |
| C-09 | Cron tiap menit tidak mungkin di Vercel Hobby; tidak ada alternatif scheduler | Sedang | `vercel.json:5` `* * * * *`; README sudah mengakui batas Hobby |
| C-10 | `images.remotePatterns` dihitung saat build; env yang hilang mematikan semua gambar R2 | Sedang | `next.config.ts:14,57-67` |
| C-11 | Tiga variabel `.env` tidak dipakai kode dan tidak ada di `.env.example` | Sedang | `DATABASE_URL_POOLED`, `POSTGRES_URL`, `PRISMA_DATABASE_URL` = 0 referensi |
| C-12 | Validasi env tidak mencakup 4 variabel yang benar-benar dibaca; password admin punya default lemah | Sedang | `SEED_ADMIN_PASSWORD` fallback `Admin123456!`; `DISABLE_REALTIME`, `R2_FORCE_PATH_STYLE`, `SKIP_ENV_VALIDATION` di luar zod |
| C-13 | `tsconfig` longgar untuk domain uang/stok | Rendah | `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noUnusedLocals` tidak aktif; `target ES2017` |
| C-14 | 16 paket usang; tidak ada `engines`/`packageManager`; `@types/node` 20 vs CI Node 22 | Rendah | `npm outdated`; Prisma 6.19.3 → 7.10.1; Vitest 3.2.7 → 5.1.1 |
| C-15 | Higiene repo: 5 aset `public/` tak terpakai, artefak audit 3,3 MB tidak di-ignore, e2e `reuseExistingServer` | Rendah | `public/{file,globe,next,vercel,window}.svg`; `UI-AUDIT-SCREENSHOTS/` |

---

## 2. Metode dan Batas

| Aspek | Detail |
|---|---|
| Dependensi | `npm outdated --json`, `npm audit --json`, `npm audit --omit=dev`, pencocokan impor statis di `src/**` + `scripts/**` + `prisma/**` |
| Build | `npm run build` produksi (Turbopack), exit 0 |
| Tipe & lint | `npx tsc --noEmit` exit 0; `npx eslint` exit 0 |
| Prisma | `npx prisma validate` exit 0 |
| Runtime | `sharp` dimuat langsung: `sharp 0.35.5 / libvips 8.18.7` |
| Batas | Cakupan tes **tidak diukur** — tidak ada `coverage` script, tidak ada `c8`/`istanbul`, tidak ada ambang cakupan. Yang bisa dinilai hanya pemetaan berkas uji ke modul. |
| Batas | Perilaku platform Vercel tidak diuji langsung; angka 4,5 MB diambil dari dokumentasi resmi Vercel Functions (diperbarui 24 Agustus 2026). |

---

## 3. Dependensi

### 3.1 Tidak terpakai (5 paket)

| Paket | Ukuran | Bukti | Dampak |
|---|---|---|---|
| `bcryptjs` ^3.0.3 | ±90 KB | **0 impor** di seluruh repo; hashing memakai `argon2` (5 referensi) | Dua algoritma hashing terpasang; permukaan serangan bertambah tanpa manfaat |
| `@types/bcryptjs` ^2.4.6 | kecil | 0 impor; bcryptjs v3 sudah membawa tipe sendiri | Paket stub usang |
| `cn` ^0.5.2 | kecil | 0 impor; utilitas lokal bernama `cn` ada di `src/lib/utils.ts` | Nama bertabrakan dengan helper sendiri — risiko salah impor |
| `date-fns` ^4.4.0 | ±200 KB | 0 impor; format tanggal memakai `Intl` di `src/lib/utils.ts` | Duplikasi fungsi format |
| `zustand` ^5.1.0 | ±10 KB | 0 impor; state memakai React state + TanStack Query | Dependensi mati |

Total: **5 dari 33 dependencies** tidak dipakai. Tidak ditemukan impor dinamis (`import()`) untuk paket-paket tersebut.

### 3.2 Duplikat fungsi

| Kelompok | Paket terpasang | Yang dipakai | Catatan |
|---|---|---|---|
| Hashing password | `argon2`, `bcryptjs` | `argon2` | Hapus `bcryptjs` + `@types/bcryptjs` |
| Format tanggal | `date-fns`, `Intl` (bawaan) | `Intl` via `formatWIB`/`relativeTime` | Hapus `date-fns` |
| Utility class | `clsx`, `tailwind-merge`, `cn` (npm) | `clsx` + `tailwind-merge` via `cn()` lokal | Hapus paket `cn` |
| Library UI | `@base-ui/react`, `@radix-ui/react-slot` | Keduanya (base-ui untuk komponen, radix-slot untuk `Button asChild`) | Bukan duplikat murni; tetap dua primitive berbeda di satu proyek |

### 3.3 Salah tempat

- **`shadcn` ^4.23.0 ada di `dependencies`.** Paket ini adalah CLI + stylesheet build-time (`@import "shadcn/tailwind.css"` di `globals.css:3`). Konsekuensinya:
  - `npm audit --omit=dev` melaporkan **4 moderate** (`shadcn`, `ts-morph`, `@ts-morph/common`, `minimatch`) yang sebenarnya hanya alat build.
  - Runtime audit produksi tidak lagi bersih padahal kode aplikasi tidak memakai shadcn saat runtime.
- **`@tailwindcss/turbopack`, `tailwindcss`, `typescript`, `eslint`, `prisma`, `vitest`, `tsx`, `lighthouse`** sudah benar di `devDependencies`. `prisma` CLI di dev dan `@prisma/client` di prod adalah pemisahan yang tepat.
- **`sharp` di `dependencies`** sudah benar — dipakai saat runtime (`src/lib/image.ts:1`).

### 3.4 Versi usang (16 paket)

| Paket | Terpasang | Wanted | Latest | Catatan |
|---|---|---|---|---|
| `@prisma/client` / `prisma` | 6.19.3 | 6.19.3 | **7.10.1** | Major tertunda; `prisma.config.ts` sudah gaya Prisma 7 |
| `vitest` | 3.2.7 | 3.2.7 | **5.1.1** | Dua CVE critical ada di sini |
| `eslint` | 9.39.5 | 9.39.5 | **10.15.0** | Major |
| `typescript` | 5.9.3 | 5.9.3 | **7.0.2** | Major |
| `@types/node` | 20.19.43 | 20.19.43 | 26.6.6 | CI memakai Node 22, lokal 26 — tipe tidak cocok |
| `recharts` | 3.10.1 | 3.11.0 | 3.11.0 | Minor |
| `lucide-react` | 1.73.0 | 1.76.0 | 1.76.0 | Minor |
| `@tanstack/react-query` | 5.107.1 | 5.108.1 | 5.108.1 | Patch |
| `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` | 3.1169.0 | 3.1172.0 | 3.1172.0 | Patch |
| `@hookform/resolvers` | 7.0.6 | 7.0.7 | 7.0.7 | Patch |
| `jose` | 6.2.17 | 6.2.18 | 6.2.18 | Patch |
| `react` / `react-dom` | 19.3.0 | 19.3.0 | 19.3.1 | Dipin eksak — aman |
| `@tailwindcss/turbopack`, `tailwindcss` | 4.3.3 | 4.3.3 | 4.3.5 | Dipin eksak — aman |
| `next`, `eslint-config-next` | 16.4.6 | 16.4.6 | 16.4.6 | Sinkron |

`next` dan `eslint-config-next` dipin **eksak** dan versinya sama — ini benar dan harus dipertahankan.

### 3.5 `npm audit`

| Cakupan | Critical | High | Moderate | Total |
|---|---|---|---|---|
| Seluruh pohon (termasuk dev) | **2** | 0 | 11 | 13 |
| Runtime saja (`--omit=dev`) | 0 | 0 | **4** | 4 |

Rincian critical (keduanya dev-only):

| Paket | Rentang rentan | Advisory | Perbaikan |
|---|---|---|---|
| `vitest` | 0.0.95 – 4.1.10 | Path traversal / arbitrary file read via `@vitest/mocker` | **5.1.1** (major) |
| `tinypool` | ≤ 2.1.1 | Prototype pollution → RCE di worker options | Ikut `vitest` 5.1.1 |

Moderate runtime: seluruhnya rantai `shadcn → ts-morph/@ts-morph/common → minimatch`. `npm audit --omit=dev --audit-level=high` **lulus** (exit 0) karena tidak ada high/critical runtime — tetapi itu hanya karena `shadcn` salah tempat.

**Rekomendasi:** `npm rm bcryptjs @types/bcryptjs cn date-fns zustand`, pindahkan `shadcn` ke `devDependencies`, lalu `npm audit --omit=dev` menjadi **0**. Naikkan `vitest` ke 5.x untuk menutup 2 critical.

---

## 4. Konfigurasi

### 4.1 `tsconfig.json`

| Opsi | Nilai | Verdict |
|---|---|---|
| `strict` | `true` | ✓ |
| `noUncheckedIndexedAccess` | tidak diset (`false`) | ✗ — akses array/objek pada agregasi keuangan & stok tidak dipaksa aman |
| `exactOptionalPropertyTypes` | tidak diset (`false`) | ✗ — `undefined` vs properti hilang tidak dibedakan |
| `noUnusedLocals` / `noUnusedParameters` | tidak diset | ✗ — impor mati lolos typecheck |
| `noImplicitOverride`, `noFallthroughCasesInSwitch` | tidak diset | ✗ — `switch` status pesanan tidak dijaga |
| `target` | `ES2017` | △ — Next 16 mendukung `ES2022`; output lebih banyak downlevel |
| `lib` | `dom, dom.iterable, esnext` | ✓ |
| `allowJs` | `true` | △ — seluruh kode TS; tidak diperlukan |
| `skipLibCheck` | `true` | △ — umum, tetapi menyembunyikan konflik tipe dependensi |
| `include` | `**/*.ts`, `**/*.tsx`, `.next/types`, `.next/dev/types` | ✓ — tes & e2e ikut ter-typecheck |
| `paths` | `@/* → ./src/*` | ✓ |

`tsconfig.tsbuildinfo` (610 KB) ada di root, tetapi sudah di-ignore `*.tsbuildinfo`.

### 4.2 `eslint.config.mjs`

Yang aktif:

- `eslint-config-next/core-web-vitals` + `typescript`.
- **Satu** aturan kustom: larangan `prisma.$transaction` di `src/server/services/**` dan `src/app/api/**` (memaksa `runInTransaction`).

Yang **tidak** ada:

| Kebutuhan | Status |
|---|---|
| Batas layer `src/server/**` tidak boleh diimpor komponen klien | ✗ tidak ada `no-restricted-imports` |
| Paket `server-only` sebagai penjaga runtime | ✗ 0 impor; `server-only` tidak terpasang |
| Larangan `src/lib/**` mengimpor `src/app/**` atau `src/components/**` | ✗ tidak ada |
| Larangan `process.env` di luar `src/lib/env.ts` | ✗ tidak ada |
| `--max-warnings=0` pada `npm run lint` | ✗ script hanya `eslint` |

Saat ini **tidak ada pelanggaran nyata**: 6 komponen klien mengimpor tipe dari `@/server/services/*` semuanya memakai `import type` (terhapus saat kompilasi), dan `src/lib/*` tidak mengimpor `@/server`. Tetapi tidak ada yang mencegah pelanggaran berikutnya. Satu `import` nilai dari `@/server/services/orders` di komponen klien akan menarik Prisma ke bundle browser dan gagal saat build — tanpa peringatan lint lebih awal.

### 4.3 `next.config.ts`

| Aspek | Nilai | Verdict |
|---|---|---|
| `poweredByHeader` | `false` | ✓ |
| CSP | `default-src 'self'`; `object-src 'none'`; `base-uri 'self'`; `form-action 'self'`; `frame-ancestors 'none'` | ✓ struktur |
| `script-src` | `'self' 'unsafe-inline'` (+`'unsafe-eval'` dev) | △ — tanpa nonce/hash, `unsafe-inline` melemahkan CSP |
| `style-src` | `'self' 'unsafe-inline'` | △ — diperlukan Tailwind runtime, wajar |
| `img-src` | `'self' data: blob:` + origin R2 + `https://*.r2.cloudflarestorage.com` | ✓ |
| `connect-src` | `'self'` + Pusher HTTP/WSS + R2 | ✓ |
| `X-Frame-Options` + `frame-ancestors` | `DENY` + `'none'` | ✓ berlapis |
| HSTS | `max-age=31536000; includeSubDomains`, hanya produksi | ✓ |
| `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, COOP | ada | ✓ |
| `Cross-Origin-Resource-Policy` | **tidak ada** | ✗ minor |
| `X-DNS-Prefetch-Control`, `X-Permitted-Cross-Domain-Policies` | **tidak ada** | ✗ minor |
| `images.remotePatterns` | dari `R2_PUBLIC_BASE_URL`, `https`, pathname `/**` | △ — **dihitung saat build** |
| `cacheComponents`, `partialPrefetching` | `true` | ✓ (Next 16) |
| `turbopack.rules` | loader `@tailwindcss/turbopack` untuk `*.css` | ✓ |
| `output: "standalone"` | tidak diset | ✗ bila target self-host/Docker |
| `serverExternalPackages` | tidak diset | ✓ — `sharp` & `argon2` sudah di daftar bawaan Next |

**C-10 detail:** `next.config.ts` dievaluasi saat `next build`. Bila `R2_PUBLIC_BASE_URL` belum diisi di lingkungan build Vercel, `remotePatterns` menjadi `[]`; setiap `next/image` dengan URL R2 akan gagal 400 sampai build ulang. Env harus tersedia **saat build**, bukan hanya saat runtime.

**CSP:** header dipasang untuk `/:path*`, termasuk `_next/static`. Tidak ada mode `Report-Only` dan tidak ada endpoint laporan pelanggaran.

### 4.4 Tailwind

| Aspek | Status |
|---|---|
| Versi | 4.3.3 (CSS-first) |
| `tailwind.config.*` | tidak ada — benar untuk v4 |
| Token | `@theme inline` di `src/app/globals.css` |
| Build | loader `@tailwindcss/turbopack` di `next.config.ts`; tanpa `postcss.config.*` |
| `tw-animate-css` | dipakai via `@import` di `globals.css:2` |
| `shadcn/tailwind.css` | dipakai via `@import` di `globals.css:3` → `shadcn` harus ada saat build |
| `components.json` | `style: base-nova`, `rsc: true`, `tsx: true`, `cssVariables: true`, ikon `lucide` |

Konfigurasi Tailwind konsisten. Tidak ada `content` glob yang bisa salah, karena v4 memindai otomatis.

### 4.5 Prisma

| Aspek | Status |
|---|---|
| `prisma.config.ts` | ada; `import "dotenv/config"`, `schema`, `migrations.seed`, `datasource.url = env("DATABASE_URL")` |
| `npx prisma validate` | ✓ valid |
| Migrasi | 4 buah: `init`, `dashboard_indexes`, `security_hardening`, `quality_indexes` + `migration_lock.toml` |
| `directUrl` | `env("DIRECT_URL")` di schema |
| Generator | `prisma-client-js` (bukan `prisma-client` baru), tanpa `binaryTargets` |
| Peringatan CLI | *"Prisma config detected, skipping environment variable loading"* — dotenv dimuat manual di `prisma.config.ts`, jadi aman |
| `env.ts` | `DIRECT_URL` **opsional** — tidak cocok dengan schema yang mewajibkannya |

`npm run db:seed` memakai `npx tsx prisma/seed.ts` tanpa `dotenv/config`, tetapi `@prisma/client` memuat `.env` sendiri saat diimpor (diverifikasi: `DATABASE_URL` berubah dari `unset` → `set` setelah `import("@prisma/client")`). Jadi seed berjalan, namun ketergantungan pada perilaku implisit ini rapuh.

### 4.6 `src/proxy.ts` (Proxy/Middleware Next 16)

| Aspek | Status |
|---|---|
| CSRF | membandingkan `Origin`/`Referer` dengan `APP_BASE_URL` + `ALLOWED_ORIGINS`, bukan `Host` | ✓ |
| Mutasi tanpa Origin/Referer | hanya diizinkan untuk `/api/cron/*` | ✓ |
| Proteksi rute | `/admin` → SUPER_ADMIN, `/cashier` → CASHIER/SUPER_ADMIN, redirect `/login` | ✓ |
| Verifikasi sesi | `jwtVerify` dengan `SESSION_SECRET` | ✓ |
| **Fallback secret** | `process.env.SESSION_SECRET \|\| "development-secret-must-be-at-least-32-chars-long!"` | ✗ **C-08** |
| `tokenVersion` | dibaca dari JWT tetapi **tidak dicek ke database** | △ — sesi yang dicabut tetap lolos di proxy (layout masih memeriksa) |
| Sumber env | tidak memakai `@/lib/env` yang tervalidasi | ✗ duplikasi kontrak env |

`matcher` mencakup `/api/:path*` sehingga setiap mutasi API melewati proxy — biaya satu verifikasi JWT per request API.

---

## 5. `.env.example` vs `process.env`

**16 kunci** dibaca kode aplikasi (`src/**`), **21 kunci** didokumentasikan di `.env.example` (termasuk yang dikomentari).

### 5.1 Dipakai tetapi tidak terdokumentasi

| Variabel | Lokasi | Catatan |
|---|---|---|
| `NODE_ENV` | `next.config.ts`, `db.ts`, `logger.ts`, `session.ts`, `api/public/orders/*` | Standar Node — wajar tidak didokumentasikan |
| `CI` | `playwright.config.ts` | Standar CI |
| `SKIP_ENV_VALIDATION` | `src/lib/env.ts:40` | **Harus didokumentasikan** karena mematikan seluruh validasi |

### 5.2 Didokumentasikan tetapi tidak divalidasi `lib/env.ts`

| Variabel | Dibaca di | Risiko |
|---|---|---|
| `DISABLE_REALTIME` | `src/lib/pusher-server.ts:19` | Salah tulis (`"1"`, `"TRUE"`) → realtime tetap aktif tanpa peringatan |
| `R2_FORCE_PATH_STYLE` | `src/lib/r2.ts:21` | Sama; hanya `"true"` yang dikenali |
| `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD` | `prisma/seed.ts:11-12` | Tidak pernah divalidasi; **default `Admin123456!`** bila kosong |
| `SKIP_ENV_VALIDATION` | `src/lib/env.ts:40` | Bypass total |

### 5.3 Ada di `.env` tetapi tidak dipakai dan tidak terdokumentasi

| Variabel | Referensi di kode |
|---|---|
| `DATABASE_URL_POOLED` | **0** |
| `POSTGRES_URL` | **0** |
| `PRISMA_DATABASE_URL` | **0** |

Ketiganya sisa integrasi Prisma/Neon. Menimbulkan kebingungan: `DATABASE_URL` yang benar-benar dipakai menunjuk `db.prisma.io`, sementara tiga variabel lain tidak berpengaruh apa pun.

### 5.4 `lib/env.ts`

| Aspek | Status |
|---|---|
| Skema server | 18 kunci: DATABASE_URL, DIRECT_URL (opsional), APP_BASE_URL, ALLOWED_ORIGINS, TRUSTED_PROXY, SESSION_SECRET (≥32), CRON_SECRET (≥8), 5×R2, 4×Pusher, NODE_ENV |
| Skema client | `NEXT_PUBLIC_PUSHER_KEY`, `NEXT_PUBLIC_PUSHER_CLUSTER` |
| Penggabungan | `serverEnvSchema.merge(clientEnvSchema)` → satu objek `env` |
| Waktu validasi | saat impor modul (`export const env = validateEnv()`) |
| Pesan error | mencantumkan setiap field yang gagal |
| Bypass | `SKIP_ENV_VALIDATION=true/1` → `process.env as unknown as Env` |
| `TRUSTED_PROXY` | regex `vercel\|cloudflare\|none\|[1-9]\d*` ✓ |

**Celah:** `DIRECT_URL` opsional (tetapi wajib untuk Prisma), `DISABLE_REALTIME` dan `R2_FORCE_PATH_STYLE` tidak masuk skema, dan tipe hasil bypass tidak tervalidasi sama sekali.

Karena validasi terjadi saat impor, `next build` juga membutuhkannya. Build lokal berhasil karena `.env` lengkap; deploy tanpa env R2/Pusher akan gagal saat build dengan pesan yang jelas (ini perilaku yang baik).

---

## 6. `.gitignore`

| Target | Status |
|---|---|
| `node_modules`, `.pnp*`, `.yarn/*` | ✓ |
| `.next/`, `/out/`, `/build` | ✓ |
| `.env*` dengan pengecualian `.env.example` dan `.env.test` | ✓ |
| `coverage/`, `test-results/`, `playwright-report/`, `lighthouse-menu.json`, `lighthouse.log` | ✓ |
| `*.tsbuildinfo`, `next-env.d.ts` | ✓ |
| `.vercel`, `*.pem`, `*.log`, `.DS_Store` | ✓ |
| Berkas upload lokal | n/a — tidak ada upload ke disk; semua ke R2 |
| `UI-AUDIT-SCREENSHOTS/` (3,3 MB, 54 PNG) | ✗ tidak di-ignore — putuskan: commit atau ignore |
| `AUDIT-*.md` / laporan audit lain | ✗ tidak di-ignore — 7 berkas untracked |
| `scripts/.tmp-*` | ✗ tidak ada pola; skrip sementara bisa ikut ter-commit |

`.env.test` sengaja di-whitelist dan **tidak berisi rahasia** (hanya `TRUSTED_PROXY=1`) — aman.

---

## 7. Kesiapan Deploy

| # | Aspek | Status | Detail |
|---|---|---|---|
| 1 | `sharp` di platform target | ✓ | `sharp@0.35.5`, `libvips 8.18.7`, dimuat langsung. `package-lock.json` memuat `@img/sharp-linux-x64` **dan** `@img/sharp-libvips-linux-x64` → `npm ci` di Vercel/Linux memasang biner yang benar. Semua rute memakai runtime Node (tidak ada `export const runtime = "edge"`), jadi `sharp` dan `argon2` aman. |
| 2 | Batas body vs batas upload | ✗ **C-01** | Vercel: **4,5 MB** per request/response (`FUNCTION_PAYLOAD_TOO_LARGE` 413). Kode menerima **12 MB** dan service memproses hingga **10 MB**. `ImageUploader` admin mengompres >4 MB → aman. **`order-tracking.tsx:110-113` mengirim `file` mentah** hingga 10 MB → foto ponsel 5–10 MB gagal 413 sebelum kode berjalan. |
| 3 | `vercel.json` cron | △ **C-09** | `GET /api/cron/expire-orders` tiap menit. Vercel Hobby hanya cron harian; README sudah mencatatnya. Endpoint memvalidasi `Authorization: Bearer <CRON_SECRET>` dengan perbandingan timing-safe ✓. Tidak ada scheduler alternatif (GitHub Actions/cron eksternal). |
| 4 | Migrasi produksi | ✗ **C-06** | `prisma migrate deploy` hanya ada di job CI (`ci.yml:66`), bukan di pipeline deploy. Tidak ada `postinstall`/`prebuild` yang menjalankan migrasi. Deploy Vercel hanya `next build` → skema produksi bisa tertinggal dari kode. `@prisma/client` postinstall menjalankan `prisma generate` ✓, tetapi bukan migrasi. |
| 5 | Region & durasi fungsi | △ | Tidak ada `regions`/`maxDuration` di `vercel.json` atau rute. Default region `iad1` — jauh dari pengguna Indonesia; DB `db.prisma.io` juga perlu region yang sama. |
| 6 | Self-host | △ | Tidak ada `output: "standalone"`, `Dockerfile`, atau `.dockerignore`. `next start` bekerja, tetapi image produksi tidak dioptimalkan. |
| 7 | Variabel build vs runtime | △ | `R2_PUBLIC_BASE_URL` dibutuhkan saat **build** (C-10); seluruh env R2/Pusher/SESSION dibutuhkan saat **build** karena `env.ts` dievaluasi saat impor. |
| 8 | Rate limit | ✓ | Berbasis tabel `RateLimit` (`INSERT ... ON CONFLICT`), bukan memori → aman untuk banyak instance serverless. Tetapi kuncinya bergantung pada IP (lihat C-02). |
| 9 | `TRUSTED_PROXY` | ✗ **C-02** | Default `none`. Di Vercel, `Request.ip` tidak tersedia → `getClientIp` mengembalikan `"unknown"` untuk **semua** klien. Dampak: bucket rate limit login dan bukti pembayaran menjadi global. `.env.example` harus default `vercel` (atau dokumentasikan wajib diubah). |
| 10 | Seed produksi | △ | `SEED_ADMIN_PASSWORD` default `Admin123456!` bila tidak diset. Seed tidak boleh dijalankan di produksi tanpa mengganti nilai ini. |
| 11 | Node version | △ **C-14** | CI Node 22, lokal Node 26, `@types/node` 20. Tidak ada `engines` atau `packageManager`, sehingga perilaku `npm ci` dan tipe bisa berbeda antar mesin. |

---

## 8. Skrip npm vs `AI-AGENT.md` §2

| Skrip §2 | Ada | Diverifikasi |
|---|---|---|
| `npm run dev` | ✓ | tidak dijalankan (port) |
| `npm run build` | ✓ | **exit 0** |
| `npm run start` | ✓ | tidak dijalankan (port) |
| `npm run lint` | ✓ | **exit 0** |
| `npm run typecheck` | ✓ | **exit 0** |
| `npm run test` | ✓ | **tidak dijalankan** — menulis ke DB remote (C-03) |
| `npm run test:unit` | ✓ | **tidak dijalankan** — alasan sama |
| `npm run test:e2e` | ✓ | tidak dijalankan — butuh server + DB |
| `npm run db:migrate` | ✓ | tidak dijalankan (mengubah skema remote) |
| `npm run db:seed` | ✓ | tidak dijalankan (menulis DB remote) |
| `npm run db:studio` | ✓ | tidak dijalankan (interaktif) |

Skrip tambahan di luar §2: `db:seed:demo`, `db:generate`, `bench:dashboard`, `audit:stock-drift`, `lighthouse:menu`. Semua berkas targetnya ada (`scripts/benchmark-dashboard.ts`, `scripts/audit-stock-drift.ts`, `scripts/lighthouse-menu.mjs`, `scripts/init-buckets.mjs`, `prisma/seed-demo.ts`).

Catatan:

- `lint` = `eslint` tanpa `--max-warnings=0` → warning tidak menggagalkan CI.
- `test` memakai glob `tests/**/*.test.ts`. Dukungan glob pada `node --test` baru ada di Node ≥22; `package.json` tidak menyatakan `engines`, sehingga Node 20 akan gagal tanpa pesan jelas.
- Tidak ada skrip `format`, `check`, atau `coverage`.

---

## 9. Tes dan Cakupan

### 9.1 Inventaris

| Runner | Berkas | Jumlah |
|---|---|---|
| `node:test` (`tests/**`) | 21 di root + 1 di `integration/` | **22 berkas** |
| Vitest (`quality/**`) | 4 berkas uji + `fixtures.ts` + `setup.ts` | **4 berkas** |
| Playwright (`e2e/**`) | `order-flow.spec.ts` | **3 skenario** |

Tidak ada tes yang di-skip atau dinonaktifkan: pencarian `.skip`, `.todo`, `.only`, `.fixme`, `test.only`, `describe.only` di seluruh `tests/`, `quality/`, `e2e/` → **0 hasil**.

### 9.2 Pemetaan modul kritis

| Modul | Berkas uji | Status |
|---|---|---|
| State machine pesanan | `tests/order-state`, `quality/order-state` | ✓ termasuk approve ganda bersamaan |
| Checkout & konkurensi | `quality/checkout-concurrency`, `tests/order-stock-tracking` | ✓ replay Idempotency-Key, stok tersisa 1 |
| Pembayaran (approve/reject/unggah ulang) | `tests/cashier-orders`, `tests/order-tracking`, `tests/security` | ✓ guard status, batas unggah, cron idempoten |
| Stok | `tests/stock`, `stock-settings`, `order-stock-tracking`, `product-update` | ✓ saldo negatif, movement konsisten, update parsial |
| Keuangan | `tests/finance`, `tests/dashboard`, `quality/finance` | ✓ laba bersih, batas hari WIB, idempoten |
| Upload & gambar | `tests/image`, `tests/security` ("upload berbahaya"), `quality/image-auth` | ✓ AVIF, magic bytes, otorisasi |
| Auth/RBAC/sesi | `tests/auth`, `pusher-auth`, `client-ip`, `request-origin`, `realtime-commit` | ✓ |
| Menu, keranjang, pengaturan, meja | `tests/menu`, `cart`, `settings`, `table-update` | ✓ |
| End-to-end | `e2e/order-flow.spec.ts` | ✓ 3 alur: pesan→setujui→cetak, tolak→unggah ulang→setujui, kedaluwarsa→stok kembali |

### 9.3 Celah cakupan

| Area | Celah |
|---|---|
| Handler rute unggah | Tidak ada tes HTTP untuk `content-length` 12 MB, 413, dan `formData` rusak — hanya service `processAndStore` yang diuji |
| `src/lib/env.ts` | Tidak ada tes validasi (field wajib hilang, bypass `SKIP_ENV_VALIDATION`) |
| `src/proxy.ts` | CSRF diuji lewat `request-origin`, tetapi perilaku redirect per peran di proxy tidak diuji langsung |
| `src/lib/qr.ts`, `src/lib/r2.ts` | Tidak ada tes unit |
| Lembar QR A4 | Tidak ada test karena fiturnya tidak ada (lihat audit UI/UX) |
| Metrik cakupan | **Tidak ada** `coverage` script, `c8`, atau ambang cakupan — persentase tidak bisa dinyatakan |

### 9.4 Isolasi tes (`C-03`)

`.env.test` hanya berisi:

```
TRUSTED_PROXY=1
```

`package.json` menjalankan `tsx --env-file=.env.test --import dotenv/config ...`. Karena dotenv **tidak menimpa** variabel yang sudah ada, `DATABASE_URL` diambil dari `.env` — di repo ini `db.prisma.io`. `quality/fixtures.ts` membuat kategori, produk, pesanan, lalu menghapusnya. Artinya `npm test` lokal akan **menulis ke database remote**. CI aman karena environment job menimpa `DATABASE_URL` ke `localhost:5432`.

Tidak ada pengaman yang menolak berjalan bila host bukan `localhost`.

---

## 10. Yang Sudah Benar (diverifikasi)

1. **`strict: true`** di `tsconfig`, dan seluruh `tests/**` + `e2e/**` ikut typecheck — `npx tsc --noEmit` exit 0.
2. **`next` dan `eslint-config-next` dipin eksak pada versi yang sama** (16.4.6).
3. **`sharp` siap Linux**: lockfile memuat `@img/sharp-linux-x64` + `libvips-linux-x64`; semua rute Node runtime.
4. **Header keamanan lengkap dan berlapis**: CSP + XFO + `frame-ancestors`, HSTS hanya produksi, `nosniff`, Referrer-Policy, Permissions-Policy, COOP, `poweredByHeader: false`.
5. **CSRF berbasis origin tepercaya**, bukan `Host`; mutasi tanpa Origin hanya untuk cron.
6. **Rate limit persisten di database**, aman untuk serverless multi-instance.
7. **Cron diamankan** dengan `Authorization: Bearer` dan perbandingan timing-safe.
8. **`prisma.config.ts` valid** dan `npx prisma validate` lolos; migrasi bernomor dan `migration_lock.toml` ada.
9. **`.gitignore` menutup** `.env*` (kecuali example/test), `.next`, `node_modules`, artefak tes, `*.tsbuildinfo`, `.vercel`.
10. **`prisma migrate deploy` ada di CI**, bersama `npm audit --omit=dev --audit-level=high`, typecheck, tes, build, e2e, dan Lighthouse.
11. **`npm run build` bersih**: 0 error, seluruh rute ter-render (ƒ/◐), tidak ada peringatan blokir.
12. **Semua skrip §2 `AI-AGENT.md` ada** dan target berkas skrip tambahan valid.
13. **Tidak ada tes yang dinonaktifkan**; tiga alur kritis memiliki e2e.
14. **Dependensi runtime utama tepat tempat**: `@prisma/client`, `sharp`, `argon2`, `@aws-sdk/*` di `dependencies`; CLI/build tool di `devDependencies`.

---

## 11. Prioritas Perbaikan

### P0 — sebelum deploy produksi

1. **Samakan batas upload dengan platform.** Pilih satu: (a) kompres di klien untuk bukti pembayaran seperti `ImageUploader`, atau (b) turunkan `MAX_IMAGE_SIZE_BYTES` ke **4 MB** dan `MAX_UPLOAD_BYTES` ke **4,2 MB**, atau (c) unggah langsung ke R2 dengan presigned PUT. Ukur ulang: unggah 5 MB harus mengembalikan 200, bukan 413 dari Vercel.
2. **Set `TRUSTED_PROXY=vercel`** di `.env.example` dan dokumentasikan; tanpa itu rate limit login/bukti menjadi global (`"unknown"`).
3. **Isolasi tes.** Tambahkan penjaga di `tests`/`quality` yang menolak `DATABASE_URL` non-lokal, atau sediakan `db:test:setup` dengan database lokal. Perbaiki `.env.test` agar memuat `DATABASE_URL` sendiri.
4. **Bersihkan dependensi.** `npm rm bcryptjs @types/bcryptjs cn date-fns zustand`; pindahkan `shadcn` ke `devDependencies`; naikkan `vitest` ke 5.x. Target: `npm audit --omit=dev` = **0**; audit penuh tanpa critical.

### P1 — sprint berikutnya

5. **Migrasi saat deploy.** Tambahkan langkah `prisma migrate deploy` ke pipeline rilis (atau `vercel-build`), bukan hanya CI test. Jadikan `DIRECT_URL` wajib di `env.ts`.
6. **Tutup bypass konfigurasi.** Hapus fallback `SESSION_SECRET` di `proxy.ts` dan impor `env` tervalidasi; batasi `SKIP_ENV_VALIDATION` hanya untuk `NODE_ENV=test`.
7. **Tegakkan batas layer.** Tambahkan `no-restricted-imports` (klien → `@/server`, `src/lib` → `@/app`/`@/components`, `process.env` di luar `env.ts`) dan pasang `server-only` di modul server.
8. **Validasi env yang tersisa.** Masukkan `DISABLE_REALTIME`, `R2_FORCE_PATH_STYLE`, `SEED_ADMIN_*` ke skema; hapus tiga variabel mati dari `.env`.
9. **Cron yang benar-benar jalan.** Tetapkan target plan Vercel Pro, atau pindahkan ke cron eksternal (GitHub Actions tiap menit) dengan `CRON_SECRET`.
10. **Kunci versi runtime.** Tambahkan `"engines": { "node": ">=22 <27" }` dan `packageManager`; naikkan `@types/node` ke 22.

### P2 — backlog

11. **Perketat `tsconfig`**: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noUnusedLocals`, `target ES2022`, `allowJs: false`.
12. **Lengkapi cakupan**: tes handler unggah (413/12 MB), `env.ts`, `qr.ts`, `r2.ts`, dan proxy per peran; tambahkan `coverage` + ambang minimum untuk `src/server/services/**`.
13. **Higiene**: hapus 5 aset `public/*.svg`, putuskan nasib `UI-AUDIT-SCREENSHOTS/`, tambahkan pola ignore untuk artefak audit, set `reuseExistingServer: !process.env.CI` di Playwright.
14. **Header minor**: tambahkan `Cross-Origin-Resource-Policy: same-origin` dan `X-Permitted-Cross-Domain-Policies: none`.

---

## 12. Lampiran

### 12.1 Perintah reproduksi

```bash
npm outdated --json
npm audit --json
npm audit --omit=dev --json
npx tsc --noEmit
npx eslint
npx prisma validate
npm run build

# sharp
node -e "const s=require('sharp');console.log(s.versions.sharp, s.versions.vips)"

# bukti tidak terpakai
rg -n 'bcryptjs|date-fns|zustand|from "cn"' src prisma scripts tests quality e2e

# bukti env
rg -n 'DATABASE_URL_POOLED|POSTGRES_URL|PRISMA_DATABASE_URL' -g '!node_modules' .
```

### 12.2 Angka kunci

| Metrik | Nilai |
|---|---|
| Dependencies / devDependencies | 33 / 16 |
| Tidak terpakai | 5 paket |
| Usang | 16 paket |
| Audit penuh | 13 (2 critical, 11 moderate) |
| Audit runtime | 4 moderate — semuanya dari `shadcn` |
| Migrasi Prisma | 4 |
| Tes `node:test` / Vitest / e2e | 22 / 4 / 3 skenario |
| Tes di-skip | 0 |
| `npm run build` | exit 0 |
| `tsc --noEmit` | exit 0 |
| `eslint` | exit 0 |

### 12.3 Catatan kebersihan

- Tidak ada berkas `src/**`, `prisma/**`, `package.json`, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, atau `.env.example` yang diubah.
- Satu skrip sementara `scripts/.tmp-dep-scan.mjs` dibuat untuk pemindaian impor dan dihapus setelah audit.
- Tidak ada perintah yang menulis ke database.
