import "server-only";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { runInTransaction } from "@/lib/tx";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { isUploadedKey } from "@/lib/upload-key";

/**
 * Field tanpa default, dipakai bersama skema baca dan update. Update tidak
 * boleh memakai default: field yang tidak dikirim tidak boleh ikut ditulis
 * (bug T-01), default hanya dipakai saat membaca key yang belum ada.
 */
const settingsFields = {
  namaKafe: z.string().min(1, "Nama kafe tidak boleh kosong"),
  timeoutBayarMenit: z.number().int().min(1).max(120),
  maksUploadUlang: z.number().int().min(1).max(10),
  footerStruk: z.string(),
  logoKey: z
    .string()
    .refine((value) => isUploadedKey(value, "logo"), "Key logo tidak valid")
    .nullable(),
  isOrderingOpen: z.boolean(),
};

export const appSettingsSchema = z.object({
  namaKafe: settingsFields.namaKafe.default("Kedai Kopi Selaras"),
  timeoutBayarMenit: settingsFields.timeoutBayarMenit.default(15),
  maksUploadUlang: settingsFields.maksUploadUlang.default(3),
  footerStruk: settingsFields.footerStruk.default(
    "Terima kasih atas kunjungan Anda! Silakan datang kembali."
  ),
  logoKey: settingsFields.logoKey.optional(),
  isOrderingOpen: settingsFields.isOrderingOpen.default(true),
});

export type AppSettings = z.infer<typeof appSettingsSchema>;

/** Skema PATCH: semua field opsional dan tanpa default. */
export const appSettingsUpdateSchema = z.object(settingsFields).partial();

export type AppSettingsUpdateInput = z.infer<typeof appSettingsUpdateSchema>;

export const DEFAULT_SETTINGS: AppSettings = {
  namaKafe: "Kedai Kopi Selaras",
  timeoutBayarMenit: 15,
  maksUploadUlang: 3,
  footerStruk: "Terima kasih atas kunjungan Anda! Silakan datang kembali.",
  logoKey: null,
  isOrderingOpen: true,
};

/**
 * Cache singkat per instance serverless. Pembacaan settings terjadi di setiap
 * checkout dan polling status pesanan; 15 detik cukup untuk memangkas query
 * tanpa membuat perubahan admin terasa lama. Instance lain tetap membaca DB
 * sendiri (TTL pendek), dan update settings di instance ini langsung membuang
 * cache.
 */
const SETTINGS_TTL_MS = 15_000;
let settingsCache: { value: AppSettings; expiresAt: number } | null = null;

/**
 * Service untuk membaca dan memperbarui pengaturan aplikasi secara bertipe aman.
 */
export async function getSettings(): Promise<AppSettings> {
  if (settingsCache && settingsCache.expiresAt > performance.now()) {
    return settingsCache.value;
  }

  const settingsRows = await prisma.setting.findMany();
  const rawObj: Record<string, unknown> = { ...DEFAULT_SETTINGS };

  for (const row of settingsRows) {
    rawObj[row.key] = row.value;
  }

  const result = appSettingsSchema.safeParse(rawObj);
  const settings = result.success ? result.data : DEFAULT_SETTINGS;
  settingsCache = { value: settings, expiresAt: performance.now() + SETTINGS_TTL_MS };
  return settings;
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
 * Merge terkendali: pengaturan berupa key-value datar, jadi hanya key yang
 * dikirim yang ditulis. Nilai lama dibaca dulu untuk audit, bukan untuk ditulis
 * ulang. Default tidak pernah ikut tersimpan.
 */
export async function updateSettings(
  input: unknown,
  userId: string
): Promise<AppSettings> {
  const data = appSettingsUpdateSchema.parse(input);
  const entries = (
    Object.entries(data) as Array<
      [keyof AppSettingsUpdateInput, string | number | boolean | null | undefined]
    >
  ).filter(
    (entry): entry is [keyof AppSettingsUpdateInput, string | number | boolean | null] =>
      entry[1] !== undefined
  );

  if (entries.length === 0) {
    throw new AppError("VALIDATION_ERROR", "Tidak ada perubahan pengaturan", 400);
  }

  const current = await getSettings();
  const merged = appSettingsSchema.parse({ ...current, ...data });
  const changes = entries
    .filter(([key, value]) => current[key] !== value)
    .map(([key, value]) => ({ key, from: current[key], to: value }));

  if (changes.length === 0) {
    return merged;
  }

  await runInTransaction(async (tx) => {
    for (const { key, to } of changes) {
      await tx.setting.upsert({
        where: { key },
        update: {
          value: to === null ? Prisma.JsonNull : (to as Prisma.InputJsonValue),
        },
        create: {
          key,
          value: to === null ? Prisma.JsonNull : (to as Prisma.InputJsonValue),
        },
      });
    }

    await tx.auditLog.create({
      data: {
        userId,
        action: "settings.update",
        entity: "Setting",
        entityId: "app",
        meta: {
          changes: Object.fromEntries(
            changes.map(({ key, from, to }) => [
              key,
              { from: from ?? null, to },
            ])
          ),
        },
      },
    });
  });

  settingsCache = null;
  return merged;
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

  settingsCache = null;
  return validated as AppSettings[K];
}
