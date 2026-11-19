import { z } from "zod";

export const stockAdjustSchema = z
  .object({
    productId: z.string().min(1, "Produk wajib dipilih"),
    type: z.enum(["PURCHASE", "ADJUSTMENT", "WASTE"]),
    quantity: z
      .number({ error: "Jumlah wajib berupa angka" })
      .int("Jumlah harus bilangan bulat")
      .refine((value) => value !== 0, "Jumlah tidak boleh nol"),
    note: z.string().trim().max(300).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.type !== "ADJUSTMENT" && value.quantity < 0) {
      ctx.addIssue({
        code: "custom",
        path: ["quantity"],
        message: "Jumlah harus positif; gunakan tipe Koreksi untuk nilai negatif",
      });
    }
  });

export type StockAdjustInput = z.infer<typeof stockAdjustSchema>;

export const stockSettingsSchema = z
  .object({
    lowStockThreshold: z
      .number({ error: "Batas minimum wajib berupa angka" })
      .int()
      .min(0)
      .max(1_000_000)
      .optional(),
    trackStock: z.boolean().optional(),
  })
  .refine(
    (value) => value.lowStockThreshold !== undefined || value.trackStock !== undefined,
    "Tidak ada perubahan"
  );

export type StockSettingsInput = z.infer<typeof stockSettingsSchema>;

export const stockHistoryQuerySchema = z.object({
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
});
