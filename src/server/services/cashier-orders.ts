import { CHANNELS, REALTIME_EVENTS } from "@/lib/realtime-events";
import { OrderStatus, PaymentStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { emitToChannel } from "@/lib/pusher-server";
import { runInTransaction } from "@/lib/tx";
import { getSettings } from "@/server/services/settings";
import {
  emitOrderStatus,
  emitStockChanges,
} from "@/server/services/orders";
import { releaseStock } from "@/server/services/stock";
import {
  HISTORY_STATUSES,
  PROCESSING_STATUSES,
  canAdvance,
  isProgressStatus,
} from "@/server/domain/order-state";

export interface CashierOrderListItem {
  id: string;
  code: string;
  status: OrderStatus;
  tableName: string;
  customerName: string | null;
  itemCount: number;
  total: number;
  createdAt: string;
  updatedAt: string;
}

export interface CashierQueue {
  verification: CashierOrderListItem[];
  processing: CashierOrderListItem[];
  ready: CashierOrderListItem[];
  history: CashierOrderListItem[];
  counts: {
    verification: number;
    processing: number;
    ready: number;
    history: number;
  };
}

export interface CashierPaymentItem {
  id: string;
  attempt: number;
  status: PaymentStatus;
  rejectReason: string | null;
  createdAt: string;
  verifiedAt: string | null;
  verifiedByName: string | null;
}

export interface CashierOrderDetail {
  id: string;
  code: string;
  status: OrderStatus;
  tableName: string;
  customerName: string | null;
  note: string | null;
  subtotal: number;
  total: number;
  createdAt: string;
  expiresAt: string;
  printedAt: string | null;
  printCount: number;
  items: Array<{
    id: string;
    name: string;
    price: number;
    quantity: number;
    note: string | null;
  }>;
  payments: CashierPaymentItem[];
}

const listSelect = {
  id: true,
  code: true,
  status: true,
  customerName: true,
  total: true,
  createdAt: true,
  updatedAt: true,
  table: { select: { name: true } },
  _count: { select: { items: true } },
} satisfies Prisma.OrderSelect;

function toListItem(
  order: Prisma.OrderGetPayload<{ select: typeof listSelect }>
): CashierOrderListItem {
  return {
    id: order.id,
    code: order.code,
    status: order.status,
    tableName: order.table.name,
    customerName: order.customerName,
    itemCount: order._count.items,
    total: order.total,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}

/**
 * Antrean kasir: verifikasi (terlama dulu), diproses, siap, dan riwayat.
 */
export async function listCashierOrders(): Promise<CashierQueue> {
  const [verification, processing, ready, history, historyCount] = await Promise.all([
    prisma.order.findMany({
      where: { status: "AWAITING_VERIFICATION" },
      orderBy: { createdAt: "asc" },
      select: listSelect,
    }),
    prisma.order.findMany({
      where: { status: { in: PROCESSING_STATUSES } },
      orderBy: { updatedAt: "asc" },
      select: listSelect,
    }),
    prisma.order.findMany({
      where: { status: "READY" },
      orderBy: { updatedAt: "asc" },
      select: listSelect,
    }),
    prisma.order.findMany({
      where: { status: { in: HISTORY_STATUSES } },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: listSelect,
    }),
    prisma.order.count({ where: { status: { in: HISTORY_STATUSES } } }),
  ]);

  return {
    verification: verification.map(toListItem),
    processing: processing.map(toListItem),
    ready: ready.map(toListItem),
    history: history.map(toListItem),
    counts: {
      verification: verification.length,
      processing: processing.length,
      ready: ready.length,
      history: historyCount,
    },
  };
}

export async function getCashierOrder(id: string): Promise<CashierOrderDetail> {
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      table: { select: { name: true } },
      items: true,
      payments: {
        orderBy: { createdAt: "desc" },
        include: { verifiedBy: { select: { name: true } } },
      },
    },
  });

  if (!order) {
    throw new AppError("NOT_FOUND", "Pesanan tidak ditemukan", 404);
  }

  return {
    id: order.id,
    code: order.code,
    status: order.status,
    tableName: order.table.name,
    customerName: order.customerName,
    note: order.note,
    subtotal: order.subtotal,
    total: order.total,
    createdAt: order.createdAt.toISOString(),
    expiresAt: order.expiresAt.toISOString(),
    printedAt: order.printedAt?.toISOString() ?? null,
    printCount: order.printCount,
    items: order.items.map((item) => ({
      id: item.id,
      name: item.nameSnapshot,
      price: item.priceSnapshot,
      quantity: item.quantity,
      note: item.note,
    })),
    payments: order.payments.map((payment) => ({
      id: payment.id,
      attempt: payment.attempt,
      status: payment.status,
      rejectReason: payment.rejectReason,
      createdAt: payment.createdAt.toISOString(),
      verifiedAt: payment.verifiedAt?.toISOString() ?? null,
      verifiedByName: payment.verifiedBy?.name ?? null,
    })),
  };
}

