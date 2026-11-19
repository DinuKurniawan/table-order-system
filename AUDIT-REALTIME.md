# AUDIT REALTIME (PUSHER)

Tanggal: 2026-11-19
Mode: **read-only terhadap kode aplikasi** — tidak ada perubahan pada `src/**`, `prisma/**`, atau konfigurasi.
Ruang lingkup: `src/lib/pusher-server.ts`, `src/lib/pusher-client.ts`, `src/lib/realtime-events.ts`, `src/lib/tx.ts`, seluruh pemanggil `emitToChannel`/`after()`, komponen klien yang berlangganan, `src/app/api/pusher/auth/route.ts`, dan `PRD.md` Bagian 6.
Verifikasi: `npm run build` sukses; `tests/realtime-commit.test.ts` + `tests/pusher-auth.test.ts` **15/15 lulus**.

## 1. Ringkasan

Total temuan: **12** — **2 Tinggi, 3 Sedang, 5 Rendah, 2 Informasi**.

Fondasi realtime sudah benar: semua emit server-side dijalankan lewat `after()` setelah commit, nama event/channel berasal dari `realtime-events.ts`, otorisasi 5 jenis channel berfungsi, dan klien memperlakukan event sebagai sinyal invalidasi. Yang belum benar adalah **kelengkapan dan ketahanan**:

1. **R-01** — Tidak ada refetch saat koneksi Pusher pulih; halaman admin dapat basi tanpa batas dan indikator koneksi tetap hijau saat offline.
2. **R-02** — `stock.changed` untuk reservasi/pelepasan stok tidak dikirim ke admin (dan hanya ke meja pemesan), sehingga halaman stok admin tidak pernah ter-update oleh penjualan.

Keduanya melanggar eksplisit `PRD.md:198,203`.

## 2. Jawaban Ringkas atas 9 Pertanyaan Audit

