import test from "node:test";
import assert from "node:assert/strict";
import { PrismaClient, CategoryType, Role } from "@prisma/client";
import {
  productCreateSchema,
  productUpdateSchema,
} from "../src/lib/validators/product";
import { createProduct, updateProduct } from "../src/server/services/products";

const prisma = new PrismaClient();

test("K-01: update produk tidak mengisi default dan tidak menyentuh stok", async (t) => {
  const stamp = Date.now();
  const admin = await prisma.user.create({
    data: {
      name: `Admin K01 ${stamp}`,
      username: `admin-k01-${stamp}`,
      passwordHash: "x",
      role: Role.SUPER_ADMIN,
    },
  });
  const category = await prisma.category.create({
    data: { name: `K01 ${stamp}`, type: CategoryType.DRINK, subtype: "COFFEE" },
  });

  t.after(async () => {
    const products = await prisma.product.findMany({
      where: { categoryId: category.id },
      select: { id: true },
    });
    const ids = products.map((row) => row.id);
    await prisma.auditLog.deleteMany({ where: { entityId: { in: ids } } });
    await prisma.stockMovement.deleteMany({ where: { productId: { in: ids } } });
    await prisma.product.deleteMany({ where: { categoryId: category.id } });
    await prisma.category.delete({ where: { id: category.id } });
    await prisma.user.delete({ where: { id: admin.id } });
    await prisma.$disconnect();
  });

  await t.test("skema update tidak punya default dan membuang field stock", () => {
    assert.deepEqual(productUpdateSchema.parse({ isActive: false }), {
      isActive: false,
    });
    assert.deepEqual(productUpdateSchema.parse({ name: "X", stock: 99 }), {
      name: "X",
    });
    assert.ok(!("stock" in productUpdateSchema.shape), "stock tidak boleh ada di update");

    const created = productCreateSchema.parse({
      name: "Default",
      price: 1000,
      categoryId: "cat",
    });
    assert.equal(created.trackStock, true);
    assert.equal(created.stock, 0);
    assert.equal(created.lowStockThreshold, 5);
  });

  const product = await createProduct(
    {
      name: `K01 ${stamp} Produk`,
      price: 25000,
      categoryId: category.id,
      isActive: true,
      trackStock: true,
      stock: 7,
      lowStockThreshold: 3,
    },
    admin.id
  );

  await t.test("(a) PATCH {isActive:false} tidak menyentuh field lain", async () => {
    await updateProduct(product.id, { isActive: false }, admin.id);

    const saved = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    assert.equal(saved.stock, 7);
    assert.equal(saved.price, 25000);
    assert.equal(saved.name, `K01 ${stamp} Produk`);
    assert.equal(saved.lowStockThreshold, 3);
    assert.equal(saved.trackStock, true);
    assert.equal(saved.isActive, false);
  });

  await t.test("(b) PATCH {name} hanya mengubah name", async () => {
    await updateProduct(product.id, { name: `K01 ${stamp} Ganti Nama` }, admin.id);

    const saved = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    assert.equal(saved.name, `K01 ${stamp} Ganti Nama`);
    assert.equal(saved.stock, 7);
    assert.equal(saved.price, 25000);
    assert.equal(saved.isActive, false);
    assert.equal(saved.lowStockThreshold, 3);
    assert.equal(saved.trackStock, true);
  });

  await t.test("(c) toggle cepat di tabel UI (payload {isActive})", async () => {
    await updateProduct(product.id, { isActive: true }, admin.id);

    const saved = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    assert.equal(saved.isActive, true);
    assert.equal(saved.stock, 7);
    assert.equal(saved.price, 25000);
    assert.equal(saved.lowStockThreshold, 3);
    assert.equal(saved.trackStock, true);
  });
});
