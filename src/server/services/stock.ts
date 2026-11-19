import { CHANNELS, REALTIME_EVENTS } from "@/lib/realtime-events";
import { Prisma, StockMoveType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { emitToChannel } from "@/lib/pusher-server";
import { runInTransaction } from "@/lib/tx";
import {
  stockAdjustSchema,
  stockSettingsSchema,
} from "@/lib/validators/stock";

export type StockStatus = "aman" | "menipis" | "habis" | "tidak_dilacak";

export interface StockProductRow {
  id: string;
  name: string;
  category: string;
  stock: number;
  lowStockThreshold: number;
  trackStock: boolean;
  isActive: boolean;
  status: StockStatus;
}

export interface StockCounts {
  all: number;
  low: number;
  out: number;
}

export interface StockOverview {
  products: StockProductRow[];
  counts: StockCounts;
}

export interface StockMovementRow {
  id: string;
  type: StockMoveType;
  quantity: number;
  balance: number;
  note: string | null;
  userName: string | null;
  orderId: string | null;
  orderCode: string | null;
  createdAt: string;
}

function statusOf(product: {
  trackStock: boolean;
  stock: number;
  lowStockThreshold: number;
}): StockStatus {
  if (!product.trackStock) return "tidak_dilacak";
  if (product.stock <= 0) return "habis";
  if (product.stock <= product.lowStockThreshold) return "menipis";
  return "aman";
}

export async function listStockProducts(): Promise<StockOverview> {
  const products = await prisma.product.findMany({
    where: { deletedAt: null },
    orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      stock: true,
      lowStockThreshold: true,
      trackStock: true,
      isActive: true,
      category: { select: { name: true } },
    },
  });

  const rows = products.map((product) => ({
    id: product.id,
    name: product.name,
    category: product.category.name,
    stock: product.stock,
    lowStockThreshold: product.lowStockThreshold,
    trackStock: product.trackStock,
    isActive: product.isActive,
    status: statusOf(product),
  }));

  return {
    products: rows,
    counts: {
      all: rows.length,
      low: rows.filter((row) => row.status === "menipis").length,
      out: rows.filter((row) => row.status === "habis").length,
    },
  };
}

async function activeTableTokens(): Promise<string[]> {
  const tables = await prisma.table.findMany({
    where: { isActive: true },
    select: { token: true },
  });
  return tables.map((table) => table.token);
}

function broadcastStock(params: {
  productId: string;
  name: string;
  stock: number;
  lowStockThreshold: number;
  low: boolean;
  tableTokens: string[];
}): void {
  const payload = {
    productId: params.productId,
    name: params.name,
    stock: params.stock,
    lowStockThreshold: params.lowStockThreshold,
  };

  emitToChannel(CHANNELS.admin, REALTIME_EVENTS.stockChanged, payload);
  for (const token of params.tableTokens) {
    emitToChannel(CHANNELS.table(token), REALTIME_EVENTS.stockChanged, payload);
  }

  if (params.low) {
    emitToChannel(CHANNELS.admin, REALTIME_EVENTS.stockLow, payload);
  }

  emitToChannel(CHANNELS.admin, REALTIME_EVENTS.kpiUpdated, { source: "stock" });
}

export interface AdjustStockResult {
  productId: string;
  stock: number;
  balance: number;
  status: StockStatus;
}

export interface StockChange {
  productId: string;
  newStock: number;
}

/**
 * Reservasi stok atomik untuk satu item checkout. Produk non-tracked tidak
 * menyentuh stok maupun StockMovement (K-02). Untuk produk tracked, UPDATE
 * bersyarat menjamin stok tidak pernah negatif.
 */
export async function reserveStock(
  tx: Prisma.TransactionClient,
  item: { productId: string; name: string; quantity: number; trackStock: boolean },
  orderCode: string
): Promise<StockChange | null> {
  if (!item.trackStock) return null;

  const rows = await tx.$queryRaw<Array<{ stock: number }>>`
    UPDATE "Product"
    SET stock = stock - ${item.quantity}, "updatedAt" = NOW()
    WHERE id = ${item.productId}
      AND "trackStock" = true
      AND "isActive" = true
      AND "deletedAt" IS NULL
      AND stock >= ${item.quantity}
    RETURNING stock
  `;

  if (rows.length === 0) {
    throw new AppError(
      "STOCK_INSUFFICIENT",
      `Stok tidak cukup untuk produk ${item.name}`,
      409
    );
  }

  const newStock = rows[0].stock;

  // K-07: tautkan reservasi ke order agar releaseStock dapat menghitung sisa
  // yang benar-benar pernah direservasi (K-03).
  const order = await tx.order.findUnique({
    where: { code: orderCode },
    select: { id: true },
  });

  await tx.stockMovement.create({
    data: {
      productId: item.productId,
      type: "ORDER_RESERVE",
      quantity: item.quantity,
      balance: newStock,
      orderId: order?.id ?? null,
      note: `Pesanan order ${orderCode}`,
    },
  });

  return { productId: item.productId, newStock };
}

