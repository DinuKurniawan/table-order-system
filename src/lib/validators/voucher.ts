import { z } from "@/lib/zod";
import { VoucherType } from "@prisma/client";
import { voucherCodeSchema } from "@/lib/voucher-code";
import { cupSizeSchema } from "@/lib/size-pricing";

const voucherFields = {
  description: z.string().trim().max(160, "Deskripsi maksimal 160 karakter").nullish(),
  type: z.enum(VoucherType, { error: "Tipe voucher tidak valid" }),
  value: z
    .number({ error: "Nilai diskon wajib berupa angka" })
    .int("Nilai diskon harus bilangan bulat")
    .min(1, "Nilai diskon minimal 1")
    .max(1_000_000_000, "Nilai diskon terlalu besar"),
  maxDiscount: z
    .number({ error: "Maks. diskon wajib berupa angka" })
    .int("Maks. diskon harus bilangan bulat")
    .min(1, "Maks. diskon minimal Rp1")
    .nullish(),
  minSpend: z
    .number({ error: "Min. belanja wajib berupa angka" })
    .int("Min. belanja harus bilangan bulat")
    .min(0, "Min. belanja tidak boleh negatif"),
  quota: z
    .number({ error: "Kuota wajib berupa angka" })
    .int("Kuota harus bilangan bulat")
    .min(1, "Kuota minimal 1")
    .nullish(),
  startsAt: z.coerce.date({ error: "Tanggal mulai tidak valid" }),
  endsAt: z.coerce.date({ error: "Tanggal berakhir tidak valid" }),
};

export const voucherConfigSchema = z
  .object(voucherFields)
  .superRefine((data, ctx) => {
    if (data.endsAt.getTime() <= data.startsAt.getTime()) {
      ctx.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "Tanggal berakhir harus setelah tanggal mulai",
      });
    }

    if (data.type === VoucherType.PERCENT) {
      if (data.value > 100) {
        ctx.addIssue({
          code: "custom",
          path: ["value"],
          message: "Persentase diskon maksimal 100",
        });
      }
      if (data.maxDiscount == null) {
        ctx.addIssue({
          code: "custom",
          path: ["maxDiscount"],
          message: "Maks. diskon wajib diisi untuk tipe persen",
        });
      }
    } else if (data.maxDiscount != null) {
      ctx.addIssue({
        code: "custom",
        path: ["maxDiscount"],
        message: "Maks. diskon hanya berlaku untuk tipe persen",
      });
    }
  });

export const voucherCreateSchema = z
  .object({
    ...voucherFields,
    code: voucherCodeSchema.optional(),
    minSpend: voucherFields.minSpend.default(0),
    isActive: z.boolean().default(true),
  })
  .superRefine((data, ctx) => {
    if (data.endsAt.getTime() <= data.startsAt.getTime()) {
      ctx.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "Tanggal berakhir harus setelah tanggal mulai",
      });
    }
    if (data.type === VoucherType.PERCENT) {
      if (data.value > 100) {
        ctx.addIssue({
          code: "custom",
          path: ["value"],
          message: "Persentase diskon maksimal 100",
        });
      }
      if (data.maxDiscount == null) {
        ctx.addIssue({
          code: "custom",
          path: ["maxDiscount"],
          message: "Maks. diskon wajib diisi untuk tipe persen",
        });
      }
    } else if (data.maxDiscount != null) {
      ctx.addIssue({
        code: "custom",
        path: ["maxDiscount"],
        message: "Maks. diskon hanya berlaku untuk tipe persen",
      });
    }
  });

export type VoucherCreateInput = z.infer<typeof voucherCreateSchema>;

/** Tanpa default: field yang tidak dikirim tidak boleh ikut ditulis. */
export const voucherUpdateSchema = z
  .object({
    ...voucherFields,
    code: voucherCodeSchema,
    isActive: z.boolean(),
  })
  .partial();

export type VoucherUpdateInput = z.infer<typeof voucherUpdateSchema>;

export const voucherListQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  status: z
    .enum(["all", "active", "scheduled", "expired", "exhausted", "inactive"])
    .default("all"),
  sort: z
    .enum(["newest", "most_used", "ending_soon"])
    .default("newest"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
});

export type VoucherListQuery = z.infer<typeof voucherListQuerySchema>;

export const voucherApplyItemSchema = z.object({
  productId: z.string().trim().min(1).max(64),
  quantity: z.number().int().min(1).max(100),
  size: cupSizeSchema.optional(),
});

export const voucherApplySchema = z.object({
  tableToken: z.string().trim().min(8).max(120),
  code: voucherCodeSchema,
  items: z.array(voucherApplyItemSchema).min(1).max(50),
});

export type VoucherApplyInput = z.infer<typeof voucherApplySchema>;
