import { NextRequest, NextResponse } from "next/server";
import { loginSchema } from "@/lib/validators/auth";
import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { createSession } from "@/lib/session";
import {
  isRateLimited,
  rateLimitHeaders,
  recordFailedAttempt,
  resetRateLimit,
} from "@/lib/rate-limiter";
import { getClientIp } from "@/lib/client-ip";
import { apiErrorResponse } from "@/lib/api";
import { logger } from "@/lib/logger";
import { Role } from "@prisma/client";

/**
 * SEC-03: hash dummy berparameter sama dengan hash asli. Dibuat sekali saat
 * modul dimuat agar jalur "user tidak ada/nonaktif" tetap membayar biaya Argon2.
 */
const DUMMY_PASSWORD_HASH = hashPassword("dummy-login-timing-password");

function invalidCredentials(): NextResponse {
  return apiErrorResponse(
    "UNAUTHENTICATED",
    "Username atau password salah",
    401
  );
}

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const parseResult = loginSchema.safeParse(json);

    if (!parseResult.success) {
      return apiErrorResponse(
        "VALIDATION_ERROR",
        "Validasi gagal",
        400,
        parseResult.error.flatten().fieldErrors
      );
    }

    const { username, password } = parseResult.data;

    // Rate limit terdistribusi: per IP+username dan per IP (anti spraying).
    const ip = getClientIp(req);
    const rateLimitKey = `login:${ip}:${username.toLowerCase()}`;
    const ipRateLimitKey = `login-ip:${ip}`;

    const [rateLimit, ipRateLimit] = await Promise.all([
      isRateLimited(rateLimitKey, 5),
      isRateLimited(ipRateLimitKey, 20),
    ]);
    const blocked = rateLimit.limited ? rateLimit : ipRateLimit;
    if (blocked.limited) {
      return NextResponse.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: `Terlalu banyak percobaan login. Silakan coba lagi dalam ${blocked.retryAfterSeconds} detik.`,
          },
        },
        { status: 429, headers: rateLimitHeaders(blocked) }
      );
    }

    // Cari user di DB
    const user = await prisma.user.findUnique({
      where: { username },
    });

    // Audit login gagal (tanpa password) — audit R-06. Bentuk audit sama untuk
    // user tidak ada, nonaktif, dan password salah agar tidak jadi oracle.
    async function recordLoginFailure(): Promise<void> {
      await Promise.all([
        recordFailedAttempt(rateLimitKey),
        recordFailedAttempt(ipRateLimitKey),
      ]);
      try {
        await prisma.auditLog.create({
          data: {
            userId: null,
            action: "auth.login_failed",
            entity: "User",
            entityId: username,
            meta: { username },
          },
        });
      } catch (auditErr) {
        // Audit tidak boleh menggagalkan respons autentikasi.
        logger.error("Gagal mencatat audit login gagal", auditErr);
      }
    }

    if (!user || !user.isActive) {
      // Constant-work: verifikasi terhadap hash dummy walau user tidak ada.
      await verifyPassword(password, await DUMMY_PASSWORD_HASH);
      await recordLoginFailure();
      return invalidCredentials();
    }

    const isMatch = await verifyPassword(password, user.passwordHash);
    if (!isMatch) {
      await recordLoginFailure();
      return invalidCredentials();
    }

    // Berhasil login: reset percobaan rate limit & catat waktu login
    await Promise.all([
      resetRateLimit(rateLimitKey),
      resetRateLimit(ipRateLimitKey),
    ]);

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    try {
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: "auth.login",
          entity: "User",
          entityId: user.id,
          meta: { username },
        },
      });
    } catch (auditErr) {
      logger.error("Gagal mencatat audit login", auditErr);
    }

    const redirectUrl = user.mustChangePassword
      ? "/change-password"
      : user.role === Role.SUPER_ADMIN
        ? "/admin"
        : "/cashier";

    const response = NextResponse.json({
      success: true,
      message: "Login berhasil",
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      redirectUrl,
    });

    // Pasang sesi JWT di cookie httpOnly
    await createSession(
      {
        sub: user.id,
        role: user.role,
        tokenVersion: user.tokenVersion,
        mustChangePassword: user.mustChangePassword,
      },
      response
    );

    return response;
  } catch (err) {
    logger.error("Login API error", err);
    return apiErrorResponse(
      "INTERNAL",
      "Terjadi kesalahan pada server saat login",
      500
    );
  }
}
