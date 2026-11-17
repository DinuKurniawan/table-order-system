import { prisma } from "@/lib/db";
import { z } from "zod";

export const appSettingsSchema = z.object({
  namaKafe: z.string().min(1, "Nama kafe tidak boleh kosong").default("Kedai Kopi Selaras"),
  timeoutBayarMenit: z.number().int().min(1).max(120).default(15),
  maksUploadUlang: z.number().int().min(1).max(10).default(3),
  footerStruk: z.string().default("Terima kasih atas kunjungan Anda! Silakan datang kembali."),
  logoKey: z.string().nullable().optional(),
  isOrderingOpen: z.boolean().default(true),
});

export type AppSettings = z.infer<typeof appSettingsSchema>;

export const DEFAULT_SETTINGS: AppSettings = {
  namaKafe: "Kedai Kopi Selaras",
  timeoutBayarMenit: 15,
  maksUploadUlang: 3,
  footerStruk: "Terima kasih atas kunjungan Anda! Silakan datang kembali.",
  logoKey: null,
  isOrderingOpen: true,
};

/**
 * Service untuk membaca dan memperbarui pengaturan aplikasi secara bertipe aman.
 */
export async function getSettings(): Promise<AppSettings> {
  const settingsRows = await prisma.setting.findMany();
  const rawObj: Record<string, unknown> = { ...DEFAULT_SETTINGS };

  for (const row of settingsRows) {
    rawObj[row.key] = row.value;
  }

  const result = appSettingsSchema.safeParse(rawObj);
  if (!result.success) {
    return DEFAULT_SETTINGS;
  }

  return result.data;
}

/**
 * Mengambil satu nilai pengaturan spesifik berdasarkan kunci.
 */
export async function getSetting<K extends keyof AppSettings>(
  key: K
): Promise<AppSettings[K]> {
  const row = await prisma.setting.findUnique({
    where: { key },
  });

  if (!row) {
    return DEFAULT_SETTINGS[key];
  }

  const schemaForKey = appSettingsSchema.shape[key];
  const parsed = schemaForKey.safeParse(row.value);

  if (!parsed.success) {
    return DEFAULT_SETTINGS[key];
  }

  return parsed.data as AppSettings[K];
}

/**
 * Memperbarui sekumpulan pengaturan aplikasi (sebagian atau seluruhnya).
 */
export async function updateSettings(
  partial: Partial<AppSettings>
): Promise<AppSettings> {
  const current = await getSettings();
  const merged = { ...current, ...partial };
  const validated = appSettingsSchema.parse(merged);

  const updates = Object.entries(partial).map(([key, value]) =>
    prisma.setting.upsert({
      where: { key },
      update: { value: value as unknown as object },
      create: { key, value: value as unknown as object },
    })
  );

  await prisma.$transaction(updates);

  return validated;
}

/**
 * Mengubah satu nilai pengaturan spesifik.
 */
export async function setSetting<K extends keyof AppSettings>(
  key: K,
  value: AppSettings[K]
): Promise<AppSettings[K]> {
  const schemaForKey = appSettingsSchema.shape[key];
  const validated = schemaForKey.parse(value);

  await prisma.setting.upsert({
    where: { key },
    update: { value: validated as unknown as object },
    create: { key, value: validated as unknown as object },
  });

  return validated as AppSettings[K];
}