| # | Pertanyaan | Jawaban | Bukti |
|---|---|---|---|
| 1 | Semua emit setelah commit, bukan di dalam `$transaction`? | **Ya untuk seluruh kode server.** Semua emit berada di callback `after()`; `runInTransaction` menjalankan callback hanya setelah commit dan menelan error emit. Pengecualian: halaman diagnostik klien memanggil `emitToChannel` langsung (R-06), tetapi tidak punya kredensial sehingga tidak mengirim apa pun. | `src/lib/tx.ts:48-63`; `tests/realtime-commit.test.ts:10-121` |
| 2 | Nama channel/event hanya dari `lib/realtime-events.ts`? | **Ya di server dan komponen produksi.** Semua service memakai `CHANNELS`/`REALTIME_EVENTS`. Pelanggaran hanya di `src/app/admin/settings/realtime-test/page.tsx:55-76` yang menulis string literal event. Tipe `emitToChannel(event: string)` juga tidak membatasi ke `RealTimeEvent`. | `src/lib/pusher-server.ts:55`; `src/app/admin/settings/realtime-test/page.tsx:38-43` |
| 3 | Payload kecil dan bebas data sensitif? Klien hanya invalidasi? | **Ukuran kecil (<10 KB), tetapi kontrak menyimpang dari PRD.** `order.created` membawa `tableToken` (kredensial channel meja) dan `customerName`; `order.status_changed` tidak membawa `orderId`/`reason`; `stock.changed` memakai `newStock` (bukan `stock`) dan tanpa `available`; `transaction.created` punya tiga bentuk berbeda. Klien saat ini mengabaikan sebagian besar field dan tetap invalidasi, jadi belum rusak—tetapi rapuh. | `PRD.md:193-201`; `src/app/api/public/orders/route.ts:273-288`; `src/server/services/orders.ts:145-163`; `src/server/services/cashier-orders.ts:314-328` |
| 4 | Pusher gagal: request tetap sukses? Ada fallback/polling saat reconnect? | **Request tetap sukses**; error hanya di-log. **Fallback tidak merata:** kasir 15 dtk, detail kasir 20 dtk, customer 30 dtk; dashboard admin, keuangan, stok, dan menu **tanpa polling**. Tidak ada `pusher.connection.bind('connected')` seperti diwajibkan PRD. | `src/lib/pusher-server.ts:55-72`; `src/components/cashier/cashier-dashboard.tsx:105-109`; `src/components/cashier/cashier-order-detail.tsx:98-103`; `src/app/order/[code]/order-tracking.tsx:65-70`; `src/components/admin/dashboard-manager.tsx:280-286`; `PRD.md:203` |
| 5 | Setiap hook unsubscribe saat unmount? Ada subscribe ganda? | **Ya.** `useRealtimeEvent` dan `usePusherChannel` melakukan `unbind` + `releaseChannel`; ref-count per channel membuat StrictMode aman dan mencegah `subscribe` ganda. Catatan: nilai balik `useRealtimeEvent` adalah no-op dan `usePusherChannel` selalu mengembalikan `subscription: null` (API menyesatkan, bukan kebocoran). | `src/lib/pusher-client.ts:18-35,67-83,93-129` |
| 6 | Debounce invalidasi dashboard? Potensi badai query? | **Dashboard admin sudah debounce 500 ms** dan membersihkan timer saat unmount. **Dashboard kasir tidak** — tiap event langsung `invalidateQueries`; satu pesanan dapat memicu 4 refresh. Checkout juga mengirim satu trigger per item (maks. 50) tanpa `triggerBatch`. | `src/components/admin/dashboard-manager.tsx:288-299`; `src/components/cashier/cashier-dashboard.tsx:148-155`; `src/app/api/public/orders/route.ts:240-256` |
| 7 | Event untuk setiap perubahan penting sesuai PRD Bagian 6? | **Tidak lengkap.** Reservasi/pelepasan stok tidak mengirim `stock.changed` ke admin; hanya meja pemesan. Perubahan produk, meja, pengaturan, dan daftar kasir tidak punya event. Refund hanya lewat dead code. Detail di R-02, R-07, R-12, dan tabel inventaris Bagian 5. | `src/app/api/public/orders/route.ts:240-246`; `src/server/services/orders.ts:152-163`; `src/server/services/products.ts:238-283`; `src/server/services/tables.ts:115-138` |
| 8 | Otorisasi `/api/pusher/auth` untuk 5 channel? | **Ya.** `private-cashier` (CASIER/SUPER_ADMIN), `private-admin` (SUPER_ADMIN), `private-user-{id}` (hanya diri sendiri), `private-order-{code}` (cookie access token, constant-time), `private-table-{token}` (meja aktif). Semua diuji. Belum ada rate limit/body cap. | `src/app/api/pusher/auth/route.ts:63-95`; `tests/pusher-auth.test.ts:138-250` |
| 9 | Uji manual dua browser, putus/sambung, tutup/buka tab, banyak tab? | Skenario dan ekspektasi ada di **Bagian 6**. Temuan yang paling mungkin terlihat: indikator tetap hijau saat offline (R-08), admin tidak refetch setelah Pusher pulih (R-01), stok admin tidak berubah setelah checkout (R-02). | `PRD.md:203` |

## 3. Temuan

### R-01 — Tidak ada refetch saat Pusher pulih; admin dapat basi tanpa batas (Tinggi)
**Lokasi:** `src/lib/pusher-client.ts:67-83`; `src/components/providers.tsx:8-15`; `src/components/admin/dashboard-manager.tsx:280-286`; `PRD.md:203`

`usePusherChannel` hanya mengikat `pusher:subscription_succeeded` dan `pusher:subscription_error`. Tidak ada binding ke `pusher.connection` (`connected`, `disconnected`, `unavailable`) dan tidak ada invalidasi saat reconnect. `QueryClient` global mematikan `refetchOnWindowFocus`; dashboard admin, keuangan, stok, dan menu juga tidak punya `refetchInterval`.

Pusher **tidak memutar ulang event** yang hilang saat koneksi terputus. Walaupun `pusher-js` otomatis subscribe ulang, data yang berubah selama putus tidak pernah diambil lagi oleh halaman admin.

**Reproduksi:**
1. Buka dashboard admin di browser A (login SUPER_ADMIN).
2. Di DevTools A, blokir domain Pusher (`*.pusher.com`, `sockjs-*.pusher.com`) — internet lain tetap jalan.
3. Dari browser B, buat 2 pesanan dan setujui 1 pembayaran.
4. Hapus blokir, tunggu Pusher tersambung kembali >60 detik.
5. **Diharapkan (PRD 203):** dashboard otomatis refetch saat `connected`; KPI dan grafik menampilkan pesanan/transaksi baru.
6. **Aktual:** tidak ada refetch; KPI, grafik, dan aktivitas tetap angka lama sampai halaman di-reload manual. Indikator koneksi juga tidak pernah berubah merah (lihat R-08).

