import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { handleApiError, readJson } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { getOrderAccessToken } from "@/lib/order-access";
import { createPaymentProofUpload } from "@/server/services/orders";
import { consumeRateLimit, tooManyRequests } from "@/lib/rate-limiter";
import { getClientIp } from "@/lib/client-ip";
import { UPLOAD_URL_EXPIRES_SEC } from "@/server/services/upload";

const presignSchema = z.object({
  contentType: z.string().min(1),
  size: z.number().int().positive(),
});

/**
 * POST /api/public/orders/[code]/payment/presign
 * Membuat presigned URL unggah bukti bayar langsung ke bucket privat R2.
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
      `proof-presign:${code}:${getClientIp(req)}`,
      10,
      60
    );
    if (limiter.limited) return tooManyRequests(limiter);

    const input = presignSchema.parse(await readJson(req));
    const result = await createPaymentProofUpload(code, token, input);

    return NextResponse.json({
      data: {
        key: result.key,
        uploadUrl: result.uploads[0].uploadUrl,
        expiresIn: UPLOAD_URL_EXPIRES_SEC,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
