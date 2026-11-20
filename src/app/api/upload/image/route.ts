import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { createImageUploadUrls } from "@/server/services/upload";
import { ImagePresetKey } from "@/lib/image";
import { logger } from "@/lib/logger";
import { handleApiError, readJson } from "@/lib/api";
import { consumeRateLimit, tooManyRequests } from "@/lib/rate-limiter";

const ALLOWED_ADMIN_PRESETS: ImagePresetKey[] = [
  "product",
  "qris",
  "attachment",
];

const presignSchema = z.object({
  preset: z.enum(["product", "qris", "attachment"]).default("product"),
  contentType: z.string().min(1),
  size: z.number().int().positive(),
  thumb: z
    .object({
      contentType: z.string().min(1),
      size: z.number().int().positive(),
    })
    .optional(),
});

/**
 * POST /api/upload/image
 * Membuat presigned URL untuk unggah langsung browser ke R2. Body JSON:
 * `{ preset, contentType, size, thumb? }`. Server tidak menerima byte gambar.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireRole(["SUPER_ADMIN"]);

    const limiter = await consumeRateLimit(`upload:${user.id}`, 30, 60);
    if (limiter.limited) return tooManyRequests(limiter);

    const input = presignSchema.parse(await readJson(req));
    const preset = input.preset as ImagePresetKey;

    if (!ALLOWED_ADMIN_PRESETS.includes(preset)) {
      throw new AppError(
        "VALIDATION_ERROR",
        `Preset tidak valid. Preset yang diizinkan: ${ALLOWED_ADMIN_PRESETS.join(", ")}`,
        400
      );
    }

    const result = await createImageUploadUrls({
      preset,
      bucket: "public",
      contentType: input.contentType,
      size: input.size,
      thumb: preset === "product" ? input.thumb : undefined,
    });

    return NextResponse.json({ data: result });
  } catch (err) {
    if (!(err instanceof AppError)) {
      logger.error("API Upload Image Error", err);
    }
    return handleApiError(err);
  }
}
