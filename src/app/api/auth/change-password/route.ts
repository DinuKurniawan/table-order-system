import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hashPassword, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, apiErrorResponse } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { changePasswordSchema } from "@/lib/validators/auth";
import { passwordPolicyError } from "@/lib/password-policy";
import { getClientIp } from "@/lib/client-ip";
import { consumeRateLimit, rateLimitHeaders } from "@/lib/rate-limiter";
import { destroySession } from "@/lib/session";
import { logger } from "@/lib/logger";
import { runInTransaction } from "@/lib/tx";

/**
 * POST /api/auth/change-password
 *
 * Satu-satunya endpoint yang boleh dipakai saat mustChangePassword=true.
 * Setelah berhasil: tokenVersion naik (sesi lama mati), flag false, audit dicatat.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return apiErrorResponse(
        "UNAUTHENTICATED",
        "Sesi Anda tidak valid atau telah berakhir. Silakan login kembali.",
        401
      );
    }

    const ip = getClientIp(req);
    const limit = await consumeRateLimit(
      `change-password:${ip}:${user.id}`,
      5,
      15 * 60
    );
    if (limit.limited) {
      return NextResponse.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: `Terlalu banyak percobaan. Coba lagi dalam ${limit.retryAfterSeconds} detik.`,
          },
        },
        { status: 429, headers: rateLimitHeaders(limit) }
      );
    }

    const parsed = changePasswordSchema.safeParse(await req.json());
    if (!parsed.success) {
      return apiErrorResponse(
        "VALIDATION_ERROR",
        "Validasi gagal",
        400,
        parsed.error.flatten().fieldErrors
      );
    }

    const { currentPassword, newPassword } = parsed.data;
    const policyError = passwordPolicyError(newPassword, {
      username: user.username,
    });
    if (policyError) {
      return apiErrorResponse("VALIDATION_ERROR", policyError, 400, {
        newPassword: [policyError],
      });
    }

    const record = await prisma.user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true, tokenVersion: true },
    });
    if (!record) {
      return apiErrorResponse("UNAUTHENTICATED", "Sesi tidak valid", 401);
    }

    if (!(await verifyPassword(currentPassword, record.passwordHash))) {
      return apiErrorResponse(
        "UNAUTHENTICATED",
        "Password saat ini salah",
        401
      );
    }

    // Tolak pemakaian ulang password lama (termasuk bila flag sudah false).
    if (await verifyPassword(newPassword, record.passwordHash)) {
      return apiErrorResponse(
        "VALIDATION_ERROR",
        "Password baru tidak boleh sama dengan password lama",
        400,
        { newPassword: ["Password baru tidak boleh sama dengan password lama"] }
      );
    }

    const newHash = await hashPassword(newPassword);

    await runInTransaction(async (tx) => {
      const updated = await tx.user.updateMany({
        where: { id: user.id, tokenVersion: record.tokenVersion },
        data: {
          passwordHash: newHash,
          mustChangePassword: false,
          tokenVersion: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        throw new AppError(
          "CONFLICT",
          "Password sudah diubah oleh sesi lain. Silakan login kembali.",
          409
        );
      }
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "auth.password_changed",
          entity: "User",
          entityId: user.id,
          meta: { username: user.username },
        },
      });
    });

    const response = NextResponse.json({
      success: true,
      message: "Password berhasil diubah. Silakan login kembali.",
    });
    await destroySession(response);
    return response;
  } catch (err) {
    logger.error("Change password API error", err);
    return handleApiError(err);
  }
}