/**
 * Mengembalikan stok pesanan yang batal/kedaluwarsa. Hanya stok yang benar-benar
 * pernah direservasi order ini yang dikembalikan (K-03), dihitung dari
 * StockMovement ber-orderId (K-07) sehingga idempoten walau dipanggil ulang.
 */
export async function releaseStock(
  tx: Prisma.TransactionClient,
  orderId: string,
  code: string
): Promise<StockChange[]> {
  const [reserved, released] = await Promise.all([
    tx.stockMovement.groupBy({
      by: ["productId"],
      where: { orderId, type: "ORDER_RESERVE" },
      _sum: { quantity: true },
    }),
    tx.stockMovement.groupBy({
      by: ["productId"],
      where: { orderId, type: "ORDER_RELEASE" },
      _sum: { quantity: true },
    }),
  ]);

  const outstanding = new Map<string, number>();
  for (const row of reserved) {
    outstanding.set(row.productId, row._sum.quantity ?? 0);
  }
  for (const row of released) {
    outstanding.set(
      row.productId,
      (outstanding.get(row.productId) ?? 0) - (row._sum.quantity ?? 0)
    );
  }

  const itemProducts = await tx.orderItem.findMany({
    where: { orderId, productId: { in: [...outstanding.keys()] } },
    select: { productId: true },
  });

  const changes: StockChange[] = [];

  for (const { productId } of itemProducts) {
    const quantity = outstanding.get(productId) ?? 0;
    if (quantity <= 0) continue;
    // Satu pelepasan per produk agar baris order duplikat tidak dobel.
    outstanding.set(productId, 0);

    const rows = await tx.$queryRaw<Array<{ stock: number }>>`
      UPDATE "Product" SET stock = stock + ${quantity}, "updatedAt" = NOW()
      WHERE id = ${productId} AND "trackStock" = true
      RETURNING stock
    `;
    if (rows.length === 0) continue;

    await tx.stockMovement.create({
      data: {
        productId,
        type: "ORDER_RELEASE",
        quantity,
        balance: rows[0].stock,
        orderId,
        note: `Stok dikembalikan untuk ${code}`,
      },
    });

    changes.push({ productId, newStock: rows[0].stock });
  }

  return changes;
}

/**
 * Penyesuaian stok atomik. Stok tidak pernah boleh negatif; UPDATE bersyarat
 * menjamin dua permintaan bersamaan tidak menghasilkan saldo minus.
 */
