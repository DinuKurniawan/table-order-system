import "server-only";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Serverless membuka pool per instance, sedangkan Prisma Postgres (direct,
 * db.prisma.io) membatasi 45 koneksi per role. Pakai URL pooled bila tersedia
 * (PgBouncer di pooled.db.prisma.io) agar banyak instance berbagi sedikit
 * koneksi server. Satu koneksi per instance cukup dan query antre lewat
 * pool_timeout. Nilai tetap bisa ditimpa dari parameter URL.
 */
function datasourceUrl(): string | undefined {
  const pooled = process.env.DATABASE_URL_POOLED;
  const raw = pooled ?? process.env.DATABASE_URL;
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (pooled && !url.searchParams.has("pgbouncer")) {
      url.searchParams.set("pgbouncer", "true");
    }
    if (!url.searchParams.has("connection_limit")) {
      url.searchParams.set("connection_limit", "1");
    }
    if (!url.searchParams.has("pool_timeout")) {
      url.searchParams.set("pool_timeout", "30");
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
    // Satu koneksi membuat transaksi bisa mengantre; beri waktu tunggu lebih
    // panjang daripada default 2 detik agar tidak gagal P2024 saat ramai.
    transactionOptions: { maxWait: 15000 },
    log:
      process.env.NODE_ENV === "development"
        ? ["error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
