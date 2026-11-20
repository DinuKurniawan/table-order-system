import { isIP } from "node:net";
import crypto from "node:crypto";
import { env } from "@/lib/env";

/**
 * IP klien dari sumber tepercaya (audit T-07).
 *
 * Header forwarded hanya dipakai bila memang dipasang oleh proxy yang
 * dikonfigurasi lewat TRUSTED_PROXY. Mode:
 * - `vercel`: x-vercel-forwarded-for / x-real-ip (header platform).
 * - `cloudflare`: cf-connecting-ip, hanya bila request membawa cf-ray.
 * - `none`: IP koneksi langsung; semua header forwarded diabaikan.
 * - `<N>`: entri ke-N dari kanan pada x-forwarded-for.
 *
 * Nilai fallback selalu kunci non-kosong agar tidak ada bucket tanpa nama.
 */

const FALLBACK_PREFIX = "unknown:";

let unknownIpRequests = 0;
let warnedUnknownIp = false;

/** Jumlah permintaan yang tidak bisa dipetakan ke IP (untuk health check). */
export function getUnknownIpCount(): number {
  return unknownIpRequests;
}

/**
 * SEC-13: jangan menyatukan semua klien tanpa IP ke satu bucket global.
 * Kunci fallback memakai hash User-Agent + Accept-Language agar bucket tetap
 * terpisah, dan dicatat agar health check bisa memperingatkan miskonfigurasi.
 */
function fallbackKey(request: Request): string {
  unknownIpRequests += 1;
  if (!warnedUnknownIp) {
    warnedUnknownIp = true;
    console.warn(
      "[client-ip] IP klien tidak terdeteksi; memakai bucket fallback berbasis fingerprint. Periksa TRUSTED_PROXY."
    );
  }
  const ua = request.headers.get("user-agent") ?? "";
  const lang = request.headers.get("accept-language") ?? "";
  const fingerprint = crypto
    .createHash("sha256")
    .update(`${ua}\n${lang}`)
    .digest("hex")
    .slice(0, 16);
  return `${FALLBACK_PREFIX}${fingerprint}`;
}

function asIp(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return isIP(trimmed) ? trimmed : null;
}

function firstValid(header: string | null): string | null {
  if (!header) return null;
  for (const part of header.split(",")) {
    const ip = asIp(part);
    if (ip) return ip;
  }
  return null;
}

function fromRight(header: string | null, hop: number): string | null {
  if (!header) return null;
  const parts = header
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return asIp(parts[parts.length - hop]);
}

export function getClientIp(
  request: Request,
  mode: string = env.TRUSTED_PROXY
): string {
  if (mode === "vercel") {
    return (
      firstValid(request.headers.get("x-vercel-forwarded-for")) ??
      asIp(request.headers.get("x-real-ip")) ??
      fallbackKey(request)
    );
  }

  if (mode === "cloudflare") {
    // cf-ray menandakan request melewati Cloudflare; origin wajib menolak
    // koneksi langsung dari luar rentang IP Cloudflare.
    if (!request.headers.get("cf-ray")) return fallbackKey(request);
    return asIp(request.headers.get("cf-connecting-ip")) ?? fallbackKey(request);
  }

  if (mode === "none") {
    // Web Request tidak mengekspos socket; adapter Node tertentu menyediakan ip.
    const direct = (request as Request & { ip?: string }).ip;
    return asIp(direct) ?? fallbackKey(request);
  }

  const hop = Number(mode);
  return (
    fromRight(request.headers.get("x-forwarded-for"), hop) ?? fallbackKey(request)
  );
}
