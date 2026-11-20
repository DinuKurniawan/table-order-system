import { NextResponse, type NextRequest } from "next/server";
import { handleApiError } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { getOrderAccessToken } from "@/lib/order-access";
import { getCustomerOrder } from "@/server/services/orders";
import { consumeRateLimit, tooManyRequests } from "@/lib/rate-limiter";
import { getClientIp } from "@/lib/client-ip";


/**
 * GET /api/public/orders/[code]
 * Detail pesanan untuk halaman lacak customer. Butuh accessToken.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const limiter = await consumeRateLimit(
      `order-get:${getClientIp(req)}`,
      60,
      60
    );
    if (limiter.limited) return tooManyRequests(limiter);

    const token = getOrderAccessToken(req, code);
    if (!token) {
      throw new AppError("UNAUTHENTICATED", "Kode akses pesanan diperlukan", 401);
    }

    const order = await getCustomerOrder(code, token);
    return NextResponse.json(order);
  } catch (err) {
    return handleApiError(err);
  }
}
