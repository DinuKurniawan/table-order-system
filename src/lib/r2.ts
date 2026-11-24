import "server-only";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/lib/env";

function getR2Endpoint(): string {
  if (env.R2_ACCOUNT_ID.startsWith("http://") || env.R2_ACCOUNT_ID.startsWith("https://")) {
    return env.R2_ACCOUNT_ID;
  }
  return `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
}

export const r2Client = new S3Client({
  region: "auto",
  endpoint: getR2Endpoint(),
  // MinIO/CI memakai path-style; R2 produksi tetap virtual-hosted.
  forcePathStyle: process.env.R2_FORCE_PATH_STYLE === "true",
  // SDK baru menambahkan checksum kosong (CRC32 AAAAAA==) ke presigned PUT,
  // sehingga unggahan browser yang sebenarnya selalu ditolak R2.
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});

/**
 * Menyimpan objek ke bucket R2
 */
export async function putObject(
  bucket: string,
  key: string,
  body: Buffer | Uint8Array,
  contentType: string = "image/avif"
): Promise<void> {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
    // Objek publik immutable (nama file unik); bucket privat jangan di-cache.
    CacheControl:
      bucket === env.R2_BUCKET_PUBLIC
        ? "public, max-age=31536000, immutable"
        : "private, no-store",
  });

  await r2Client.send(command);
}

/**
 * Menghapus objek dari bucket R2
 */
export async function deleteObject(bucket: string, key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  await r2Client.send(command);
}

/**
 * Menghasilkan URL publik untuk objek di bucket publik R2
 */
export function getPublicUrl(key: string): string {
  const baseUrl = env.R2_PUBLIC_BASE_URL.replace(/\/+$/, "");
  const cleanKey = key.replace(/^\/+/, "");
  return `${baseUrl}/${cleanKey}`;
}

/**
 * Menghasilkan presigned URL untuk membaca objek pada bucket privat (mis. bukti bayar)
 * @param bucket Nama bucket privat
 * @param key Key/path objek di bucket
 * @param expiresSec Masa berlaku presigned URL (default: 60 detik)
 */
export async function getSignedReadUrl(
  bucket: string,
  key: string,
  expiresSec: number = 60
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  return getSignedUrl(r2Client, command, { expiresIn: expiresSec });
}

/**
 * Menghasilkan presigned URL untuk unggah langsung dari browser ke R2 (PUT).
 * Content-Type ikut ditandatangani sehingga browser wajib mengirim nilai sama.
 */
export async function getSignedPutUrl(
  bucket: string,
  key: string,
  contentType: string,
  expiresSec: number = 300
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(r2Client, command, { expiresIn: expiresSec });
}

/**
 * Membaca metadata objek. Mengembalikan null bila objek tidak ada.
 */
export async function headObject(
  bucket: string,
  key: string
): Promise<{ contentLength: number; contentType: string } | null> {
  try {
    const result = await r2Client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: key })
    );
    return {
      contentLength: result.ContentLength ?? 0,
      contentType: result.ContentType ?? "",
    };
  } catch {
    return null;
  }
}
