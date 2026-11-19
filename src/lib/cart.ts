import { z } from "zod";

/**
 * Bentuk keranjang yang boleh dibaca dari localStorage (audit R-04).
 * `name` dipakai halaman menu, `productName` dipakai halaman keranjang;
 * keduanya opsional agar data lama tetap terbaca.
 */
export const cartItemSchema = z.object({
  productId: z.string().min(1),
  name: z.string().min(1).optional(),
  productName: z.string().min(1).optional(),
  productImage: z.string().optional(),
  price: z.number().int().nonnegative(),
  quantity: z.number().int().positive(),
  note: z.string().optional(),
});

export const cartItemsSchema = z.record(z.string(), cartItemSchema);

export type CartItem = z.infer<typeof cartItemSchema>;
export type CartItems = z.infer<typeof cartItemsSchema>;

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
