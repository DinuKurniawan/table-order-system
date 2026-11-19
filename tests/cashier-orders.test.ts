import test from "node:test";
import assert from "node:assert/strict";
import { PrismaClient, CategoryType, OrderStatus, PaymentStatus } from "@prisma/client";
import { AppError } from "../src/lib/errors";
import {
  advanceOrderStatus,
  approvePayment,
  rejectPayment,
} from "../src/server/services/cashier-orders";

const prisma = new PrismaClient();

test("Kasir: approve bersamaan, alasan wajib, state machine", async (t) => {
  const stamp = Date.now();
  const table = await prisma.table.create({
    data: { name: `Kasir Meja ${stamp}`, token: `kasir-token-${stamp}` },
  });
  const category = await prisma.category.create({
    data: { name: `Kasir ${stamp}`, type: CategoryType.FOOD },
  });
  const product = await prisma.product.create({
    data: {
      name: `Kasir Produk ${stamp}`,
      price: 15000,
      categoryId: category.id,
      stock: 100,
    },
  });
  const cashier = await prisma.user.create({
    data: {
      name: `Kasir Uji ${stamp}`,
      username: `kasir-uji-${stamp}`,
      passwordHash: "x",
      role: "CASHIER",
    },
  });

  const orderIds: string[] = [];

  async function makeOrder(status: OrderStatus, paymentStatus?: PaymentStatus, attempt = 1) {
    const code = `KSR-${stamp}-${orderIds.length + 1}`;
    const order = await prisma.order.create({
      data: {
        code,
        accessToken: `token-${code}`,
        tableId: table.id,
        subtotal: 15000,
        total: 15000,
        status,
        expiresAt: new Date(Date.now() + 10 * 60_000),
        items: {
          create: [
            {
              productId: product.id,
              nameSnapshot: "Kasir Produk",
              priceSnapshot: 15000,
              quantity: 1,
            },
          ],
        },
      },
    });
    orderIds.push(order.id);

    if (paymentStatus) {
      await prisma.payment.create({
        data: {
          orderId: order.id,
          attempt,
          proofKey: `proofs/${code}/uji.avif`,
          status: paymentStatus,
        },
      });
    }

    return order;
  }

  t.after(async () => {
    await prisma.auditLog.deleteMany({ where: { entityId: { in: orderIds } } });
    await prisma.transaction.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.user.delete({ where: { id: cashier.id } });
    await prisma.product.delete({ where: { id: product.id } });
    await prisma.category.delete({ where: { id: category.id } });
    await prisma.table.delete({ where: { id: table.id } });
    await prisma.$disconnect();
  });

  await t.test("1. Dua approve bersamaan: hanya satu yang sukses", async () => {
    const order = await makeOrder(
      OrderStatus.AWAITING_VERIFICATION,
      PaymentStatus.PENDING
    );

    const results = await Promise.allSettled([
      approvePayment(order.id, cashier.id),
      approvePayment(order.id, cashier.id),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected"
    );

    assert.equal(fulfilled.length, 1, "Hanya satu kasir boleh menang");
    assert.equal(rejected.length, 1, "Permintaan kedua harus ditolak");
    assert.ok(
      rejected[0].reason instanceof AppError &&
        rejected[0].reason.code === "CONFLICT",
      "Permintaan kedua harus CONFLICT"
    );

    const payments = await prisma.payment.findMany({ where: { orderId: order.id } });
    assert.equal(payments.length, 1);
    assert.equal(payments[0].status, PaymentStatus.APPROVED);
    assert.equal(payments[0].verifiedById, cashier.id);

    const income = await prisma.transaction.count({
      where: { orderId: order.id, type: "INCOME" },
    });
    assert.equal(income, 1, "Transaksi INCOME harus idempoten");

    const updated = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    assert.equal(updated.status, OrderStatus.ACCEPTED);
  });

  await t.test("2. Tolak tanpa alasan ditolak", async () => {
    const order = await makeOrder(
      OrderStatus.AWAITING_VERIFICATION,
      PaymentStatus.PENDING
    );

    await assert.rejects(
      () => rejectPayment(order.id, cashier.id, "   "),
      (err: unknown) => err instanceof AppError && err.code === "BAD_REQUEST"
    );

    const updated = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    assert.equal(updated.status, OrderStatus.AWAITING_VERIFICATION);

    const payment = await prisma.payment.findFirstOrThrow({
      where: { orderId: order.id },
    });
    assert.equal(payment.status, PaymentStatus.PENDING);
  });

  await t.test("3. Tolak dengan alasan menandai PAYMENT_REJECTED", async () => {
    const order = await makeOrder(
      OrderStatus.AWAITING_VERIFICATION,
      PaymentStatus.PENDING
    );

    const result = await rejectPayment(order.id, cashier.id, "Nominal tidak sesuai");
    assert.equal(result.status, OrderStatus.PAYMENT_REJECTED);
    assert.equal(result.cancelled, false);

    const payment = await prisma.payment.findFirstOrThrow({
      where: { orderId: order.id },
    });
    assert.equal(payment.status, PaymentStatus.REJECTED);
    assert.equal(payment.rejectReason, "Nominal tidak sesuai");
  });

  await t.test("4. State machine menolak lompatan status", async () => {
    const order = await makeOrder(OrderStatus.ACCEPTED);

    await assert.rejects(
      () => advanceOrderStatus(order.id, cashier.id, "READY"),
      (err: unknown) => err instanceof AppError && err.code === "CONFLICT"
    );

    const preparing = await advanceOrderStatus(order.id, cashier.id, "PREPARING");
    assert.equal(preparing.status, OrderStatus.PREPARING);

    await assert.rejects(
      () => advanceOrderStatus(order.id, cashier.id, "COMPLETED"),
      (err: unknown) => err instanceof AppError && err.code === "CONFLICT"
    );

    const ready = await advanceOrderStatus(order.id, cashier.id, "READY");
    assert.equal(ready.status, OrderStatus.READY);

    const completed = await advanceOrderStatus(order.id, cashier.id, "COMPLETED");
    assert.equal(completed.status, OrderStatus.COMPLETED);
  });
});
