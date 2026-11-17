import { z } from "zod";

export const tableInputSchema = z.object({
  name: z.string().trim().min(1, "Nama meja wajib diisi").max(40, "Nama meja maksimal 40 karakter"),
  area: z.string().trim().max(40, "Area maksimal 40 karakter").nullish(),
  isActive: z.boolean().default(true),
});

export type TableInput = z.infer<typeof tableInputSchema>;

export const tableUpdateSchema = tableInputSchema.partial();

export type TableUpdateInput = z.infer<typeof tableUpdateSchema>;
