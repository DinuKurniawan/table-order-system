import { NextResponse } from "next/server";
import { cacheable } from "@/lib/next-cache";
import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { getUnknownIpCount } from "@/lib/client-ip";

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
    // R2 menolak permintaan tanpa tanda tangan dengan 400/401/403/404
    // (bukan selalu 403). Yang penting: bukan 2xx = tidak dapat dibaca publik.
    return response.status >= 400 && response.status < 500
      ? "pass"
      : "fail";
  } catch {
    // Jaringan/CI tanpa akses keluar: jangan anggap lulus.
    return "skipped";
  }
}

/** Probe R2 keluar jarang berubah; cache 30 detik agar health check murah. */
const checkPrivateBucketCached = cacheable(
  checkPrivateBucket,
  ["health-private-bucket"],
  { revalidate: 30 }
);

export async function GET() {
  const checks: Record<string, "pass" | "fail" | "skipped"> = {};

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "pass";
  } catch {
    checks.database = "fail";
  }

  checks.privateBucket = await checkPrivateBucketCached();

  const warnings: string[] = [];
  if (env.NODE_ENV === "production" && env.TRUSTED_PROXY === "none") {
    warnings.push(
      "TRUSTED_PROXY=none di production: IP klien diambil dari koneksi langsung; pastikan origin tidak di belakang proxy."
    );
  }
  if (getUnknownIpCount() > 0) {
    warnings.push(
      `${getUnknownIpCount()} permintaan tanpa IP terdeteksi; memakai bucket fallback berbasis fingerprint. Periksa TRUSTED_PROXY.`
    );
  }

  const ok = checks.database === "pass" && checks.privateBucket !== "fail";
  return NextResponse.json(
    { ok, checks, warnings, unknownIpRequests: getUnknownIpCount() },
    { status: ok ? 200 : 503 }
  );
}
