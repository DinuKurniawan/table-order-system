import test from "node:test";
import assert from "node:assert/strict";
import { isUploadedKey } from "../src/lib/upload-key";
import { productCreateSchema } from "../src/lib/validators/product";
import { financeTransactionCreateSchema } from "../src/lib/validators/finance";

const ID = "aB3dE5gH7jK9mN1p";

test("Upload key: format hasil presign", async (t) => {
  await t.test("main dan thumb produk diterima", () => {
    assert.equal(isUploadedKey(`products/${ID}.webp`, "products", "main"), true);
    assert.equal(isUploadedKey(`products/${ID}-thumb.webp`, "products", "thumb"), true);
    assert.equal(isUploadedKey(`products/${ID}.jpg`, "products"), true);
  });

  await t.test("key di luar prefix atau berpindah folder ditolak", () => {
    assert.equal(isUploadedKey(`qris/${ID}.webp`, "products"), false);
    assert.equal(isUploadedKey(`products/../${ID}.webp`, "products"), false);
    assert.equal(isUploadedKey(`products/${ID}.avif`, "products"), false);
    assert.equal(isUploadedKey(`proofs/abc/${ID}.webp`, "proofs/abc", "main"), true);
  });

  await t.test("thumbnail tidak boleh dipakai sebagai gambar utama", () => {
    assert.equal(isUploadedKey(`products/${ID}-thumb.webp`, "products", "main"), false);
  });

  await t.test("skema produk menolak key sembarang", () => {
    const base = {
      name: "Kopi",
      price: 10000,
      categoryId: "cat",
      isActive: true,
      trackStock: true,
      lowStockThreshold: 5,
      stock: 0,
    };
    assert.equal(
      productCreateSchema.safeParse({ ...base, imageKey: `products/${ID}.webp` }).success,
      true
    );
    assert.equal(
      productCreateSchema.safeParse({ ...base, imageKey: "https://evil.test/x.webp" }).success,
      false
    );
  });

  await t.test("skema lampiran keuangan menolak key sembarang", () => {
    assert.equal(
      financeTransactionCreateSchema.safeParse({
        type: "EXPENSE",
        category: "Bahan Baku",
        amount: 1000,
        attachKey: `attachments/finance/${ID}.webp`,
      }).success,
      true
    );
    assert.equal(
      financeTransactionCreateSchema.safeParse({
        type: "EXPENSE",
        category: "Bahan Baku",
        amount: 1000,
        attachKey: "attachments/finance/../../secret",
      }).success,
      false
    );
  });
});
