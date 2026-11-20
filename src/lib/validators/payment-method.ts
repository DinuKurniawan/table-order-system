import { z } from "zod";
import { isUploadedKey } from "@/lib/upload-key";

const qrisImageKey = z
  .string()
  .trim()
  .min(1)
  .refine((value) => isUploadedKey(value, "qris"), "Key gambar QRIS tidak valid");

const base = {
  label: z.string().trim().min(1, "Label wajib diisi").max(80),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).optional(),
};

/**
 * QRIS menyimpan gambar (imageKey) tanpa nomor rekening.
 * BANK wajib punya nomor rekening dan nama pemilik.
 */
export const paymentMethodInputSchema = z.discriminatedUnion("kind", [
  z.object({
    ...base,
    kind: z.literal("QRIS"),
    imageKey: qrisImageKey.nullish(),
    accountName: z.string().trim().max(80).nullish(),
  }),
  z.object({
    ...base,
    kind: z.literal("BANK"),
    accountNo: z
      .string()
      .trim()
      .min(4, "Nomor rekening minimal 4 karakter")
      .max(30)
      .regex(/^[0-9 -]+$/, "Nomor rekening hanya boleh angka, spasi, atau strip"),
    accountName: z.string().trim().min(1, "Atas nama wajib diisi").max(80),
  }),
]);

export type PaymentMethodInput = z.infer<typeof paymentMethodInputSchema>;

export const paymentMethodUpdateSchema = z
  .object({
    label: z.string().trim().min(1).max(80).optional(),
    isActive: z.boolean().optional(),
    imageKey: qrisImageKey.nullable().optional(),
    accountNo: z.string().trim().min(4).max(30).optional(),
    accountName: z.string().trim().min(1).max(80).optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "Tidak ada perubahan yang dikirim",
  });

export type PaymentMethodUpdateInput = z.infer<typeof paymentMethodUpdateSchema>;

export const paymentMethodReorderSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "Daftar id metode bayar wajib diisi"),
});
