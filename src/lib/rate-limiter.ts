/**
 * Rate limiter terdistribusi berbasis tabel PostgreSQL.
 *
 * Satu sumber kebenaran untuk semua instance/serverless: setiap percobaan
 * menulis ke tabel "RateLimit" dengan operasi atomik INSERT ... ON CONFLICT,
 * sehingga tidak ada race antar instance.
 *
 * Kunci harus sudah memuat konteks yang relevan (IP, username, token meja,
 * kode pesanan) agar tidak saling mengunci.
 */

import { prisma } from "@/lib/db";

export interface RateLimitResult {
  limited: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

const DEFAULT_WINDOW_SECONDS = 15 * 60;

function toResult(
  attempts: number,
  resetAt: Date,
  maxAttempts: number
): RateLimitResult {
  const retryAfterSeconds = Math.max(
    0,
    Math.ceil((resetAt.getTime() - Date.now()) / 1000)
  );

  return {
    limited: attempts >= maxAttempts,
    remaining: Math.max(0, maxAttempts - attempts),
    retryAfterSeconds,
  };
}

/**
 * Membaca status tanpa menambah hitungan. Dipakai login: pengecekan dilakukan
 * sebelum verifikasi password, pencatatan hanya saat gagal.
 */
export async function isRateLimited(
  key: string,
  maxAttempts: number = 5
): Promise<RateLimitResult> {
  const now = new Date();
  const record = await prisma.rateLimit.findUnique({ where: { key } });

  if (!record || record.resetAt <= now) {
    return {
      limited: false,
      remaining: maxAttempts,
      retryAfterSeconds: 0,
    };
  }

  return toResult(record.attempts, record.resetAt, maxAttempts);
}

/**
 * Menambah satu hitungan atomik dengan jendela waktu tetap. Dipakai endpoint
 * publik: setiap request dihitung, termasuk yang berhasil.
 */
export async function consumeRateLimit(
  key: string,
  maxAttempts: number,
  windowSeconds: number = 60
): Promise<RateLimitResult> {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowSeconds * 1000);

  const rows = await prisma.$queryRaw<Array<{ attempts: number; resetAt: Date }>>`
    INSERT INTO "RateLimit" ("key", "attempts", "resetAt")
    VALUES (${key}, 1, ${resetAt})
    ON CONFLICT ("key") DO UPDATE SET
      "attempts" = CASE
        WHEN "RateLimit"."resetAt" <= ${now} THEN 1
        ELSE "RateLimit"."attempts" + 1
      END,
      "resetAt" = CASE
        WHEN "RateLimit"."resetAt" <= ${now} THEN ${resetAt}
        ELSE "RateLimit"."resetAt"
      END
    RETURNING "attempts", "resetAt"
  `;

  const record = rows[0];
  if (!record) {
    // Tidak mungkin terjadi pada PostgreSQL, tetapi jangan fail-open diam-diam.
    return { limited: true, remaining: 0, retryAfterSeconds: windowSeconds };
  }

  return toResult(record.attempts, record.resetAt, maxAttempts);
}

/**
 * Mencatat percobaan gagal (login). Atomik dan tidak memperpanjang jendela
 * yang sedang berjalan.
 */
export async function recordFailedAttempt(
  key: string,
  windowSeconds: number = DEFAULT_WINDOW_SECONDS
): Promise<void> {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowSeconds * 1000);

  await prisma.$queryRaw`
    INSERT INTO "RateLimit" ("key", "attempts", "resetAt")
    VALUES (${key}, 1, ${resetAt})
    ON CONFLICT ("key") DO UPDATE SET
      "attempts" = CASE
        WHEN "RateLimit"."resetAt" <= ${now} THEN 1
        ELSE "RateLimit"."attempts" + 1
      END,
      "resetAt" = CASE
        WHEN "RateLimit"."resetAt" <= ${now} THEN ${resetAt}
        ELSE "RateLimit"."resetAt"
      END
  `;
}

export async function resetRateLimit(key: string): Promise<void> {
  await prisma.rateLimit.deleteMany({ where: { key } });
}

/**
 * Membersihkan baris kedaluwarsa. Dipanggil dari cron agar tabel tidak tumbuh
 * tanpa batas.
 */
export async function cleanupExpiredRateLimits(): Promise<number> {
  const result = await prisma.rateLimit.deleteMany({
    where: { resetAt: { lt: new Date() } },
  });
  return result.count;
}

export function rateLimitHeaders(result: RateLimitResult): HeadersInit {
  return {
    "Retry-After": String(result.retryAfterSeconds),
    "X-RateLimit-Remaining": String(result.remaining),
  };
}

export function tooManyRequests(result: RateLimitResult): Response {
  return Response.json(
    {
      error: `Terlalu banyak permintaan. Coba lagi dalam ${result.retryAfterSeconds} detik.`,
      code: "RATE_LIMITED",
    },
    { status: 429, headers: rateLimitHeaders(result) }
  );
}
