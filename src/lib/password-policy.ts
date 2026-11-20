/**
 * Kebijakan password staf (SEC-01).
 *
 * Dipakai seed dan endpoint ganti password. Placeholder yang dikenal selalu
 * ditolak agar kredensial contoh tidak pernah menjadi sandi nyata.
 */

export const MIN_PASSWORD_LENGTH = 12;

const PLACEHOLDER_TOKENS = [
  "admin123456",
  "admin123",
  "password",
  "change-me",
  "changeme",
  "ganti-dengan",
  "ganti_dengan",
  "kata-sandi-kuat",
  "kata_sandi_kuat",
  "contoh-password",
  "rahasia",
  "secret",
];

export function isPlaceholderPassword(password: string): boolean {
  const normalized = password.trim().toLowerCase();
  if (!normalized) return true;
  return PLACEHOLDER_TOKENS.some((token) => normalized.includes(token));
}

/** Pesan kesalahan pertama, atau null bila password lolos kebijakan. */
export function passwordPolicyError(
  password: string,
  options: { username?: string; production?: boolean } = {}
): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password minimal ${MIN_PASSWORD_LENGTH} karakter`;
  }
  if (isPlaceholderPassword(password)) {
    return "Password tidak boleh memakai nilai contoh/placeholder";
  }
  if (
    options.username &&
    password.trim().toLowerCase() === options.username.trim().toLowerCase()
  ) {
    return "Password tidak boleh sama dengan username";
  }
  if (options.production && new Set(password).size < 8) {
    return "Password terlalu lemah (variasi karakter kurang)";
  }
  return null;
}
