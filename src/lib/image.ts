import sharp, { type OutputInfo } from "sharp";
import { AppError } from "@/lib/errors";

export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_IMAGE_DIMENSION = 4096; // 4096px

export const IMAGE_PRESETS = {
  product: {
    maxWidth: 1200,
    quality: 55,
    thumb: {
      maxWidth: 320,
      quality: 50,
    },
  },
  proof: {
    maxWidth: 1600,
    quality: 60,
  },
  qris: {
    maxWidth: 1000,
    quality: 70,
  },
  attachment: {
    maxWidth: 1600,
    quality: 60,
  },
} as const;

export type ImagePresetKey = keyof typeof IMAGE_PRESETS;

/**
 * Validasi magic bytes untuk mendeteksi tipe file gambar asli
 */
export function detectImageMagicBytes(buffer: Buffer): boolean {
  if (!buffer || buffer.length < 4) return false;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return true;
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return true;
  }

  // WEBP: RIFF....WEBP
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return true;
  }

  // GIF: GIF87a / GIF89a
  if (buffer.length >= 6) {
    const gifHeader = buffer.toString("ascii", 0, 6);
    if (gifHeader === "GIF87a" || gifHeader === "GIF89a") {
      return true;
    }
  }

  // TIFF: II*. (little endian) atau MM.* (big endian)
  if (
    (buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2a && buffer[3] === 0x00) ||
    (buffer[0] === 0x4d && buffer[1] === 0x4d && buffer[2] === 0x00 && buffer[3] === 0x2a)
  ) {
    return true;
  }

  // BMP: BM (42 4D)
  if (buffer[0] === 0x42 && buffer[1] === 0x4d) {
    return true;
  }

  // HEIC / AVIF: ftyp box
  if (buffer.length >= 12 && buffer.toString("ascii", 4, 8) === "ftyp") {
    const brand = buffer.toString("ascii", 8, 12).toLowerCase();
    if (["avif", "avis", "heic", "heix", "mif1", "msf1"].includes(brand)) {
      return true;
    }
  }

  return false;
}

export interface ImageValidationResult {
  format: string;
  width: number;
  height: number;
}

/**
 * Validasi buffer gambar: cek ukuran, magic bytes, dan batas dimensi 4096px
 */
export async function validateImage(buffer: Buffer): Promise<ImageValidationResult> {
  if (!buffer || buffer.length === 0) {
    throw new AppError("VALIDATION_ERROR", "Berkas gambar kosong atau tidak valid");
  }

  if (buffer.length > MAX_IMAGE_SIZE_BYTES) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Ukuran gambar melebihi batas maksimal 10 MB"
    );
  }

  if (!detectImageMagicBytes(buffer)) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Format berkas tidak didukung atau bukan gambar valid (JPEG, PNG, WEBP, GIF, TIFF, BMP, AVIF/HEIC)"
    );
  }

  try {
    const image = sharp(buffer, { limitInputPixels: MAX_IMAGE_DIMENSION * MAX_IMAGE_DIMENSION });
    const metadata = await image.metadata();

    if (!metadata.width || !metadata.height) {
      throw new AppError("VALIDATION_ERROR", "Gagal membaca dimensi berkas gambar");
    }

    if (
      metadata.width > MAX_IMAGE_DIMENSION ||
      metadata.height > MAX_IMAGE_DIMENSION
    ) {
      throw new AppError(
        "VALIDATION_ERROR",
        `Dimensi gambar (${metadata.width}x${metadata.height}px) melebihi batas maksimal ${MAX_IMAGE_DIMENSION}x${MAX_IMAGE_DIMENSION}px`
      );
    }

    return {
      format: metadata.format ?? "unknown",
      width: metadata.width,
      height: metadata.height,
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(
      "VALIDATION_ERROR",
      "Berkas gambar rusak atau tidak dapat didekode oleh parser gambar"
    );
  }
}

export interface ConvertAvifOptions {
  maxWidth?: number;
  quality?: number;
}

export interface ConvertedImageResult {
  buffer: Buffer;
  info: OutputInfo;
}

/**
 * Konversi gambar ke format AVIF dengan rotasi EXIF otomatis dan resize fit inside tanpa memperbesar
 */
export async function toAvif(
  buffer: Buffer,
  options?: ConvertAvifOptions
): Promise<ConvertedImageResult> {
  let pipeline = sharp(buffer, {
    limitInputPixels: MAX_IMAGE_DIMENSION * MAX_IMAGE_DIMENSION,
  }).rotate();

  if (options?.maxWidth) {
    pipeline = pipeline.resize({
      width: options.maxWidth,
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  const { data, info } = await pipeline
    .avif({
      quality: options?.quality ?? 60,
      effort: 4,
    })
    .toBuffer({ resolveWithObject: true });

  return { buffer: data, info };
}
