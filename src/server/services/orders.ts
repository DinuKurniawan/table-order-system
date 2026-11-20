import { CHANNELS, REALTIME_EVENTS } from "@/lib/realtime-events";
import { OrderStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { env } from "@/lib/env";
import { deleteObject } from "@/lib/r2";
import { emitToChannel } from "@/lib/pusher-server";
import { runInTransaction } from "@/lib/tx";
import { accessTokenMatches } from "@/lib/order-token";
import { getSettings } from "@/server/services/settings";
import { CANCELLABLE_BY_CUSTOMER } from "@/server/domain/order-state";
import { releaseStock, type StockChange } from "@/server/services/stock";
import {
  listPaymentMethods,
  type PaymentMethodDTO,
} from "@/server/services/payment-methods";
import { processAndStore } from "@/server/services/upload";



export interface CustomerPaymentDTO {
  attempt: number;
  status: "PENDING" | "APPROVED" | "REJECTED";
  rejectReason: string | null;
  createdAt: string;
}

export interface CustomerOrderDTO {
  code: string;
  status: OrderStatus;
  customerName: string | null;
  note: string | null;
  tableName: string;
  subtotal: number;
  total: number;
  expiresAt: string;
  createdAt: string;
  version: number;
  cafeName: string;
  items: Array<{
    id: string;
    name: string;
    price: number;
    quantity: number;
    note: string | null;
  }>;
  latestPayment: CustomerPaymentDTO | null;
  attemptsUsed: number;
  maxAttempts: number;
  isExpired: boolean;
  canUpload: boolean;
  canCancel: boolean;
  paymentMethods: PaymentMethodDTO[];
}

type OrderWithAccess = Prisma.OrderGetPayload<{
  include: {
    table: { select: { name: true; token: true } };
    items: true;
    payments: true;
  };
}>;

async function loadOrderWithAccess(code: string, token: string): Promise<OrderWithAccess> {
  const order = await prisma.order.findUnique({
    where: { code },
    include: {
      table: { select: { name: true, token: true } },
      items: true,
      payments: { orderBy: { createdAt: "desc" } },
    },
  });

  // SEC-06: kode tidak ada dan token salah/kosong tidak dibedakan.
  if (!order || !accessTokenMatches(token, order)) {
    throw new AppError("NOT_FOUND", "Pesanan tidak ditemukan", 404);
  }

  return order;
}

/**
 * Data pesanan untuk halaman lacak customer.
 */
export async function getCustomerOrder(
  code: string,
  token: string
): Promise<CustomerOrderDTO> {
  const order = await loadOrderWithAccess(code, token);
  const [settings, methods] = await Promise.all([
    getSettings(),
    listPaymentMethods(),
  ]);

  const maxAttempts = settings.maksUploadUlang;
  const latest = order.payments[0] ?? null;
  const attemptsUsed = latest?.attempt ?? 0;
  const isExpired =
    order.expiresAt.getTime() <= Date.now() &&
    CANCELLABLE_BY_CUSTOMER.includes(order.status);
  const canUpload =
    CANCELLABLE_BY_CUSTOMER.includes(order.status) &&
    !isExpired &&
    attemptsUsed < maxAttempts;

  return {
    code: order.code,
    status: order.status,
    customerName: order.customerName,
    note: order.note,
    tableName: order.table.name,
    subtotal: order.subtotal,
    total: order.total,
    expiresAt: order.expiresAt.toISOString(),
    createdAt: order.createdAt.toISOString(),
    version: order.version,
    cafeName: settings.namaKafe,
    items: order.items.map((item) => ({
      id: item.id,
      name: item.nameSnapshot,
      price: item.priceSnapshot,
      quantity: item.quantity,
      note: item.note,
    })),
    latestPayment: latest
      ? {
          attempt: latest.attempt,
          status: latest.status,
          rejectReason: latest.rejectReason,
          createdAt: latest.createdAt.toISOString(),
        }
      : null,
    attemptsUsed,
    maxAttempts,
    isExpired,
    canUpload,
    canCancel: order.status === "AWAITING_PAYMENT",
    paymentMethods: methods.filter((method) => method.isActive),
  };
}

export function emitOrderStatus(code: string, status: OrderStatus, version: number): void {
  const payload = { orderCode: code, status, version };
  emitToChannel(CHANNELS.order(code), REALTIME_EVENTS.orderStatusChanged, payload);
  emitToChannel(CHANNELS.cashier, REALTIME_EVENTS.orderStatusChanged, payload);
  emitToChannel(CHANNELS.admin, REALTIME_EVENTS.orderStatusChanged, payload);
}

export function emitStockChanges(
  tableToken: string,
  orderCode: string,
  changes: StockChange[]
): void {
  for (const change of changes) {
    emitToChannel(CHANNELS.table(tableToken), REALTIME_EVENTS.stockChanged, {
      ...change,
      orderCode,
    });
  }
}

export interface UploadProofResult {
  paymentId: string;
  attempt: number;
  status: OrderStatus;
}

/**
 * Unggah bukti pembayaran customer.
 * Aturan: status harus AWAITING_PAYMENT / PAYMENT_REJECTED, belum kedaluwarsa,
 * dan jumlah percobaan belum melewati maksUploadUlang.
 */
export async function submitPaymentProof(
  code: string,
  token: string,
  file: Buffer
): Promise<UploadProofResult> {
  const order = await loadOrderWithAccess(code, token);
  const settings = await getSettings();
  const maxAttempts = settings.maksUploadUlang;

  if (!CANCELLABLE_BY_CUSTOMER.includes(order.status)) {
    throw new AppError(
      "CONFLICT",
      "Bukti pembayaran tidak dapat diunggah pada status pesanan ini",
      409
    );
  }

  if (order.expiresAt.getTime() <= Date.now()) {
    await expireOrders();
    throw new AppError(
      "ORDER_EXPIRED",
      "Waktu pembayaran telah habis. Pesanan dibatalkan.",
      409
    );
  }

  if ((order.payments[0]?.attempt ?? 0) >= maxAttempts) {
    throw new AppError(
      "CONFLICT",
      "Batas unggah ulang bukti pembayaran telah tercapai",
      409
    );
  }

  const stored = await processAndStore({
    file,
    preset: "proof",
    bucket: "private",
    prefix: `proofs/${code}`,
  });

  try {
    const result = await runInTransaction(async (tx, after) => {
      const current = await tx.order.findUnique({
        where: { code },
        include: { payments: { orderBy: { createdAt: "desc" }, take: 1 } },
      });

      if (!current) {
        throw new AppError("NOT_FOUND", "Pesanan tidak ditemukan", 404);
      }
      if (!CANCELLABLE_BY_CUSTOMER.includes(current.status)) {
        throw new AppError("CONFLICT", "Status pesanan sudah berubah", 409);
      }

      const attempt = (current.payments[0]?.attempt ?? 0) + 1;
      if (attempt > maxAttempts) {
        throw new AppError(
          "CONFLICT",
          "Batas unggah ulang bukti pembayaran telah tercapai",
          409
        );
      }

      const updated = await tx.order.updateMany({
        where: { id: current.id, version: current.version, status: { in: CANCELLABLE_BY_CUSTOMER } },
        data: { status: "AWAITING_VERIFICATION", version: { increment: 1 } },
      });

      if (updated.count === 0) {
        throw new AppError(
          "CONFLICT",
          "Pesanan sedang diproses. Silakan muat ulang halaman.",
          409
        );
      }

      const payment = await tx.payment.create({
        data: {
          orderId: current.id,
          attempt,
          proofKey: stored.key,
          status: "PENDING",
        },
      });

      await tx.auditLog.create({
        data: {
          action: "payment.upload",
          entity: "Order",
          entityId: current.id,
          meta: { code: current.code, attempt, total: current.total },
        },
      });

      after(() => {
        emitToChannel(CHANNELS.cashier, REALTIME_EVENTS.paymentUploaded, {
          orderCode: code,
          orderId: current.id,
          paymentId: payment.id,
          attempt,
          tableName: order.table.name,
        });
        emitToChannel(CHANNELS.admin, REALTIME_EVENTS.paymentUploaded, {
          orderCode: code,
          orderId: current.id,
          paymentId: payment.id,
          attempt,
          tableName: order.table.name,
        });
        emitToChannel(CHANNELS.order(code), REALTIME_EVENTS.paymentUploaded, {
          orderCode: code,
          attempt,
        });
        emitOrderStatus(code, "AWAITING_VERIFICATION", current.version + 1);
      });

      return {
        paymentId: payment.id,
        orderId: current.id,
        attempt,
        version: current.version + 1,
      };
    });

    return {
      paymentId: result.paymentId,
      attempt: result.attempt,
      status: "AWAITING_VERIFICATION",
    };
  } catch (err) {
    // Jangan tinggalkan bukti bayar yatim di bucket privat.
    try {
      await deleteObject(env.R2_BUCKET_PRIVATE, stored.key);
    } catch {
      // abaikan kegagalan pembersihan
    }
    throw err;
  }
}

/**
 * Customer membatalkan pesanan (hanya saat AWAITING_PAYMENT). Stok dikembalikan.
 */
export async function cancelOrderByCustomer(
  code: string,
  token: string
): Promise<void> {
  const order = await loadOrderWithAccess(code, token);

  if (order.status !== "AWAITING_PAYMENT") {
    throw new AppError(
      "CONFLICT",
      "Pesanan tidak dapat dibatalkan pada status ini",
      409
    );
  }

  const changes = await runInTransaction(async (tx, after) => {
    const updated = await tx.order.updateMany({
      where: { id: order.id, status: "AWAITING_PAYMENT", version: order.version },
      data: { status: "CANCELLED", version: { increment: 1 } },
    });
    if (updated.count === 0) return null;
    await tx.auditLog.create({
      data: {
        action: "order.cancel.customer",
        entity: "Order",
        entityId: order.id,
        meta: { code, total: order.total },
      },
    });
    const released = await releaseStock(tx, order.id, code);

    after(() => {
      emitOrderStatus(code, "CANCELLED", order.version + 1);
      emitStockChanges(order.table.token, code, released);
    });

    return released;
  });

  if (changes === null) {
    throw new AppError("CONFLICT", "Status pesanan sudah berubah", 409);
  }
}

/**
 * Batalkan pesanan AWAITING_PAYMENT / PAYMENT_REJECTED yang melewati expiresAt.
 * Idempoten: transisi status atomik memastikan stok hanya dikembalikan sekali.
 */
export async function expireOrders(
  now: Date = new Date()
): Promise<{ cancelled: number }> {
  const candidates = await prisma.order.findMany({
    where: { status: { in: CANCELLABLE_BY_CUSTOMER }, expiresAt: { lte: now } },
    select: {
      id: true,
      code: true,
      version: true,
      table: { select: { token: true } },
    },
  });

  let cancelled = 0;

  for (const order of candidates) {
    const changes = await runInTransaction(async (tx, after) => {
      const updated = await tx.order.updateMany({
        where: {
          id: order.id,
          status: { in: CANCELLABLE_BY_CUSTOMER },
          expiresAt: { lte: now },
          version: order.version,
        },
        data: { status: "CANCELLED", version: { increment: 1 } },
      });
      if (updated.count === 0) return null;
      await tx.auditLog.create({
        data: {
          action: "order.expire",
          entity: "Order",
          entityId: order.id,
          meta: { code: order.code },
        },
      });
      const released = await releaseStock(tx, order.id, order.code);

      after(() => {
        emitOrderStatus(order.code, "CANCELLED", order.version + 1);
        emitStockChanges(order.table.token, order.code, released);
      });

      return released;
    });

    if (changes === null) continue;

    cancelled += 1;
  }

  return { cancelled };
}
