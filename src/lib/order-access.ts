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
 */
export function timingSafeEqualString(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}
