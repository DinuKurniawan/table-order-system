import test from "node:test";
import assert from "node:assert/strict";
import { PrismaClient, CategoryType } from "@prisma/client";
import { updateStockSettings } from "../src/server/services/stock";

const prisma = new PrismaClient();

test("T-02: updateStockSettings tidak menimpa stok yang berubah bersamaan", async (t) => {
  const stamp = Date.now();
  const category = await prisma.category.create({
    data: { name: `T02 ${stamp}`, type: CategoryType.FOOD },
  });
  const product = await prisma.product.create({
    data: {
      name: `T02 Produk ${stamp}`,
      price: 5000,
      categoryId: category.id,
      stock: 10,
      trackStock: true,
      lowStockThreshold: 3,
    },
  });
  const user = await prisma.user.create({
    data: {
      name: `Admin T02 ${stamp}`,
      username: `admin-t02-${stamp}`,
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

  let release!: () => void;
  let locked!: () => void;
  const lockAcquired = new Promise<void>((resolve) => {
    locked = resolve;
  });
  const releaseLock = new Promise<void>((resolve) => {
    release = resolve;
  });

  const competing = prisma.$transaction(async (tx) => {
    // Simulasi reservasi checkout yang memegang kunci baris.
    await tx.product.update({ where: { id: product.id }, data: { stock: 3 } });
    locked();
    await releaseLock;
  });

  await lockAcquired;
  const settings = updateStockSettings(
    product.id,
    { lowStockThreshold: 7 },
    user.id
  );

  // Beri kesempatan updateStockSettings mencapai UPDATE sebelum lock dilepas.
  await new Promise((resolve) => setTimeout(resolve, 300));
  release();
  await Promise.all([competing, settings]);

  const saved = await prisma.product.findUniqueOrThrow({
    where: { id: product.id },
  });
  assert.equal(saved.stock, 3, "stok hasil reservasi tidak boleh kembali ke 10");
  assert.equal(saved.lowStockThreshold, 7);
});
