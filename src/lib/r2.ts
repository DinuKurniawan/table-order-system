import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
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
