import { z } from "zod";
import { CategoryType, DrinkSubtype } from "@prisma/client";
import { isUploadedKey } from "@/lib/upload-key";
import { sizePricesSchema } from "@/lib/size-pricing";

function productImageKey(kind: "main" | "thumb") {
  return z
    .string()
    .trim()
    .min(1)
    .refine(
      (value) => isUploadedKey(value, "products", kind),
      "Key gambar produk tidak valid"
    )
    .nullish();
}

/**
 * Kategori bertipe DRINK wajib memiliki subtype COFFEE / NON_COFFEE,
 * sedangkan kategori FOOD dilarang memiliki subtype.
 */
export const categoryInputSchema = z.discriminatedUnion("type", [
  z.object({
    name: z.string().trim().min(1, "Nama kategori wajib diisi").max(50),
    type: z.literal(CategoryType.FOOD),
    subtype: z.literal(null).optional(),
    sortOrder: z.number().int().min(0).optional(),
  }),
  z.object({
    name: z.string().trim().min(1, "Nama kategori wajib diisi").max(50),
    type: z.literal(CategoryType.DRINK),
    subtype: z.enum(DrinkSubtype, {
      error: "Subtype wajib COFFEE atau NON_COFFEE",
    }),
    sortOrder: z.number().int().min(0).optional(),
  }),
]);

export type CategoryInput = z.infer<typeof categoryInputSchema>;

export const categoryReorderSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "Daftar id kategori wajib diisi"),
});

/**
 * Field produk tanpa nilai default, dipakai bersama oleh skema create dan update.
 * Update wajib memakai bentuk ini: `.partial()` pada skema ber-default akan tetap
 * mengisi field yang tidak dikirim (bug K-01) dan menimpa data tersimpan.
 */
const productFields = {
  name: z.string().trim().min(1, "Nama produk wajib diisi").max(120),
  description: z.string().trim().max(500).nullish(),
  price: z
    .number({ error: "Harga wajib berupa angka" })
    .int("Harga harus bilangan bulat rupiah")
    .min(0, "Harga tidak boleh negatif")
    .max(1_000_000_000, "Harga terlalu besar"),
  categoryId: z.string().min(1, "Kategori wajib dipilih"),
  imageKey: productImageKey("main"),
  thumbKey: productImageKey("thumb"),
  sizePrices: sizePricesSchema.nullish(),
  isActive: z.boolean(),
  trackStock: z.boolean(),
  lowStockThreshold: z.number().int().min(0),
};

export const productCreateSchema = z.object({
  ...productFields,
  isActive: productFields.isActive.default(true),
  trackStock: productFields.trackStock.default(true),
  stock: z.number().int().min(0, "Stok tidak boleh negatif").default(0),
  lowStockThreshold: productFields.lowStockThreshold.default(5),
});

export type ProductCreateInput = z.infer<typeof productCreateSchema>;

/**
 * `stock` sengaja tidak ada: stok hanya berubah lewat stock.service (AI-AGENT
 * aturan 6), bukan lewat edit produk umum.
 */
export const productUpdateSchema = z.object(productFields).partial();

export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;

export const productToggleSchema = z.object({
  isActive: z.boolean(),
});

/**
 * Skema form klien: input number didaftarkan dengan `valueAsNumber`.
 */
export const productFormSchema = z.object({
  name: z.string().trim().min(1, "Nama produk wajib diisi").max(120),
  description: z.string().trim().max(500).optional(),
  price: z
    .number({ error: "Harga wajib berupa angka" })
    .int("Harga harus bilangan bulat")
    .min(0, "Harga tidak boleh negatif"),
  categoryId: z.string().min(1, "Kategori wajib dipilih"),
  imageKey: z.string().nullable().optional(),
  thumbKey: z.string().nullable().optional(),
  priceLarge: z.number().int().min(0).optional(),
  priceJumbo: z.number().int().min(0).optional(),
  isActive: z.boolean(),
  trackStock: z.boolean(),
  stock: z
    .number({ error: "Stok wajib berupa angka" })
    .int()
    .min(0, "Stok tidak boleh negatif"),
  lowStockThreshold: z
    .number({ error: "Ambang stok wajib berupa angka" })
    .int()
    .min(0),
});

export type ProductFormValues = z.infer<typeof productFormSchema>;

export const productListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  q: z.string().trim().max(120).optional(),
  tab: z.enum(["all", "food", "coffee", "non_coffee"]).default("all"),
  status: z.enum(["all", "active", "inactive"]).default("all"),
  sort: z
    .enum(["newest", "name_asc", "price_asc", "price_desc", "stock_asc"])
    .default("newest"),
});

export type ProductListQuery = z.infer<typeof productListQuerySchema>;
