import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError, type AppErrorCode } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * Format error seragam: { error: { code, message, fields? } }
 * (ARCHITECTURE bagian 9, audit S-04).
 */
export function apiErrorResponse(
  code: AppErrorCode,
  message: string,
  status: number,
  fields?: Record<string, string[] | undefined>
): NextResponse {
  return NextResponse.json(
    { error: { code, message, ...(fields ? { fields } : {}) } },
    { status }
  );
}

/**
 * Pemetaan error seragam untuk seluruh Route Handler admin.
 */
export function handleApiError(err: unknown): NextResponse {
  if (err instanceof AppError) {
    return apiErrorResponse(err.code, err.message, err.status, err.fields);
  }

  if (err instanceof ZodError) {
    return apiErrorResponse(
      "VALIDATION_ERROR",
      "Validasi gagal",
      400,
      err.flatten().fieldErrors
    );
  }

  logger.error("API error", err);
  return apiErrorResponse("INTERNAL", "Terjadi kesalahan pada server", 500);
}

/**
 * Membaca body JSON dan menolak payload yang bukan objek.
 *
 * SEC-15: batas ukuran ditegakkan saat stream dibaca (bukan hanya dari
 * Content-Length yang bisa dipalsukan). Default 256 KB; endpoint yang butuh
 * lebih dapat mengirim `maxBytes` (mis. checkout publik 64 KB).
 */
export const DEFAULT_JSON_BODY_LIMIT_BYTES = 256 * 1024;

export interface ReadJsonOptions {
  maxBytes?: number;
}

function bodyTooLarge(): AppError {
  return new AppError("PAYLOAD_TOO_LARGE", "Body request terlalu besar", 413);
}

export async function readJson(
  req: Request,
  options: ReadJsonOptions = {}
): Promise<Record<string, unknown>> {
  const limit = options.maxBytes ?? DEFAULT_JSON_BODY_LIMIT_BYTES;

  try {
    const declared = Number(req.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > limit) throw bodyTooLarge();
    if (!req.body) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Body request bukan JSON yang valid",
        400
      );
    }

    const reader = req.body.getReader();
    const decoder = new TextDecoder();
    let received = 0;
    let text = "";

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      received += value.byteLength;
      if (received > limit) {
        await reader.cancel().catch(() => {});
        throw bodyTooLarge();
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();

    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new AppError(
        "VALIDATION_ERROR",
        "Body request bukan JSON yang valid",
        400
      );
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Body request harus berupa objek JSON",
        400
      );
    }
    return body as Record<string, unknown>;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(
      "VALIDATION_ERROR",
      "Body request bukan JSON yang valid",
      400
    );
  }
}