export async function adjustStock(
  input: unknown,
  userId: string
): Promise<AdjustStockResult> {
  const data = stockAdjustSchema.parse(input);
  const delta =
    data.type === "PURCHASE"
      ? data.quantity
      : data.type === "WASTE"
      ? -data.quantity
      : data.quantity;

  const product = await prisma.product.findFirst({
    where: { id: data.productId, deletedAt: null },
    select: { id: true, name: true, stock: true, trackStock: true, lowStockThreshold: true },
  });

  if (!product) {
    throw new AppError("NOT_FOUND", "Produk tidak ditemukan", 404);
  }
  if (!product.trackStock) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Produk ini tidak melacak stok. Aktifkan pelacakan terlebih dahulu.",
      400
    );
  }
  if (product.stock + delta < 0) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Stok tidak mencukupi. Sisa stok ${product.stock}.`,
      400
    );
  }

  const result = await runInTransaction(async (tx, after) => {
    const updated = await tx.$queryRaw<Array<{ stock: number }>>`
      UPDATE "Product"
      SET stock = stock + ${delta}, "updatedAt" = NOW()
      WHERE id = ${product.id} AND stock + ${delta} >= 0
      RETURNING stock
    `;

    if (updated.length === 0) {
      throw new AppError(
        "CONFLICT",
        "Stok berubah bersamaan. Muat ulang lalu coba lagi.",
        409
      );
    }

    const balance = updated[0].stock;

    await tx.stockMovement.create({
      data: {
        productId: product.id,
        type: StockMoveType[data.type],
        quantity: delta,
        balance,
        note: data.note?.trim() || null,
        userId,
      },
    });

    await tx.auditLog.create({
      data: {
        userId,
        action: `stock.${data.type.toLowerCase()}`,
        entity: "Product",
        entityId: product.id,
        meta: { name: product.name, delta, balance, note: data.note ?? null },
      },
    });

    after(async () =>
      broadcastStock({
        productId: product.id,
        name: product.name,
        stock: balance,
        lowStockThreshold: product.lowStockThreshold,
        low: balance <= product.lowStockThreshold,
        tableTokens: await activeTableTokens(),
      })
    );

    return balance;
  });

  return {
    productId: product.id,
    stock: result,
    balance: result,
    status: statusOf({ trackStock: true, stock: result, lowStockThreshold: product.lowStockThreshold }),
  };
}

export async function updateStockSettings(
  productId: string,
  input: unknown,
  userId: string
): Promise<{ productId: string; stock: number; trackStock: boolean; lowStockThreshold: number }> {
  const data = stockSettingsSchema.parse(input);

  const updated = await runInTransaction(async (tx, after) => {
    // Kunci baris (audit T-02): baca stok terkini di dalam transaksi agar
    // reservasi checkout yang berjalan bersamaan tidak tertimpa stok absolut.
    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        name: string;
        stock: number;
        trackStock: boolean;
        lowStockThreshold: number;
      }>
    >`
      SELECT id, name, stock, "trackStock", "lowStockThreshold"
      FROM "Product"
      WHERE id = ${productId} AND "deletedAt" IS NULL
      FOR UPDATE
    `;

    const product = rows[0];
    if (!product) {
      throw new AppError("NOT_FOUND", "Produk tidak ditemukan", 404);
    }

    const nextTrack = data.trackStock ?? product.trackStock;
    const nextThreshold = data.lowStockThreshold ?? product.lowStockThreshold;
    const disableTracking = nextTrack === false && product.stock > 0;
    const nextStock = nextTrack ? product.stock : 0;

    const saved = await tx.product.update({
      where: { id: product.id },
      data: {
        trackStock: nextTrack,
        lowStockThreshold: nextThreshold,
        stock: nextStock,
      },
      select: { stock: true, trackStock: true, lowStockThreshold: true },
    });

    if (disableTracking) {
      await tx.stockMovement.create({
        data: {
          productId: product.id,
          type: StockMoveType.ADJUSTMENT,
          quantity: -product.stock,
          balance: 0,
          note: "Pelacakan stok dinonaktifkan",
          userId,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        userId,
        action: "stock.settings",
        entity: "Product",
        entityId: product.id,
        meta: {
          name: product.name,
          trackStock: nextTrack,
          lowStockThreshold: nextThreshold,
        },
      },
    });

    after(async () =>
      broadcastStock({
        productId: product.id,
        name: product.name,
        stock: saved.stock,
        lowStockThreshold: saved.lowStockThreshold,
        low: saved.trackStock && saved.stock <= saved.lowStockThreshold,
        tableTokens: await activeTableTokens(),
      })
    );

    return saved;
  });

  return {
    productId,
    stock: updated.stock,
    trackStock: updated.trackStock,
    lowStockThreshold: updated.lowStockThreshold,
  };
}

export async function listStockMovements(
  productId: string,
  range: { from?: string; to?: string } = {}
): Promise<StockMovementRow[]> {
  const product = await prisma.product.findFirst({
    where: { id: productId, deletedAt: null },
    select: { id: true },
  });
  if (!product) {
    throw new AppError("NOT_FOUND", "Produk tidak ditemukan", 404);
  }

  const createdAt: Prisma.DateTimeFilter = {};
  if (range.from) {
    const from = new Date(range.from);
    if (!Number.isNaN(from.getTime())) createdAt.gte = from;
  }
  if (range.to) {
    const to = new Date(range.to);
    if (!Number.isNaN(to.getTime())) createdAt.lte = to;
  }

  const movements = await prisma.stockMovement.findMany({
    where: {
      productId,
      ...(Object.keys(createdAt).length > 0 ? { createdAt } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const userIds = [...new Set(movements.map((row) => row.userId).filter(Boolean))] as string[];
  const orderIds = [...new Set(movements.map((row) => row.orderId).filter(Boolean))] as string[];

  const [users, orders] = await Promise.all([
    userIds.length
      ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    orderIds.length
      ? prisma.order.findMany({ where: { id: { in: orderIds } }, select: { id: true, code: true } })
      : Promise.resolve([]),
  ]);

  const userMap = new Map(users.map((user) => [user.id, user.name]));
  const orderMap = new Map(orders.map((order) => [order.id, order.code]));

  return movements.map((movement) => ({
    id: movement.id,
    type: movement.type,
    quantity: movement.quantity,
    balance: movement.balance,
    note: movement.note,
    userName: movement.userId ? userMap.get(movement.userId) ?? null : null,
    orderId: movement.orderId,
    orderCode: movement.orderId ? orderMap.get(movement.orderId) ?? null : null,
    createdAt: movement.createdAt.toISOString(),
  }));
}
