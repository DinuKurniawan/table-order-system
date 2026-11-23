import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { handleApiError, readJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { getClientIp } from "@/lib/client-ip";
import { consumeRateLimit, tooManyRequests } from "@/lib/rate-limiter";
import { resolveOrderPricing } from "@/server/services/order-pricing";
import { previewVoucher } from "@/server/services/vouchers";
import { voucherApplySchema } from "@/lib/validators/voucher";

const MAX_BODY_BYTES = 32 * 1024;

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const ipLimit = await consumeRateLimit(`voucher:validate:${ip}`, 10, 60);
    if (ipLimit.limited) return tooManyRequests(ipLimit);

    const body = await readJson(req, { maxBytes: MAX_BODY_BYTES });
    const parsed = voucherApplySchema.safeParse(body);
    if (!parsed.success) {
      return handleApiError(
        new AppError("VALIDATION_ERROR", "Validasi gagal", 400)
      );
    }
    const { tableToken, code, items } = parsed.data;

    const tableLimit = await consumeRateLimit(
      `voucher:validate:table:${tableToken}`,
      10,
      60
    );
    if (tableLimit.limited) return tooManyRequests(tableLimit);

    const table = await prisma.table.findUnique({ where: { token: tableToken } });
    if (!table || !table.isActive) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Meja tidak aktif atau tidak ditemukan",
        400
      );
    }

    const { subtotal } = await resolveOrderPricing(items);
    const preview = await previewVoucher(code, subtotal);

    return NextResponse.json({ data: preview });
  } catch (err) {
    return handleApiError(err);
  }
}
