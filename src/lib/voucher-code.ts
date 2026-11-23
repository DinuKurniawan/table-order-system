import { customAlphabet } from "nanoid";
import { z } from "@/lib/zod";

/**
 * Alfabet kode voucher: tanpa I, O, 0, 1 agar tidak salah baca saat
 * customer mengetik ulang kode dari struk/WhatsApp.
 */
export const VOUCHER_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const VOUCHER_CODE_LENGTH = 8;

export const generateVoucherCode = customAlphabet(
  VOUCHER_CODE_ALPHABET,
  VOUCHER_CODE_LENGTH
);

export function normalizeVoucherCode(code: string): string {
  return code.trim().toUpperCase();
}

export const voucherCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(
    /^[A-Z0-9_-]{4,24}$/,
    "Kode 4–24 karakter, hanya huruf, angka, - dan _"
  );

export type VoucherCode = z.infer<typeof voucherCodeSchema>;
