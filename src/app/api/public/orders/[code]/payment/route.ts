import { NextResponse, type NextRequest } from "next/server";
import { handleApiError } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { getOrderAccessToken } from "@/lib/order-access";
import { submitPaymentProof } from "@/server/services/orders";
import {
  consumeRateLimit,
  tooManyRequests,
} from "@/lib/rate-limiter";
import { getClientIp } from "@/lib/client-ip";

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

/**
 * POST /api/public/orders/[code]/payment
 * Unggah bukti pembayaran (multipart). File dikonversi ke AVIF dan disimpan
 * di bucket privat R2 melalui service upload.
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

    const limiter = await consumeRateLimit(
      `proof:${code}:${getClientIp(req)}`,
      10,
      60
    );
    if (limiter.limited) return tooManyRequests(limiter);

    const contentLength = Number(req.headers.get("content-length") ?? 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_BYTES) {
      throw new AppError("BAD_REQUEST", "Ukuran unggahan terlalu besar", 413);
    }

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new AppError("BAD_REQUEST", "Body harus berupa multipart/form-data", 400);
    }

    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      throw new AppError("BAD_REQUEST", "Berkas bukti pembayaran wajib diunggah", 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await submitPaymentProof(code, token, buffer);

    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}
