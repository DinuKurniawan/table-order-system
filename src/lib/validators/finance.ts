import { z } from "@/lib/zod";
import { isUploadedKey } from "@/lib/upload-key";

export const EXPENSE_CATEGORIES = [
  "Bahan Baku",
  "Gaji",
  "Listrik/Air",
  "Sewa",
  "Operasional",
  "Lainnya",
] as const;

export const INCOME_CATEGORIES = ["Penjualan", "Penjualan Manual", "Lainnya"] as const;

export const financePresetSchema = z.enum([
  "today",
  "7d",
  "month",
  "year",
  "custom",
]);

export type FinancePreset = z.infer<typeof financePresetSchema>;

export const financeRangeSchema = z.object({
  preset: financePresetSchema.default("month"),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
});

export const financeTransactionCreateSchema = z.object({
  type: z.enum(["INCOME", "EXPENSE"]),
  category: z.string().trim().min(1, "Kategori wajib diisi").max(50),
  amount: z
    .number({ error: "Jumlah wajib berupa angka" })
    .int("Jumlah harus bilangan bulat")
    .min(1, "Jumlah harus lebih dari nol")
    .max(1_000_000_000),
  note: z.string().trim().max(500).optional(),
  occurredAt: z.string().trim().optional(),
  attachKey: z
    .string()
    .trim()
    .max(300)
    .refine(
      (value) => value === "" || isUploadedKey(value, "attachments/finance"),
      "Key lampiran tidak valid"
    )
    .optional(),
});

export type FinanceTransactionCreateInput = z.infer<
  typeof financeTransactionCreateSchema
>;

export const financeTransactionUpdateSchema =
  financeTransactionCreateSchema.omit({ type: true }).partial();

export const financeListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(1000).default(10),
  type: z.enum(["all", "INCOME", "EXPENSE"]).default("all"),
  category: z.string().trim().max(50).optional(),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
});
