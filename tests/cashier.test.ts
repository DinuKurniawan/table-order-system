import test from "node:test";
import assert from "node:assert/strict";
import { PaymentStatus, PrismaClient, Role } from "@prisma/client";
import { ZodError } from "zod";
import { authenticateSession, verifyPassword } from "../src/lib/auth";
import { AppError } from "../src/lib/errors";
import { cashierCreateSchema } from "../src/lib/validators/cashier";
import {
  createCashier,
  deleteCashier,
  listCashiers,
  resetCashierPassword,
  updateCashier,
} from "../src/server/services/cashiers";

const prisma = new PrismaClient();

test("Modul Kasir: akun, sesi, dan audit", async (t) => {
  const stamp = Date.now();
  const prefix = `uji${stamp}`;
  // User sendiri: tes paralel lain membuat/menghapus SUPER_ADMIN sehingga
  // findFirst bisa mengembalikan baris yang dihapus di tengah tes.
  const admin = await prisma.user.create({
    data: {
      name: `Admin Kasir ${stamp}`,
      username: `${prefix}_admin`,
      passwordHash: "x",
      role: Role.SUPER_ADMIN,
    },
  });

  t.after(async () => {
    await prisma.order.deleteMany({ where: { code: { startsWith: `UJI-CSH-${stamp}` } } });
    await prisma.user.deleteMany({ where: { username: { startsWith: prefix } } });
    await prisma.$disconnect();
  });

  await t.test("1. Validasi input: password < 8 karakter dan username tidak sah ditolak", () => {
    assert.throws(
      () =>
        cashierCreateSchema.parse({
          name: "Kasir Pendek",
          username: `${prefix}_pendek`,
          password: "1234567",
        }),
      (err: Error) => err instanceof ZodError,
      "Password 7 karakter harus ditolak"
    );

    assert.throws(
      () =>
        cashierCreateSchema.parse({
          name: "Kasir Spasi",
          username: "kasir satu",
          password: "rahasia123",
        }),
      (err: Error) => err instanceof ZodError,
      "Username berspasi harus ditolak"
    );
  });

  await t.test("2. Buat kasir: username dinormalisasi, hash argon2id, password tidak dikembalikan", async () => {
    const cashier = await createCashier(
      {
        name: "Kasir Uji",
        username: `${prefix}_satu`.toUpperCase(),
        password: "rahasia123",
      },
      admin.id
    );

    assert.equal(cashier.username, `${prefix}_satu`);
    assert.equal(cashier.isActive, true);
    assert.equal(cashier.approvedCount, 0);
    assert.equal("passwordHash" in cashier, false, "Hash tidak boleh bocor ke DTO");

    const row = await prisma.user.findUniqueOrThrow({ where: { id: cashier.id } });
    assert.match(row.passwordHash, /^\$argon2id\$/, "Password wajib di-hash argon2id");
    assert.equal(await verifyPassword("rahasia123", row.passwordHash), true);

    const audit = await prisma.auditLog.findFirst({
      where: { entityId: cashier.id, action: "cashier.create" },
    });
    assert.ok(audit, "Pembuatan kasir harus tercatat di audit log");
    assert.equal(JSON.stringify(audit.meta).includes("rahasia123"), false);
  });

  await t.test("3. Username duplikat (beda kapital) ditolak dengan pesan jelas", async () => {
    await assert.rejects(
      () =>
        createCashier(
          {
            name: "Kasir Kembar",
            username: `${prefix}_SATU`,
            password: "rahasia456",
          },
          admin.id
        ),
      (err: Error) =>
        err instanceof AppError && err.code === "CONFLICT" && err.message.includes("sudah dipakai")
    );
  });

  await t.test("4. Nonaktif menaikkan tokenVersion sehingga sesi lama ditolak", async () => {
    const cashier = await prisma.user.findFirstOrThrow({
      where: { username: `${prefix}_satu` },
    });

    const updated = await updateCashier(cashier.id, { isActive: false }, admin.id);
    assert.equal(updated.isActive, false);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: cashier.id } });
    assert.equal(row.tokenVersion, cashier.tokenVersion + 1);

    const staleSession = await authenticateSession({
      sub: cashier.id,
      role: Role.CASHIER,
      tokenVersion: cashier.tokenVersion,
    });
    assert.equal(staleSession, null, "Sesi dengan tokenVersion lama harus ditolak");

    const audit = await prisma.auditLog.findFirst({
      where: { entityId: cashier.id, action: "cashier.deactivate" },
    });
    assert.ok(audit, "Penonaktifan kasir harus tercatat di audit log");
  });

  await t.test("5. Reset password: hash baru, tokenVersion naik, sesi aktif terputus", async () => {
    const cashier = await createCashier(
      { name: "Kasir Reset", username: `${prefix}_reset`, password: "lama12345" },
      admin.id
    );

    await resetCashierPassword(cashier.id, { password: "baru12345" }, admin.id);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: cashier.id } });
    assert.equal(row.tokenVersion, 1);
    assert.equal(await verifyPassword("baru12345", row.passwordHash), true);
    assert.equal(await verifyPassword("lama12345", row.passwordHash), false);

    const staleSession = await authenticateSession({
      sub: cashier.id,
      role: Role.CASHIER,
      tokenVersion: 0,
    });
    assert.equal(staleSession, null, "Reset password harus memutus sesi sebelumnya");

    const audit = await prisma.auditLog.findFirst({
      where: { entityId: cashier.id, action: "cashier.reset_password" },
    });
    assert.ok(audit);
    assert.equal(JSON.stringify(audit.meta).includes("baru12345"), false);
  });

  await t.test("6. Kasir tanpa riwayat verifikasi dihapus permanen", async () => {
    const cashier = await createCashier(
      { name: "Kasir Sementara", username: `${prefix}_hapus`, password: "hapus12345" },
      admin.id
    );

    const result = await deleteCashier(cashier.id, admin.id);
    assert.equal(result.mode, "hard");

    const gone = await prisma.user.findUnique({ where: { id: cashier.id } });
    assert.equal(gone, null);
  });

  await t.test("7. Kasir dengan riwayat verifikasi hanya dinonaktifkan, hitungan setuju/tolak akurat", async () => {
    const cashier = await createCashier(
      { name: "Kasir Verifikator", username: `${prefix}_verif`, password: "verif12345" },
      admin.id
    );

    const table = await prisma.table.findFirstOrThrow();
    const order = await prisma.order.create({
      data: {
        code: `UJI-CSH-${stamp}`,
        accessToken: `token-${stamp}`,
        tableId: table.id,
        subtotal: 10000,
        total: 10000,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        payments: {
          create: [
            {
              attempt: 1,
              proofKey: "uji/bukti-1.avif",
              status: PaymentStatus.APPROVED,
              verifiedById: cashier.id,
              verifiedAt: new Date(),
            },
            {
              attempt: 2,
              proofKey: "uji/bukti-2.avif",
              status: PaymentStatus.REJECTED,
              rejectReason: "Bukti buram",
              verifiedById: cashier.id,
              verifiedAt: new Date(),
            },
          ],
        },
      },
    });

    const listed = await listCashiers();
    const found = listed.find((item) => item.id === cashier.id);
    assert.ok(found, "Kasir harus muncul di daftar");
    assert.equal(found.approvedCount, 1);
    assert.equal(found.rejectedCount, 1);
    assert.equal(
      listed.some((item) => item.username === admin.username),
      false,
      "Super Admin tidak boleh ikut daftar kasir"
    );

    const result = await deleteCashier(cashier.id, admin.id);
    assert.equal(result.mode, "soft");

    const row = await prisma.user.findUniqueOrThrow({ where: { id: cashier.id } });
    assert.equal(row.isActive, false);
    assert.equal(row.tokenVersion, 1);

    await prisma.order.delete({ where: { id: order.id } });
  });
});
