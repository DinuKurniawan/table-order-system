import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { CategoryType, PrismaClient } from "@prisma/client";
import { runInTransaction, isInTransaction } from "../src/lib/tx";

const prisma = new PrismaClient();

test("T-03: event hanya dikirim setelah commit", async (t) => {
  const stamp = Date.now();
  const created: string[] = [];

  t.after(async () => {
    await prisma.category.deleteMany({ where: { id: { in: created } } });
    await prisma.$disconnect();
  });

  await t.test("(a) callback berjalan setelah data terlihat dari DB", async () => {
    let seenInDb = false;
    let callbackRanInsideTx = true;

    const category = await runInTransaction(async (tx, after) => {
      const saved = await tx.category.create({
        data: { name: `T03 Commit ${stamp}`, type: CategoryType.FOOD },
      });
      created.push(saved.id);

      after(async () => {
        callbackRanInsideTx = isInTransaction();
        const persisted = await prisma.category.findUnique({
          where: { id: saved.id },
        });
        seenInDb = persisted !== null;
      });

      return saved;
    });

    assert.ok(category.id);
    assert.equal(seenInDb, true, "data harus sudah commit saat callback berjalan");
    assert.equal(callbackRanInsideTx, false, "callback di luar konteks transaksi");
  });

  await t.test("(b) rollback membuang semua callback", async () => {
    let called = 0;

    await assert.rejects(
      () =>
        runInTransaction(async (tx, after) => {
          const saved = await tx.category.create({
            data: { name: `T03 Rollback ${stamp}`, type: CategoryType.FOOD },
          });
          after(() => {
            called += 1;
          });
          throw new Error(`rollback ${saved.id}`);
        }),
      /rollback/
    );

    assert.equal(called, 0, "transaksi rollback tidak boleh mengirim event");
    const saved = await prisma.category.findFirst({
      where: { name: `T03 Rollback ${stamp}` },
    });
    assert.equal(saved, null);
  });

  await t.test("(c) callback melempar error tidak menggagalkan hasil", async () => {
    const order: string[] = [];

    const result = await runInTransaction(async (tx, after) => {
      const saved = await tx.category.create({
        data: { name: `T03 Throw ${stamp}`, type: CategoryType.FOOD },
      });
      created.push(saved.id);

      after(() => {
        order.push("gagal");
        throw new Error("emit gagal");
      });
      after(() => {
        order.push("lanjut");
      });

      return "sukses";
    });

    assert.equal(result, "sukses");
    assert.deepEqual(order, ["gagal", "lanjut"]);
  });

  await t.test("(d) transaksi bersarang memakai transaksi induk", async () => {
    const order: string[] = [];
    let sameTx = false;

    await runInTransaction(async (tx, after) => {
      const outer = await tx.category.create({
        data: { name: `T03 Outer ${stamp}`, type: CategoryType.FOOD },
      });
      created.push(outer.id);

      await runInTransaction(async (innerTx, innerAfter) => {
        sameTx = innerTx === tx;
        const inner = await innerTx.category.findUnique({
          where: { id: outer.id },
        });
        assert.ok(inner, "transaksi bersarang harus melihat data induk");
        innerAfter(() => {
          order.push("inner");
        });
      });

      after(() => {
        order.push("outer");
      });
    });

    assert.equal(sameTx, true, "transaksi bersarang tidak boleh membuka transaksi baru");
    assert.deepEqual(order, ["inner", "outer"]);
  });

  await t.test("(e) arsitektur: tidak ada emit/transaksi di luar helper", () => {
    const roots = ["src/server/services", "src/app/api"];
    const offenders: string[] = [];

    function walk(directory: string): void {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.name.endsWith(".ts")) {
          const source = fs.readFileSync(full, "utf8");
          if (/\bafterCommit\b/.test(source)) offenders.push(`${full}:afterCommit`);
          if (/\$transaction\b/.test(source)) offenders.push(`${full}:$transaction`);
        }
      }
    }

    for (const root of roots) walk(root);

    assert.deepEqual(
      offenders,
      [],
      `Transaksi wajib lewat runInTransaction dan event lewat after(): ${offenders.join(", ")}`
    );
  });
});
