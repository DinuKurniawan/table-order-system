/**
 * SEC-09 MIGRATE: isi Order.accessTokenHash dari accessToken plaintext.
 *
 * Idempoten: hanya memproses baris yang hash-nya masih null.
 * Jalankan manual setelah migrasi expand, lalu tunggu satu siklus deploy
 * sebelum menjalankan migrasi contract yang menghapus accessToken.
 *
 *   npx tsx scripts/backfill-access-token-hash.ts
 */
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const rows = await prisma.order.findMany({
    where: { accessTokenHash: null, accessToken: { not: null } },
    select: { id: true, accessToken: true },
  });

  let updated = 0;
  for (const row of rows) {
    if (!row.accessToken) continue;
    const hash = crypto
      .createHash("sha256")
      .update(row.accessToken)
      .digest("hex");
    const result = await prisma.order.updateMany({
      where: { id: row.id, accessTokenHash: null },
      data: { accessTokenHash: hash },
    });
    updated += result.count;
  }

  console.log(
    `Backfill accessTokenHash selesai: ${updated} baris diperbarui dari ${rows.length} kandidat.`
  );
}

main()
  .catch((err) => {
    console.error("Backfill gagal:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
