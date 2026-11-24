import "server-only";
import { CHANNELS, REALTIME_EVENTS } from "@/lib/realtime-events";
import { OrderStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { env } from "@/lib/env";
import { deleteObject, headObject } from "@/lib/r2";
import { isUploadedKey } from "@/lib/upload-key";
import { emitToChannel } from "@/lib/pusher-server";
import { runInTransaction } from "@/lib/tx";
import { accessTokenMatches } from "@/lib/order-token";
import { getSettings } from "@/server/services/settings";
import { CANCELLABLE_BY_CUSTOMER } from "@/server/domain/order-state";
import { releaseStock, type StockChange } from "@/server/services/stock";
import { releaseVoucherForOrder } from "@/server/services/vouchers";
import {
  listPaymentMethods,
  type PaymentMethodDTO,
} from "@/server/services/payment-methods";
import { buildDynamicQris } from "@/lib/qris";
import QRCode from "qrcode";
import {
  createImageUploadUrls,
  MAX_UPLOAD_BYTES,
} from "@/server/services/upload";



export interface CustomerPaymentDTO {
  attempt: number;
  status: "PENDING" | "APPROVED" | "REJECTED";
  method: "QRIS" | "BANK" | null;
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
  discount: number;
  voucherCode: string | null;
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
  paymentMethods: Array<Omit<PaymentMethodDTO, "qrisPayload">>;
  qris: { methodId: string; dataUrl: string } | null;
}

type OrderWithAccess = Prisma.OrderGetPayload<{
  include: {
    table: { select: { name: true; token: true } };
    items: true;
    payments: true;
  };
}>;

async function loadOrderWithAccess(
  code: string,
  token: string | null | undefined
): Promise<OrderWithAccess> {
  const order = await prisma.order.findUnique({
    where: { code },
    include: {
      table: { select: { name: true, token: true } },
      items: true,
      payments: { orderBy: { createdAt: "desc" } },
    },
  });

  // SEC-06: kode tidak ada dan token salah/kosong tidak dibedakan.
  if (!token || !order || !accessTokenMatches(token, order)) {
    throw new AppError("NOT_FOUND", "Pesanan tidak ditemukan", 404);
  }

  return order;
}

/**
 * Data pesanan untuk halaman lacak customer.
 */
const QR_OPTIONS = {
  errorCorrectionLevel: "M",
  margin: 1,
  width: 480,
} as const;

/**
 * QR dinamis dari payload statis metode bayar aktif. Nominal selalu dari
 * order.total di server; payload mentah tidak pernah dikirim ke customer.
 */
async function getDynamicQris(
  total: number
): Promise<CustomerOrderDTO["qris"]> {
  const method = await prisma.paymentMethod.findFirst({
    where: { kind: "QRIS", isActive: true, qrisPayload: { not: null } },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    select: { id: true, qrisPayload: true },
  });
  if (!method?.qrisPayload) return null;

  try {
    const payload = buildDynamicQris(method.qrisPayload, total);
    const dataUrl = await QRCode.toDataURL(payload, { ...QR_OPTIONS });
    return { methodId: method.id, dataUrl };
  } catch (err) {
    console.warn("Payload QRIS metode bayar tidak valid:", method.id, err);
    return null;
  }
}

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
  const qris = canUpload ? await getDynamicQris(order.total) : null;

  return {
    code: order.code,
    status: order.status,
    customerName: order.customerName,
    note: order.note,
    tableName: order.table.name,
    subtotal: order.subtotal,
    discount: order.discount,
    voucherCode: order.voucherCode,
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
          method:
            latest.method === "QRIS"
              ? "QRIS"
              : latest.method === "BANK"
                ? "BANK"
                : null,
          rejectReason: latest.rejectReason,
          createdAt: latest.createdAt.toISOString(),
        }
      : null,
    attemptsUsed,
    maxAttempts,
    isExpired,
    canUpload,
    canCancel: order.status === "AWAITING_PAYMENT",
    paymentMethods: methods
      .filter((method) => method.isActive)
      .map((method) => ({
        id: method.id,
        kind: method.kind,
        label: method.label,
        accountNo: method.accountNo,
        accountName: method.accountName,
        imageKey: method.imageKey,
        imageUrl: method.imageUrl,
        isActive: method.isActive,
        sortOrder: method.sortOrder,
      })),
    qris,
  };
}

export interface TrackedOrderDTO {
  code: string;
  status: OrderStatus;
  createdAt: string;
  expiresAt: string;
}

/**
 * Lacak pesanan publik tanpa access token: nama pemesan + nomor meja,
 * dibatasi ke jendela waktu pendek oleh pemanggil. Hanya field status yang
 * boleh keluar; item, total, pembayaran, dan catatan tidak pernah di-select.
 */
