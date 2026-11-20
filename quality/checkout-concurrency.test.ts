import { afterEach, describe, expect, it } from "vitest";
import { CategoryType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { POST } from "@/app/api/public/orders/route";
import { stamp } from "./fixtures";

const ip = `10.77.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}`;
const cleanupIds: string[] = [];
const cleanupTables: string[] = [];

function payload(tableToken: string, productId: string): RequestInit {
  return {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
      "idempotency-key": `quality-${stamp()}-${Math.random().toString(36).slice(2)}`,
    },
    body: JSON.stringify({
      tableToken,
      customerName: "Quality Test",
      items: [{ productId, quantity: 1 }],
    }),
  };
}

async function setup(stock: number) {
  const id = stamp();
  const category = await prisma.category.create({
    data: { name: `Checkout ${id}`, type: CategoryType.FOOD },
  });
  const product = await prisma.product.create({
    data: {
      name: `Checkout ${id}`,
      price: 12_000,
      categoryId: category.id,
      stock,
      trackStock: true,
    },
  });
  const table = await prisma.table.create({
    data: { name: `Meja Checkout ${id}`, token: `checkout-${id}` },
  });
  cleanupIds.push(product.id, category.id);
  cleanupTables.push(table.id);
  return { product, table };
}

afterEach(async () => {
  if (cleanupIds.length || cleanupTables.length) {
    const orders = await prisma.order.findMany({
      where: { tableId: { in: cleanupTables } },
      select: { id: true },
    });
    const ids = orders.map((order) => order.id);
    await prisma.auditLog.deleteMany({
      where: { entityId: { in: ids } },
    });
    await prisma.stockMovement.deleteMany({
      where: { productId: { in: cleanupIds } },
    });
    await prisma.order.deleteMany({ where: { id: { in: ids } } });
    await prisma.table.deleteMany({ where: { id: { in: cleanupTables } } });
    await prisma.product.deleteMany({ where: { id: { in: cleanupIds } } });
    await prisma.category.deleteMany({ where: { id: { in: cleanupIds } } });
  }
  await prisma.rateLimit.deleteMany({
    where: {
      OR: [
        { key: { contains: ip } },
        { key: { startsWith: "order:table:checkout-" } },
      ],
    },
  });
  cleanupIds.length = 0;
  cleanupTables.length = 0;
});

describe("reservasi stok konkuren", () => {
  it("hanya satu checkout berhasil saat stok tersisa satu", async () => {
    const { product, table } = await setup(1);

    const responses = await Promise.all([
      POST(new Request("http://localhost/api/public/orders", payload(table.token, product.id))),
      POST(new Request("http://localhost/api/public/orders", payload(table.token, product.id))),
    ]);

    expect(responses.map((res) => res.status).sort()).toEqual([201, 409]);

    const stock = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
    });
    expect(stock.stock).toBe(0);
    expect(await prisma.order.count({ where: { tableId: table.id } })).toBe(1);
  });

  it("replay Idempotency-Key mengembalikan pesanan sama tanpa memotong stok lagi", async () => {
    const { product, table } = await setup(5);
    const request = payload(table.token, product.id);

    const first = await POST(
      new Request("http://localhost/api/public/orders", request)
    );
    const replay = await POST(
      new Request("http://localhost/api/public/orders", request)
    );

    expect(first.status).toBe(201);
    expect(replay.status).toBe(200);
    const firstBody = (await first.json()) as { code: string };
    const replayBody = (await replay.json()) as { code: string };
    expect(replayBody.code).toBe(firstBody.code);

    const stock = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
    });
    expect(stock.stock).toBe(4);
    expect(await prisma.order.count({ where: { tableId: table.id } })).toBe(1);
  });
});
