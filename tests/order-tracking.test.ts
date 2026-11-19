import test from "node:test";
import assert from "node:assert/strict";
import { PrismaClient, CategoryType, OrderStatus, PaymentStatus } from "@prisma/client";
import { AppError } from "../src/lib/errors";
import {
  cancelOrderByCustomer,
  expireOrders,
  getCustomerOrder,
  submitPaymentProof,
} from "../src/server/services/orders";
import { getSettings } from "../src/server/services/settings";

const prisma = new PrismaClient();

test("Pelacakan Pesanan: guard status, batas unggah, cron idempoten", async (t) => {
  const stamp = Date.now();
  const table = await prisma.table.create({
    data: { name: `Uji Meja ${stamp}`, token: `uji-token-${stamp}` },
  });
  const category = await prisma.category.create({
    data: { name: `Uji ${stamp}`, type: CategoryType.FOOD },
  });
  const product = await prisma.product.create({
    data: {
      name: `Uji Produk ${stamp}`,
      price: 10000,
      categoryId: category.id,
      stock: 100,
    },
  });

  const orderIds: string[] = [];
  const settings = await getSettings();

  async function makeOrder(options: {
    status: OrderStatus;
    expiresAt: Date;
    attempt?: number;
    paymentStatus?: PaymentStatus;
  }) {
    const code = `TEST-${stamp}-${orderIds.length + 1}`;
    const token = `token-${code}`;

    const order = await prisma.order.create({
      data: {
        code,
        accessToken: token,
        tableId: table.id,
        subtotal: 20000,
        total: 20000,
        status: options.status,
        expiresAt: options.expiresAt,
        items: {
          create: [
            {
              productId: product.id,
              nameSnapshot: "Uji Produk",
              priceSnapshot: 10000,
              quantity: 2,
            },
          ],
        },
      },
    });
    orderIds.push(order.id);

    // Simulasikan reservasi stok saat order dibuat.
    await prisma.product.update({
      where: { id: product.id },
      data: { stock: { decrement: 2 } },
    });
    await prisma.stockMovement.create({
      data: {
        productId: product.id,
        type: "ORDER_RESERVE",
        quantity: 2,
        balance: 0,
        orderId: order.id,
        note: `Uji ${code}`,
      },
    });

    if (options.attempt) {
      await prisma.payment.create({
        data: {
          orderId: order.id,
          attempt: options.attempt,
          proofKey: `proofs/${code}/uji.avif`,
          status: options.paymentStatus ?? PaymentStatus.REJECTED,
          rejectReason: "Uji penolakan",
        },
      });
    }

    return { code, token };
  }

  t.after(async () => {
    await prisma.stockMovement.deleteMany({ where: { productId: product.id } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.product.delete({ where: { id: product.id } });
    await prisma.category.delete({ where: { id: category.id } });
    await prisma.table.delete({ where: { id: table.id } });
    await prisma.$disconnect();
  });

  await t.test("1. Kode akses salah ditolak", async () => {
    const future = new Date(Date.now() + 10 * 60_000);
    const { code } = await makeOrder({
      status: OrderStatus.AWAITING_PAYMENT,
      expiresAt: future,
    });

    await assert.rejects(
      () => getCustomerOrder(code, "token-salah"),
      (err: unknown) => err instanceof AppError && err.code === "FORBIDDEN"
    );
  });

  await t.test("2. Transisi status ilegal ditolak", async () => {
    const future = new Date(Date.now() + 10 * 60_000);
    const { code, token } = await makeOrder({
      status: OrderStatus.ACCEPTED,
      expiresAt: future,
      attempt: 1,
      paymentStatus: PaymentStatus.APPROVED,
    });

    await assert.rejects(
      () => submitPaymentProof(code, token, Buffer.from("bukan-gambar")),
      (err: unknown) => err instanceof AppError && err.code === "CONFLICT"
    );

    await assert.rejects(
      () => cancelOrderByCustomer(code, token),
      (err: unknown) => err instanceof AppError && err.code === "CONFLICT"
    );

    const paymentCount = await prisma.payment.count({
      where: { order: { code } },
    });
    assert.equal(paymentCount, 1, "Tidak boleh ada Payment baru");
  });

  await t.test("3. Unggah ulang melebihi batas ditolak", async () => {
    const future = new Date(Date.now() + 10 * 60_000);
    const { code, token } = await makeOrder({
      status: OrderStatus.PAYMENT_REJECTED,
      expiresAt: future,
      attempt: settings.maksUploadUlang,
    });

    await assert.rejects(
      () => submitPaymentProof(code, token, Buffer.from("bukan-gambar")),
      (err: unknown) =>
        err instanceof AppError &&
        err.code === "CONFLICT" &&
        /Batas unggah ulang/.test(err.message)
    );
  });

  await t.test("4. Cron mengembalikan stok tepat sekali", async () => {
    const past = new Date(Date.now() - 60_000);
    const awaiting = await makeOrder({
      status: OrderStatus.AWAITING_PAYMENT,
      expiresAt: past,
    });
    const rejected = await makeOrder({
      status: OrderStatus.PAYMENT_REJECTED,
      expiresAt: past,
      attempt: 1,
    });

    const before = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
      select: { stock: true },
    });

    const first = await expireOrders();
    assert.ok(first.cancelled >= 2, "Kedua order uji harus dibatalkan");

    const afterFirst = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
      select: { stock: true },
    });
    assert.equal(
      afterFirst.stock,
      before.stock + 4,
      "Stok kedua order uji harus kembali"
    );

    const releases = await prisma.stockMovement.count({
      where: { productId: product.id, type: "ORDER_RELEASE" },
    });
    assert.equal(releases, 2, "Satu ORDER_RELEASE per order");

    const second = await expireOrders();
    assert.equal(second.cancelled, 0, "Cron kedua tidak membatalkan apa pun");

    const afterSecond = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
      select: { stock: true },
    });
    assert.equal(afterSecond.stock, before.stock + 4, "Stok tidak boleh bertambah dua kali");

    const releasesAfterSecond = await prisma.stockMovement.count({
      where: { productId: product.id, type: "ORDER_RELEASE" },
    });
    assert.equal(releasesAfterSecond, 2, "Tidak ada ORDER_RELEASE ganda");

    const statuses = await prisma.order.findMany({
      where: { code: { in: [awaiting.code, rejected.code] } },
      select: { status: true },
    });
    assert.ok(
      statuses.every((order) => order.status === OrderStatus.CANCELLED),
      "Pesanan harus berstatus CANCELLED"
    );
  });
});