**Catatan:** React Query default `refetchOnReconnect: true` menutupi kasus jaringan browser offline→online, tetapi **tidak** menutupi Pusher down/WebSocket drop saat internet tetap online—dan PRD tetap mewajibkan binding `connected`.

**Perbaikan:** di `initPusherClient`, bind `pusher.connection.bind("connected", () => queryClient.invalidateQueries())` (atau event version-per-channel), bind `disconnected`/`unavailable` ke status indikator, dan tambahkan polling lambat (30–60 dtk) untuk halaman admin yang tidak punya fallback.

### R-02 — `stock.changed` reservasi/pelepasan tidak dikirim ke admin dan meja lain (Tinggi)
**Lokasi:** `src/app/api/public/orders/route.ts:240-256`; `src/server/services/orders.ts:152-163`; `src/server/services/stock.ts:103-128`

Saat checkout, `stock.changed` hanya dikirim ke `CHANNELS.table(tableToken)` milik meja yang memesan. Tidak ada emit ke `CHANNELS.admin`, dan meja lain yang menunya sedang terbuka tidak menerima update. Saat pembatalan/kedaluwarsa, `emitStockChanges` juga hanya mengirim ke satu channel meja.

Akibatnya halaman **Stok** admin tidak pernah ter-update oleh penjualan/pelepasan stok—hanya oleh penyesuaian manual dan perubahan pengaturan stok. Ini melanggar `PRD.md:198` (`stock.changed` → `admin, table-*`).

**Reproduksi:**
1. Buka `/admin/stock` di tab A dan dua menu meja berbeda (meja B dan C) di tab lain.
2. Checkout produk tracked qty 2 dari meja B.
3. **Diharapkan:** stok di admin dan menu meja C langsung berkurang.
4. **Aktual:** stok di admin dan menu C tidak berubah; hanya menu meja B yang menerima event. Database sudah benar, jadi reload manual menunjukkan angka baru. Batalkan pesanan → admin tetap tidak menerima event.

**Perbaikan:** kirim `stock.changed` ke `CHANNELS.admin` untuk setiap reservasi/pelepasan, dan sebarkan ke seluruh meja aktif (bukan hanya meja pemesan) atau gunakan satu event agregat. Satukan juga nama field (`stock`, bukan `newStock`).

### R-03 — `emitToChannel` fire-and-forget; event dapat hilang di serverless (Sedang)
**Lokasi:** `src/lib/pusher-server.ts:55-72`; `src/lib/tx.ts:6-12,57-63`

`emitToChannel` memanggil `void pusher.trigger(...).catch(...)`. Callback `after()` memang berjalan setelah commit, tetapi tidak menunggu HTTP trigger selesai. Di runtime serverless (Vercel/Lambda), eksekusi dapat dibekukan tepat setelah response dikirim; di proses Node biasa, crash setelah commit juga menghilangkan event. Outbox di `tx.ts` hanya in-memory, bukan durable.

**Dampak:** request sukses dan data commit, tetapi event tidak pernah sampai. Klien yang punya polling akan pulih; halaman admin tanpa polling tidak.

**Perbaikan:** `await` trigger dengan timeout di dalam `after()` untuk event kritis, atau buat tabel outbox + worker/retry. Minimal, gunakan `triggerBatch` dan log kegagalan dengan metrik.

### R-04 — Kontrak payload menyimpang dari PRD; `order.created` membawa `tableToken` dan `customerName` (Sedang)
**Lokasi:** `src/app/api/public/orders/route.ts:273-288`; `src/server/services/orders.ts:145-163`; `src/server/services/cashier-orders.ts:314-328`; `src/server/services/finance.ts:341-344`; `PRD.md:193-201`

Perbandingan aktual vs PRD:

