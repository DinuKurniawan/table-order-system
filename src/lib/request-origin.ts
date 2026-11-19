import { env } from "@/lib/env";

/**
 * Origin tepercaya untuk proteksi CSRF (audit S-08).
 *
 * Selalu memakai APP_BASE_URL sebagai sumber utama, bukan header Host yang
 * dikirim klien. ALLOWED_ORIGINS menambahkan origin lain (mis. domain preview)
 * sebagai daftar dipisah koma.
 */

export function parseOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function configuredOrigins(): string[] {
  const origins = new Set<string>();
  const base = parseOrigin(env.APP_BASE_URL);
  if (base) origins.add(base);

  for (const entry of env.ALLOWED_ORIGINS.split(",")) {
    const origin = parseOrigin(entry.trim());
    if (origin) origins.add(origin);
  }

  return [...origins];
}

/**
 * Origin atau Referer request harus cocok dengan daftar origin tepercaya.
 * Header Host tidak pernah dipakai untuk keputusan ini.
 */
export function isAllowedOrigin(
  request: Request,
  origins: string[] = configuredOrigins()
): boolean {
  if (origins.length === 0) return false;

  const origin = parseOrigin(request.headers.get("origin"));
  if (origin) return origins.includes(origin);

  const referer = parseOrigin(request.headers.get("referer"));
  if (referer) return origins.includes(referer);

  return false;
}
