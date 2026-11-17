import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "@/lib/errors";

/**
 * Pemetaan error seragam untuk seluruh Route Handler admin.
 */
export function handleApiError(err: unknown): NextResponse {
  if (err instanceof AppError) {
    return NextResponse.json(
      { error: err.message, code: err.code },
      { status: err.status }
    );
  }

  if (err instanceof ZodError) {
    return NextResponse.json(
      {
        error: "Validasi gagal",
        details: err.flatten().fieldErrors,
      },
      { status: 400 }
    );
  }

  console.error("API error:", err);
  return NextResponse.json(
    { error: "Terjadi kesalahan pada server" },
    { status: 500 }
  );
}

/**
 * Membaca body JSON dan menolak payload yang bukan objek.
 */
export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new AppError("BAD_REQUEST", "Body request harus berupa objek JSON", 400);
    }
    return body as Record<string, unknown>;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError("BAD_REQUEST", "Body request bukan JSON yang valid", 400);
  }
}