| Event | PRD | Aktual |
|---|---|---|
| `order.created` | `{orderId, code, tableNo, total}` | `{orderCode, orderId, tableToken, tableName, customerName}` — tanpa `total`, ada token meja |
| `payment.uploaded` | `{orderId, code, attempt}` | `{orderCode, orderId, paymentId, attempt, tableName}` — cukup, ada field tambahan |
| `order.status_changed` | `{orderId, code, status, reason?}` | `{orderCode, status, version}` — tanpa `orderId`/`reason` |
| `stock.changed` | `{productId, stock, available}` | checkout: `{productId, newStock, orderCode}`; adjustment: `{productId, name, stock, lowStockThreshold}` |
| `stock.low` | `{productId, name, stock}` | checkout: `{productId, newStock, orderCode}` tanpa `name`; adjustment: ada `name`/`stock` |
| `transaction.created` | `{id, type, amount}` | approve: `{orderCode, amount}`; finance: `{id, action}` |

**Dampak:** klien saat ini hanya invalidasi, jadi belum ada data salah. Namun kontrak tidak stabil, `stock.low` dari checkout memunculkan toast generik tanpa nama produk, dan `tableToken` adalah kredensial untuk channel meja/menu yang tidak perlu diketahui kasir. `customerName` adalah PII yang tidak dipakai handler kasir (hanya `tableName`/`orderCode`).

**Perbaikan:** definisikan map payload bertipe di `realtime-events.ts`; hapus `tableToken` dan `customerName` (kirim `tableName`); tambahkan `total`; satukan `stock`/`available`; sertakan `orderId`/`reason` pada status.

### R-05 — Badai query di dashboard kasir dan trigger per item (Sedang)
**Lokasi:** `src/components/cashier/cashier-dashboard.tsx:148-155`; `src/app/api/public/orders/route.ts:240-256`; `src/server/services/orders.ts:152-163`; `src/lib/pusher-server.ts:63-68`

Dashboard kasir tidak memakai debounce. Satu pesanan dapat memicu `order.created`, `payment.uploaded`, `order.status_changed`, dan `transaction.created`; masing-masing langsung `invalidateQueries({ queryKey: ["cashier-orders"] })`. Pada jam sibuk, N pesanan menghasilkan sekitar 4N request ke `/api/cashier/orders`.

Checkout juga memanggil `emitToChannel` sekali per item untuk `stock.changed` dan sekali lagi untuk `stock.low`. Dengan keranjang maksimum 50 item, satu checkout bisa menghasilkan >50 trigger HTTP terpisah; `triggerBatch` tidak dipakai. Pusher membatasi batch 10 event per request dan memiliki batas laju per channel.

**Reproduksi:** buka Network tab dashboard kasir, buat 10 pesanan cepat. Hitung request `cashier-orders` dan trigger stok. **Diharapkan:** satu refresh per jendela debounce (±500 ms) dan event stok agregat. **Aktual:** beberapa refresh per pesanan dan puluhan trigger per checkout besar.

**Perbaikan:** debounce 300–500 ms seperti dashboard admin; kirim satu `stock.changed` berisi array perubahan (atau `triggerBatch`); debounce toast `stock.low`.

### R-06 — Halaman diagnostik realtime rusak dan memakai string literal (Rendah)
**Lokasi:** `src/app/admin/settings/realtime-test/page.tsx:1-8,38-43,55-76`; `tests/realtime-commit.test.ts:123-146`

Halaman ini `"use client"` tetapi mengimpor `emitToChannel` dari `@/lib/pusher-server`. Di browser, `process.env.PUSHER_APP_ID/KEY/SECRET/CLUSTER` tidak tersedia, sehingga `getPusher()` mengembalikan `null` dan tombol “Kirim …” hanya menulis warning—tidak pernah mengirim event. `npm run build` sukses, tetapi chunk klien memuat modul server tersebut (string “Pusher environment variables not fully configured” ditemukan di chunk statis); tidak ada nilai secret yang ikut, jadi bukan kebocoran kredensial.

Selain itu, event ditulis sebagai literal `"order.created"`, `"payment.uploaded"`, `"order.status_changed"`, `"user.deactivated"`, bukan `REALTIME_EVENTS`. Tes arsitektur T-03(e) hanya memindai `src/server/services` dan `src/app/api` dengan ekstensi `.ts`, sehingga `.tsx` ini lolos.

**Perbaikan:** pindahkan pengiriman ke Route Handler/server action yang memakai `emitToChannel`, gunakan konstanta, atau hapus halaman diagnostik yang tidak tertaut dari UI.

