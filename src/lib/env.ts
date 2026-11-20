import { z } from "zod";
import { evaluateSecretPolicy } from "@/lib/secret-policy";

const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL wajib diisi"),
  DIRECT_URL: z.string().optional(),
  APP_BASE_URL: z.string().url("APP_BASE_URL harus berupa URL yang valid").default("http://localhost:3000"),
  ALLOWED_ORIGINS: z.string().default(""),
  TRUSTED_PROXY: z
    .string()
    .regex(
      /^(vercel|cloudflare|none|[1-9]\d*)$/,
      "TRUSTED_PROXY harus vercel|cloudflare|none|<jumlah hop>"
    )
    .default("none"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET wajib minimal 32 karakter"),
  CRON_SECRET: z.string().min(8, "CRON_SECRET wajib minimal 8 karakter"),  R2_ACCOUNT_ID: z.string().min(1, "R2_ACCOUNT_ID wajib diisi"),
  R2_ACCESS_KEY_ID: z.string().min(1, "R2_ACCESS_KEY_ID wajib diisi"),
  R2_SECRET_ACCESS_KEY: z.string().min(1, "R2_SECRET_ACCESS_KEY wajib diisi"),
  R2_BUCKET_PUBLIC: z.string().min(1, "R2_BUCKET_PUBLIC wajib diisi"),
  R2_BUCKET_PRIVATE: z.string().min(1, "R2_BUCKET_PRIVATE wajib diisi"),
  R2_PUBLIC_BASE_URL: z.string().url("R2_PUBLIC_BASE_URL harus berupa URL yang valid"),
  PUSHER_APP_ID: z.string().min(1, "PUSHER_APP_ID wajib diisi"),
  PUSHER_KEY: z.string().min(1, "PUSHER_KEY wajib diisi"),
  PUSHER_SECRET: z.string().min(1, "PUSHER_SECRET wajib diisi"),
  PUSHER_CLUSTER: z.string().min(1, "PUSHER_CLUSTER wajib diisi"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

const clientEnvSchema = z.object({
  NEXT_PUBLIC_PUSHER_KEY: z.string().min(1, "NEXT_PUBLIC_PUSHER_KEY wajib diisi"),
  NEXT_PUBLIC_PUSHER_CLUSTER: z.string().min(1, "NEXT_PUBLIC_PUSHER_CLUSTER wajib diisi"),
});

const mergedEnvSchema = serverEnvSchema.merge(clientEnvSchema);

export type Env = z.infer<typeof mergedEnvSchema>;

function validateEnv(): Env {
  if (process.env.SKIP_ENV_VALIDATION === "true" || process.env.SKIP_ENV_VALIDATION === "1") {
    return process.env as unknown as Env;
  }

  const parsed = mergedEnvSchema.safeParse(process.env);

  if (!parsed.success) {
    const formattedErrors = parsed.error.issues
      .map((issue) => `  - [${issue.path.join(".")}]: ${issue.message}`)
      .join("\n");

    const errorMessage = `\n❌ Konfigurasi Environment Variables Gagal:\n${formattedErrors}\n\nSilakan periksa file .env Anda atau salin dari .env.example.\n`;
    
    // Log clearly to console
    console.error(errorMessage);
    throw new Error(errorMessage);
  }

  // SEC-02/SEC-07: nilai contoh dan secret lemah ditolak di production,
  // hanya diperingatkan di development/test.
  const policy = evaluateSecretPolicy(parsed.data);
  if (policy.warnings.length > 0) {
    console.warn(
      `⚠️ Peringatan secret (non-production):\n${policy.warnings
        .map((message) => `  - ${message}`)
        .join("\n")}`
    );
  }
  if (policy.errors.length > 0) {
    const errorMessage = `\n❌ Konfigurasi secret tidak aman:\n${policy.errors
      .map((message) => `  - ${message}`)
      .join("\n")}\n`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }

  return parsed.data;
}

export const env = validateEnv();
