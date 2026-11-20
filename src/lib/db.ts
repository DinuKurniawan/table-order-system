import "server-only";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Serverless membuka pool per instance, sedangkan Prisma Postgres (direct,
 * db.prisma.io) membatasi 45 koneksi per role. Pakai URL pooled bila tersedia
 * (PgBouncer di pooled.db.prisma.io) agar banyak instance berbagi sedikit
 * koneksi server. Lima koneksi per instance cukup untuk query paralel
 * (dashboard/cashier) tanpa antre satu per satu; PgBouncer yang membatasi
 * koneksi server. Nilai tetap bisa ditimpa dari parameter URL.
 */
function datasourceUrl(): string | undefined {
  const pooled = process.env.DATABASE_URL_POOLED;
  const raw = pooled ?? process.env.DATABASE_URL;
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    // Prisma Postgres pooler sudah PgBouncer >= 1.21. Flag pgbouncer=true
    // membuat tiap query +120ms (diukur) dan tidak lagi diperlukan.
    if (!url.searchParams.has("connection_limit")) {
      url.searchParams.set("connection_limit", "5");
    }
    if (!url.searchParams.has("pool_timeout")) {
      url.searchParams.set("pool_timeout", "10");
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: datasourceUrl(),
    // Beri waktu tunggu koneksi lebih panjang dari default 2 detik agar tidak
    // gagal P2024 saat ramai, dan timeout transaksi eksplisit 15 detik karena
    // checkout multi-item bisa melewati default 5 detik di region jauh.
    transactionOptions: { maxWait: 15000, timeout: 15000 },
    log:
      process.env.NODE_ENV === "development"
        ? ["error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
