import test from "node:test";
import assert from "node:assert/strict";
import { Prisma, PrismaClient, Role } from "@prisma/client";
import { ZodError } from "zod";
import { AppError } from "../src/lib/errors";
import {
  appSettingsUpdateSchema,
  getSettings,
  updateSettings,
} from "../src/server/services/settings";

const prisma = new PrismaClient();

test("T-01: PATCH settings hanya menulis field yang dikirim", async (t) => {
  const stamp = Date.now();
  const admin = await prisma.user.create({
    data: {
      name: `Admin T01 ${stamp}`,
      username: `admin-t01-${stamp}`,
      passwordHash: "x",
      role: Role.SUPER_ADMIN,
    },
  });

  const originalRows = await prisma.setting.findMany();

  t.after(async () => {
    await prisma.auditLog.deleteMany({ where: { userId: admin.id } });
    await prisma.setting.deleteMany();
    if (originalRows.length > 0) {
      await prisma.setting.createMany({
        data: originalRows.map((row) => ({
          key: row.key,
          value: row.value as Prisma.InputJsonValue,
        })),
      });
    }
    await prisma.user.delete({ where: { id: admin.id } });
    await prisma.$disconnect();
  });

  await t.test("skema update tidak mengisi default", () => {
    assert.deepEqual(appSettingsUpdateSchema.parse({ namaKafe: "X" }), {
      namaKafe: "X",
    });
  });

  await t.test("set semua nilai non-default", async () => {
    const saved = await updateSettings(
      {
        namaKafe: `Kafe Uji ${stamp}`,
        timeoutBayarMenit: 42,
        maksUploadUlang: 7,
        footerStruk: `Footer ${stamp}`,
        isOrderingOpen: false,
      },
      admin.id
    );

    assert.equal(saved.namaKafe, `Kafe Uji ${stamp}`);
    assert.equal(saved.timeoutBayarMenit, 42);
    assert.equal(saved.maksUploadUlang, 7);
    assert.equal(saved.footerStruk, `Footer ${stamp}`);
    assert.equal(saved.isOrderingOpen, false);
  });

  await t.test("PATCH satu field tidak mengubah field lain", async () => {
    const saved = await updateSettings({ namaKafe: `Kafe Baru ${stamp}` }, admin.id);

    assert.equal(saved.namaKafe, `Kafe Baru ${stamp}`);
    assert.equal(saved.timeoutBayarMenit, 42);
    assert.equal(saved.maksUploadUlang, 7);
    assert.equal(saved.footerStruk, `Footer ${stamp}`);
    assert.equal(saved.isOrderingOpen, false);

    const reread = await getSettings();
    assert.deepEqual(reread, saved);
  });

  await t.test("nilai tidak valid ditolak tanpa menulis", async () => {
    await assert.rejects(
      () => updateSettings({ timeoutBayarMenit: 0 }, admin.id),
      (err: Error) => err instanceof ZodError
    );
    await assert.rejects(
      () => updateSettings({ isOrderingOpen: "ya" }, admin.id),
      (err: Error) => err instanceof ZodError
    );

    const untouched = await getSettings();
    assert.equal(untouched.timeoutBayarMenit, 42);
    assert.equal(untouched.isOrderingOpen, false);
  });

  await t.test("payload kosong ditolak", async () => {
    await assert.rejects(
      () => updateSettings({}, admin.id),
      (err: Error) => err instanceof AppError && err.code === "VALIDATION_ERROR"
    );
  });

  await t.test("AuditLog mencatat nilai lama -> baru", async () => {
    const audit = await prisma.auditLog.findFirst({
      where: { userId: admin.id, action: "settings.update", entityId: "app" },
      orderBy: { createdAt: "desc" },
    });
    assert.ok(audit, "Perubahan settings harus tercatat");

    const meta = audit.meta as {
      changes: Record<string, { from: unknown; to: unknown }>;
    };
    assert.equal(meta.changes.namaKafe.to, `Kafe Baru ${stamp}`);
    assert.equal(meta.changes.namaKafe.from, `Kafe Uji ${stamp}`);
  });
});