### R-07 — Event hilang untuk produk, meja, pengaturan, dan daftar kasir (Rendah)
**Lokasi:** `src/server/services/products.ts:238-283,293-329`; `src/server/services/tables.ts:115-138,174-199`; `src/server/services/cashiers.ts:203-206,241-244,284-287,306-309`; `src/components/admin/cashier-manager.tsx:86-90`

- `updateProduct`/`deleteProduct` tidak mengirim event. Perubahan harga/nama/foto atau penonaktifan produk tidak sampai ke menu meja yang sedang terbuka; pelanggan melihat harga lama sampai reload (checkout tetap memakai harga DB, jadi total bisa berbeda dari tampilan).
- `updateTable`/`regenerateTableToken` tidak mengirim event. Menonaktifkan meja tidak memutus channel `private-table-{token}` yang sudah tersambung; halaman menu tetap terbuka sampai submit gagal.
- Perubahan pengaturan (timeout bayar, metode bayar, batas upload) tidak mengirim event.
- `cashiers.ts` mengirim `user.deactivated` ke admin, tetapi `cashier-manager.tsx` tidak berlangganan event apa pun; daftar kasir dan KPI “kasir aktif” di dashboard tidak berubah sampai reload.

**Perbaikan:** tambahkan event `menu.updated`/`table.updated`/`settings.updated` (atau perluas `stock.changed`) dan berlangganan di halaman terkait; untuk kasir, kirim `kpi.updated` atau invalidasi daftar kasir.

### R-08 — Indikator koneksi tidak akurat; status bisa macet “connecting” (Rendah)
**Lokasi:** `src/lib/pusher-client.ts:57-91`; `src/components/admin/connection-indicator.tsx:11-29`

`usePusherChannel` hanya mengikat `pusher:subscription_succeeded` dan `pusher:subscription_error`. Tidak ada binding ke `pusher.connection` untuk `disconnected`, `unavailable`, atau `state_change`. Saat jaringan Putus, tidak ada event subscription yang dipancarkan, sehingga `connectionStatus` tetap `"connected"` dan indikator tetap hijau “Realtime Aktif”.

Selain itu, jika channel sudah subscribed sebelum hook baru dipasang (mis. komponen mount belakangan pada singleton client), `pusher:subscription_succeeded` tidak dipancarkan ulang ke listener baru; status bisa tersangkut `"connecting"` meski koneksi sehat. `usePusherChannel` juga selalu mengembalikan `subscription: null`, dan `useRealtimeEvent` mengembalikan cleanup no-op.

**Perbaikan:** inisialisasi status dari `client.connection.state`, bind `state_change`/`disconnected`/`connected`, dan kembalikan channel/cleanup yang sebenarnya.

### R-09 — `/api/pusher/auth` tanpa rate limit dan batas body (Rendah)
**Lokasi:** `src/app/api/pusher/auth/route.ts:18-29,41-57,84-90`

Body JSON/form dibaca penuh sebelum validasi panjang. Tidak ada `consumeRateLimit` maupun batas `content-length`. Setiap request channel order/table melakukan query DB; penyerang dapat membanjiri endpoint dengan body besar atau kode acak. Otorisasi tetap benar, jadi ini masalah ketahanan, bukan bypass.

**Perbaikan:** batasi `content-length` (mis. 8 KB), rate limit per IP/socket/user, dan cache hasil lookup meja/order jangka pendek. Gunakan singleton Pusher, bukan `new Pusher` per request.

### R-10 — Urutan event tidak dijamin; `version` diabaikan klien (Rendah)
**Lokasi:** `src/server/services/orders.ts:145-150`; `src/app/order/[code]/order-tracking.tsx:79-83`; `src/lib/pusher-server.ts:63-68`

`after()` menjalankan callback berurutan, tetapi `emitToChannel` memulai HTTP trigger secara paralel tanpa menunggu. Dua transaksi status yang berdekatan dapat tiba tidak berurutan. Pelanggan memakai `payload.status` langsung untuk toast, sehingga toast lama bisa muncul setelah toast baru. Data tetap benar karena handler juga invalidasi dan mengambil ulang dari API.

**Perbaikan:** sertakan `version` (sudah ada) dan abaikan event dengan versi lebih kecil dari yang sudah dilihat; atau jangan tampilkan status dari payload—cukup invalidasi lalu baca status dari hasil query.

