import { z } from "zod";
import { cupSizeSchema } from "@/lib/size-pricing";

export { cupSizeSchema };
export type { CupSize } from "@/lib/size-pricing";

/**
 * Bentuk keranjang yang boleh dibaca dari localStorage (audit R-04).
 * `name` dipakai halaman menu, `productName` dipakai halaman keranjang;
 * keduanya opsional agar data lama tetap terbaca.
 */
export const sugarLevelSchema = z.enum(["NO_SUGAR", "SEDIKIT", "REGULER"]);
export const iceLevelSchema = z.enum(["SEDIKIT", "REGULER"]);
export const temperatureSchema = z.enum(["ICE", "HOT"]);

export const cartItemSchema = z.object({
  productId: z.string().min(1),
  name: z.string().min(1).optional(),
  productName: z.string().min(1).optional(),
  productImage: z.string().optional(),
  drink: z.boolean().optional(),
  sugar: sugarLevelSchema.optional(),
  ice: iceLevelSchema.optional(),
  temperature: temperatureSchema.optional(),
  size: cupSizeSchema.optional(),
  price: z.number().int().nonnegative(),
  quantity: z.number().int().positive(),
  note: z.string().optional(),
});

export const cartItemsSchema = z.record(z.string(), cartItemSchema);

export type CartItem = z.infer<typeof cartItemSchema>;
export type CartItems = z.infer<typeof cartItemsSchema>;
export type SugarLevel = z.infer<typeof sugarLevelSchema>;
export type IceLevel = z.infer<typeof iceLevelSchema>;
export type Temperature = z.infer<typeof temperatureSchema>;

/** Parse isi localStorage; data rusak/tidak valid dianggap keranjang kosong. */
export function parseStoredCart(raw: string | null): CartItems {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    const items = (parsed as { items?: unknown } | null)?.items;
    const result = cartItemsSchema.safeParse(items);
    return result.success ? result.data : {};
  } catch {
    return {};
  }
}
