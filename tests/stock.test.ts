import test from "node:test";
import assert from "node:assert/strict";
import { PrismaClient, CategoryType } from "@prisma/client";
import { AppError } from "../src/lib/errors";
import { adjustStock } from "../src/server/services/stock";

const prisma = new PrismaClient();

test("Stok: tolak saldo negatif dan saldo movement konsisten", async (t) => {
  const stamp = Date.now();
  const category = await prisma.category.create({
    data: { name: `Stok ${stamp}`, type: CategoryType.FOOD },
  });
  const product = await prisma.product.create({
    data: {
      name: `Stok Produk ${stamp}`,
      price: 5000,
      categoryId: category.id,
      stock: 10,
      trackStock: true,
      lowStockThreshold: 3,
    },
  });
  const user = await prisma.user.create({
    data: {
      name: `Admin Stok ${stamp}`,
      username: `admin-stok-${stamp}`,
      passwordHash: "x",
      role: "SUPER_ADMIN",
    },
  });

  t.after(async () => {
    await prisma.auditLog.deleteMany({ where: { entityId: product.id } });
    await prisma.stockMovement.deleteMany({ where: { productId: product.id } });
    await prisma.product.delete({ where: { id: product.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.category.delete({ where: { id: category.id } });
    await prisma.$disconnect();
  });

  await t.test("1. Adjust negatif melebihi stok ditolak", async () => {
    await assert.rejects(
      () =>
        adjustStock(
          {
            productId: product.id,
            type: "ADJUSTMENT",
            quantity: -50,
            note: "Uji minus",
          },
          user.id
        ),
      (err: unknown) => err instanceof AppError && err.code === "VALIDATION_ERROR"
    );

    const after = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    assert.equal(after.stock, 10, "Stok tidak boleh berubah");

    const count = await prisma.stockMovement.count({ where: { productId: product.id } });
    assert.equal(count, 0, "Tidak boleh ada movement saat ditolak");
  });

  await t.test("2. Saldo movement selalu sama dengan stok produk", async () => {
    await adjustStock(
      { productId: product.id, type: "PURCHASE", quantity: 5, note: "Masuk" },
      user.id
    );
    await adjustStock(
      { productId: product.id, type: "WASTE", quantity: 3, note: "Rusak" },
      user.id
    );
    await adjustStock(
      { productId: product.id, type: "ADJUSTMENT", quantity: -2, note: "Koreksi" },
      user.id
    );

    const finalProduct = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
    });
    assert.equal(finalProduct.stock, 10, "10 + 5 - 3 - 2 = 10");

    const movements = await prisma.stockMovement.findMany({
      where: { productId: product.id },
      orderBy: { createdAt: "asc" },
    });
    assert.equal(movements.length, 3);

    let running = 10;
    for (const movement of movements) {
      running += movement.quantity;
      assert.equal(
        movement.balance,
        running,
        `Saldo movement ${movement.type} harus ${running}`
      );
    }
    assert.equal(running, finalProduct.stock);
  });

  await t.test("3. Waste melebihi stok ditolak dan tidak menulis movement", async () => {
    const before = await prisma.stockMovement.count({ where: { productId: product.id } });

    await assert.rejects(
      () =>
        adjustStock(
          { productId: product.id, type: "WASTE", quantity: 999 },
          user.id
        ),
      (err: unknown) => err instanceof AppError && err.code === "VALIDATION_ERROR"
    );

    const after = await prisma.stockMovement.count({ where: { productId: product.id } });
    assert.equal(after, before);
  });
});