export async function getPaymentProofKey(
  orderId: string,
  paymentId?: string
): Promise<string> {
  const payment = await prisma.payment.findFirst({
    where: { orderId, ...(paymentId ? { id: paymentId } : {}) },
    orderBy: { createdAt: "desc" },
    select: { proofKey: true },
  });

  if (!payment) {
    throw new AppError("NOT_FOUND", "Bukti pembayaran tidak ditemukan", 404);
  }

  return payment.proofKey;
}

export interface ApproveResult {
  code: string;
  status: OrderStatus;
  version: number;
  total: number;
}

/**
 * Setujui pembayaran. Optimistic lock pada Order.version menjamin hanya
 * satu kasir yang berhasil walaupun dua permintaan datang bersamaan.
 */
export async function approvePayment(
  orderId: string,
  userId: string
): Promise<ApproveResult> {
  const result = await runInTransaction(async (tx, after) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: {
        payments: {
          where: { status: "PENDING" },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!order) {
      throw new AppError("NOT_FOUND", "Pesanan tidak ditemukan", 404);
    }
    if (order.status !== "AWAITING_VERIFICATION") {
      throw new AppError(
        "ALREADY_PROCESSED",
        "Pesanan sudah diproses kasir lain",
        409
      );
    }
    if (!order.payments[0]) {
      throw new AppError(
        "CONFLICT",
        "Tidak ada bukti pembayaran yang menunggu verifikasi",
        409
      );
    }

    const now = new Date();
    const updated = await tx.order.updateMany({
      where: {
        id: order.id,
        version: order.version,
        status: "AWAITING_VERIFICATION",
      },
      data: { status: "ACCEPTED", version: { increment: 1 } },
    });

    if (updated.count === 0) {
      throw new AppError(
        "ALREADY_PROCESSED",
        "Pesanan sudah diproses kasir lain",
        409
      );
    }

    await tx.payment.updateMany({
      where: { orderId: order.id, status: "PENDING" },
      data: {
        status: "APPROVED",
        verifiedById: userId,
        verifiedAt: now,
        rejectReason: null,
      },
    });

    await tx.transaction.upsert({
      where: {
        orderId_category: { orderId: order.id, category: "Penjualan" },
      },
      update: {},
      create: {
        orderId: order.id,
        type: "INCOME",
        category: "Penjualan",
        amount: order.total,
        note: `Pembayaran ${order.code}`,
        createdById: userId,
        occurredAt: now,
      },
    });

    await tx.auditLog.create({
      data: {
        userId,
        action: "payment.approve",
        entity: "Order",
        entityId: order.id,
        meta: { code: order.code, total: order.total },
      },
    });

    after(() => {
      emitOrderStatus(order.code, "ACCEPTED", order.version + 1);
      emitToChannel(CHANNELS.cashier, REALTIME_EVENTS.transactionCreated, {
        orderCode: order.code,
        amount: order.total,
      });
      emitToChannel(CHANNELS.admin, REALTIME_EVENTS.transactionCreated, {
        orderCode: order.code,
        amount: order.total,
      });
      emitToChannel(CHANNELS.admin, REALTIME_EVENTS.kpiUpdated, {
        orderCode: order.code,
        amount: order.total,
      });
    });

    return {
      code: order.code,
      total: order.total,
      version: order.version + 1,
    };
  });

  return { ...result, status: "ACCEPTED" };
}

export interface RejectResult {
  code: string;
  status: OrderStatus;
  version: number;
  cancelled: boolean;
}

/**
 * Tolak bukti pembayaran. Bila percobaan sudah mencapai batas, pesanan
 * dibatalkan dan stok dikembalikan dalam transaksi yang sama.
 */
