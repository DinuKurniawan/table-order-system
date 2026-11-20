import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";
import { POST as createOrder } from "../src/app/api/public/orders/route";
import { GET as getOrder } from "../src/app/api/public/orders/[code]/route";

const prisma = new PrismaClient();
const stamp = Date.now();
const ipBlock = (stamp % 200) + 1;
const ip = `198.51.${ipBlock}.11`;

const CODE_PATTERN = /^ORD-\d{6}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/;

test("SEC-06: kode pesanan kuat dan error akses seragam", async (t) => {
  const table = await prisma.table.create({
    data: { name: `Kode ${stamp}`, token: `kode-${stamp}` },
  });
  const category = await prisma.category.create({
    data: { name: `Kode ${stamp}`, type: "FOOD" },
  });
  const product = await prisma.product.create({
    data: {
      name: `Kode Produk ${stamp}`,
      price: 10000,
      categoryId: category.id,
      stock: 100,
    },
  });

  const orderIds: string[] = [];

  t.after(async () => {
    await prisma.rateLimit.deleteMany({ where: { key: { contains: ip } } });
    await prisma.stockMovement.deleteMany({ where: { productId: product.id } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.product.delete({ where: { id: product.id } });
    await prisma.category.delete({ where: { id: category.id } });
    await prisma.table.delete({ where: { id: table.id } });
    await prisma.$disconnect();
  });

  const checkout = (key: string) =>
    createOrder(
      new NextRequest("http://localhost:3000/api/public/orders", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": key,
          "x-forwarded-for": ip,
        },
        body: JSON.stringify({
          tableToken: table.token,
          customerName: "Uji Kode",
          items: [{ productId: product.id, quantity: 1 }],
        }),
      })
    );

  const keyA = `sec06-key-${stamp}-aaaaaaaa`;
  const keyB = `sec06-key-${stamp}-bbbbbbbb`;

  const first = await checkout(keyA);
  assert.equal(first.status, 201);
  const firstBody = (await first.json()) as {
    code: string;
    accessToken: string;
  };

  await t.test("1. kode baru berformat benar dan unik", async () => {
    assert.match(firstBody.code, CODE_PATTERN);
    const second = await checkout(keyB);
    const secondBody = (await second.json()) as {
      code: string;
      accessToken: string;
    };
    assert.match(secondBody.code, CODE_PATTERN);
    assert.notEqual(secondBody.code, firstBody.code);

    const rows = await prisma.order.findMany({
      where: { code: { in: [firstBody.code, secondBody.code] } },
      select: { id: true },
    });
    orderIds.push(...rows.map((row) => row.id));
  });

  await t.test("2. replay idempoten mengembalikan token yang sama", async () => {
    const replay = await checkout(keyA);
    assert.equal(replay.status, 200);
    const replayBody = (await replay.json()) as {
      code: string;
      accessToken: string;
    };
    assert.equal(replayBody.code, firstBody.code);
    assert.equal(replayBody.accessToken, firstBody.accessToken);
  });

  await t.test("3. 404 seragam untuk kode tidak ada dan token salah", async () => {
    const url = (code: string) =>
      `http://localhost:3000/api/public/orders/${code}`;
    const ctx = (code: string) => ({ params: Promise.resolve({ code }) });

    const missing = await getOrder(
      new NextRequest(url("ORD-000000-TIDAKADA")),
      ctx("ORD-000000-TIDAKADA")
    );
    const wrong = await getOrder(
      new NextRequest(url(firstBody.code), {
        headers: { "x-order-token": "token-salah" },
      }),
      ctx(firstBody.code)
    );
    const empty = await getOrder(
      new NextRequest(url(firstBody.code)),
      ctx(firstBody.code)
    );

    assert.equal(missing.status, 404);
    assert.equal(wrong.status, 404);
    assert.equal(empty.status, 404);
    const [a, b, c] = await Promise.all(
      [missing, wrong, empty].map((response) => response.json())
    );
    assert.deepEqual(a, b);
    assert.deepEqual(b, c);
  });
});