### R-11 — `stock.low` berulang dan toast tanpa nama (Informasi)
**Lokasi:** `src/server/services/stock.ts:123-125,308-317,402-411`; `src/app/api/public/orders/route.ts:248-256`; `src/components/admin/stock-manager.tsx:115-118`

`broadcastStock` mengirim `stock.low` pada **setiap** penyesuaian selama stok masih di bawah threshold, bukan hanya saat melewati batas. Checkout juga mengirim `stock.low` per item tanpa `name`, sehingga toast berbunyi “Ada stok menipis” tanpa nama produk. Pada operasi beruntun, admin menerima toast berulang.

**Perbaikan:** kirim hanya saat transisi dari `> threshold` ke `<= threshold`, sertakan `name` di semua payload, dan debounce toast.

### R-12 — Refund/koreksi tidak punya event yang aktif; layanan pembatalan pasca-bayar dead code (Informasi)
**Lokasi:** `src/server/services/finance.ts:494-536,542-620`

`cancelAcceptedOrder` sudah mengirim `order.status_changed`, `stock.changed`, dan `transaction.created` lewat `emitFinanceChange`, tetapi tidak ada route/UI yang memanggilnya (temuan K-11 audit logika bisnis). `recordRefundForOrder` tidak mengirim event sama sekali. Akibatnya `transaction.created` untuk pengeluaran/refund hanya berasal dari input keuangan manual; refund otomatis tidak akan pernah muncul realtime sampai fitur pembatalan diaktifkan.

**Perbaikan:** aktifkan route pembatalan + refund dan pastikan `emitFinanceChange` dipanggil setelah commit; atau hapus dead code agar tidak menyesatkan.

## 4. Yang Sudah Benar (diverifikasi)

1. **After commit** — `runInTransaction` menjalankan `after()` hanya setelah `prisma.$transaction` sukses, berurutan, dan error callback tidak menggagalkan request (`src/lib/tx.ts:48-63`). Diuji T-03(a–d); rollback membuang callback.
2. **Tidak ada emit di dalam transaksi** — seluruh pemanggilan `emitToChannel` di `src/server/services` dan route berada di dalam callback `after()`; tidak ditemukan `$transaction` mentah di service.
3. **Konstanta** — service dan komponen produksi memakai `CHANNELS`/`REALTIME_EVENTS`; auth memakai prefix dari `CHANNELS`; tidak ada string channel liar di kode server.
4. **Otorisasi channel** — 5 jenis channel diuji: kasir aktif, kasir nonaktif, `tokenVersion` lama, role admin, `private-user` milik orang lain, `private-order` dengan token salah, `private-table` nonaktif, dan tanpa sesi. Semua 403/200 sesuai (`tests/pusher-auth.test.ts`).
5. **Konstanta waktu token order** — perbandingan access token memakai `crypto.timingSafeEqual` dengan cek panjang (`src/lib/order-access.ts:27-32`).
6. **Unsubscribe/ref-count** — tiap hook membersihkan `unbind` dan menurunkan ref-count; StrictMode tidak menggandakan subscribe; tidak ada event ganda dalam satu tab.
7. **Klien sebagai invalidator** — handler utama memanggil `invalidateQueries`, bukan menyimpan payload sebagai sumber data. Penggunaan payload hanya untuk toast/highlight (sinyal UI).
8. **Kegagalan Pusher tidak menggagalkan request** — `emitToChannel` menangkap error sinkron dan `.catch` untuk promise; request tetap 2xx.
9. **Debounce dashboard admin** — 500 ms, timer dibersihkan saat unmount (`dashboard-manager.tsx:288-299`), sehingga lima event berbeda dalam satu gelombang become satu refetch.
10. **Payload kecil** — tidak ada base64, URL bukti bayar, access token order, atau password di payload; ukuran jauh di bawah 10 KB.

## 5. Inventaris Event (aktual)

