/**
 * Membaca pesan error dari envelope API `{ error: { code, message } }`
 * (audit S-04). String lama tetap didukung agar rollout aman.
 */
export function apiErrorMessage(
  payload: unknown,
  fallback = "Permintaan gagal"
): string {
  const error = (payload as { error?: unknown } | null)?.error;

  if (typeof error === "string" && error) return error;
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }

  return fallback;
}
