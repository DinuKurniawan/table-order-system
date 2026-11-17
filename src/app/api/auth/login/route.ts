import { NextRequest, NextResponse } from "next/server";
import { loginSchema } from "@/lib/validators/auth";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth";
import { createSession } from "@/lib/session";
import { isRateLimited, recordFailedAttempt, resetRateLimit } from "@/lib/rate-limiter";
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

    // Deteksi IP pengakses untuk rate limiter
    const forwardedFor = req.headers.get("x-forwarded-for");
    const ip = forwardedFor ? forwardedFor.split(",")[0].trim() : "127.0.0.1";
    const rateLimitKey = `login:${ip}:${username.toLowerCase()}`;

    // Cek batas percobaan login
    const rateLimit = isRateLimited(rateLimitKey, 5);
    if (rateLimit.limited) {
      return NextResponse.json(
        {
          error: `Terlalu banyak percobaan login. Silakan coba lagi dalam ${rateLimit.retryAfterSeconds} detik.`,
        },
        {
          status: 429,
          headers: {
            "Retry-After": rateLimit.retryAfterSeconds.toString(),
          },
        }
      );
    }

    // Cari user di DB
    const user = await prisma.user.findUnique({
      where: { username },
    });

    if (!user || !user.isActive) {
      recordFailedAttempt(rateLimitKey);
      return NextResponse.json(
        { error: "Username atau password salah" },
        { status: 401 }
      );
    }

    const isMatch = await verifyPassword(password, user.passwordHash);
    if (!isMatch) {
      recordFailedAttempt(rateLimitKey);
      return NextResponse.json(
        { error: "Username atau password salah" },
        { status: 401 }
      );
    }

    // Berhasil login: reset percobaan rate limit & catat waktu login
    resetRateLimit(rateLimitKey);

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
    console.error("Login API error:", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan pada server saat login" },
      { status: 500 }
    );
  }
}
