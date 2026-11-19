import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { consumeRateLimit, getClientIp, tooManyRequests } from "@/lib/rate-limiter";
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
      return NextResponse.json(
        { error: "Meja tidak aktif atau tidak ditemukan" },
        { status: 400 }
      );
    }

    const products = await getPublicMenu({ token, search, category });
    return NextResponse.json({ products });
  } catch (err) {
    if (err instanceof Error && /Meja tidak aktif/.test(err.message)) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    logger.error("Error fetching public menu", err);
    return NextResponse.json({ error: "Gagal memuat menu" }, { status: 500 });
  }
}
