/**
 * Konstanta tipe event dan nama channel untuk sistem realtime.
 * Semua tipe disinkronkan dengan fitur Pusher di Step 9 PRD Bagian 6.
 */

// ============================================================
// Tipe event realtime (sinkron dengan pusher-client.ts)
// ============================================================

/** Semua event yang bisa dikirim melalui Pusher */
export type RealTimeEvent =
  | "order.created"
  | "payment.uploaded"
  | "order.status_changed"
  | "stock.changed"
  | "stock.low"
  | "transaction.created"
  | "kpi.updated"
  | "user.deactivated";

/** Nama channel private beserta pola penggunaannya */
export type ChannelName =
  // Role-based private channels
  | "private-cashier"
  | "private-admin"
  // Order-specific private channels
  | "private-order-{code}"
  // Table-specific private channels (token-based)
  | "private-table-{token}"
  // User-specific private channels (untuk logout paksa kasir)
  | "private-user-{id}";

// ============================================================
// Channel rules per PRD Bagian 6
// ============================================================

/**
 * Channel mapping: role/condition → channel name
 * - SUPER_ADMIN/CASHIER → private-cashier
 * - SUPER_ADMIN only → private-admin
 * - Order code → private-order-{code} (via auth token cookie)
 * - Table token → private-table-{token} (valid & active)
 * - User ID → private-user-{id} (only own user)
 */

// ============================================================
// Event ke channel mapping (opsional untuk referensi)
// ============================================================

/**
 * Contoh pemetaan event ke channel:
 * - order.created          → private-order-{orderCode} (pelanggan kasir lihat)
 * - payment.uploaded       → private-order-{orderCode} (kasi notifikasi ke kasir)
 * - order.status_changed   → private-order-{orderCode} (pelanggan + kasir)
 * - stock.changed          → private-table-{tableToken} (kasi update meja)
 * - stock.low              → private-admin (notifikasi admin stok)
 * - transaction.created    → private-cashier (kasir lihat transaksi baru)
 * - kpi.updated            → private-admin (dashboard admin)
 * - user.deactivated       → private-admin (kasir logout otomatis)
 */