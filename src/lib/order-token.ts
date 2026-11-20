import crypto from "crypto";

/**
 * Kode pesanan (SEC-06).
 *
 * Format: `ORD-YYMMDD-XXXXXXXX` dengan alfabet base32 tanpa karakter ambigu
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
