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
 */
export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
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
