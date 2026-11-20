import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { createImageUploadUrls, UPLOAD_URL_EXPIRES_SEC } from "@/server/services/upload";
import { env } from "@/lib/env";
import { getSignedReadUrl } from "@/lib/r2";
import { logger } from "@/lib/logger";
import { handleApiError, readJson } from "@/lib/api";
import { consumeRateLimit, tooManyRequests } from "@/lib/rate-limiter";

const PRIVATE_ATTACHMENT_PREFIX = "attachments/finance/";

const presignSchema = z.object({
  contentType: z.string().min(1),
  size: z.number().int().positive(),
});

/**
 * Unggah lampiran transaksi keuangan secara langsung ke bucket privat R2.
 * Client mengirim JSON `{ contentType, size }`, menerima `key` + `uploadUrl`,
 * lalu PUT berkas ke R2 tanpa melewati Next.js.
 */
export async function POST(req: Request) {
  try {
    const user = await requireRole(["SUPER_ADMIN"]);

    const limiter = await consumeRateLimit(`upload:${user.id}`, 30, 60);
    if (limiter.limited) return tooManyRequests(limiter);

    const input = presignSchema.parse(await readJson(req));
    const result = await createImageUploadUrls({
      preset: "attachment",
      bucket: "private",
      prefix: "attachments/finance",
      contentType: input.contentType,
      size: input.size,
    });

    return NextResponse.json({
      data: {
        key: result.key,
        uploadUrl: result.uploads[0].uploadUrl,
        size: result.size,
        format: result.format,
        expiresIn: UPLOAD_URL_EXPIRES_SEC,
      },
    });
  } catch (err) {
    if (!(err instanceof AppError)) {
      logger.error("API Finance Attachment Error", err);
    }
    return handleApiError(err);
  }
}

/**
 * GET /api/admin/finance/attachment?key=attachments/finance/...
 * Presigned URL 60 detik untuk lampiran privat. Hanya SUPER_ADMIN dan hanya
 * key dengan prefix lampiran keuangan yang diizinkan.
 */
export async function GET(req: NextRequest) {
  try {
    await requireRole(["SUPER_ADMIN"]);

    const key = req.nextUrl.searchParams.get("key") ?? "";
    if (
      !key.startsWith(PRIVATE_ATTACHMENT_PREFIX) ||
      key.includes("..") ||
      key.length > 300
    ) {
      throw new AppError("VALIDATION_ERROR", "Key lampiran tidak valid", 400);
    }

    const url = await getSignedReadUrl(env.R2_BUCKET_PRIVATE, key, 60);
    return NextResponse.json({ data: { url, expiresIn: 60 } });
  } catch (err) {
    if (!(err instanceof AppError)) {
      logger.error("API Finance Attachment URL Error", err);
    }
    return handleApiError(err);
  }
}
