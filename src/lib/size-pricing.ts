import { z } from "@/lib/zod";
import { priceForSize, type SizePrices } from "@/lib/price";

export { priceForSize, type SizePrices };

export const cupSizeSchema = z.enum(["REGULER", "LARGE", "JUMBO"]);
export type CupSize = z.infer<typeof cupSizeSchema>;

export const sizePricesSchema = z
  .object({
    LARGE: z.number().int().nonnegative(),
    JUMBO: z.number().int().nonnegative(),
  })
  .partial();

export function parseSizePrices(value: unknown): SizePrices | null {
  if (!value) return null;
  const parsed = sizePricesSchema.safeParse(value);
  if (!parsed.success || Object.keys(parsed.data).length === 0) return null;
  return parsed.data;
}
