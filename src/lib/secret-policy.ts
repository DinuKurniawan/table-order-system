/**
 * Kebijakan secret (SEC-02, SEC-07).
 *
 * Nilai contoh yang publik tidak boleh lolos di production. Di development/test
 * hanya diperingatkan agar `.env.test` dan salinan `.env.example` tetap jalan.
 */

export const KNOWN_EXAMPLE_SECRETS: ReadonlySet<string> = new Set([
  // .env.example lama
  "at-least-32-character-random-secret-key-change-this",
  "cron-secret-for-scheduled-worker",
  // fallback proxy lama
  "development-secret-must-be-at-least-32-chars-long!",
  // placeholder .env.example baru & README
  "GANTI_DENGAN_HASIL_PERINTAH_DI_README",
  "contoh-secret-acak-minimal-32-karakter",
  "contoh-cron-secret-123",
  "kata-sandi-kuat-anda",
]);

export const MIN_SESSION_SECRET_LENGTH = 32;
export const MIN_CRON_SECRET_LENGTH = 32;

/** Deteksi pola sederhana: variasi karakter rendah atau unit pendek berulang. */
export function hasLowEntropy(value: string): boolean {
  if (new Set(value).size < 8) return true;
  for (let size = 1; size <= 4; size += 1) {
    const unit = value.slice(0, size);
    if (!unit) continue;
    const repeated = unit.repeat(Math.ceil(value.length / size)).slice(0, value.length);
    if (repeated === value) return true;
  }
  return false;
}

export interface SecretPolicyResult {
  errors: string[];
  warnings: string[];
}

function checkSecret(
  name: string,
  value: string | undefined,
  minLength: number,
  production: boolean
): { error?: string; warning?: string } {
  const push = (message: string) =>
    production ? { error: message } : { warning: message };

  if (!value) return push(`${name} wajib diisi`);
  if (KNOWN_EXAMPLE_SECRETS.has(value)) {
    return push(`${name} memakai nilai contoh publik; ganti dengan nilai acak`);
  }
  if (value.length < minLength) {
    return push(`${name} wajib minimal ${minLength} karakter`);
  }
  if (hasLowEntropy(value)) {
    return push(`${name} terlalu lemah (variasi karakter/pola berulang)`);
  }
  return {};
}

export function evaluateSecretPolicy(input: {
  SESSION_SECRET?: string;
  CRON_SECRET?: string;
  NODE_ENV?: string;
}): SecretPolicyResult {
  const production = input.NODE_ENV === "production";
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const [name, value, minLength] of [
    ["SESSION_SECRET", input.SESSION_SECRET, MIN_SESSION_SECRET_LENGTH],
    ["CRON_SECRET", input.CRON_SECRET, MIN_CRON_SECRET_LENGTH],
  ] as const) {
    const result = checkSecret(name, value, minLength, production);
    if (result.error) errors.push(result.error);
    if (result.warning) warnings.push(result.warning);
  }

  return { errors, warnings };
}

/**
 * Fail-closed: proxy/handler menolak berjalan tanpa secret yang layak.
 * Di development/test nilai lemah hanya diperingatkan oleh validateEnv.
 */
export function requireSessionSecret(
  value: string | undefined = process.env.SESSION_SECRET
): Uint8Array {
  if (!value) {
    throw new Error("SESSION_SECRET wajib diisi; tidak ada fallback secret.");
  }
  if (
    process.env.NODE_ENV === "production" &&
    (value.length < MIN_SESSION_SECRET_LENGTH ||
      KNOWN_EXAMPLE_SECRETS.has(value) ||
      hasLowEntropy(value))
  ) {
    throw new Error("SESSION_SECRET tidak valid untuk production.");
  }
  return new TextEncoder().encode(value);
}
