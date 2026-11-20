import test from "node:test";
import assert from "node:assert/strict";
import { PrismaClient, CategoryType } from "@prisma/client";
import { POST } from "../src/app/api/public/orders/route";
import { cancelOrderByCustomer } from "../src/server/services/orders";
import { getPublicMenu } from "../src/server/services/menu";

const prisma = new PrismaClient();

test("K-02: produk non-tracked tidak mereservasi stok, tracked tetap atomik", async (t) => {
  const stamp = Date.now();
  const category = await prisma.category.create({
    data: { name: `K02 ${stamp}`, type: CategoryType.FOOD },
  });
  const untracked = await prisma.product.create({
    data: {
      name: `K02 ${stamp} Non-Tracked`,
      price: 15000,
      categoryId: category.id,
      stock: 0,
      trackStock: false,
    },
  });
  const tracked = await prisma.product.create({
    data: {
      name: `K02 ${stamp} Tracked`,
      price: 15000,
      categoryId: category.id,
      stock: 5,
      trackStock: true,
    },
  });
  const tables = await Promise.all(
    Array.from({ length: 22 }, (_, index) =>
      prisma.table.create({
        data: { name: `K02 ${stamp} Meja ${index}`, token: `k02-${stamp}-${index}` },
      })
    )
  );

  const ipKeys = tables.map((_, index) => `order:10.240.0.${index + 1}`);
  const tableKeys = tables.map((table) => `order:table:${table.token}`);

  function request(tableToken: string, productId: string, ip: string, id: string): Request {
    return new Request("http://localhost/api/public/orders", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": ip,
        "idempotency-key": id,
      },
      body: JSON.stringify({
        tableToken,
        customerName: "Uji Stok",
        items: [{ productId, quantity: 1 }],
      }),
    });
  }

  t.after(async () => {
    const orders = await prisma.order.findMany({
      where: { tableId: { in: tables.map((table) => table.id) } },
      select: { id: true },
    });
    const orderIds = orders.map((order) => order.id);
    const productIds = [untracked.id, tracked.id];

    await prisma.auditLog.deleteMany({ where: { entityId: { in: orderIds } } });
    await prisma.stockMovement.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.table.deleteMany({ where: { id: { in: tables.map((table) => table.id) } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.category.delete({ where: { id: category.id } });
    await prisma.rateLimit.deleteMany({
      where: { key: { in: [...ipKeys, ...tableKeys] } },
    });
    await prisma.$disconnect();
  });

  await t.test("(a) checkout produk non-tracked berstok 0 berhasil", async () => {
    const response = await POST(
      request(tables[0].token, untracked.id, "10.240.0.1", `k02-${stamp}-a`)
    );
    assert.equal(response.status, 201);

    const saved = await prisma.product.findUniqueOrThrow({ where: { id: untracked.id } });
    assert.equal(saved.stock, 0, "stok produk non-tracked tidak boleh berubah");

    const movements = await prisma.stockMovement.count({ where: { productId: untracked.id } });
    assert.equal(movements, 0, "produk non-tracked tidak menulis StockMovement");

    const menu = await getPublicMenu({ token: tables[0].token });
    const row = menu.find((item) => item.id === untracked.id);
    assert.ok(row);
    assert.equal(row.trackStock, false, "menu publik wajib menandai trackStock=false");
  });

  await t.test("(b) 20 checkout paralel stok 5: maksimal 5 sukses, stok >= 0", async () => {
    const responses = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        POST(
          request(
            tables[index + 1].token,
            tracked.id,
            `10.240.0.${index + 2}`,
            `k02-${stamp}-p${index}`
          )
        )
      )
    );

    const statuses = responses.map((response) => response.status);
    assert.equal(statuses.filter((status) => status === 201).length, 5);
    assert.equal(statuses.filter((status) => status === 409).length, 15);

    const saved = await prisma.product.findUniqueOrThrow({ where: { id: tracked.id } });
    assert.equal(saved.stock, 0);
    assert.ok(saved.stock >= 0);

    const reserved = await prisma.stockMovement.count({
      where: { productId: tracked.id, type: "ORDER_RESERVE" },
    });
    assert.equal(reserved, 5);
  });

  await t.test("(c) batal tidak mengubah stok produk non-tracked", async () => {
    const response = await POST(
      request(tables[0].token, untracked.id, "10.240.0.21", `k02-${stamp}-c`)
    );
    assert.equal(response.status, 201);
    const body = (await response.json()) as { code: string; accessToken: string };

    await cancelOrderByCustomer(body.code, body.accessToken);

    const saved = await prisma.product.findUniqueOrThrow({ where: { id: untracked.id } });
    assert.equal(saved.stock, 0);
    const movements = await prisma.stockMovement.count({ where: { productId: untracked.id } });
    assert.equal(movements, 0);

    const order = await prisma.order.findUniqueOrThrow({ where: { code: body.code } });
    assert.equal(order.status, "CANCELLED");
  });
});