export async function rejectPayment(
  orderId: string,
  userId: string,
  reason: string
): Promise<RejectResult> {
  const cleanReason = reason.trim();
  if (!cleanReason) {
    throw new AppError("VALIDATION_ERROR", "Alasan penolakan wajib diisi", 400);
  }
  if (cleanReason.length > 500) {
    throw new AppError("VALIDATION_ERROR", "Alasan penolakan maksimal 500 karakter", 400);
  }

  const settings = await getSettings();

  const result = await runInTransaction(async (tx, after) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: {
        table: { select: { token: true } },
        payments: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });

    if (!order) {
      throw new AppError("NOT_FOUND", "Pesanan tidak ditemukan", 404);
    }
    if (order.status !== "AWAITING_VERIFICATION") {
      throw new AppError(
        "ALREADY_PROCESSED",
        "Pesanan sudah diproses kasir lain",
        409
      );
    }

    const latest = order.payments[0];
    if (!latest || latest.status !== "PENDING") {
      throw new AppError(
        "CONFLICT",
        "Tidak ada bukti pembayaran yang menunggu verifikasi",
        409
      );
    }

    const cancelled = latest.attempt >= settings.maksUploadUlang;
    const nextStatus: OrderStatus = cancelled ? "CANCELLED" : "PAYMENT_REJECTED";
    const now = new Date();

    const updated = await tx.order.updateMany({
      where: {
        id: order.id,
        version: order.version,
        status: "AWAITING_VERIFICATION",
      },
      data: { status: nextStatus, version: { increment: 1 } },
    });

    if (updated.count === 0) {
      throw new AppError(
        "ALREADY_PROCESSED",
        "Pesanan sudah diproses kasir lain",
        409
      );
    }

    await tx.payment.update({
      where: { id: latest.id },
      data: {
        status: "REJECTED",
        rejectReason: cleanReason,
        verifiedById: userId,
        verifiedAt: now,
      },
    });

    await tx.auditLog.create({
      data: {
        userId,
        action: cancelled ? "payment.reject.cancel" : "payment.reject",
        entity: "Order",
        entityId: order.id,
        meta: { code: order.code, reason: cleanReason, attempt: latest.attempt },
      },
    });

    const changes = cancelled
      ? await releaseStock(tx, order.id, order.code)
      : [];

    after(() => {
      emitOrderStatus(order.code, nextStatus, order.version + 1);
      if (cancelled) {
        emitStockChanges(order.table.token, order.code, changes);
      }
    });

    return {
      code: order.code,
      status: nextStatus,
      version: order.version + 1,
      cancelled,
    };
  });

  return result;
}

export type { ProgressStatus } from "@/server/domain/order-state";

export async function advanceOrderStatus(
  orderId: string,
  userId: string,
  next: string
): Promise<{ code: string; status: OrderStatus; version: number }> {
  if (!isProgressStatus(next)) {
    throw new AppError("VALIDATION_ERROR", "Status tujuan tidak valid", 400);
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, code: true, status: true, version: true },
  });

  if (!order) {
    throw new AppError("NOT_FOUND", "Pesanan tidak ditemukan", 404);
  }

  if (!canAdvance(order.status, next)) {
    throw new AppError(
      "INVALID_TRANSITION",
      `Tidak dapat mengubah status dari ${order.status} ke ${next}`,
      409
    );
  }

  const updated = await runInTransaction(async (tx, after) => {
    const result = await tx.order.updateMany({
      where: { id: order.id, version: order.version, status: order.status },
      data: { status: next, version: { increment: 1 } },
    });

    if (result.count === 0) {
      throw new AppError("CONFLICT", "Status pesanan sudah berubah", 409);
    }

    await tx.auditLog.create({
      data: {
        userId,
        action: "order.status_change",
        entity: "Order",
        entityId: order.id,
        meta: { code: order.code, from: order.status, to: next },
      },
    });

    after(() => emitOrderStatus(order.code, next, order.version + 1));

    return order.version + 1;
  });

  return { code: order.code, status: next, version: updated };
}

export async function markOrderPrinted(
  orderId: string,
  userId: string
): Promise<{ printCount: number; printedAt: string }> {
  const printedAt = new Date();

  const updated = await runInTransaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: { id: true, code: true },
    });
    if (!order) {
      throw new AppError("NOT_FOUND", "Pesanan tidak ditemukan", 404);
    }

    const saved = await tx.order.update({
      where: { id: orderId },
      data: { printedAt, printCount: { increment: 1 } },
      select: { printCount: true },
    });

    await tx.auditLog.create({
      data: {
        userId,
        action: "order.print",
        entity: "Order",
        entityId: order.id,
        meta: { code: order.code, printCount: saved.printCount },
      },
    });

    return saved;
  });

  return { printCount: updated.printCount, printedAt: printedAt.toISOString() };
}
