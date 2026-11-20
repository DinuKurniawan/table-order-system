/**
 * Validasi key objek yang dibuat server saat presign unggah langsung:
 * `<prefix>/<nanoid 16>[-thumb].(webp|jpg)`. Dipakai di skema simpan agar
 * klien tidak bisa menyimpan key sembarang ke database.
 */
const KEY_NAME = /^[A-Za-z0-9_-]{16}(-thumb)?\.(webp|jpg)$/;

export function isUploadedKey(
  key: string,
  prefix: string,
  kind: "main" | "thumb" | "any" = "any"
): boolean {
  const base = prefix.replace(/\/+$/, "");
  if (!key.startsWith(`${base}/`)) return false;

  const name = key.slice(base.length + 1);
  if (!KEY_NAME.test(name)) return false;

  const isThumb = name.includes("-thumb.");
  return kind === "any" || (kind === "thumb") === isThumb;
}
