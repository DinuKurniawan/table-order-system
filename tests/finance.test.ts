import test from "node:test";
import assert from "node:assert/strict";
import { PrismaClient, CategoryType } from "@prisma/client";
import {
  cancelAcceptedOrder,
  createFinanceTransaction,
  getFinanceOverview,
} from "../src/server/services/finance";
import { approvePayment } from "../src/server/services/cashier-orders";

const prisma = new PrismaClient();

test("Keuangan: laba bersih, batas hari WIB, penjualan idempoten", async (t) => {
  const stamp = Date.now();
  const user = await prisma.user.create({
    data: {
      name: `Admin Keuangan ${stamp}`,
      username: `admin-keuangan-${stamp}`,
      passwordHash: "x",
      role: "SUPER_ADMIN",
    },
  });
  const category = await prisma.category.create({
    data: { name: `Keuangan ${stamp}`, type: CategoryType.FOOD },
  });
  const product = await prisma.product.create({
    data: {
      name: `Keuangan Produk ${stamp}`,
      price: 25000,
      categoryId: category.id,
      stock: 10,
    },
  });
  const table = await prisma.table.create({
    data: { name: `Keuangan Meja ${stamp}`, token: `keuangan-token-${stamp}` },
  });

  const orderIds: string[] = [];

  t.after(async () => {
    await prisma.auditLog.deleteMany({ where: { userId: user.id } });
    await prisma.transaction.deleteMany({ where: { createdById: user.id } });
    await prisma.transaction.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.stockMovement.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.product.delete({ where: { id: product.id } });
    await prisma.table.delete({ where: { id: table.id } });
    await prisma.category.delete({ where: { id: category.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  });

  await t.test("1. Laba = pemasukan - pengeluaran", async () => {
    await createFinanceTransaction(
      {
        type: "INCOME",
        category: "Penjualan Manual",
        amount: 100_000,
        occurredAt: "2031-01-10T10:00:00+07:00",
      },
      user.id
    );
    await createFinanceTransaction(
      {
        type: "EXPENSE",
        category: "Bahan Baku",
        amount: 40_000,
        occurredAt: "2031-01-12T09:00:00+07:00",
      },
      user.id
    );

    const overview = await getFinanceOverview({
      preset: "custom",
      from: "2031-01-01",
      to: "2031-01-31",
    });

    assert.equal(overview.summary.income, 100_000);
    assert.equal(overview.summary.expense, 40_000);
    assert.equal(overview.summary.net, 60_000);
    assert.equal(overview.summary.count, 2);
  });

  await t.test("2. Pergantian hari WIB benar", async () => {
    await createFinanceTransaction(
      {
        type: "INCOME",
        category: "Lainnya",
        amount: 10_000,
        occurredAt: "2031-02-10T00:00:00+07:00",
      },
      user.id
    );
    await createFinanceTransaction(
      {
        type: "INCOME",
        category: "Lainnya",
        amount: 20_000,
        occurredAt: "2031-02-10T23:59:00+07:00",
      },
      user.id
    );
    // 00:00 WIB tanggal 11 sudah masuk hari berikutnya.
    await createFinanceTransaction(
      {
        type: "INCOME",
        category: "Lainnya",
        amount: 99_000,
        occurredAt: "2031-02-11T00:00:00+07:00",
      },
      user.id
    );

    const day = await getFinanceOverview({
      preset: "custom",
      from: "2031-02-10",
      to: "2031-02-10",
    });

    assert.equal(day.summary.income, 30_000, "Hanya transaksi 10 Feb WIB");
    assert.equal(day.series.length, 1);
    assert.equal(day.series[0].bucket, "2031-02-10");
    assert.equal(day.series[0].income, 30_000);

    const nextDay = await getFinanceOverview({
      preset: "custom",
      from: "2031-02-11",
      to: "2031-02-11",
    });
    assert.equal(nextDay.summary.income, 99_000);
  });

  await t.test("3. Transaksi penjualan idempoten dan refund tidak menghapus penjualan", async () => {
    const order = await prisma.order.create({
      data: {
        code: `FIN-${stamp}`,
        accessToken: `tok-${stamp}`,
        tableId: table.id,
        subtotal: 25_000,
        total: 25_000,
        status: "AWAITING_VERIFICATION",
        expiresAt: new Date(Date.now() + 10 * 60_000),
        items: {
          create: [
            {
              productId: product.id,
              nameSnapshot: "Keuangan Produk",
              priceSnapshot: 25_000,
              quantity: 1,
            },
          ],
        },
        payments: {
          create: [
            {
              attempt: 1,
              proofKey: `proofs/${stamp}.avif`,
              status: "PENDING",
            },
          ],
        },
      },
    });
    orderIds.push(order.id);

    await approvePayment(order.id, user.id);
    await assert.rejects(() => approvePayment(order.id, user.id));

    const income = await prisma.transaction.count({
      where: { orderId: order.id, category: "Penjualan" },
    });
    assert.equal(income, 1, "Penjualan hanya satu");

    await cancelAcceptedOrder(order.id, user.id, "Pesanan dibatalkan uji");

    const sale = await prisma.transaction.findUniqueOrThrow({
      where: { orderId_category: { orderId: order.id, category: "Penjualan" } },
    });
    const refund = await prisma.transaction.findUniqueOrThrow({
      where: { orderId_category: { orderId: order.id, category: "Refund" } },
    });

    assert.equal(sale.type, "INCOME");
    assert.equal(refund.type, "EXPENSE");
    assert.equal(refund.amount, sale.amount);

    const cancelled = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    assert.equal(cancelled.status, "CANCELLED");
  });
});
