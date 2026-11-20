import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiErrorResponse, handleApiError, readJson } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { orderAccessCookieName } from "@/lib/order-access";
import { getCustomerOrder } from "@/server/services/orders";
import {
  consumeRateLimit,
  tooManyRequests,
} from "@/lib/rate-limiter";
import { getClientIp } from "@/lib/client-ip";


const accessSchema = z.object({
  token: z.string().trim().min(1, "Kode akses wajib diisi"),
});

/**
 * POST /api/public/orders/[code]/access
 * Validasi kode akses lalu simpan sebagai cookie httpOnly.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const limiter = await consumeRateLimit(
      `access:${code}:${getClientIp(req)}`,
      10,
      10 * 60
    );
    if (limiter.limited) return tooManyRequests(limiter);

    const body = accessSchema.parse(await readJson(req));

    await getCustomerOrder(code, body.token);

    const response = NextResponse.json({ ok: true });
    response.cookies.set(orderAccessCookieName(code), body.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 24 * 60 * 60,
    });
    return response;
  } catch (err) {
    // SEC-06: kode tidak ada / token salah / kosong tidak dibedakan.
    if (err instanceof AppError && err.status === 404) {
      return apiErrorResponse(
        "NOT_FOUND",
        "Kode pesanan atau kode akses tidak cocok",
        404
      );
    }
    return handleApiError(err);
  }
}
