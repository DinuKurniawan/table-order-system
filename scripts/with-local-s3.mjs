/**
 * Dev server memakai `.env.development` (DB dev + S3 mock). Test tetap memakai
 * `.env.test` lewat load-test-env. Playwright sudah menyetel DATABASE_URL dari
 * env test saat menjalankan webServer, jadi env itu tidak boleh ditimpa.
 */
const isDevServer = process.argv[2] === "next" && process.argv[3] === "dev";
if (isDevServer && !process.env.DATABASE_URL) {
  const { config } = await import("dotenv");
  config({ path: ".env.development", override: true });
} else {
  await import("./load-test-env.mjs");
}
import { spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createConnection } from "node:net";
import S3rver from "s3rver";
import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  PutBucketCorsCommand,
} from "@aws-sdk/client-s3";

const endpoint = process.env.R2_ACCOUNT_ID ?? "";
const publicBucket = process.env.R2_BUCKET_PUBLIC;
const privateBucket = process.env.R2_BUCKET_PRIVATE;
const isCi = process.env.CI === "true";

const corsXml = `<CORSConfiguration>
  <CORSRule>
    <AllowedOrigin>http://localhost:3000</AllowedOrigin>
    <AllowedOrigin>http://127.0.0.1:3000</AllowedOrigin>
    <AllowedMethod>GET</AllowedMethod>
    <AllowedMethod>HEAD</AllowedMethod>
    <AllowedMethod>PUT</AllowedMethod>
    <AllowedHeader>*</AllowedHeader>
    <ExposeHeader>ETag</ExposeHeader>
    <MaxAgeSeconds>3000</MaxAgeSeconds>
  </CORSRule>
</CORSConfiguration>`;

function parseLocalEndpoint(value) {
  try {
    const url = new URL(value);
    const local =
      url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (!local) return null;
    return {
      host: url.hostname,
      port: Number(url.port || 80),
    };
  } catch {
    return null;
  }
}

function portInUse({ host, port }) {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

function s3Client() {
  return new S3Client({
    region: "auto",
    endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "S3RVER",
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "S3RVER",
    },
  });
}

async function ensureBuckets(client) {
  for (const bucket of [publicBucket, privateBucket]) {
    if (!bucket) continue;
    try {
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
    } catch {
      await client.send(new CreateBucketCommand({ Bucket: bucket }));
    }
    // Bucket lama mungkin belum punya CORS (mis. server dev yang masih hidup).
    try {
      await client.send(
        new PutBucketCorsCommand({
          Bucket: bucket,
          CORSConfiguration: {
            CORSRules: [
              {
                AllowedOrigins: [
                  "http://localhost:3000",
                  "http://127.0.0.1:3000",
                ],
                AllowedMethods: ["GET", "HEAD", "PUT"],
                AllowedHeaders: ["*"],
                ExposeHeaders: ["ETag"],
                MaxAgeSeconds: 3000,
              },
            ],
          },
        })
      );
    } catch {
      // S3rver versi lama mengabaikan CORS API; konfigurasi awal sudah dipakai.
    }
  }
}

const local = !isCi ? parseLocalEndpoint(endpoint) : null;
let server = null;

if (local) {
  const running = await portInUse(local);
  if (!running) {
    const dataDir = path.join(tmpdir(), "coffeeshop-s3-test");
    rmSync(dataDir, { recursive: true, force: true });
    mkdirSync(dataDir, { recursive: true });

    server = new S3rver({
      address: local.host,
      port: local.port,
      silent: true,
      directory: dataDir,
      configureBuckets: [publicBucket, privateBucket]
        .filter(Boolean)
        .map((name) => ({ name, configs: [Buffer.from(corsXml)] })),
    });
    await server.run();
    console.log(
      `[local-s3] ${endpoint} (${publicBucket}, ${privateBucket})`
    );
  } else {
    console.log("[local-s3] memakai server yang sudah berjalan di port", local.port);
  }

  const client = s3Client();
  try {
    await ensureBuckets(client);
  } catch (err) {
    console.error("[local-s3] gagal menyiapkan bucket:", err.message);
    await stopServer();
    process.exit(1);
  } finally {
    client.destroy();
  }
}

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error("Pemakaian: node scripts/with-local-s3.mjs <perintah> [...arg]");
  await stopServer();
  process.exit(1);
}

const child = spawn(command, args, {
  env: process.env,
  stdio: "inherit",
  shell: process.platform === "win32",
});

let stopping = false;
async function stopServer() {
  if (!server) return;
  const current = server;
  server = null;
  await new Promise((resolve) => current.close(() => resolve()));
}

async function stop(code) {
  if (stopping) return;
  stopping = true;
  await stopServer();
  process.exit(code);
}

child.on("exit", (code, signal) => {
  void stop(signal ? 1 : code ?? 0);
});
child.on("error", (err) => {
  console.error("[local-s3] gagal menjalankan perintah:", err.message);
  void stop(1);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    child.kill();
  });
}
