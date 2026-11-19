/**
 * Konstanta tipe event dan nama channel untuk sistem realtime.
 * Semua tipe disinkronkan dengan fitur Pusher di Step 9 PRD Bagian 6.
 *
 * Nilai runtime (bukan hanya tipe) agar service/komponen tidak menulis
 * string literal dan rename channel aman (audit S-06).
 */

// ============================================================
// Event realtime
// ============================================================

export const REALTIME_EVENTS = {
  orderCreated: "order.created",
  paymentUploaded: "payment.uploaded",
  orderStatusChanged: "order.status_changed",
  stockChanged: "stock.changed",
  stockLow: "stock.low",
  transactionCreated: "transaction.created",
  kpiUpdated: "kpi.updated",
  userDeactivated: "user.deactivated",
} as const;

/** Semua event yang bisa dikirim melalui Pusher */
export type RealTimeEvent =
  (typeof REALTIME_EVENTS)[keyof typeof REALTIME_EVENTS];

// ============================================================
// Channel
// ============================================================

export const CHANNELS = {
  cashier: "private-cashier",
  admin: "private-admin",
  order: (code: string) => `private-order-${code}`,
  table: (token: string) => `private-table-${token}`,
  user: (id: string) => `private-user-${id}`,
  orderPrefix: "private-order-",
  tablePrefix: "private-table-",
  userPrefix: "private-user-",
} as const;

/** Nama channel private beserta pola penggunaannya */
export type ChannelName =
  | typeof CHANNELS.cashier
  | typeof CHANNELS.admin
  | `private-order-${string}`
  | `private-table-${string}`
  | `private-user-${string}`;

// ============================================================
// Channel rules per PRD Bagian 6
// ============================================================

/**
 * Channel mapping: role/condition -> channel name
 * - SUPER_ADMIN/CASHIER -> private-cashier
 * - SUPER_ADMIN only -> private-admin
 * - Order code -> private-order-{code} (via auth token cookie)
 * - Table token -> private-table-{token} (valid & active)
 * - User ID -> private-user-{id} (only own user)
 */

/**
 * Pemetaan event ke channel:
 * - order.created        -> private-order-{orderCode} + private-cashier/admin
 * - payment.uploaded     -> private-order-{orderCode} + private-cashier/admin
 * - order.status_changed -> private-order-{orderCode} + private-cashier/admin
 * - stock.changed        -> private-table-{tableToken} + private-admin
 * - stock.low            -> private-admin
 * - transaction.created  -> private-cashier/admin
 * - kpi.updated          -> private-admin
 * - user.deactivated     -> private-user-{id} + private-admin
 */
