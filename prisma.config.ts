import "dotenv/config";
import { defineConfig, env } from "prisma/config";

/**
 * Konfigurasi Prisma (audit R-05): menggantikan `package.json#prisma` yang
 * deprecated di Prisma 7.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "npx tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
