import "server-only";
import { prisma } from "@/lib/db";
import { getPublicUrl } from "@/lib/r2";
import { describeAudit } from "@/lib/audit";
import {
  bucketKeys,
  resolveFinanceRange,
  type FinanceGranularity,
} from "@/server/services/finance";
import { logger } from "@/lib/logger";

export type DashboardRange = "today" | "week" | "month" | "year";

export interface DashboardKpi {
  pesananHariIni: number;
  pendapatanHariIni: number;
  menungguVerifikasi: number;
  stokMenipis: number;
}

export interface DashboardSeriesPoint {
  tanggal: string;
  pemasukan: number;
  pengeluaran: number;
  pesanan: number;
}

export interface DashboardComposition {
  makanan: number;
  kopi: number;
  nonKopi: number;
}

export interface DashboardBestSeller {
  productId: string;
  produk: string;
  qty: number;
  omzet: number;
  imageUrl: string | null;
}

export interface DashboardCashier {
  id: string;
  kasir: string;
  jumlahVerifikasi: number;
  lastLogin: string | null;
}

export interface DashboardTable {
  id: string;
  name: string;
  area: string | null;
  orderCode: string;
  status: string;
  total: number;
  since: string;
}

export interface DashboardActivity {
  id: string;
  action: string;
  text: string;
  actor: string;
  createdAt: string;
  entity: string;
  entityId: string;
}

export interface DashboardData {
  profile: { name: string; role: string };
  kpi: DashboardKpi | null;
  series: DashboardSeriesPoint[] | null;
  komposisi: DashboardComposition | null;
  menuTerlaris: DashboardBestSeller[] | null;
  kasirAktif: DashboardCashier[] | null;
  mejaAktif: DashboardTable[] | null;
  aktivitasTerbaru: DashboardActivity[] | null;
  granularity: FinanceGranularity;
  errors: Partial<
    Record<
      | "kpi"
      | "series"
      | "komposisi"
      | "menuTerlaris"
      | "kasirAktif"
      | "mejaAktif"
      | "aktivitas",
      true
    >
  >;
}

const ACTIVE_STATUSES = [
  "AWAITING_PAYMENT",
  "AWAITING_VERIFICATION",
  "PAYMENT_REJECTED",
  "ACCEPTED",
  "PREPARING",
  "READY",
] as const;

function rangePreset(range: DashboardRange) {
  return range === "week" ? "7d" : range;
}

async function capture<T>(
  promise: Promise<T>
): Promise<{ data: T | null; failed: boolean }> {
  try {
    return { data: await promise, failed: false };
  } catch (error) {
    logger.error("Dashboard section failed", error);
    return { data: null, failed: true };
  }
}

