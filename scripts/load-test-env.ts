import { config } from "dotenv";

const isCi = process.env.CI === "true";
const testDbKeys = ["DATABASE_URL", "DIRECT_URL", "DATABASE_URL_POOLED"] as const;

/**
 * Lokal: .env.test menang atas .env/shell agar tes tidak pernah menyentuh DB
 * produksi. CI sudah menyediakan seluruh env dari workflow, jadi jangan
 * menimpanya dengan URL localhost.
 */
if (!isCi) {
  config({ path: ".env.test", override: true });

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

  // Non-DB (R2/Pusher) untuk E2E lokal. Di CI semua variabel berasal dari
  // workflow, jadi `.env` produksi tidak boleh dibaca sama sekali.
  config();
}
