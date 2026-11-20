/**
 * SEC-14: nama cookie sesi.
 *
 * Production memakai prefix `__Host-` yang dipaksakan browser: Secure,
 * Path=/, dan tanpa atribut Domain. Development/test tetap nama lama karena
 * `__Host-` mensyaratkan HTTPS.
 */
export const SESSION_COOKIE_BASE_NAME = "session_token";

export function sessionCookieName(): string {
  return process.env.NODE_ENV === "production"
    ? `__Host-${SESSION_COOKIE_BASE_NAME}`
    : SESSION_COOKIE_BASE_NAME;
}
