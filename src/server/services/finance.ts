import { CHANNELS, REALTIME_EVENTS } from "@/lib/realtime-events";
import { OrderStatus, Prisma, TxType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { env } from "@/lib/env";
import { emitToChannel } from "@/lib/pusher-server";
import { runInTransaction } from "@/lib/tx";
import { deleteObject } from "@/lib/r2";
import {
  financeListQuerySchema,
  financeRangeSchema,
  financeTransactionCreateSchema,
  financeTransactionUpdateSchema,
  type FinancePreset,
} from "@/lib/validators/finance";
import {
  emitOrderStatus,
  emitStockChanges,
} from "@/server/services/orders";
import { releaseStock } from "@/server/services/stock";
import { CANCELLABLE_BY_ADMIN } from "@/server/domain/order-state";

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type FinanceGranularity = "day" | "week" | "month";

export interface FinanceSummary {
  income: number;
  expense: number;
  net: number;
  count: number;
}

export interface FinanceSeriesPoint {
  bucket: string;
  income: number;
  expense: number;
}

export interface FinanceOverview {
  summary: FinanceSummary;
  series: FinanceSeriesPoint[];
  granularity: FinanceGranularity;
  range: { from: string; to: string };
}

export interface FinanceTransactionRow {
  id: string;
  type: TxType;
  category: string;
  amount: number;
  note: string | null;
  attachKey: string | null;
  occurredAt: string;
  createdAt: string;
  createdByName: string | null;
  orderId: string | null;
  orderCode: string | null;
  isManual: boolean;
}

export interface FinanceTransactionList {
  items: FinanceTransactionRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function wibDayStart(date: Date): Date {
  const shifted = new Date(date.getTime() + WIB_OFFSET_MS);
  return new Date(
    Date.UTC(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate()
    ) - WIB_OFFSET_MS
  );
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function parseWibDay(value: string | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day)) - WIB_OFFSET_MS
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

export function resolveFinanceRange(input: {
  preset?: FinancePreset;
  from?: string;
  to?: string;
}): { start: Date; end: Date; granularity: FinanceGranularity } {
  const data = financeRangeSchema.parse(input);
  const todayStart = wibDayStart(new Date());
  let start = todayStart;
  let end = addDays(todayStart, 1);

  if (data.preset === "7d") {
    start = addDays(todayStart, -6);
  } else if (data.preset === "month") {
    const shifted = new Date(todayStart.getTime() + WIB_OFFSET_MS);
    start = new Date(
      Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), 1) - WIB_OFFSET_MS
    );
  } else if (data.preset === "year") {
    const shifted = new Date(todayStart.getTime() + WIB_OFFSET_MS);
    start = new Date(Date.UTC(shifted.getUTCFullYear(), 0, 1) - WIB_OFFSET_MS);
  } else if (data.preset === "custom") {
    const from = parseWibDay(data.from);
    const to = parseWibDay(data.to);
    start = from ?? start;
    if (to) end = addDays(to, 1);
    if (end <= start) end = addDays(start, 1);
  }

  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_MS));
  const granularity: FinanceGranularity =
    data.preset === "year" || days > 180 ? "month" : days > 45 ? "week" : "day";

  return { start, end, granularity };
}

