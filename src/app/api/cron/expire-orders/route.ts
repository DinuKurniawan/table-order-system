import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { timingSafeEqualString } from "@/lib/order-access";
import { handleApiError } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { expireOrders } from "@/server/services/orders";
import { cleanupExpiredRateLimits } from "@/lib/rate-limiter";

/**
 * GET /api/cron/expire-orders
 * Dipanggil penjadwal (Vercel Cron) setiap menit. Header wajib:
 * Authorization: Bearer <CRON_SECRET>
 */
export async function GET(req: Request) {
  try {
    const expected = `Bearer ${env.CRON_SECRET}`;
    const provided = req.headers.get("authorization") ?? "";

    if (!timingSafeEqualString(provided, expected)) {
      throw new AppError("UNAUTHORIZED", "Kredensial cron tidak valid", 401);
    }

    const result = await expireOrders();
    await cleanupExpiredRateLimits();
    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}
