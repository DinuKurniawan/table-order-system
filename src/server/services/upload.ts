import "server-only";
import { nanoid } from "nanoid";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import {
  validateImage,
  toAvif,
  MAX_IMAGE_SIZE_BYTES,
  IMAGE_PRESETS,
  ImagePresetKey,
} from "@/lib/image";
import {
  putObject,
  getPublicUrl,
  getSignedReadUrl,
  getSignedPutUrl,
} from "@/lib/r2";

export const UPLOAD_URL_EXPIRES_SEC = 300;

/** Batas ukuran berkas yang boleh diunggah langsung ke R2. */
export const MAX_UPLOAD_BYTES = MAX_IMAGE_SIZE_BYTES;

const UPLOAD_EXTENSIONS: Record<string, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
};

function assertUploadMeta(contentType: string, size: number) {
  if (!UPLOAD_EXTENSIONS[contentType]) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Tipe gambar harus image/webp atau image/jpeg",
      400
    );
  }
  if (!Number.isInteger(size) || size <= 0 || size > MAX_IMAGE_SIZE_BYTES) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Ukuran gambar harus antara 1 byte dan ${MAX_IMAGE_SIZE_BYTES / (1024 * 1024)} MB`,
      400
    );
  }
}

function defaultFolderPrefix(preset: ImagePresetKey): string {
  if (preset === "proof") {
    const now = new Date();
    return `proofs/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}`;
  }
  if (preset === "product") return "products";
  if (preset === "qris") return "qris";
  return "attachments";
}

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
  const fileId = nanoid(16);

  let folderPrefix = prefix;
  if (!folderPrefix) {
    folderPrefix = defaultFolderPrefix(preset);
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

export interface PresignedUpload {
  kind: "main" | "thumb";
  key: string;
  uploadUrl: string;
}

export interface CreateImageUploadUrlsInput {
  preset: ImagePresetKey;
  bucket: "public" | "private";
  prefix?: string;
  contentType: string;
  size: number;
  thumb?: { contentType: string; size: number };
}

export interface PresignedImageResult {
  key: string;
  url: string;
  thumbKey?: string;
  thumbUrl?: string;
  uploads: PresignedUpload[];
  size: number;
  format: string;
}

/**
 * Alur direct upload: browser mengompres gambar, meminta URL sementara dari
 * server, lalu mengunggah langsung ke R2. Server tidak menerima byte gambar.
 */
export async function createImageUploadUrls({
  preset,
  bucket,
  prefix,
  contentType,
  size,
  thumb,
}: CreateImageUploadUrlsInput): Promise<PresignedImageResult> {
  assertUploadMeta(contentType, size);
  if (thumb) assertUploadMeta(thumb.contentType, thumb.size);

  const targetBucket =
    bucket === "private" ? env.R2_BUCKET_PRIVATE : env.R2_BUCKET_PUBLIC;
  const folderPrefix = (prefix ?? defaultFolderPrefix(preset)).replace(
    /^\/+|\/+$/g,
    ""
  );
  const extension = UPLOAD_EXTENSIONS[contentType];

  const fileId = nanoid(16);
  const mainKey = `${folderPrefix}/${fileId}.${extension}`;
  const uploads: PresignedUpload[] = [
    {
      kind: "main",
      key: mainKey,
      uploadUrl: await getSignedPutUrl(
        targetBucket,
        mainKey,
        contentType,
        UPLOAD_URL_EXPIRES_SEC
      ),
    },
  ];

  let thumbKey: string | undefined;
  if (thumb) {
    thumbKey = `${folderPrefix}/${fileId}-thumb.${UPLOAD_EXTENSIONS[thumb.contentType]}`;
    uploads.push({
      kind: "thumb",
      key: thumbKey,
      uploadUrl: await getSignedPutUrl(
        targetBucket,
        thumbKey,
        thumb.contentType,
        UPLOAD_URL_EXPIRES_SEC
      ),
    });
  }

  let url: string;
  let thumbUrl: string | undefined;
  if (bucket === "public") {
    url = getPublicUrl(mainKey);
    thumbUrl = thumbKey ? getPublicUrl(thumbKey) : undefined;
  } else {
    url = await getSignedReadUrl(targetBucket, mainKey, UPLOAD_URL_EXPIRES_SEC);
    thumbUrl = thumbKey
      ? await getSignedReadUrl(targetBucket, thumbKey, UPLOAD_URL_EXPIRES_SEC)
      : undefined;
  }

  return {
    key: mainKey,
    url,
    thumbKey,
    thumbUrl,
    uploads,
    size,
    format: extension,
  };
}