export async function getDashboard(
  range: DashboardRange,
  profile: { name: string; role: string }
): Promise<DashboardData> {
  const { start, end, granularity } = resolveFinanceRange({
    preset: rangePreset(range),
  });
  const today = resolveFinanceRange({ preset: "today" });

  const kpiTask = capture(
    prisma
      .$queryRaw<DashboardKpi[]>`
        SELECT
          (SELECT COUNT(*)::int FROM "Order"
            WHERE "createdAt" >= ${today.start} AND "createdAt" < ${today.end}) AS "pesananHariIni",
          (SELECT COALESCE(SUM("amount"), 0)::double precision FROM "Transaction"
            WHERE "type" = 'INCOME'
              AND "occurredAt" >= ${today.start} AND "occurredAt" < ${today.end}) AS "pendapatanHariIni",
          (SELECT COUNT(*)::int FROM "Order"
            WHERE "status" = 'AWAITING_VERIFICATION') AS "menungguVerifikasi",
          (SELECT COUNT(*)::int FROM "Product"
            WHERE "deletedAt" IS NULL AND "isActive" = true AND "trackStock" = true
              AND "stock" <= "lowStockThreshold") AS "stokMenipis"
      `
      .then((rows) => rows[0] ?? null)
  );

  const seriesTask = capture(
    (async () => {
      const bucketFormat =
        granularity === "month" ? "YYYY-MM" : "YYYY-MM-DD";
      const [transactions, orders] = await Promise.all([
        prisma.$queryRaw<
          Array<{ bucket: string; type: string; total: number }>
        >`
          SELECT to_char(
                   date_trunc(${granularity}::text, "occurredAt" + INTERVAL '7 hours'),
                   ${bucketFormat}::text
                 ) AS bucket,
                 "type"::text AS type,
                 SUM("amount")::double precision AS total
          FROM "Transaction"
          WHERE "occurredAt" >= ${start} AND "occurredAt" < ${end}
          GROUP BY 1, 2
          ORDER BY 1
        `,
        prisma.$queryRaw<Array<{ bucket: string; total: number }>>`
          SELECT to_char(
                   date_trunc(${granularity}::text, "createdAt" + INTERVAL '7 hours'),
                   ${bucketFormat}::text
                 ) AS bucket,
                 COUNT(*)::int AS total
          FROM "Order"
          WHERE "createdAt" >= ${start} AND "createdAt" < ${end}
          GROUP BY 1
          ORDER BY 1
        `,
      ]);

      const points = new Map<string, DashboardSeriesPoint>();
      for (const key of bucketKeys(start, end, granularity)) {
        points.set(key, {
          tanggal: key,
          pemasukan: 0,
          pengeluaran: 0,
          pesanan: 0,
        });
      }
      for (const row of transactions) {
        const point = points.get(row.bucket);
        if (!point) continue;
        if (row.type === "INCOME") point.pemasukan += Number(row.total);
        if (row.type === "EXPENSE") point.pengeluaran += Number(row.total);
      }
      for (const row of orders) {
        const point = points.get(row.bucket);
        if (point) point.pesanan += Number(row.total);
      }
      return [...points.values()];
    })()
  );

  const compositionTask = capture(
    prisma
      .$queryRaw<
        Array<{ type: string; subtype: string | null; qty: number }>
      >`
        SELECT c."type"::text AS type,
               c."subtype"::text AS subtype,
               SUM(oi."quantity")::int AS qty
        FROM "OrderItem" oi
        JOIN "Order" o ON o."id" = oi."orderId"
        JOIN "Product" p ON p."id" = oi."productId"
        JOIN "Category" c ON c."id" = p."categoryId"
        WHERE o."createdAt" >= ${start} AND o."createdAt" < ${end}
          AND o."status"::text <> 'CANCELLED'
        GROUP BY c."type", c."subtype"
      `
      .then((rows) => {
        let makanan = 0;
        let kopi = 0;
        let nonKopi = 0;
        for (const row of rows) {
          if (row.type === "FOOD") makanan += Number(row.qty);
          else if (row.subtype === "COFFEE") kopi += Number(row.qty);
          else nonKopi += Number(row.qty);
        }
        const total = makanan + kopi + nonKopi;
        if (total === 0) return { makanan: 0, kopi: 0, nonKopi: 0 };
        return {
          makanan: Math.round((makanan / total) * 100),
          kopi: Math.round((kopi / total) * 100),
          nonKopi: Math.round((nonKopi / total) * 100),
        };
      })
  );

  const bestSellerTask = capture(
    prisma
      .$queryRaw<
        Array<{
          productId: string;
          produk: string;
          imageKey: string | null;
          thumbKey: string | null;
          qty: number;
          omzet: number;
        }>
      >`
        SELECT oi."productId" AS "productId",
               p."name" AS produk,
               p."imageKey" AS "imageKey",
               p."thumbKey" AS "thumbKey",
               SUM(oi."quantity")::int AS qty,
               SUM(oi."quantity" * oi."priceSnapshot")::double precision AS omzet
        FROM "OrderItem" oi
        JOIN "Order" o ON o."id" = oi."orderId"
        JOIN "Product" p ON p."id" = oi."productId"
        WHERE o."createdAt" >= ${start} AND o."createdAt" < ${end}
          AND o."status"::text <> 'CANCELLED'
        GROUP BY 1, 2, 3, 4
        ORDER BY qty DESC, omzet DESC
        LIMIT 10
      `
      .then((rows) =>
        rows.map((row) => ({
          productId: row.productId,
          produk: row.produk,
          qty: Number(row.qty),
          omzet: Number(row.omzet),
          imageUrl:
            row.thumbKey || row.imageKey
              ? getPublicUrl(row.thumbKey ?? row.imageKey ?? "")
              : null,
        }))
      )
  );

  const cashierTask = capture(
    prisma.user
      .findMany({
        where: { role: "CASHIER", isActive: true },
        select: {
          id: true,
          name: true,
          lastLoginAt: true,
          _count: {
            select: {
              verifications: {
                where: { verifiedAt: { gte: today.start, lt: today.end } },
              },
            },
          },
        },
        orderBy: { name: "asc" },
      })
      .then((rows) =>
        rows.map((row) => ({
          id: row.id,
          kasir: row.name,
          jumlahVerifikasi: row._count.verifications,
          lastLogin: row.lastLoginAt?.toISOString() ?? null,
        }))
      )
  );

  const tableTask = capture(
    prisma.table
      .findMany({
        where: {
          isActive: true,
          orders: { some: { status: { in: [...ACTIVE_STATUSES] } } },
        },
        select: {
          id: true,
          name: true,
          area: true,
          orders: {
            where: { status: { in: [...ACTIVE_STATUSES] } },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              code: true,
              status: true,
              total: true,
              createdAt: true,
            },
          },
        },
        orderBy: { name: "asc" },
      })
      .then((rows) =>
        rows.flatMap((row) => {
          const order = row.orders[0];
          if (!order) return [];
          return [
            {
              id: row.id,
              name: row.name,
              area: row.area,
              orderCode: order.code,
              status: order.status,
              total: order.total,
              since: order.createdAt.toISOString(),
            },
          ];
        })
      )
  );

  const activityTask = capture(
    (async () => {
      const [auditRows, orderRows] = await Promise.all([
        prisma.auditLog.findMany({
          orderBy: { createdAt: "desc" },
          take: 50,
          include: { user: { select: { name: true } } },
        }),
        prisma.order.findMany({
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            id: true,
            code: true,
            customerName: true,
            createdAt: true,
            table: { select: { name: true } },
          },
        }),
      ]);

      const auditActivities: DashboardActivity[] = auditRows.map((row) => ({
        id: `audit-${row.id}`,
        action: row.action,
        text: describeAudit(row.action, row.entity, row.meta),
        actor: row.user?.name ?? "Sistem",
        createdAt: row.createdAt.toISOString(),
        entity: row.entity,
        entityId: row.entityId,
      }));

      const orderActivities: DashboardActivity[] = orderRows.map((row) => ({
        id: `order-${row.id}`,
        action: "order.created",
        text: `Pesanan ${row.code} dibuat · ${row.table.name}`,
        actor: row.customerName?.trim() || "Pelanggan",
        createdAt: row.createdAt.toISOString(),
        entity: "Order",
        entityId: row.id,
      }));

      return [...auditActivities, ...orderActivities]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 50);
    })()
  );

  const [
    kpiResult,
    seriesResult,
    compositionResult,
    bestSellerResult,
    cashierResult,
    tableResult,
    activityResult,
  ] = await Promise.all([
    kpiTask,
    seriesTask,
    compositionTask,
    bestSellerTask,
    cashierTask,
    tableTask,
    activityTask,
  ]);

  const errors: DashboardData["errors"] = {};
  if (kpiResult.failed) errors.kpi = true;
  if (seriesResult.failed) errors.series = true;
  if (compositionResult.failed) errors.komposisi = true;
  if (bestSellerResult.failed) errors.menuTerlaris = true;
  if (cashierResult.failed) errors.kasirAktif = true;
  if (tableResult.failed) errors.mejaAktif = true;
  if (activityResult.failed) errors.aktivitas = true;

  return {
    profile: {
      name: profile.name,
      role: profile.role === "SUPER_ADMIN" ? "Super Admin" : "Kasir",
    },
    kpi: kpiResult.data,
    series: seriesResult.data,
    komposisi: compositionResult.data,
    menuTerlaris: bestSellerResult.data,
    kasirAktif: cashierResult.data,
    mejaAktif: tableResult.data,
    aktivitasTerbaru: activityResult.data,
    granularity,
    errors,
  };
}
