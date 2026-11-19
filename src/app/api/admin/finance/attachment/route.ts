import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { processAndStore } from "@/server/services/upload";
import { env } from "@/lib/env";
import { getSignedReadUrl } from "@/lib/r2";
import { logger } from "@/lib/logger";
import { consumeRateLimit, tooManyRequests } from "@/lib/rate-limiter";

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const PRIVATE_ATTACHMENT_PREFIX = "attachments/finance/";

/**
 * Unggah lampiran transaksi keuangan: dikonversi AVIF dan disimpan di bucket
 * privat. Client mengirim multipart `file`, menerima `key` untuk disimpan pada
 * transaksi.
 */
export async function POST(req: Request) {
  try {
    const user = await requireRole(["SUPER_ADMIN"]);

    const limiter = await consumeRateLimit(`upload:${user.id}`, 30, 60);
    if (limiter.limited) return tooManyRequests(limiter);

    const contentLength = Number(req.headers.get("content-length") ?? 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_BYTES) {
      throw new AppError("BAD_REQUEST", "Ukuran unggahan terlalu besar", 413);
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!file || !(file instanceof File)) {
      throw new AppError("BAD_REQUEST", "Berkas lampiran wajib diunggah", 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await processAndStore({
      file: buffer,
      preset: "attachment",
      bucket: "private",
      prefix: "attachments/finance",
    });

    return NextResponse.json({
      data: { key: result.key, size: result.size, format: result.format },
    });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status }
      );
    }
    logger.error("API Finance Attachment Error", err);
    return NextResponse.json(
      { error: "Gagal memproses lampiran" },
      { status: 500 }
    );
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
      throw new AppError("BAD_REQUEST", "Key lampiran tidak valid", 400);
    }

    const url = await getSignedReadUrl(env.R2_BUCKET_PRIVATE, key, 60);
    return NextResponse.json({ data: { url, expiresIn: 60 } });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status }
      );
    }
    logger.error("API Finance Attachment URL Error", err);
    return NextResponse.json(
      { error: "Gagal membuat tautan lampiran" },
      { status: 500 }
    );
  }
}
