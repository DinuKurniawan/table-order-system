import crypto from "crypto";
import { env } from "@/lib/env";
import { timingSafeEqualString } from "@/lib/order-access";

/**
 * Kode pesanan & token akses customer (SEC-06, SEC-09).
 *
 * Kode: `ORD-YYMMDD-XXXXXXXX` dengan alfabet base32 tanpa karakter ambigu
 * (0/O/1/I/L). 8 karakter acak ~ 31^8 (≈ 8,5 × 10^11) kombinasi per hari.
 * Kode lama berformat lain tetap dibaca karena lookup hanya memakai string.
 */
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function randomCode(length: number): string {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

export function generateOrderCode(now: Date = new Date()): string {
  const datePart = now.toISOString().slice(2, 10).replace(/-/g, "");
  return `ORD-${datePart}-${randomCode(8)}`;
}

/**
 * Token akses 256-bit. Diturunkan dari Idempotency-Key agar replay
 * idempotensi dapat mengembalikan token yang sama tanpa menyimpan plaintext.
 */
export function deriveOrderAccessToken(idempotencyKey: string): string {
  return crypto
    .createHmac("sha256", env.SESSION_SECRET)
    .update(`order-access:${idempotencyKey}`)
    .digest("hex");
}

export function hashAccessToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export interface StoredAccessToken {
  accessToken: string | null;
  accessTokenHash: string | null;
}

/**
 * Bandingkan token mentah dengan hash (pesanan baru) atau plaintext
 * (pesanan lama yang belum di-backfill).
 */
export function accessTokenMatches(
  token: string,
  stored: StoredAccessToken
): boolean {
  if (stored.accessTokenHash) {
    return timingSafeEqualString(
      hashAccessToken(token),
      stored.accessTokenHash
    );
  }
  if (stored.accessToken) {
    return timingSafeEqualString(token, stored.accessToken);
  }
  return false;
}
