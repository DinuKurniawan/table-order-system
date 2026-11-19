/**
 * Lighthouse mobile untuk halaman menu customer.
 * Prasyarat: server produksi berjalan dan DATABASE_URL tersedia.
 *   npm run build && npm start
 *   npm run lighthouse:menu
 */
import "dotenv/config";
import fs from "node:fs";
import lighthouse from "lighthouse";
import * as chromeLauncher from "chrome-launcher";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";

async function main() {
  const table = await prisma.table.findFirst({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });
  if (!table) throw new Error("Tidak ada meja aktif. Jalankan npm run db:seed.");

  const chrome = await chromeLauncher.launch({
    chromeFlags: ["--headless=new", "--no-sandbox", "--disable-gpu"],
  });

  try {
    const result = await lighthouse(`${baseUrl}/m/${table.token}`, {
      port: chrome.port,
      output: "json",
      logLevel: "error",
      onlyCategories: ["performance", "accessibility", "best-practices"],
      formFactor: "mobile",
      screenEmulation: {
        mobile: true,
        width: 412,
        height: 823,
        deviceScaleFactor: 1.75,
        disabled: false,
      },
      throttling: {
        rttMs: 150,
        throughputKbps: 1638.4,
        cpuSlowdownMultiplier: 4,
      },
    });
    if (!result) throw new Error("Lighthouse tidak mengembalikan hasil.");

    const { lhr } = result;
    fs.writeFileSync("lighthouse-menu.json", JSON.stringify(lhr));

    const lcp = lhr.audits["largest-contentful-paint"].numericValue;
    const summary = {
      performance: lhr.categories.performance.score,
      accessibility: lhr.categories.accessibility.score,
      bestPractices: lhr.categories["best-practices"].score,
      lcpMs: Math.round(lcp),
      cls: lhr.audits["cumulative-layout-shift"].numericValue,
      tbtMs: Math.round(lhr.audits["total-blocking-time"].numericValue),
    };
    console.log(JSON.stringify(summary, null, 2));

    if (lcp >= 2500) throw new Error(`LCP ${Math.round(lcp)}ms melewati target 2500ms`);
    if (summary.accessibility < 0.95) {
      throw new Error(`Skor aksesibilitas ${summary.accessibility} di bawah 0.95`);
    }
  } finally {
    await chrome.kill();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
