import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { handleApiError } from "@/lib/api";

export async function GET() {
  try {
    await requireRole(["SUPER_ADMIN"]);

    const [awaitingVerification, lowStockRows] = await Promise.all([
      prisma.order.count({ where: { status: "AWAITING_VERIFICATION" } }),
      prisma.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*)::int AS count
        FROM "Product"
        WHERE "deletedAt" IS NULL
          AND "isActive" = true
          AND "trackStock" = true
          AND "stock" <= "lowStockThreshold"
      `,
    ]);

    const lowStock = Number(lowStockRows[0]?.count ?? 0);

    const alerts = [
      {
        id: "awaiting-verification",
        label: "Menunggu verifikasi",
        description: "Pesanan siap diverifikasi kasir",
        count: awaitingVerification,
        href: "/cashier",
      },
      {
        id: "low-stock",
        label: "Stok menipis",
        description: "Produk menyentuh batas stok minimum",
        count: lowStock,
        href: "/admin/stock",
      },
    ].filter((alert) => alert.count > 0);

    return NextResponse.json({
      data: {
        total: awaitingVerification + lowStock,
        alerts,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
