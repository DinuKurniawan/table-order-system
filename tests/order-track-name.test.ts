import test from "node:test";
import assert from "node:assert/strict";
import { PrismaClient, OrderStatus } from "@prisma/client";
import { NextRequest } from "next/server";
import { trackOrdersByCustomer } from "../src/server/services/orders";
import { POST as trackRoute } from "../src/app/api/public/orders/track/route";

const prisma = new PrismaClient();

test("Lacak pesanan: nama + meja, hanya 24 jam, tanpa field sensitif", async (t) => {
  const stamp = Date.now();
  const table = await prisma.table.create({
    data: { name: `Lacak ${stamp}`, token: `lacak-token-${stamp}` },
  });
  const otherTable = await prisma.table.create({
    data: { name: `Lacak Lain ${stamp}`, token: `lacak-token-lain-${stamp}` },
  });

  const name = `Nama Uji ${stamp}`;
  const orderIds: string[] = [];

  async function makeOrder(options: {
    customerName: string;
    tableId: string;
    createdAt: Date;
  }) {
    const order = await prisma.order.create({
      data: {
        code: `TRACK-${stamp}-${orderIds.length + 1}`,
        tableId: options.tableId,
        customerName: options.customerName,
        subtotal: 20000,
        total: 20000,
        status: OrderStatus.AWAITING_PAYMENT,
        expiresAt: new Date(Date.now() + 10 * 60_000),
        createdAt: options.createdAt,
      },
    });
    orderIds.push(order.id);
    return order;
  }

  t.after(async () => {
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.table.deleteMany({
      where: { id: { in: [table.id, otherTable.id] } },
    });
    await prisma.$disconnect();
  });

  const now = Date.now();
  const recent = await makeOrder({
    customerName: name,
    tableId: table.id,
    createdAt: new Date(now - 60 * 60_000),
  });
  const recentLowercase = await makeOrder({
    customerName: name.toLowerCase(),
    tableId: table.id,
    createdAt: new Date(now - 2 * 60 * 60_000),
  });
  await makeOrder({
    customerName: name,
    tableId: table.id,
    createdAt: new Date(now - 25 * 60 * 60_000),
  });
  await makeOrder({
    customerName: name,
    tableId: otherTable.id,
    createdAt: new Date(now - 60 * 60_000),
  });
  await makeOrder({
    customerName: `Orang Lain ${stamp}`,
    tableId: table.id,
    createdAt: new Date(now - 60 * 60_000),
  });

  const since = new Date(now - 24 * 60 * 60_000);
  const results = await trackOrdersByCustomer({
    name,
    tableName: table.name,
    since,
  });

  assert.deepEqual(
    results.map((order) => order.code),
    [recent.code, recentLowercase.code],
    "Hanya order 24 jam terakhir dengan nama+meja cocok, terbaru dulu"
  );

  for (const order of results) {
    assert.deepEqual(
      Object.keys(order).sort(),
      ["code", "createdAt", "expiresAt", "status"],
      "Respons tidak boleh memuat field sensitif"
    );
    assert.equal("customerName" in order, false);
    assert.equal("total" in order, false);
    assert.equal("items" in order, false);
  }
});

test("Lacak pesanan: meja wajib cocok dengan token barcode", async (t) => {
  const stamp = Date.now();
  const table = await prisma.table.create({
    data: { name: `Barcode ${stamp}`, token: `barcode-token-${stamp}` },
  });
  const otherTable = await prisma.table.create({
    data: { name: `Barcode Lain ${stamp}`, token: `barcode-lain-${stamp}` },
  });

  const order = await prisma.order.create({
    data: {
      code: `TRACK-SEC-${stamp}`,
      tableId: table.id,
      customerName: `Budi ${stamp}`,
      subtotal: 20000,
      total: 20000,
      status: OrderStatus.PREPARING,
      expiresAt: new Date(Date.now() + 10 * 60_000),
    },
  });

  function request(body: unknown) {
    return new NextRequest(
      "http://localhost:3000/api/public/orders/track",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }
    );
  }

  t.after(async () => {
    await prisma.rateLimit.deleteMany({ where: { key: { startsWith: "track:" } } });
    await prisma.order.deleteMany({ where: { id: order.id } });
    await prisma.table.deleteMany({
      where: { id: { in: [table.id, otherTable.id] } },
    });
    await prisma.$disconnect();
  });

  const name = `Budi ${stamp}`;

  // Pilihan meja berbeda dari barcode ditolak; kode pesanan tidak bocor.
  const mismatch = await trackRoute(
    request({
      name,
      table: otherTable.name,
      tableToken: table.token,
    })
  );
  assert.equal(mismatch.status, 403);

  // Barcode palsu ditolak.
  const invalid = await trackRoute(
    request({ name, table: table.name, tableToken: "token-palsu-123" })
  );
  assert.equal(invalid.status, 403);

  // Barcode meja sendiri hanya mencari pesanan di meja itu.
  const ownTable = await trackRoute(
    request({ name, table: table.name, tableToken: table.token })
  );
  assert.equal(ownTable.status, 200);
  const ownBody = (await ownTable.json()) as {
    orders: Array<{ code: string }>;
  };
  assert.deepEqual(
    ownBody.orders.map((item) => item.code),
    [order.code]
  );

  // Nama yang sama dicari dari meja lain lewat barcode meja lain: kosong.
  const otherTableResult = await trackRoute(
    request({
      name,
      table: otherTable.name,
      tableToken: otherTable.token,
    })
  );
  assert.equal(otherTableResult.status, 200);
  const otherBody = (await otherTableResult.json()) as {
    orders: Array<{ code: string }>;
  };
  assert.deepEqual(otherBody.orders, []);
});
