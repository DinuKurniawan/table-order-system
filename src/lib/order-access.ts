import crypto from "crypto";
import type { NextRequest } from "next/server";

/**
 * Nama cookie httpOnly yang menyimpan accessToken pesanan customer.
 */
export function orderAccessCookieName(code: string): string {
  return `order_${code}`;
}

/**
 * Membaca accessToken pesanan dari cookie httpOnly atau header alternatif.
 */
export function getOrderAccessToken(
  req: NextRequest,
  code: string
): string | null {
  return (
    req.cookies.get(orderAccessCookieName(code))?.value ??
    req.headers.get("x-order-token")
  );
}

/**
 * Perbandingan string constant-time untuk token rahasia.
 *
 * Kedua nilai di-HMAC-SHA256 dengan kunci acak per proses, lalu digest
 * berpanjang tetap dibandingkan. Tidak ada early-return: panjang asli tidak
 * teramati dan waktu eksekusi tidak bergantung pada isi.
 */
const COMPARE_KEY = crypto.randomBytes(32);

function hmacDigest(value: string): Buffer {
  return crypto.createHmac("sha256", COMPARE_KEY).update(value).digest();
}

export function timingSafeEqualString(a: string, b: string): boolean {
  return crypto.timingSafeEqual(hmacDigest(a), hmacDigest(b));
}
