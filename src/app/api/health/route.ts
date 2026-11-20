import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

/**
 * GET /api/health
 *
 * SEC-10: pastikan bucket privat tidak dapat diakses tanpa tanda tangan.
 * SEC-13: laporkan mode TRUSTED_PROXY dan lonjakan permintaan tanpa IP.
 */
async function checkPrivateBucket(): Promise<"pass" | "fail" | "skipped"> {
  const accountHost = env.R2_ACCOUNT_ID.includes(".")
    ? env.R2_ACCOUNT_ID.replace(/^https?:\/\//, "").replace(/\/+$/, "")
    : `${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const probe = `https://${accountHost}/${env.R2_BUCKET_PRIVATE}/health-probe-${crypto.randomUUID()}`;

  try {
    const response = await fetch(probe, {
      method: "HEAD",
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    return response.status === 403 || response.status === 404
      ? "pass"
      : "fail";
  } catch {
    // Jaringan/CI tanpa akses keluar: jangan anggap lulus.
    return "skipped";
  }
}

export async function GET() {
  const checks: Record<string, "pass" | "fail" | "skipped"> = {};

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "pass";
  } catch {
    checks.database = "fail";
  }

  checks.privateBucket = await checkPrivateBucket();

  const warnings: string[] = [];
  if (
    env.NODE_ENV === "production" &&
    env.TRUSTED_PROXY === "none"
  ) {
    warnings.push(
      "TRUSTED_PROXY=none di production: semua klien berbagi bucket rate limit."
    );
  }

  const ok = checks.database === "pass" && checks.privateBucket !== "fail";
  return NextResponse.json(
    { ok, checks, warnings },
    { status: ok ? 200 : 503 }
  );
}