| Peristiwa | Lokasi emit | Channel | Event | Setelah commit | Catatan |
|---|---|---|---|---|---|
| Checkout pesanan | `api/public/orders/route.ts:273-288` | cashier, admin | `order.created` | Ya | Tanpa `total`; membawa `tableToken`/`customerName` |
| Reservasi stok checkout | `api/public/orders/route.ts:240-246` | table pemesan | `stock.changed` | Ya | Tidak ke admin/meja lain; field `newStock` |
| Stok rendah checkout | `api/public/orders/route.ts:248-256` | admin | `stock.low` | Ya | Tanpa `name` |
| Upload bukti bayar | `server/services/orders.ts:271-291` | cashier, admin, order | `payment.uploaded`, `order.status_changed` | Ya | `attempt`, `paymentId`, `tableName` |
| Approve pembayaran | `server/services/cashier-orders.ts:314-328` | order, cashier, admin | `order.status_changed`, `transaction.created`, `kpi.updated` | Ya | `transaction.created` tanpa `id`/`type` |
| Reject pembayaran | `server/services/cashier-orders.ts:440-445` | order, cashier, admin | `order.status_changed`; `stock.changed` bila batal | Ya | Stok hanya ke meja |
| Progres pesanan | `server/services/cashier-orders.ts:506` | order, cashier, admin | `order.status_changed` | Ya | — |
| Customer batalkan | `server/services/orders.ts:350-353` | order, cashier, admin; table | `order.status_changed`, `stock.changed` | Ya | Stok hanya ke meja |
| Cron kedaluwarsa | `server/services/orders.ts:404-407` | order, cashier, admin; table | `order.status_changed`, `stock.changed` | Ya | Stok hanya ke meja |
| Admin batalkan + refund | `server/services/finance.ts:606-610` | order, cashier, admin; table; admin | status, stock, `transaction.created`, `kpi.updated` | Ya | Dead code—tidak ada route |
| Keuangan manual | `server/services/finance.ts:380,437,476` | admin | `transaction.created`, `kpi.updated` | Ya | `transaction.created` juga untuk update/delete |
| Penyesuaian stok | `server/services/stock.ts:308-317` | admin + semua meja aktif | `stock.changed`, `stock.low`, `kpi.updated` | Ya | Ini satu-satunya jalur yang menyebar ke semua meja |
| Pengaturan stok | `server/services/stock.ts:402-411` | admin + semua meja aktif | `stock.changed`, `stock.low`, `kpi.updated` | Ya | — |
| Kasir dinonaktifkan/reset/hapus | `server/services/cashiers.ts:203-206,241-244,284-287,306-309` | user, admin | `user.deactivated` | Ya | Admin UI tidak berlangganan |
| Produk/meja/pengaturan berubah | — | — | — | — | Tidak ada event (R-07) |
| Cetak pesanan | `server/services/cashier-orders.ts:514-549` | — | — | — | Tidak mengubah status; tidak perlu event |

## 6. Uji Manual (skenario)

### S-01 — Dua browser: kasir & customer (happy path)
1. Browser A login kasir; browser B buka menu meja, checkout 2 item tracked.
2. **Harapan:** A menampilkan toast “Pesanan baru dari …” + suara + baris baru <2 dtk; B status `AWAITING_PAYMENT`.
3. B upload bukti; A toast “Bukti bayar masuk …”. A approve; B status `ACCEPTED` tanpa reload.
4. A ubah `PREPARING → READY → COMPLETED`; B mengikuti tiap perubahan.
5. A reject dengan alasan; B melihat `PAYMENT_REJECTED` + alasan, bisa upload ulang; setelah percobaan habis B `CANCELLED` dan stok kembali.
**Prediksi:** lulus (event + polling 15/30 dtk).

### S-02 — Pusher down, internet tetap hidup
1. Buka dashboard admin A dan kasir B.
2. Blokir hanya domain Pusher di A dan B (DevTools request blocking).
3. Buat pesanan + approve dari browser C.
4. **Harapan:** B memulihkan dalam ≤15 dtk (polling); A memulihkan saat Pusher tersambung lagi (PRD 203).
5. **Aktual yang diperkirakan:** B pulih; **A tetap basi** (R-01); indikator A tetap hijau (R-08).
6. Buka halaman stok admin saat memblokir Pusher lalu checkout: stok tidak berubah walau online (R-02).

### S-03 — Jaringan penuh offline → online
1. Matikan network browser A (offline) 2 menit; buat pesanan dari B.
2. Online lagi; tunggu 30–60 dtk.
3. **Harapan:** React Query `refetchOnReconnect` (default) memuat ulang query aktif; kasir juga polling.
4. **Catatan:** ini **bukan** bukti R-01; R-01 khusus Pusher-only outage. Tetap verifikasi indikator: saat offline seharusnya “Terputus”, aktual kemungkinan masih “Realtime Aktif” (R-08).

