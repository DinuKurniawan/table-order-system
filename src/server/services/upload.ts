import { nanoid } from "nanoid";
import { env } from "@/lib/env";
import {
  validateImage,
  toAvif,
  IMAGE_PRESETS,
  ImagePresetKey,
} from "@/lib/image";
import { putObject, getPublicUrl, getSignedReadUrl } from "@/lib/r2";

export interface ProcessAndStoreInput {
  file: Buffer;
  preset: ImagePresetKey;
  bucket?: "public" | "private";
  prefix?: string;
}

export interface StoredImageResult {
  key: string;
  thumbKey?: string;
  url: string;
  thumbUrl?: string;
  size: number;
  width: number;
  height: number;
  format: "avif";
}

/**
 * Memvalidasi, mengonversi gambar ke format AVIF, dan menyimpannya di Cloudflare R2
 */
export async function processAndStore({
  file,
  preset,
  bucket = "public",
  prefix,
}: ProcessAndStoreInput): Promise<StoredImageResult> {
  // 1. Validasi berkas (magic bytes, dimensi <= 4096px, ukuran <= 10MB)
  await validateImage(file);

  const presetConfig = IMAGE_PRESETS[preset];
  const targetBucket =
    bucket === "private" ? env.R2_BUCKET_PRIVATE : env.R2_BUCKET_PUBLIC;

  // 2. Buat path folder dan nama berkas unik
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const fileId = nanoid(16);

  let folderPrefix = prefix;
  if (!folderPrefix) {
    if (preset === "proof") {
      folderPrefix = `proofs/${year}/${month}`;
    } else if (preset === "product") {
      folderPrefix = "products";
    } else if (preset === "qris") {
      folderPrefix = "qris";
    } else {
      folderPrefix = "attachments";
    }
  }

  folderPrefix = folderPrefix.replace(/^\/+|\/+$/g, "");
  const mainKey = `${folderPrefix}/${fileId}.avif`;

  // 3. Konversi gambar utama ke AVIF
  const mainAvif = await toAvif(file, {
    maxWidth: presetConfig.maxWidth,
    quality: presetConfig.quality,
  });

  // 4. Unggah gambar utama ke R2
  await putObject(targetBucket, mainKey, mainAvif.buffer, "image/avif");

  // 5. Konversi dan simpan thumbnail jika preset memilikinya (mis. product)
  let thumbKey: string | undefined;
  if ("thumb" in presetConfig && presetConfig.thumb) {
    thumbKey = `${folderPrefix}/${fileId}-thumb.avif`;
    const thumbAvif = await toAvif(file, {
      maxWidth: presetConfig.thumb.maxWidth,
      quality: presetConfig.thumb.quality,
    });
    await putObject(targetBucket, thumbKey, thumbAvif.buffer, "image/avif");
  }

  // 6. Siapkan URL publik atau URL bertanda tangan (signed URL)
  let url: string;
  let thumbUrl: string | undefined;

  if (bucket === "public") {
    url = getPublicUrl(mainKey);
    thumbUrl = thumbKey ? getPublicUrl(thumbKey) : undefined;
  } else {
    // Bucket privat menggunakan signed read URL 60 detik (default)
    url = await getSignedReadUrl(targetBucket, mainKey, 300);
    thumbUrl = thumbKey
      ? await getSignedReadUrl(targetBucket, thumbKey, 300)
      : undefined;
  }

  return {
    key: mainKey,
    thumbKey,
    url,
    thumbUrl,
    size: mainAvif.info.size,
    width: mainAvif.info.width,
    height: mainAvif.info.height,
    format: "avif",
  };
}
