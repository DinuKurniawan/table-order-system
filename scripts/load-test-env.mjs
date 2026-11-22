import { existsSync } from "node:fs";
import { config } from "dotenv";

const isCi = process.env.CI === "true";
const testDbKeys = ["DATABASE_URL", "DIRECT_URL", "DATABASE_URL_POOLED"];

/**
 * Lokal: hanya `.env.test` (+ override lokal yang di-ignore). `.env` produksi
 * tidak pernah dibaca. CI sudah menyediakan seluruh env dari workflow, jadi
 * jangan menimpanya dengan URL localhost.
 */
if (!isCi) {
  config({ path: ".env.test", override: true });

  if (existsSync(".env.test.local")) {
    config({ path: ".env.test.local", override: true });
  }

  for (const key of testDbKeys) {
    const host = (() => {
      try {
        return new URL(process.env[key] ?? "").hostname;
      } catch {
        return "";
      }
    })();
    if (host !== "localhost" && host !== "127.0.0.1") {
      throw new Error(`${key} di .env.test harus menunjuk PostgreSQL lokal.`);
    }
  }
}
