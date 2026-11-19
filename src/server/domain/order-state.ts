import type { OrderStatus } from "@prisma/client";

/** Status yang masih diproses kasir (bukan antrean verifikasi/riwayat). */
export const PROCESSING_STATUSES: OrderStatus[] = ["ACCEPTED", "PREPARING"];

/** Status akhir yang masuk riwayat kasir. */
export const HISTORY_STATUSES: OrderStatus[] = [
  "COMPLETED",
  "PAYMENT_REJECTED",
  "CANCELLED",
];

/** Status yang boleh dibatalkan pelanggan / diunggah ulang buktinya. */
export const CANCELLABLE_BY_CUSTOMER: OrderStatus[] = [
  "AWAITING_PAYMENT",
  "PAYMENT_REJECTED",
];

/** Status yang boleh dibatalkan admin (refund) setelah pembayaran. */
export const CANCELLABLE_BY_ADMIN: OrderStatus[] = [
  "ACCEPTED",
  "PREPARING",
  "READY",
  "COMPLETED",
];

/** Transisi maju yang diizinkan untuk kasir. */
export const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  ACCEPTED: "PREPARING",
  PREPARING: "READY",
  READY: "COMPLETED",
};

/** Status tujuan yang valid untuk endpoint progres kasir. */
export const PROGRESS_STATUSES = ["PREPARING", "READY", "COMPLETED"] as const;

export type ProgressStatus = (typeof PROGRESS_STATUSES)[number];

export function isProgressStatus(value: string): value is ProgressStatus {
  return (PROGRESS_STATUSES as readonly string[]).includes(value);
}

/** Guard transisi status; satu sumber kebenaran untuk service & tes. */
export function canAdvance(from: OrderStatus, to: OrderStatus): boolean {
  return NEXT_STATUS[from] === to;
}