export function bucketKeys(
  start: Date,
  end: Date,
  granularity: FinanceGranularity
): string[] {
  const keys: string[] = [];
  const format = (date: Date) => {
    const wib = new Date(date.getTime() + WIB_OFFSET_MS);
    const year = wib.getUTCFullYear();
    const month = String(wib.getUTCMonth() + 1).padStart(2, "0");
    if (granularity === "month") return `${year}-${month}`;
    return `${year}-${month}-${String(wib.getUTCDate()).padStart(2, "0")}`;
  };

  if (granularity === "day") {
    for (let cursor = start; cursor < end; cursor = addDays(cursor, 1)) {
      keys.push(format(cursor));
    }
    return keys;
  }

  if (granularity === "week") {
    const wib = new Date(start.getTime() + WIB_OFFSET_MS);
    const weekday = wib.getUTCDay();
    const mondayOffset = (weekday + 6) % 7;
    let cursor = addDays(start, -mondayOffset);
    while (cursor < end) {
      keys.push(format(cursor));
      cursor = addDays(cursor, 7);
    }
    return keys;
  }

  const shifted = new Date(start.getTime() + WIB_OFFSET_MS);
  let year = shifted.getUTCFullYear();
  let month = shifted.getUTCMonth();
  while (
    new Date(Date.UTC(year, month, 1) - WIB_OFFSET_MS).getTime() < end.getTime()
  ) {
    keys.push(`${year}-${String(month + 1).padStart(2, "0")}`);
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  return keys;
}

export async function getFinanceOverview(input: {
  preset?: FinancePreset;
  from?: string;
  to?: string;
}): Promise<FinanceOverview> {
  const { start, end, granularity } = resolveFinanceRange(input);

  const [totals, rows] = await Promise.all([
    prisma.transaction.groupBy({
      by: ["type"],
      where: { occurredAt: { gte: start, lt: end } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.$queryRaw<Array<{ bucket: string; type: TxType; total: number }>>`
      SELECT to_char(
               date_trunc(${granularity}::text, "occurredAt" + INTERVAL '7 hours'),
               ${granularity === "month" ? "YYYY-MM" : "YYYY-MM-DD"}::text
             ) AS bucket,
             type::text AS type,
             SUM(amount)::double precision AS total
      FROM "Transaction"
      WHERE "occurredAt" >= ${start} AND "occurredAt" < ${end}
      GROUP BY 1, 2
      ORDER BY 1
    `,
  ]);

  let income = 0;
  let expense = 0;
  let count = 0;
  for (const row of totals) {
    count += row._count._all;
    if (row.type === "INCOME") income = row._sum.amount ?? 0;
    if (row.type === "EXPENSE") expense = row._sum.amount ?? 0;
  }

  const byBucket = new Map<string, FinanceSeriesPoint>();
  for (const key of bucketKeys(start, end, granularity)) {
    byBucket.set(key, { bucket: key, income: 0, expense: 0 });
  }
  for (const row of rows) {
    const point = byBucket.get(row.bucket);
    if (!point) continue;
    if (row.type === "INCOME") point.income += Number(row.total);
    if (row.type === "EXPENSE") point.expense += Number(row.total);
  }

  return {
    summary: { income, expense, net: income - expense, count },
    series: [...byBucket.values()].sort((a, b) => a.bucket.localeCompare(b.bucket)),
    granularity,
    range: {
      from: start.toISOString(),
      to: new Date(end.getTime() - 1).toISOString(),
    },
  };
}

function parseOccurredAt(value: string | undefined): Date {
  if (!value) return new Date();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AppError("VALIDATION_ERROR", "Tanggal transaksi tidak valid", 400);
  }
  return date;
}

async function toRows(
  transactions: Array<{
    id: string;
    type: TxType;
    category: string;
    amount: number;
    note: string | null;
    attachKey: string | null;
    orderId: string | null;
    occurredAt: Date;
    createdAt: Date;
    createdById: string | null;
  }>
): Promise<FinanceTransactionRow[]> {
  const userIds = [
    ...new Set(transactions.map((row) => row.createdById).filter(Boolean)),
  ] as string[];
  const orderIds = [
    ...new Set(transactions.map((row) => row.orderId).filter(Boolean)),
  ] as string[];

  const [users, orders] = await Promise.all([
    userIds.length
      ? prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    orderIds.length
      ? prisma.order.findMany({
          where: { id: { in: orderIds } },
          select: { id: true, code: true },
        })
      : Promise.resolve([]),
  ]);

  const userMap = new Map(users.map((user) => [user.id, user.name]));
  const orderMap = new Map(orders.map((order) => [order.id, order.code]));

  return transactions.map((row) => ({
    id: row.id,
    type: row.type,
    category: row.category,
    amount: row.amount,
    note: row.note,
    attachKey: row.attachKey,
    occurredAt: row.occurredAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    createdByName: row.createdById ? userMap.get(row.createdById) ?? null : null,
    orderId: row.orderId,
    orderCode: row.orderId ? orderMap.get(row.orderId) ?? null : null,
    isManual: row.orderId === null,
  }));
}

export async function listFinanceTransactions(
  input: unknown
): Promise<FinanceTransactionList> {
  const query = financeListQuerySchema.parse(input);

  const where: Prisma.TransactionWhereInput = {};
  if (query.type !== "all") where.type = query.type;
  if (query.category) where.category = query.category;

  const from = parseWibDay(query.from);
  const to = parseWibDay(query.to);
  if (from || to) {
    where.occurredAt = {
      ...(from ? { gte: from } : {}),
      ...(to ? { lt: addDays(to, 1) } : {}),
    };
  }

  const [total, transactions] = await Promise.all([
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({
      where,
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  return {
    items: await toRows(transactions),
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

function emitFinanceChange(action: "created" | "updated" | "deleted", id: string) {
  emitToChannel(CHANNELS.admin, REALTIME_EVENTS.transactionCreated, { id, action });
  emitToChannel(CHANNELS.admin, REALTIME_EVENTS.kpiUpdated, { source: "finance" });
}

export async function createFinanceTransaction(
  input: unknown,
  userId: string
): Promise<FinanceTransactionRow> {
  const data = financeTransactionCreateSchema.parse(input);
  const occurredAt = parseOccurredAt(data.occurredAt);

  const created = await runInTransaction(async (tx, after) => {
    const transaction = await tx.transaction.create({
      data: {
        type: data.type,
        category: data.category,
        amount: data.amount,
        note: data.note?.trim() || null,
        attachKey: data.attachKey?.trim() || null,
        occurredAt,
        createdById: userId,
      },
    });

    await tx.auditLog.create({
      data: {
        userId,
        action: "transaction.create",
        entity: "Transaction",
        entityId: transaction.id,
        meta: {
          type: transaction.type,
          category: transaction.category,
          amount: transaction.amount,
        },
      },
    });

    after(() => emitFinanceChange("created", transaction.id));

    return transaction;
  });

  return (await toRows([created]))[0];
}

export async function updateFinanceTransaction(
  id: string,
  input: unknown,
  userId: string
): Promise<FinanceTransactionRow> {
  const data = financeTransactionUpdateSchema.parse(input);

  const current = await prisma.transaction.findUnique({ where: { id } });
  if (!current) {
    throw new AppError("NOT_FOUND", "Transaksi tidak ditemukan", 404);
  }
  if (current.orderId) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Transaksi penjualan otomatis tidak dapat diubah",
      400
    );
  }

  const updated = await runInTransaction(async (tx, after) => {
    const transaction = await tx.transaction.update({
      where: { id },
      data: {
        ...(data.category !== undefined ? { category: data.category } : {}),
        ...(data.amount !== undefined ? { amount: data.amount } : {}),
        ...(data.note !== undefined ? { note: data.note.trim() || null } : {}),
        ...(data.attachKey !== undefined
          ? { attachKey: data.attachKey.trim() || null }
          : {}),
        ...(data.occurredAt !== undefined
          ? { occurredAt: parseOccurredAt(data.occurredAt) }
          : {}),
      },
    });

    await tx.auditLog.create({
      data: {
        userId,
        action: "transaction.update",
        entity: "Transaction",
        entityId: transaction.id,
        meta: {
          type: transaction.type,
          category: transaction.category,
          amount: transaction.amount,
        },
      },
    });

    after(() => emitFinanceChange("updated", transaction.id));

    return transaction;
  });

  return (await toRows([updated]))[0];
}

export async function deleteFinanceTransaction(
  id: string,
  userId: string
): Promise<{ id: string }> {
  const current = await prisma.transaction.findUnique({ where: { id } });
  if (!current) {
    throw new AppError("NOT_FOUND", "Transaksi tidak ditemukan", 404);
  }
  if (current.orderId) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Transaksi penjualan otomatis tidak dapat dihapus. Catat koreksi/refund.",
      400
    );
  }

  await runInTransaction(async (tx, after) => {
    await tx.transaction.delete({ where: { id } });
    await tx.auditLog.create({
      data: {
        userId,
        action: "transaction.delete",
        entity: "Transaction",
        entityId: id,
        meta: {
          type: current.type,
          category: current.category,
          amount: current.amount,
        },
      },
    });
    after(() => emitFinanceChange("deleted", id));
  });

  if (current.attachKey) {
    try {
      await deleteObject(env.R2_BUCKET_PRIVATE, current.attachKey);
    } catch (err) {
      console.warn("Gagal menghapus lampiran transaksi:", current.attachKey, err);
    }
  }

  return { id };
}

/**
 * Mencatat koreksi pengeluaran "Refund" untuk pesanan yang dibatalkan setelah
 * pembayaran diterima. Idempoten: satu transaksi Refund per pesanan.
 */
export async function recordRefundForOrder(
  orderId: string,
  userId: string | null,
  reason?: string
): Promise<{ created: boolean }> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      transactions: { where: { category: "Penjualan" }, take: 1 },
    },
  });

  if (!order) {
    throw new AppError("NOT_FOUND", "Pesanan tidak ditemukan", 404);
  }
  if (!order.transactions[0]) {
    throw new AppError(
      "CONFLICT",
      "Pesanan belum memiliki transaksi penjualan",
      409
    );
  }

  const existing = await prisma.transaction.findUnique({
    where: { orderId_category: { orderId, category: "Refund" } },
    select: { id: true },
  });
  if (existing) return { created: false };

  await prisma.transaction.create({
    data: {
      type: "EXPENSE",
      category: "Refund",
      amount: order.total,
      note: reason?.trim() || `Refund pesanan ${order.code}`,
      orderId,
      createdById: userId,
    },
  });

  emitFinanceChange("created", orderId);
  return { created: true };
}

/**
 * Batalkan pesanan yang sudah diterima/diproses. Stok dikembalikan dan
 * transaksi penjualan dikoreksi lewat EXPENSE "Refund" (tidak dihapus).
 */
export async function cancelAcceptedOrder(
  orderId: string,
  userId: string,
  reason?: string
): Promise<{ code: string; status: OrderStatus; version: number }> {
  const result = await runInTransaction(async (tx, after) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: {
        table: { select: { token: true } },
        transactions: { where: { category: "Penjualan" }, take: 1 },
      },
    });

    if (!order) {
      throw new AppError("NOT_FOUND", "Pesanan tidak ditemukan", 404);
    }
    if (!CANCELLABLE_BY_ADMIN.includes(order.status)) {
      throw new AppError(
        "CONFLICT",
        "Pesanan tidak dapat dibatalkan pada status ini",
        409
      );
    }

    const updated = await tx.order.updateMany({
      where: { id: order.id, version: order.version, status: order.status },
      data: { status: "CANCELLED", version: { increment: 1 } },
    });
    if (updated.count === 0) {
      throw new AppError("CONFLICT", "Status pesanan sudah berubah", 409);
    }

    if (order.transactions[0]) {
      await tx.transaction.upsert({
        where: { orderId_category: { orderId, category: "Refund" } },
        update: {},
        create: {
          type: "EXPENSE",
          category: "Refund",
          amount: order.total,
          note: reason?.trim() || `Refund pesanan ${order.code}`,
          orderId,
          createdById: userId,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        userId,
        action: "order.cancel.refund",
        entity: "Order",
        entityId: order.id,
        meta: {
          code: order.code,
          reason: reason?.trim() || null,
          refund: order.transactions[0] ? order.total : 0,
        },
      },
    });

    const changes = await releaseStock(tx, order.id, order.code);

    after(() => {
      emitOrderStatus(order.code, "CANCELLED", order.version + 1);
      emitStockChanges(order.table.token, order.code, changes);
      emitFinanceChange("created", orderId);
    });

    return {
      code: order.code,
      version: order.version + 1,
      cancelled: true as const,
    };
  });

  return { code: result.code, status: "CANCELLED", version: result.version };
}
