/**
 * Terapkan CORS ke bucket R2 agar unggah langsung dari browser (presigned PUT)
 * lolos preflight OPTIONS. Jalankan dengan env produksi:
 *   node --env-file=.env.production scripts/set-r2-cors.mjs
 * Origin diambil dari APP_BASE_URL + ALLOWED_ORIGINS.
 */
import { config } from "dotenv";
import { S3Client, PutBucketCorsCommand } from "@aws-sdk/client-s3";

config({ path: process.env.ENV_FILE ?? ".env" });

const required = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_PUBLIC",
  "R2_BUCKET_PRIVATE",
  "APP_BASE_URL",
];
const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`Env belum lengkap: ${missing.join(", ")}`);
  process.exit(1);
}

const origins = [
  process.env.APP_BASE_URL,
  ...(process.env.ALLOWED_ORIGINS ?? "").split(","),
]
  .map((value) => value.trim())
  .filter(Boolean)
  .map((value) => {
    try {
      return new URL(value).origin;
    } catch {
      console.error(`Origin tidak valid: ${value}`);
      process.exit(1);
    }
  });

const accountId = process.env.R2_ACCOUNT_ID;
const endpoint = /^https?:\/\//.test(accountId)
  ? accountId
  : `https://${accountId}.r2.cloudflarestorage.com`;

const client = new S3Client({
  region: "auto",
  endpoint,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const allowedOrigins = [...new Set(origins)];
const buckets = [
  process.env.R2_BUCKET_PUBLIC,
  process.env.R2_BUCKET_PRIVATE,
];

for (const bucket of buckets) {
  await client.send(
    new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: allowedOrigins,
            AllowedMethods: ["GET", "HEAD", "PUT"],
            AllowedHeaders: ["*"],
            ExposeHeaders: ["ETag"],
            MaxAgeSeconds: 3000,
          },
        ],
      },
    })
  );
  console.log(`CORS diterapkan: ${bucket} <- ${allowedOrigins.join(", ")}`);
}
