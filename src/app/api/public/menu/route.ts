import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { consumeRateLimit, tooManyRequests } from "@/lib/rate-limiter";
import { getClientIp } from "@/lib/client-ip";
import { apiErrorResponse } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { getPublicMenu } from "@/server/services/menu";

export async function GET(request: Request) {
  try {
    const ipLimit = await consumeRateLimit(`menu:${getClientIp(request)}`, 120, 60);
    if (ipLimit.limited) return tooManyRequests(ipLimit);

    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token") || "";
    const search = searchParams.get("search") || "";
    const category = searchParams.get("category") || "";

    // Token meja palsu/nonaktif tidak boleh membuka katalog.
    if (!token) {
      return apiErrorResponse(
        "VALIDATION_ERROR",
        "Meja tidak aktif atau tidak ditemukan",
        400
      );
    }

    const products = await getPublicMenu({ token, search, category });
    return NextResponse.json({ products });
  } catch (err) {
    if (err instanceof AppError && err.code === "NOT_FOUND") {
      return apiErrorResponse("NOT_FOUND", err.message, 404);
    }
    logger.error("Error fetching public menu", err);
    return apiErrorResponse("INTERNAL", "Gagal memuat menu", 500);
  }
}
