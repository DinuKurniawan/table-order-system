import { NextResponse, type NextRequest } from "next/server";
import { handleApiError } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { getOrderAccessToken } from "@/lib/order-access";
import { claimQrisPayment } from "@/server/services/orders";
import { consumeRateLimit, tooManyRequests } from "@/lib/rate-limiter";
import { getClientIp } from "@/lib/client-ip";

/**
 * POST /api/public/orders/[code]/payment/qris
 * Customer mengklaim sudah membayar QRIS. Nominal dihitung server-side.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const token = getOrderAccessToken(req, code);
    if (!token) {
      throw new AppError("UNAUTHENTICATED", "Kode akses pesanan diperlukan", 401);
    }

    const limiter = await consumeRateLimit(
      `qris-claim:${code}:${getClientIp(req)}`,
      10,
      60
    );
    if (limiter.limited) return tooManyRequests(limiter);

    const result = await claimQrisPayment(code, token);

    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}
