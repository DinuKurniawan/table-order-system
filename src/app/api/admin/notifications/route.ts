import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { handleApiError } from "@/lib/api";
import { runInTransaction } from "@/lib/tx";
import { unreadNotificationTotal } from "@/lib/notification-read-state";

const MAX_READS_PER_REQUEST = 20;

/** Validasi payload penandaan baca; item rusak dilewati. */
function parseReads(
  body: unknown
): Array<{ alertId: string; seenAt: Date }> {
  const raw = (body as { alerts?: unknown } | null)?.alerts;
  if (!Array.isArray(raw)) return [];

  const reads: Array<{ alertId: string; seenAt: Date }> = [];
  for (const item of raw.slice(0, MAX_READS_PER_REQUEST)) {
    const { id, latestAt } = (item ?? {}) as {
      id?: unknown;
      latestAt?: unknown;
    };
    if (typeof id !== "string" || id.length === 0 || id.length > 64) continue;

    const time = typeof latestAt === "string" ? Date.parse(latestAt) : NaN;
    if (!Number.isFinite(time)) continue;
    reads.push({ alertId: id, seenAt: new Date(time) });
  }
  return reads;
}

export async function GET() {
  try {
    const user = await requireRole(["SUPER_ADMIN"]);

    const [awaitingVerification, lowStockRows] = await Promise.all([
      prisma.order.aggregate({
        where: { status: "AWAITING_VERIFICATION" },
        _count: { _all: true },
        _max: { updatedAt: true },
      }),
      prisma.$queryRaw<Array<{ count: number; latestAt: Date | null }>>`
        SELECT COUNT(*)::int AS count, MAX("updatedAt") AS "latestAt"
        FROM "Product"
        WHERE "deletedAt" IS NULL
          AND "isActive" = true
          AND "trackStock" = true
          AND "stock" <= "lowStockThreshold"
      `,
    ]);

    const awaitingCount = awaitingVerification._count._all;
    const awaitingLatestAt = awaitingVerification._max.updatedAt;
    const lowStock = Number(lowStockRows[0]?.count ?? 0);
    const lowStockLatestAt = lowStockRows[0]?.latestAt ?? null;

    const baseAlerts = [
      {
        id: "awaiting-verification",
        label: "Menunggu verifikasi",
        description: "Pesanan siap diverifikasi kasir",
        count: awaitingCount,
        latestAt: (awaitingLatestAt ?? new Date(0)).toISOString(),
        href: "/cashier",
      },
      {
        id: "low-stock",
        label: "Stok menipis",
        description: "Produk menyentuh batas stok minimum",
        count: lowStock,
        latestAt: (lowStockLatestAt ?? new Date(0)).toISOString(),
        href: "/admin/stock",
      },
    ].filter((alert) => alert.count > 0);

    const reads = await prisma.notificationRead.findMany({
      where: {
        userId: user.id,
        alertId: { in: baseAlerts.map((alert) => alert.id) },
      },
      select: { alertId: true, seenAt: true },
    });
    const seenById = new Map(
      reads.map((read) => [read.alertId, read.seenAt.toISOString()])
    );

    const alerts = baseAlerts.map((alert) => ({
      ...alert,
      seenAt: seenById.get(alert.id) ?? null,
    }));

    return NextResponse.json({
      data: {
        total: unreadNotificationTotal(alerts),
        alerts,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}

/** Tandai alert sudah dibaca untuk admin yang sedang login. */
export async function POST(req: Request) {
  try {
    const user = await requireRole(["SUPER_ADMIN"]);

    const body = await req.json().catch(() => null);
    const reads = parseReads(body);
    if (reads.length === 0) {
      return NextResponse.json({ data: { updated: 0 } });
    }

    const now = new Date();
    await runInTransaction(async (tx) => {
      for (const read of reads) {
        await tx.$executeRaw`
          INSERT INTO "NotificationRead" ("userId", "alertId", "seenAt")
          VALUES (
            ${user.id},
            ${read.alertId},
            ${read.seenAt > now ? now : read.seenAt}
          )
          ON CONFLICT ("userId", "alertId")
          DO UPDATE SET "seenAt" = GREATEST(
            "NotificationRead"."seenAt",
            EXCLUDED."seenAt"
          )
        `;
      }
    });

    return NextResponse.json({ data: { updated: reads.length } });
  } catch (err) {
    return handleApiError(err);
  }
}
