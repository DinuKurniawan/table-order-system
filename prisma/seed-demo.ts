/**
 * Seed data demo besar untuk uji performa dashboard.
 *
 * 500 pesanan tersebar pada 90 hari terakhir, lengkap dengan item, pembayaran,
 * transaksi penjualan, dan audit log. Semua baris memakai prefiks kode
 * `DEMO-` dan dibuat ulang setiap kali skrip dijalankan.
 *
 * Jalankan setelah `npm run db:seed`:
 *   npm run db:seed:demo
 */

import {
  PrismaClient,
  OrderStatus,
  PaymentStatus,
  Role,
  TxType,
} from "@prisma/client";

const prisma = new PrismaClient();

const ORDER_COUNT = 500;
const DAYS_BACK = 90;

/** PRNG deterministik agar hasil bisa dibandingkan antar-run. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main() {
  const startedAt = Date.now();
  const rand = mulberry32(20261119);
  const pick = <T>(values: T[]): T => values[Math.floor(rand() * values.length)];

  const admin = await prisma.user.findFirst({
    where: { role: Role.SUPER_ADMIN, isActive: true },
    select: { id: true },
  });
  if (!admin) throw new Error("Super Admin belum ada. Jalankan npm run db:seed.");

  const products = await prisma.product.findMany({
    where: { isActive: true, deletedAt: null },
    select: { id: true, name: true, price: true },
    take: 8,
    orderBy: { name: "asc" },
  });
  const tables = await prisma.table.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    take: 5,
    orderBy: { name: "asc" },
  });
  if (products.length === 0 || tables.length === 0) {
    throw new Error("Butuh minimal 1 produk dan 1 meja. Jalankan npm run db:seed.");
  }

  const oldOrders = await prisma.order.findMany({
    where: { code: { startsWith: "DEMO-" } },
    select: { id: true },
  });
  if (oldOrders.length > 0) {
    const ids = oldOrders.map((order) => order.id);
    await prisma.transaction.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.auditLog.deleteMany({
      where: { entity: "Order", entityId: { in: ids } },
    });
    await prisma.order.deleteMany({ where: { id: { in: ids } } });
  }

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const completedStatuses = new Set<OrderStatus>([
    OrderStatus.COMPLETED,
    OrderStatus.READY,
    OrderStatus.PREPARING,
    OrderStatus.ACCEPTED,
  ]);

  let created = 0;

  await prisma.$transaction(
    async (tx) => {
      for (let index = 0; index < ORDER_COUNT; index += 1) {
        const daysAgo = Math.floor(rand() * DAYS_BACK);
        const hourWib = 8 + Math.floor(rand() * 13);
        const createdAt = new Date(
          now - daysAgo * dayMs - (23 - hourWib) * 60 * 60 * 1000
        );

        const roll = rand();
        const status: OrderStatus =
          roll < 0.72
            ? OrderStatus.COMPLETED
            : roll < 0.86
              ? pick([
                  OrderStatus.ACCEPTED,
                  OrderStatus.PREPARING,
                  OrderStatus.READY,
                ])
              : roll < 0.94
                ? OrderStatus.AWAITING_VERIFICATION
                : OrderStatus.CANCELLED;

        const code = `DEMO-${String(index + 1).padStart(4, "0")}`;
        const table = pick(tables);
        const itemCount = 1 + Math.floor(rand() * 3);
        const chosen = new Map<string, number>();
        for (let item = 0; item < itemCount; item += 1) {
          const product = pick(products);
          chosen.set(product.id, (chosen.get(product.id) ?? 0) + 1 + Math.floor(rand() * 2));
        }

        const items = [...chosen.entries()].map(([productId, quantity]) => {
          const product = products.find((entry) => entry.id === productId);
          return {
            productId,
            quantity,
            nameSnapshot: product?.name ?? "Produk",
            priceSnapshot: product?.price ?? 0,
          };
        });
        const subtotal = items.reduce(
          (sum, item) => sum + item.priceSnapshot * item.quantity,
          0
        );

        const order = await tx.order.create({
          data: {
            code,
            accessToken: `demo-token-${index}`,
            tableId: table.id,
            customerName: rand() < 0.5 ? `Pelanggan ${index + 1}` : null,
            status,
            subtotal,
            total: subtotal,
            createdAt,
            version: completedStatuses.has(status) ? 2 : 0,
            expiresAt: new Date(createdAt.getTime() + 15 * 60 * 1000),
            items: { create: items },
          },
        });

        const paid = completedStatuses.has(status);
        if (paid || status === OrderStatus.AWAITING_VERIFICATION) {
          await tx.payment.create({
            data: {
              orderId: order.id,
              attempt: 1,
              proofKey: `demo/proof-${index}.avif`,
              status: paid ? PaymentStatus.APPROVED : PaymentStatus.PENDING,
              verifiedById: paid ? admin.id : null,
              verifiedAt: paid ? new Date(createdAt.getTime() + 4 * 60 * 1000) : null,
              createdAt: new Date(createdAt.getTime() + 3 * 60 * 1000),
            },
          });
        }

        if (paid) {
          await tx.transaction.create({
            data: {
              orderId: order.id,
              type: TxType.INCOME,
              category: "Penjualan",
              amount: subtotal,
              note: `Pembayaran ${code}`,
              createdById: admin.id,
              occurredAt: new Date(createdAt.getTime() + 4 * 60 * 1000),
            },
          });
        }

        await tx.auditLog.create({
          data: {
            userId: paid ? admin.id : null,
            action: "order.create",
            entity: "Order",
            entityId: order.id,
            meta: { code, tableName: table.name, total: subtotal },
            createdAt,
          },
        });

        created += 1;
      }
    },
    { timeout: 120_000, maxWait: 10_000 }
  );

  console.log(
    `Demo seed selesai: ${created} pesanan, ${products.length} produk, ` +
      `${tables.length} meja, ${((Date.now() - startedAt) / 1000).toFixed(1)} detik.`
  );
}

main()
  .catch((error) => {
    console.error("Gagal membuat data demo:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
