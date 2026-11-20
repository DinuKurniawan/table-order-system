import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { handleApiError, readJson } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { getOrderAccessToken } from "@/lib/order-access";
import { submitPaymentProof } from "@/server/services/orders";
import {
  consumeRateLimit,
  tooManyRequests,
} from "@/lib/rate-limiter";
import { getClientIp } from "@/lib/client-ip";

const confirmSchema = z.object({
  key: z.string().min(1).max(300),
});

/**
 * POST /api/public/orders/[code]/payment
 * Mencatat bukti pembayaran yang sudah diunggah langsung ke R2.
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
      `proof:${code}:${getClientIp(req)}`,
      10,
      60
    );
    if (limiter.limited) return tooManyRequests(limiter);

    const { key } = confirmSchema.parse(await readJson(req));
    const result = await submitPaymentProof(code, token, key);

    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}
