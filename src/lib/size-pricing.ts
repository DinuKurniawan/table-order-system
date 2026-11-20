import { z } from "zod";

export const cupSizeSchema = z.enum(["REGULER", "LARGE", "JUMBO"]);
export type CupSize = z.infer<typeof cupSizeSchema>;

/** Harga absolut per size; size yang tidak diisi memakai harga dasar. */
export const sizePricesSchema = z
  .object({
    LARGE: z.number().int().nonnegative(),
    JUMBO: z.number().int().nonnegative(),
  })
  .partial();

export type SizePrices = z.infer<typeof sizePricesSchema>;

export function parseSizePrices(value: unknown): SizePrices | null {
  if (!value) return null;
  const parsed = sizePricesSchema.safeParse(value);
  if (!parsed.success || Object.keys(parsed.data).length === 0) return null;
  return parsed.data;
}

export function priceForSize(
  basePrice: number,
  sizePrices: SizePrices | null | undefined,
  size: CupSize | null | undefined
): number {
  if (size === "LARGE") return sizePrices?.LARGE ?? basePrice;
  if (size === "JUMBO") return sizePrices?.JUMBO ?? basePrice;
  return basePrice;
}
