/**
 * Membuat bucket objek untuk lingkungan CI (S3Mock).
 * Jalankan setelah S3Mock siap dan env R2_* diarahkan ke endpoint lokal.
 */
import "dotenv/config";
import {
  S3Client,
  CreateBucketCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";

const endpoint = process.env.R2_ACCOUNT_ID?.startsWith("http")
  ? process.env.R2_ACCOUNT_ID
  : `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

const client = new S3Client({
  region: "auto",
  endpoint,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  },
});

for (const bucket of [
  process.env.R2_BUCKET_PUBLIC,
  process.env.R2_BUCKET_PRIVATE,
]) {
  if (!bucket) continue;
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    console.log(`bucket ada: ${bucket}`);
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
    console.log(`bucket dibuat: ${bucket}`);
  }
}
