import test from "node:test";
import assert from "node:assert/strict";
import { PrismaClient, CategoryType, OrderStatus } from "@prisma/client";
import { AppError } from "../src/lib/errors";
import { withCrc } from "../src/lib/qris";
import {
  claimQrisPayment,
  getCustomerOrder,
} from "../src/server/services/orders";
import {
  approvePayment,
  getPaymentProofKey,
  listCashierOrders,
} from "../src/server/services/cashier-orders";

const prisma = new PrismaClient();

function tlv(tag: string, value: string): string {
  return `${tag}${String(value.length).padStart(2, "0")}${value}`;
}

const STATIC_QRIS = withCrc(
  [
    tlv("00", "01"),
    tlv("01", "11"),
    tlv("53", "360"),
    tlv("58", "ID"),
    tlv("59", "Kopi Uji"),
    tlv("60", "Bandung"),
  ].join("")
);

test("QRIS: klaim tanpa bukti, kasir approve, payload tidak bocor", async (t) => {
  const stamp = Date.now();
  const table = await prisma.table.create({
    data: { name: `QRIS Meja ${stamp}`, token: `qris-token-${stamp}` },
  });
  const category = await prisma.category.create({
    data: { name: `QRIS ${stamp}`, type: CategoryType.FOOD },
  });
  const product = await prisma.product.create({
    data: {
      name: `QRIS Produk ${stamp}`,
      price: 20000,
      categoryId: category.id,
      stock: 100,
    },
  });
  const cashier = await prisma.user.create({
    data: {
      name: `Kasir QRIS ${stamp}`,
      username: `kasir-qris-${stamp}`,
      passwordHash: "x",
      role: "CASHIER",
    },
  });
  const method = await prisma.paymentMethod.create({
    data: {
      kind: "QRIS",
      label: `QRIS Uji ${stamp}`,
      qrisPayload: STATIC_QRIS,
    },
  });

  const orderIds: string[] = [];

  async function makeOrder() {
    const code = `QRIS-${stamp}-${orderIds.length + 1}`;
    const token = `token-${code}`;
    const order = await prisma.order.create({
      data: {
        code,
        accessToken: token,
        tableId: table.id,
        subtotal: 20000,
        total: 20000,
        status: OrderStatus.AWAITING_PAYMENT,
        expiresAt: new Date(Date.now() + 10 * 60_000),
      },
    });
    orderIds.push(order.id);
    return { order, code, token };
  }

  t.after(async () => {
    await prisma.auditLog.deleteMany({
      where: { entityId: { in: orderIds } },
    });
    await prisma.transaction.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.paymentMethod.delete({ where: { id: method.id } });
    await prisma.user.delete({ where: { id: cashier.id } });
    await prisma.product.delete({ where: { id: product.id } });
    await prisma.category.delete({ where: { id: category.id } });
    await prisma.table.delete({ where: { id: table.id } });
    await prisma.$disconnect();
  });

  await t.test("1. DTO customer berisi QR dinamis tanpa payload mentah", async () => {
    const { code, token } = await makeOrder();
    const dto = await getCustomerOrder(code, token);

    assert.equal(dto.qris?.methodId, method.id);
    assert.match(dto.qris?.dataUrl ?? "", /^data:image\/png;base64,/);
    assert.equal(
      Object.hasOwn(dto.paymentMethods[0], "qrisPayload"),
      false,
      "payload mentah tidak boleh dikirim ke customer"
    );
  });

  await t.test("2. Klaim QRIS mencatat Payment tanpa bukti", async () => {
    const { order, code, token } = await makeOrder();
    const dto = await getCustomerOrder(code, token);

    const claimed = await claimQrisPayment(code, token);
    assert.equal(claimed.status, "AWAITING_VERIFICATION");
    assert.equal(claimed.attempt, dto.attemptsUsed + 1);

    const payment = await prisma.payment.findFirstOrThrow({
      where: { orderId: order.id },
    });
    assert.equal(payment.method, "QRIS");
    assert.equal(payment.proofKey, null);
    assert.equal(payment.status, "PENDING");

    const fresh = await getCustomerOrder(code, token);
    assert.equal(fresh.qris, null, "QR tidak tampil setelah klaim");
    assert.equal(fresh.latestPayment?.method, "QRIS");

    await assert.rejects(
      () => claimQrisPayment(code, token),
      (err: unknown) => err instanceof AppError && err.code === "CONFLICT"
    );
    assert.equal(
      await prisma.payment.count({ where: { orderId: order.id } }),
      1,
      "klaim ganda tidak boleh membuat Payment kedua"
    );
  });

  await t.test("3. Kasir melihat antrean lalu approve tanpa ProofViewer", async () => {
    const { order, code, token } = await makeOrder();
    await claimQrisPayment(code, token);

    const queue = await listCashierOrders();
    assert.ok(
      queue.verification.some((item) => item.id === order.id),
      "pesanan klaim QRIS masuk antrean verifikasi"
    );

    const approved = await approvePayment(order.id, cashier.id);
    assert.equal(approved.status, "ACCEPTED");

    const payment = await prisma.payment.findFirstOrThrow({
      where: { orderId: order.id },
    });
    assert.equal(payment.status, "APPROVED");
    assert.equal(payment.verifiedById, cashier.id);

    await assert.rejects(
      () => getPaymentProofKey(order.id),
      (err: unknown) => err instanceof AppError && err.code === "NOT_FOUND"
    );
  });

  await t.test("4. Order belum diklaim terlihat read-only di kasir", async () => {
    const { order } = await makeOrder();
    const queue = await listCashierOrders();

    assert.ok(
      queue.awaitingPayment.some((item) => item.id === order.id),
      "order AWAITING_PAYMENT muncul di daftar belum bayar"
    );
    assert.equal(
      queue.verification.some((item) => item.id === order.id),
      false
    );
  });

  await t.test("5. QRIS gambar statis tanpa payload tetap bisa diklaim", async () => {
    await prisma.paymentMethod.update({
      where: { id: method.id },
      data: {
        qrisPayload: null,
        imageKey: `qris/${"a".repeat(16)}.webp`,
      },
    });

    const { order, code, token } = await makeOrder();
    const dto = await getCustomerOrder(code, token);
    assert.equal(dto.qris, null, "tanpa payload, tidak ada QR dinamis");

    const claimed = await claimQrisPayment(code, token);
    assert.equal(claimed.status, "AWAITING_VERIFICATION");

    const payment = await prisma.payment.findFirstOrThrow({
      where: { orderId: order.id },
    });
    assert.equal(payment.method, "QRIS");
    assert.equal(payment.proofKey, null);
  });
});
