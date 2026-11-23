export interface VoucherDiscountRule {
  type: "PERCENT" | "FIXED";
  value: number;
  maxDiscount: number | null;
}

/**
 * Diskon selalu bilangan bulat rupiah dan tidak pernah melebihi subtotal.
 * Pembulatan persen ke bawah agar kafe tidak menanggung pembulatan berlebih.
 */
export function computeVoucherDiscount(
  voucher: VoucherDiscountRule,
  subtotal: number
): number {
  if (subtotal <= 0) return 0;

  const discount =
    voucher.type === "PERCENT"
      ? Math.floor((subtotal * voucher.value) / 100)
      : voucher.value;

  const capped =
    voucher.maxDiscount !== null
      ? Math.min(discount, voucher.maxDiscount)
      : discount;

  return Math.max(0, Math.min(capped, subtotal));
}
