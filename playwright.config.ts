import fs from "node:fs";
import "./scripts/load-test-env.mjs";
import { defineConfig, devices } from "@playwright/test";

// unstable_cache menyimpan katalog dari DB sebelumnya. Mulai E2E dengan cache
// kosong agar produk yang dibuat lewat Prisma langsung muncul di halaman menu.
fs.rmSync(".next/cache", { recursive: true, force: true });
fs.rmSync(".next/dev/cache/fetch-cache", { recursive: true, force: true });

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.APP_BASE_URL ?? "http://localhost:3000",
    channel: "chrome",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [{ name: "chrome", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: process.env.CI ? "npm run start" : "npm run dev",
    url: "http://localhost:3000/login",
    // Jangan diam-diam memakai server dev yang mungkin terhubung ke DB produksi.
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
