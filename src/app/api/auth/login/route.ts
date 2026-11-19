import { NextRequest, NextResponse } from "next/server";
import { loginSchema } from "@/lib/validators/auth";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth";
import { createSession } from "@/lib/session";
import {
  getClientIp,
  isRateLimited,
  rateLimitHeaders,
  recordFailedAttempt,
  resetRateLimit,
} from "@/lib/rate-limiter";
import { logger } from "@/lib/logger";
import { Role } from "@prisma/client";

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const parseResult = loginSchema.safeParse(json);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: "Validasi gagal",
          details: parseResult.error.flatten().fieldErrors,
        },
        { status: 400 }
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
          error: `Terlalu banyak percobaan login. Silakan coba lagi dalam ${blocked.retryAfterSeconds} detik.`,
        },
        { status: 429, headers: rateLimitHeaders(blocked) }
      );
    }

    // Cari user di DB
    const user = await prisma.user.findUnique({
      where: { username },
    });

    if (!user || !user.isActive) {
      await Promise.all([
        recordFailedAttempt(rateLimitKey),
        recordFailedAttempt(ipRateLimitKey),
      ]);
      return NextResponse.json(
        { error: "Username atau password salah" },
        { status: 401 }
      );
    }

    const isMatch = await verifyPassword(password, user.passwordHash);
    if (!isMatch) {
      await Promise.all([
        recordFailedAttempt(rateLimitKey),
        recordFailedAttempt(ipRateLimitKey),
      ]);
      return NextResponse.json(
        { error: "Username atau password salah" },
        { status: 401 }
      );
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

    const redirectUrl = user.role === Role.SUPER_ADMIN ? "/admin" : "/cashier";

    const response = NextResponse.json({
      success: true,
      message: "Login berhasil",
      role: user.role,
      redirectUrl,
    });

    // Pasang sesi JWT di cookie httpOnly
    await createSession(
      {
        sub: user.id,
        role: user.role,
        tokenVersion: user.tokenVersion,
      },
      response
    );

    return response;
  } catch (err) {
    logger.error("Login API error", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan pada server saat login" },
      { status: 500 }
    );
  }
}
