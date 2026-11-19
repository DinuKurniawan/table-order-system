import { NextResponse, type NextRequest } from "next/server";
import { handleApiError } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { getOrderAccessToken } from "@/lib/order-access";
import { cancelOrderByCustomer } from "@/server/services/orders";


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
    const token = getOrderAccessToken(req, code);
    if (!token) {
      throw new AppError("UNAUTHORIZED", "Kode akses pesanan diperlukan", 401);
    }

    await cancelOrderByCustomer(code, token);
    return NextResponse.json({ ok: true, status: "CANCELLED" });
  } catch (err) {
    return handleApiError(err);
  }
}
