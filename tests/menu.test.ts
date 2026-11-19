import test from "node:test";
import assert from "node:assert/strict";
import { PrismaClient, CategoryType, DrinkSubtype, Role, StockMoveType } from "@prisma/client";
import { ZodError } from "zod";
import { AppError } from "../src/lib/errors";
import { categoryInputSchema, productCreateSchema } from "../src/lib/validators/product";
import {
  createCategory,
  deleteCategory,
} from "../src/server/services/categories";
import {
  createProduct,
  deleteProduct,
  listProducts,
  updateProduct,
} from "../src/server/services/products";

const prisma = new PrismaClient();

test("Modul Menu: Kategori & Produk", async (t) => {
  const stamp = Date.now();
  // User sendiri: tes paralel lain membuat/menghapus SUPER_ADMIN sehingga
  // findFirst bisa mengembalikan baris yang dihapus di tengah tes.
  const admin = await prisma.user.create({
    data: {
      name: `Admin Menu ${stamp}`,
      username: `admin-menu-${stamp}`,
      passwordHash: "x",
      role: Role.SUPER_ADMIN,
    },
  });

  t.after(async () => {
    await prisma.order.deleteMany({
      where: { code: { startsWith: `UJI-${stamp}` } },
    });
    await prisma.product.deleteMany({
      where: { name: { startsWith: `Uji ${stamp}` } },
    });
    await prisma.category.deleteMany({
      where: { name: { startsWith: `Uji ${stamp}` } },
    });
    await prisma.table.deleteMany({
      where: { name: { startsWith: `Uji ${stamp}` } },
    });
    await prisma.user.delete({ where: { id: admin.id } });
    await prisma.$disconnect();
  });

  await t.test("1. DRINK tanpa subtype ditolak, FOOD dengan subtype ditolak", () => {
    assert.throws(
      () =>
        categoryInputSchema.parse({
          name: "Minuman Misterius",
          type: CategoryType.DRINK,
        }),
      (err: Error) => err instanceof ZodError,
      "DRINK tanpa subtype wajib ditolak"
    );

    assert.throws(
      () =>
        categoryInputSchema.parse({
          name: "Makanan",
          type: CategoryType.FOOD,
          subtype: DrinkSubtype.COFFEE,
        }),
      (err: Error) => err instanceof ZodError,
      "FOOD dengan subtype wajib ditolak"
    );

    const valid = categoryInputSchema.parse({
      name: "Teh",
      type: CategoryType.DRINK,
      subtype: DrinkSubtype.NON_COFFEE,
    });
    assert.equal(valid.subtype, DrinkSubtype.NON_COFFEE);
  });

  await t.test("2. Harga negatif ditolak", () => {
    assert.throws(
      () =>
        productCreateSchema.parse({
          name: "Produk",
          price: -1000,
          categoryId: "kategori",
        }),
      (err: Error) => err instanceof ZodError
    );
  });

  await t.test("3. CRUD produk: buat, ubah, nonaktifkan, soft & hard delete", async () => {
    const category = await createCategory(
      {
        name: `Uji ${stamp} Kopi`,
        type: CategoryType.DRINK,
        subtype: DrinkSubtype.COFFEE,
      },
      admin.id
    );

    const created = await createProduct(
      {
        name: `Uji ${stamp} Latte`,
        description: "Latte uji",
        price: 25000,
        categoryId: category.id,
        imageKey: null,
        thumbKey: null,
        isActive: true,
        trackStock: true,
        stock: 10,
        lowStockThreshold: 3,
      },
      admin.id
    );

    assert.equal(created.price, 25000);
    assert.equal(created.stock, 10);
    assert.equal(created.category.subtype, DrinkSubtype.COFFEE);

    const movement = await prisma.stockMovement.findFirst({
      where: { productId: created.id, type: StockMoveType.PURCHASE },
    });
    assert.ok(movement, "Stok awal harus tercatat sebagai pergerakan stok");

    const updated = await updateProduct(
      created.id,
      { isActive: false, price: 27000 },
      admin.id
    );
    assert.equal(updated.isActive, false);
    assert.equal(updated.price, 27000);

    const listed = await listProducts({
      page: 1,
      pageSize: 10,
      q: `Uji ${stamp}`,
      tab: "coffee",
      status: "inactive",
      sort: "newest",
    });
    assert.equal(listed.items.length, 1);
    assert.equal(listed.items[0].id, created.id);

    const hardDeleted = await deleteProduct(created.id, admin.id);
    assert.equal(hardDeleted.mode, "hard");

    const gone = await prisma.product.findUnique({ where: { id: created.id } });
    assert.equal(gone, null, "Produk yang belum pernah dipesan dihapus permanen");

    const audit = await prisma.auditLog.findFirst({
      where: { entity: "Product", entityId: created.id, action: "product.delete" },
    });
    assert.ok(audit, "Penghapusan harus tercatat di audit log");

    await deleteCategory(category.id, admin.id);
  });

  await t.test("4. Produk yang pernah dipesan di-soft delete", async () => {
    const coffee = await createCategory(
      {
        name: `Uji ${stamp} Kopi Pesanan`,
        type: CategoryType.DRINK,
        subtype: DrinkSubtype.COFFEE,
      },
      admin.id
    );

    const product = await createProduct(
      {
        name: `Uji ${stamp} Pesanan`,
        price: 15000,
        categoryId: coffee.id,
        isActive: true,
        trackStock: false,
        stock: 0,
        lowStockThreshold: 5,
      },
      admin.id
    );

    const table = await prisma.table.create({
      data: { name: `Uji ${stamp} Meja`, token: `uji-meja-${stamp}` },
    });

    const order = await prisma.order.create({
      data: {
        code: `UJI-${stamp}`,
        accessToken: `token-${stamp}`,
        tableId: table.id,
        subtotal: 15000,
        total: 15000,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        items: {
          create: {
            productId: product.id,
            nameSnapshot: product.name,
            priceSnapshot: product.price,
            quantity: 1,
          },
        },
      },
    });

    const result = await deleteProduct(product.id, admin.id);
    assert.equal(result.mode, "soft");

    const kept = await prisma.product.findUnique({ where: { id: product.id } });
    assert.ok(kept?.deletedAt, "Produk yang pernah dipesan tetap tersimpan");
    assert.equal(kept.isActive, false);

    const hidden = await listProducts({
      page: 1,
      pageSize: 10,
      q: `Uji ${stamp} Pesanan`,
      tab: "all",
      status: "all",
      sort: "newest",
    });
    assert.equal(hidden.items.length, 0, "Produk soft-delete tidak tampil di daftar");

    await prisma.order.delete({ where: { id: order.id } });
    await prisma.table.delete({ where: { id: table.id } });
  });

  await t.test("5. Kategori berisi produk tidak bisa dihapus", async () => {
    const food = await createCategory(
      {
        name: `Uji ${stamp} Makanan`,
        type: CategoryType.FOOD,
      },
      admin.id
    );
    await createProduct(
      {
        name: `Uji ${stamp} Nasi Goreng`,
        price: 20000,
        categoryId: food.id,
        isActive: true,
        trackStock: false,
        stock: 0,
        lowStockThreshold: 5,
      },
      admin.id
    );

    await assert.rejects(
      () => deleteCategory(food.id, admin.id),
      (err: Error) => err instanceof AppError && err.code === "CONFLICT"
    );
  });
});
