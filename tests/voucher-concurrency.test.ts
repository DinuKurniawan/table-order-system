import test from "node:test";
import assert from "node:assert/strict";
import { PrismaClient, CategoryType, VoucherType } from "@prisma/client";
import { POST } from "../src/app/api/public/orders/route";

const prisma = new PrismaClient();

test("Voucher: kuota 9/10, dua checkout paralel menghasilkan tepat satu pemenang", async (t) => {
  const stamp = Date.now();
  const category = await prisma.category.create({
    data: { name: `Voucher Race ${stamp}`, type: CategoryType.FOOD },
  });
  const product = await prisma.product.create({
    data: {
      name: `Produk Race ${stamp}`,
      price: 20_000,
      categoryId: category.id,
      stock: 10,
      trackStock: true,
    },
  });
  const tables = await Promise.all(
    [0, 1].map((index) =>
      prisma.table.create({
        data: {
          name: `Meja Race ${stamp} ${index}`,
          token: `voucher-race-${stamp}-${index}`,
        },
      })
    )
  );
  const now = Date.now();
  const voucher = await prisma.voucher.create({
    data: {
      code: `RACE${stamp}`,
      type: VoucherType.FIXED,
      value: 5_000,
      minSpend: 0,
      quota: 10,
      usedCount: 9,
      isActive: true,
      startsAt: new Date(now - 60_000),
      endsAt: new Date(now + 24 * 60 * 60_000),
    },
  });

  const ips = ["10.250.0.1", "10.250.0.2"];

  t.after(async () => {
    const orders = await prisma.order.findMany({
      where: { tableId: { in: tables.map((table) => table.id) } },
      select: { id: true },
    });
    const orderIds = orders.map((order) => order.id);

    await prisma.auditLog.deleteMany({ where: { entityId: { in: orderIds } } });
    await prisma.stockMovement.deleteMany({ where: { productId: product.id } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.voucher.delete({ where: { id: voucher.id } });
    await prisma.table.deleteMany({
      where: { id: { in: tables.map((table) => table.id) } },
    });
    await prisma.product.delete({ where: { id: product.id } });
    await prisma.category.delete({ where: { id: category.id } });
    await prisma.rateLimit.deleteMany({
      where: {
        key: {
          in: [
            ...ips.map((ip) => `order:${ip}`),
            ...tables.map((table) => `order:table:${table.token}`),
          ],
        },
      },
    });
    await prisma.$disconnect();
  });

  const responses = await Promise.all(
    tables.map((table, index) =>
      POST(
        new Request("http://localhost/api/public/orders", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": ips[index],
            "idempotency-key": `voucher-race-${stamp}-${index}`,
          },
          body: JSON.stringify({
            tableToken: table.token,
            customerName: `Race ${index}`,
            voucherCode: `race${stamp}`,
            items: [{ productId: product.id, quantity: 1 }],
          }),
        })
      )
    )
  );

  assert.equal(
    responses.filter((response) => response.status === 201).length,
    1,
    "tepat satu checkout menang"
  );
  const loser = responses.find((response) => response.status !== 201);
  assert.ok(loser);
  assert.equal(loser.status, 409);
  const loserBody = (await loser.json()) as {
    error?: { code?: string };
  };
  assert.equal(loserBody.error?.code, "VOUCHER_QUOTA_EXHAUSTED");

  const latest = await prisma.voucher.findUniqueOrThrow({
    where: { id: voucher.id },
  });
  assert.equal(latest.usedCount, 10);

  const orders = await prisma.order.findMany({
    where: { tableId: { in: tables.map((table) => table.id) } },
  });
  assert.equal(orders.length, 1, "yang kalah tidak mendapat order");
  assert.equal(orders[0].discount, 5_000);
  assert.equal(orders[0].total, 15_000);
  assert.equal(orders[0].voucherCode, `RACE${stamp}`);

  const redemptions = await prisma.voucherRedemption.count({
    where: { voucherId: voucher.id },
  });
  assert.equal(redemptions, 1);

  const saved = await prisma.product.findUniqueOrThrow({
    where: { id: product.id },
  });
  assert.equal(saved.stock, 9, "stok hanya terpotong untuk pemenang");
});
