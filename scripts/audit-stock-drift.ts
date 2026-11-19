/**
 * Audit READ-ONLY dampak bug K-01 (toggle produk mereset stok ke 0).
 *
 * Membandingkan Product.stock dengan balance StockMovement terakhir per produk.
 * Tidak menulis apa pun ke database. Koreksi (bila disetujui) dilakukan manual
 * lewat stock.service dengan StockMovement ADJUSTMENT bernote "koreksi bug K-01".
 *
 * Jalankan: npm run audit:stock-drift
 */
import { prisma } from "../src/lib/db";

interface DriftRow {
  produk: string;
  "stok sekarang": number;
  "saldo terakhir": number | "—";
  selisih: number | "—";
  "usulan (ADJUSTMENT qty)": number | "—";
}

async function main() {
  const products = await prisma.product.findMany({
    where: { deletedAt: null, trackStock: true },
    select: { id: true, name: true, stock: true },
    orderBy: { name: "asc" },
  });

  const rows: DriftRow[] = [];

  for (const product of products) {
    const last = await prisma.stockMovement.findFirst({
      where: { productId: product.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { balance: true },
    });

    if (!last) {
      rows.push({
        produk: product.name,
        "stok sekarang": product.stock,
        "saldo terakhir": "—",
        selisih: "—",
        "usulan (ADJUSTMENT qty)": "—",
      });
      continue;
    }

    const delta = last.balance - product.stock;
    rows.push({
      produk: product.name,
      "stok sekarang": product.stock,
      "saldo terakhir": last.balance,
      selisih: delta,
      "usulan (ADJUSTMENT qty)": delta === 0 ? "—" : delta,
    });
  }

  const drifted = rows.filter((row) => row.selisih !== "—" && row.selisih !== 0);

  console.log("Audit drift stok K-01 (READ-ONLY)");
  console.log(`Produk dilacak: ${rows.length} · selisih: ${drifted.length}\n`);

  if (rows.length > 0) {
    console.table(rows);
  }

  if (drifted.length > 0) {
    console.log(
      "\nUsulan perbaikan (belum dijalankan): set stok = saldo terakhir lewat " +
        'stock.service ADJUSTMENT dengan note "koreksi bug K-01".'
    );
  } else {
    console.log("Tidak ada selisih: stok konsisten dengan riwayat movement.");
  }
}

main()
  .catch((err) => {
    console.error("Gagal menjalankan audit stok:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
