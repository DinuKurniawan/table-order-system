/**
 * AUDIT LOGIKA BISNIS & KONKURENSI — tes eksposur bug (read-only terhadap kode aplikasi).
 *
 * Tes di berkas ini SENGAJA MERAH pada kode saat ini. Setiap tes memetakan ke
 * temuan di AUDIT-LOGIKA-BISNIS-DAN-KONKURENSI-REPORT.md. Jangan perbaiki tes agar
 * hijau; perbaiki kode layanannya, lalu tes menjadi hijau.
 *
 * Jalankan terpisah:
 *   npx tsx --env-file=.env.test --import dotenv/config --test tests/integration/business-concurrency.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { PrismaClient, CategoryType } from "@prisma/client";
import { POST } from "../../src/app/api/public/orders/route";
import { reserveStockBatch } from "../../src/server/services/stock";
import { cancelAcceptedOrder } from "../../src/server/services/finance";

const prisma = new PrismaClient();

test("[K-01] kode pesanan bentrok tidak boleh menghasilkan HTTP 500", async (t) => {
  const stamp = Date.now();
  const category = await prisma.category.create({
    data: { name: `Audit K01 ${stamp}`, type: CategoryType.DRINK },
  });
  const product = await prisma.product.create({
    data: {
      name: `Audit K01 ${stamp}`,
      price: 15000,
      categoryId: category.id,
      stock: 100,
      trackStock: true,
    },
  });
  const [tableA, tableB] = await Promise.all([
    prisma.table.create({ data: { name: `Audit K01 A ${stamp}`, token: `audit-k01-a-${stamp}` } }),
    prisma.table.create({ data: { name: `Audit K01 B ${stamp}`, token: `audit-k01-b-${stamp}` } }),
  ]);

  const originalRandomBytes = crypto.randomBytes;
  let calls = 0;
  const fakeRandomBytes = ((size: number) => {
    if (size === 8) {
      calls += 1;
      // Checkout kedua memakai byte yang sama dengan yang pertama sehingga
      // kode pesanan bentrok; percobaan ulang memakai byte berbeda.
      return calls === 2
        ? Buffer.from([1, 2, 3, 4, 5, 6, 7, 8])
        : Buffer.from([9, 10, 11, 12, 13, 14, 15, 16]);
    }
    return originalRandomBytes(size);
  }) as typeof crypto.randomBytes;

  (crypto as unknown as { randomBytes: typeof crypto.randomBytes }).randomBytes =
    fakeRandomBytes;

  const request = (tableToken: string, ip: string, key: string) =>
    new Request("http://localhost/api/public/orders", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": ip,
        "idempotency-key": key,
      },
      body: JSON.stringify({
        tableToken,
        customerName: "Uji Concurrency",
        items: [{ productId: product.id, quantity: 1 }],
      }),
    });

  t.after(async () => {
    (crypto as unknown as { randomBytes: typeof crypto.randomBytes }).randomBytes =
      originalRandomBytes;
    const orders = await prisma.order.findMany({
      where: { tableId: { in: [tableA.id, tableB.id] } },
      select: { id: true, code: true },
    });
    const ids = orders.map((order) => order.id);
    await prisma.auditLog.deleteMany({ where: { entityId: { in: ids } } });
    await prisma.stockMovement.deleteMany({ where: { productId: product.id } });
    await prisma.order.deleteMany({ where: { id: { in: ids } } });
    await prisma.table.deleteMany({ where: { id: { in: [tableA.id, tableB.id] } } });
    await prisma.product.delete({ where: { id: product.id } });
    await prisma.category.delete({ where: { id: category.id } });
    await prisma.rateLimit.deleteMany({
      where: {
        OR: [
          { key: { startsWith: "order:198.51.100." } },
          { key: { contains: `audit-k01-a-${stamp}` } },
          { key: { contains: `audit-k01-b-${stamp}` } },
        ],
      },
    });
  });

  const first = await POST(request(tableA.token, "198.51.100.201", `audit-k01-${stamp}-a`));
  assert.equal(first.status, 201, "checkout pertama harus 201");
  const firstBody = (await first.json()) as { code: string };

  const second = await POST(request(tableB.token, "198.51.100.202", `audit-k01-${stamp}-b`));

  assert.notEqual(
    second.status,
    500,
    "checkout kedua tidak boleh 500 saat kode pesanan bentrok; server harus regenerasi kode"
  );
  assert.equal(second.status, 201, "checkout kedua harus tetap berhasil dengan kode baru");

  const secondBody = (await second.json()) as { code: string };
  assert.notEqual(secondBody.code, firstBody.code, "kode pesanan harus unik");
  assert.ok(calls >= 2, "simulasi bentrok tidak berjalan");
});

test("[K-03] pembatalan tidak boleh menambah stok yang tidak pernah direservasi", async (t) => {
  const stamp = Date.now();
  const category = await prisma.category.create({
    data: { name: `Audit K03 ${stamp}`, type: CategoryType.FOOD },
  });
  const table = await prisma.table.create({
    data: { name: `Audit K03 ${stamp}`, token: `audit-k03-${stamp}` },
  });
  const product = await prisma.product.create({
    data: {
      name: `Audit K03 ${stamp}`,
      price: 10000,
      categoryId: category.id,
      stock: 0,
      trackStock: false,
    },
  });
  const user = await prisma.user.create({
    data: {
      name: `Audit K03 ${stamp}`,
      username: `audit-k03-${stamp}`,
      passwordHash: "x",
      role: "SUPER_ADMIN",
    },
  });
  const order = await prisma.order.create({
    data: {
      code: `AUDIT-K03-${stamp}`,
      accessToken: `audit-k03-token-${stamp}`,
      tableId: table.id,
      subtotal: 20000,
      total: 20000,
      status: "ACCEPTED",
      expiresAt: new Date(Date.now() + 60 * 60_000),
      items: {
        create: [
          {
            productId: product.id,
            nameSnapshot: product.name,
            priceSnapshot: product.price,
            quantity: 2,
          },
        ],
      },
    },
  });

  t.after(async () => {
    await prisma.auditLog.deleteMany({ where: { entityId: order.id } });
    await prisma.stockMovement.deleteMany({ where: { productId: product.id } });
    await prisma.transaction.deleteMany({ where: { orderId: order.id } });
    await prisma.order.delete({ where: { id: order.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.product.delete({ where: { id: product.id } });
    await prisma.table.delete({ where: { id: table.id } });
    await prisma.category.delete({ where: { id: category.id } });
  });

  // Skenario sah: produk tidak melacak stok saat pesanan dibuat (tidak ada
  // reservasi), lalu admin mengaktifkan pelacakan dan mengisi stok fisik 10.
  await prisma.product.update({
    where: { id: product.id },
    data: { trackStock: true, stock: 10 },
  });

  await cancelAcceptedOrder(order.id, user.id, "uji audit");

  const saved = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
  assert.equal(
    saved.stock,
    10,
    "stok fisik tidak boleh bertambah untuk item yang tidak pernah direservasi"
  );
});

test("[K-07] StockMovement ORDER_RESERVE harus tertaut ke orderId", async (t) => {
  const stamp = Date.now();
  const category = await prisma.category.create({
    data: { name: `Audit K07 ${stamp}`, type: CategoryType.FOOD },
  });
  const table = await prisma.table.create({
    data: { name: `Audit K07 ${stamp}`, token: `audit-k07-${stamp}` },
  });
  const product = await prisma.product.create({
    data: {
      name: `Audit K07 ${stamp}`,
      price: 10000,
      categoryId: category.id,
      stock: 10,
      trackStock: true,
    },
  });
  const order = await prisma.order.create({
    data: {
      code: `AUDIT-K07-${stamp}`,
      accessToken: `audit-k07-token-${stamp}`,
      tableId: table.id,
      subtotal: 10000,
      total: 10000,
      status: "AWAITING_PAYMENT",
      expiresAt: new Date(Date.now() + 60 * 60_000),
    },
  });

  t.after(async () => {
    await prisma.stockMovement.deleteMany({ where: { productId: product.id } });
    await prisma.order.delete({ where: { id: order.id } });
    await prisma.product.delete({ where: { id: product.id } });
    await prisma.table.delete({ where: { id: table.id } });
    await prisma.category.delete({ where: { id: category.id } });
  });

  await prisma.$transaction((tx) =>
    reserveStockBatch(
      tx,
      [{ productId: product.id, name: product.name, quantity: 2, trackStock: true }],
      { id: order.id, code: order.code }
    )
  );

  const movement = await prisma.stockMovement.findFirstOrThrow({
    where: { productId: product.id, type: "ORDER_RESERVE" },
  });

  assert.equal(
    movement.orderId,
    order.id,
    "mutasi reservasi harus menyimpan orderId agar stok dapat direkonsiliasi per pesanan"
  );
});
