import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { processAndStore } from "@/server/services/upload";
import { ImagePresetKey } from "@/lib/image";
import { logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api";
import { consumeRateLimit, tooManyRequests } from "@/lib/rate-limiter";

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

const ALLOWED_ADMIN_PRESETS: ImagePresetKey[] = [
  "product",
  "qris",
  "attachment",
];

export async function POST(req: NextRequest) {
  try {
    // 1. Otorisasi: hanya Super Admin yang diizinkan mengunggah via rute ini
    const user = await requireRole(["SUPER_ADMIN"]);

    const limiter = await consumeRateLimit(`upload:${user.id}`, 30, 60);
    if (limiter.limited) return tooManyRequests(limiter);

    const contentLength = Number(req.headers.get("content-length") ?? 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_BYTES) {
      throw new AppError("VALIDATION_ERROR", "Ukuran unggahan terlalu besar", 413);
    }

    // 2. Baca multipart/form-data
    const formData = await req.formData();
    const file = formData.get("file");
    const presetParam = formData.get("preset");

    if (!file || !(file instanceof File)) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Berkas gambar ('file') wajib dilampirkan",
        400
      );
    }

    const preset = (presetParam as ImagePresetKey) || "product";

    if (!ALLOWED_ADMIN_PRESETS.includes(preset)) {
      throw new AppError(
        "VALIDATION_ERROR",
        `Preset tidak valid. Preset yang diizinkan: ${ALLOWED_ADMIN_PRESETS.join(", ")}`,
        400
      );
    }

    // 3. Konversi file ke Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 4. Proses dan simpan ke Cloudflare R2
    const result = await processAndStore({
      file: buffer,
      preset,
      bucket: "public",
    });

    return NextResponse.json({
      success: true,
      message: "Gambar berhasil diproses dan disimpan ke format AVIF",
      data: result,
    });
  } catch (err) {
    if (!(err instanceof AppError)) {
      logger.error("API Upload Image Error", err);
    }
    return handleApiError(err);
  }
}
