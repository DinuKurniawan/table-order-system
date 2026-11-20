import { NextResponse, type NextRequest } from "next/server";
import { handleApiError } from "@/lib/api";
import { getOrderAccessToken } from "@/lib/order-access";
import { cancelOrderByCustomer } from "@/server/services/orders";
import { consumeRateLimit, tooManyRequests } from "@/lib/rate-limiter";
import { getClientIp } from "@/lib/client-ip";


/**
 * POST /api/public/orders/[code]/cancel
 * Batalkan pesanan saat masih AWAITING_PAYMENT. Stok dikembalikan.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const limiter = await consumeRateLimit(
      `cancel:${code}:${getClientIp(req)}`,
      10,
      60
    );
    if (limiter.limited) return tooManyRequests(limiter);

    const token = getOrderAccessToken(req, code) ?? "";
    await cancelOrderByCustomer(code, token);
    return NextResponse.json({ ok: true, status: "CANCELLED" });
  } catch (err) {
    return handleApiError(err);
  }
}
