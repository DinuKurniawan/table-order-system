/** Harga absolut per size; size yang tidak diisi memakai harga dasar. */
export type SizePrices = Partial<Record<"LARGE" | "JUMBO", number>>;

/**
 * Fungsi murni tanpa dependensi agar client (halaman item) tidak ikut
 * mengunduh Zod dari modul skema server.
 */
export function priceForSize(
  basePrice: number,
  sizePrices: SizePrices | null | undefined,
  size: "REGULER" | "LARGE" | "JUMBO" | null | undefined
): number {
  if (size === "LARGE") return sizePrices?.LARGE ?? basePrice;
  if (size === "JUMBO") return sizePrices?.JUMBO ?? basePrice;
  return basePrice;
}