### S-04 — Tutup/buka tab dan tab background
1. Tutup tab kasir saat pesanan masuk; buka lagi.
2. **Harapan:** data awal dimuat dari API, bukan dari event; pesanan terlihat.
3. Biarkan tab admin di background 30 menit (browser throttling), lalu aktifkan.
4. **Harapan:** data terbaru; **aktual:** tanpa polling/refetch fokus, data bisa basi sampai reload (R-01). Tab customer/kasir punya polling sehingga pulih.

### S-05 — Banyak tab dan StrictMode
1. Buka 5 tab kasir untuk akun yang sama; buat 1 pesanan.
2. **Harapan:** setiap tab menampilkan tepat **satu** toast/suara; tidak ada event diproses dua kali dalam satu tab.
3. Jalankan `npm run dev` (StrictMode), ulangi; cek tidak ada subscribe ganda/duplikat toast.
4. **Prediksi:** lulus karena ref-count + cleanup; jika ada duplikat, periksa `channelRefs`/cleanup.
5. Nonaktifkan kasir dari tab admin lain: semua tab kasir logout via `user.deactivated`; daftar kasir di tab admin **tidak** berubah sampai reload (R-07).

### S-06 — Ledakan pesanan & stok
1. Buat 20 pesanan dalam 1 menit dari beberapa meja.
2. Di Network tab kasir, hitung request `GET /api/cashier/orders`.
3. **Harapan:** ≤1 request per jendela debounce; **aktual:** beberapa per pesanan (R-05).
4. Buka `/admin/stock` + menu meja lain; checkout 1 pesanan 10 item.
5. **Harapan:** stok admin dan semua menu ter-update; **aktual:** hanya meja pemesan (R-02), dan 10+ trigger terpisah (R-05).

### S-07 — Otorisasi channel (negatif)
Uji dengan `curl`/Postman ke `/api/pusher/auth`:
- `private-admin` + cookie kasir → 403.
- `private-order-{code}` tanpa cookie/with token order lain → 403.
- `private-table-{token}` meja nonaktif → 403.
- `private-user-{id}` milik user lain → 403.
- Tanpa sesi + `private-cashier` → 403.
**Prediksi:** lulus (sudah otomatis di `tests/pusher-auth.test.ts`).

## 7. Perintah Verifikasi

```bash
npm run build
# sukses (Next.js 16.4.6)

npx tsx --env-file=.env.test --import dotenv/config --test \
  tests/realtime-commit.test.ts tests/pusher-auth.test.ts
# 15 tests, 15 pass, 0 fail

# audit statis emit/trigger
Select-String -Path src -Include *.ts,*.tsx -Recurse -Pattern 'emitToChannel|\.trigger\(|after\('
Select-String -Path src -Include *.ts,*.tsx -Recurse -Pattern 'private-|order\.created|payment\.uploaded'
```

## 8. Prioritas Perbaikan

1. **Segera:** R-01 (reconnect refetch + indikator) dan R-02 (stock.changed ke admin/semua meja).
2. **Sprint berikutnya:** R-03 (await/outbox durable), R-04 (kontrak payload + hapus `tableToken`), R-05 (debounce kasir + batch trigger).
3. **Backlog:** R-06–R-10; R-11 saat volume naik; R-12 sebelum fitur refund diaktifkan.
4. **Bersihkan:** halaman `realtime-test` yang tidak berfungsi atau ubah menjadi server action; perluas tes arsitektur T-03(e) agar memindai `.tsx` dan literal event.

## 9. Lampiran — Bukti dan Catatan

- `npm run build` sukses; route `/admin/settings/realtime-test` tetap terbangun.
- Chunk klien memuat modul `pusher-server` (string “Pusher environment variables not fully configured”); tidak ada nilai `PUSHER_SECRET`/`PUSHER_KEY` yang bocor ke bundle—hanya referensi `process.env`.
- Tidak ada perubahan kode aplikasi. Berkas yang dibuat: `AUDIT-REALTIME.md`. Berkas build sementara dihapus; artefak `.next/` diabaikan git.
- Temuan R-11/R-12 bersifat informasi dan tidak memerlukan perubahan mendesak.