export async function trackOrdersByCustomer(input: {
  name: string;
  tableName: string;
  since: Date;
}): Promise<TrackedOrderDTO[]> {
  const orders = await prisma.order.findMany({
    where: {
      customerName: { equals: input.name, mode: "insensitive" },
      table: { name: { equals: input.tableName, mode: "insensitive" } },
      createdAt: { gte: input.since },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      code: true,
      status: true,
      createdAt: true,
      expiresAt: true,
    },
  });

  return orders.map((order) => ({
    code: order.code,
    status: order.status,
    createdAt: order.createdAt.toISOString(),
    expiresAt: order.expiresAt.toISOString(),
  }));
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

async function assertProofUploadAllowed(code: string, token: string) {
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

  return { order, maxAttempts };
}

/**
 * Membuat presigned URL bukti pembayaran. Browser mengunggah langsung ke R2.
 */
export async function createPaymentProofUpload(
  code: string,
  token: string,
  input: { contentType: string; size: number }
) {
  const { order } = await assertProofUploadAllowed(code, token);

  return createImageUploadUrls({
    preset: "proof",
    bucket: "private",
    prefix: `proofs/${order.code}`,
    contentType: input.contentType,
    size: input.size,
  });
}

/**
 * Menyimpan bukti pembayaran customer yang sudah diunggah langsung ke R2.
 * Objek diverifikasi keberadaan, tipe, dan ukurannya sebelum dicatat.
 */
export async function submitPaymentProof(
  code: string,
  token: string,
  proofKey: string
): Promise<UploadProofResult> {
  const { order, maxAttempts } = await assertProofUploadAllowed(code, token);

  const prefix = `proofs/${order.code}`;
  if (!isUploadedKey(proofKey, prefix, "main")) {
    throw new AppError("VALIDATION_ERROR", "Key bukti pembayaran tidak valid", 400);
  }

  const object = await headObject(env.R2_BUCKET_PRIVATE, proofKey);
  if (!object || object.contentLength <= 0) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Bukti pembayaran belum diunggah ke penyimpanan",
      400
    );
  }
  if (
    object.contentLength > MAX_UPLOAD_BYTES ||
    !["image/webp", "image/jpeg"].includes(object.contentType)
  ) {
    throw new AppError("VALIDATION_ERROR", "Berkas bukti pembayaran tidak valid", 400);
  }

  const used = await prisma.payment.findFirst({
    where: { proofKey },
    select: { id: true },
  });
  if (used) {
    throw new AppError("CONFLICT", "Bukti pembayaran ini sudah digunakan", 409);
  }

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
          method: "BANK",
          proofKey,
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
      await deleteObject(env.R2_BUCKET_PRIVATE, proofKey);
    } catch {
      // abaikan kegagalan pembersihan
    }
    throw err;
  }
}

/**
 * Customer mengklaim sudah membayar QRIS. Tidak ada bukti yang diunggah;
 * kasir tetap memverifikasi mutasi sebelum menyetujui.
 */
export async function claimQrisPayment(
  code: string,
  token: string
): Promise<UploadProofResult> {
  const { order, maxAttempts } = await assertProofUploadAllowed(code, token);

  const method = await prisma.paymentMethod.findFirst({
    where: {
      kind: "QRIS",
      isActive: true,
      // QRIS statis boleh hanya berupa gambar; payload hanya dipakai untuk
      // QR dinamis. Minimal salah satu instruksi harus ada.
      OR: [{ qrisPayload: { not: null } }, { imageKey: { not: null } }],
    },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    select: { id: true, qrisPayload: true },
  });
  if (!method) {
    throw new AppError("CONFLICT", "Pembayaran QRIS belum tersedia", 409);
  }
  if (method.qrisPayload) {
    try {
      buildDynamicQris(method.qrisPayload, order.total);
    } catch {
      throw new AppError(
        "CONFLICT",
        "Payload QRIS tidak valid. Hubungi admin.",
        409
      );
    }
  }

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
    if (current.expiresAt.getTime() <= Date.now()) {
      throw new AppError(
        "ORDER_EXPIRED",
        "Waktu pembayaran telah habis. Pesanan dibatalkan.",
        409
      );
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
      where: {
        id: current.id,
        version: current.version,
        status: { in: CANCELLABLE_BY_CUSTOMER },
      },
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
        method: "QRIS",
        proofKey: null,
        status: "PENDING",
      },
    });

    await tx.auditLog.create({
      data: {
        action: "payment.claim.qris",
        entity: "Order",
        entityId: current.id,
        meta: {
          code: current.code,
          attempt,
          total: current.total,
          methodId: method.id,
        },
      },
    });

    after(() => {
      const payload = {
        orderCode: code,
        orderId: current.id,
        paymentId: payment.id,
        attempt,
        tableName: order.table.name,
      };
      emitToChannel(CHANNELS.cashier, REALTIME_EVENTS.paymentClaimed, payload);
      emitToChannel(CHANNELS.admin, REALTIME_EVENTS.paymentClaimed, payload);
      emitToChannel(CHANNELS.order(code), REALTIME_EVENTS.paymentClaimed, {
        orderCode: code,
        attempt,
      });
      emitOrderStatus(code, "AWAITING_VERIFICATION", current.version + 1);
    });

    return {
      paymentId: payment.id,
      attempt,
      version: current.version + 1,
    };
  });

  return {
    paymentId: result.paymentId,
    attempt: result.attempt,
    status: "AWAITING_VERIFICATION",
  };
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
    await releaseVoucherForOrder(tx, { orderId: order.id, orderCode: code });

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
      await releaseVoucherForOrder(tx, {
        orderId: order.id,
        orderCode: order.code,
      });

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
