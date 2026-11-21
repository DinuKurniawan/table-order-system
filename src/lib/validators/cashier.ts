import { z } from "@/lib/zod";

const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username minimal 3 karakter")
  .max(32, "Username maksimal 32 karakter")
  .regex(/^[a-zA-Z0-9._-]+$/, "Username hanya boleh huruf, angka, titik, garis bawah, atau strip");

const passwordSchema = z
  .string()
  .min(8, "Password minimal 8 karakter")
  .max(128, "Password maksimal 128 karakter");

export const cashierCreateSchema = z.object({
  name: z.string().trim().min(1, "Nama kasir wajib diisi").max(80, "Nama maksimal 80 karakter"),
  username: usernameSchema,
  password: passwordSchema,
});

export type CashierCreateInput = z.infer<typeof cashierCreateSchema>;

export const cashierUpdateSchema = z
  .object({
    name: z.string().trim().min(1, "Nama kasir wajib diisi").max(80).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => value.name !== undefined || value.isActive !== undefined, {
    message: "Tidak ada perubahan yang dikirim",
  });

export type CashierUpdateInput = z.infer<typeof cashierUpdateSchema>;

export const cashierResetPasswordSchema = z.object({
  password: passwordSchema,
});

export type CashierResetPasswordInput = z.infer<typeof cashierResetPasswordSchema>;
