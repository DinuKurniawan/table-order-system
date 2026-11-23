import test from "node:test";
import assert from "node:assert/strict";
import { PrismaClient, VoucherType } from "@prisma/client";
import { AppError } from "../src/lib/errors";
import { runInTransaction } from "../src/lib/tx";
import {
  claimVoucher,
  createVoucher,
  deleteVoucher,
  previewVoucher,
  releaseVoucherForOrder,
  updateVoucher,
} from "../src/server/services/vouchers";

const prisma = new PrismaClient();

function window() {
  const now = Date.now();
  return {
    startsAt: new Date(now - 60_000),
    endsAt: new Date(now + 24 * 60 * 60_000),
  };
}

test("Voucher: create, guard update/hapus, preview min belanja", async (t) => {
  const stamp = Date.now();
  const admin = await prisma.user.create({
    data: {
      name: `Admin Voucher ${stamp}`,
      username: `admin-voucher-${stamp}`,
      passwordHash: "x",
      role: "SUPER_ADMIN",
    },
  });

  const created = await createVoucher(
    {
      code: `uji${stamp}`,
      description: "Uji",
      type: VoucherType.PERCENT,
      value: 20,
      maxDiscount: 10_000,
      minSpend: 25_000,
      quota: 10,
      isActive: true,
      ...window(),
    },
    admin.id
  );

  t.after(async () => {
    await prisma.auditLog.deleteMany({ where: { entityId: created.id } });
    await prisma.voucher.deleteMany({ where: { id: created.id } });
    await prisma.user.delete({ where: { id: admin.id } });
    await prisma.$disconnect();
  });

  assert.equal(created.code, `UJI${stamp}`);
  assert.equal(created.status, "AKTIF");

  await assert.rejects(
    createVoucher(
      {
        code: `uji${stamp}`,
        type: VoucherType.FIXED,
        value: 5_000,
        maxDiscount: null,
        minSpend: 0,
        isActive: true,
        ...window(),
      },
      admin.id
    ),
    (error: unknown) => error instanceof AppError && error.status === 409
  );

  await assert.rejects(
    previewVoucher(created.code, 10_000),
    (error: unknown) =>
      error instanceof AppError && /Minimal belanja/.test(error.message)
  );

  const edited = await updateVoucher(
    created.id,
    { description: "Uji diperbarui" },
    admin.id
  );
  assert.equal(edited.description, "Uji diperbarui");

  await prisma.voucher.update({
    where: { id: created.id },
    data: { usedCount: 1 },
  });
  await assert.rejects(
    updateVoucher(created.id, { value: 50 }, admin.id),
    (error: unknown) => error instanceof AppError && error.status === 409
  );
  await assert.rejects(
    deleteVoucher(created.id, admin.id),
    (error: unknown) => error instanceof AppError && error.status === 409
  );
});

test("Voucher: kuota 9/10 hanya satu checkout yang menang", async (t) => {
  const stamp = Date.now();
  const admin = await prisma.user.create({
    data: {
      name: `Admin Race ${stamp}`,
      username: `admin-race-${stamp}`,
      passwordHash: "x",
      role: "SUPER_ADMIN",
    },
  });
  const voucher = await prisma.voucher.create({
    data: {
      code: `RACE${stamp}`,
      type: VoucherType.FIXED,
      value: 5_000,
      minSpend: 0,
      quota: 10,
      usedCount: 9,
      isActive: true,
      createdById: admin.id,
      ...window(),
    },
  });

  t.after(async () => {
    await prisma.auditLog.deleteMany({ where: { entityId: voucher.id } });
    await prisma.voucher.delete({ where: { id: voucher.id } });
    await prisma.user.delete({ where: { id: admin.id } });
    await prisma.$disconnect();
  });

  const results = await Promise.allSettled([
    runInTransaction((tx) =>
      claimVoucher(tx, { code: voucher.code, subtotal: 30_000 })
    ),
    runInTransaction((tx) =>
      claimVoucher(tx, { code: voucher.code, subtotal: 30_000 })
    ),
  ]);

  const fulfilled = results.filter((result) => result.status === "fulfilled");
  const rejected = results.filter(
    (result): result is PromiseRejectedResult => result.status === "rejected"
  );

  assert.equal(fulfilled.length, 1, "tepat satu checkout menang");
  assert.equal(rejected.length, 1, "tepat satu checkout kalah");
  assert.ok(
    rejected[0].reason instanceof AppError &&
      rejected[0].reason.code === "VOUCHER_QUOTA_EXHAUSTED"
  );

  const latest = await prisma.voucher.findUnique({ where: { id: voucher.id } });
  assert.equal(latest?.usedCount, 10);
});

test("Voucher: release kuota idempoten saat order batal", async (t) => {
  const stamp = Date.now();
  const admin = await prisma.user.create({
    data: {
      name: `Admin Release ${stamp}`,
      username: `admin-release-${stamp}`,
      passwordHash: "x",
      role: "SUPER_ADMIN",
    },
  });
  const table = await prisma.table.create({
    data: { name: `Meja Release ${stamp}`, token: `release-${stamp}` },
  });
  const voucher = await prisma.voucher.create({
    data: {
      code: `REL${stamp}`,
      type: VoucherType.FIXED,
      value: 5_000,
      minSpend: 0,
      quota: 5,
      usedCount: 1,
      isActive: true,
      createdById: admin.id,
      ...window(),
    },
  });
  const order = await prisma.order.create({
    data: {
      code: `REL-${stamp}`,
      tableId: table.id,
      subtotal: 20_000,
      discount: 5_000,
      total: 15_000,
      voucherId: voucher.id,
      voucherCode: voucher.code,
      expiresAt: new Date(Date.now() + 60_000),
    },
  });

  t.after(async () => {
    await prisma.auditLog.deleteMany({ where: { entityId: order.id } });
    await prisma.voucherRedemption.deleteMany({ where: { voucherId: voucher.id } });
    await prisma.order.delete({ where: { id: order.id } });
    await prisma.voucher.delete({ where: { id: voucher.id } });
    await prisma.table.delete({ where: { id: table.id } });
    await prisma.user.delete({ where: { id: admin.id } });
    await prisma.$disconnect();
  });

  await prisma.voucherRedemption.create({
    data: {
      voucherId: voucher.id,
      orderId: order.id,
      codeSnapshot: voucher.code,
      discountAmount: 5_000,
    },
  });

  await runInTransaction((tx) =>
    releaseVoucherForOrder(tx, { orderId: order.id, orderCode: order.code })
  );
  await runInTransaction((tx) =>
    releaseVoucherForOrder(tx, { orderId: order.id, orderCode: order.code })
  );

  const latest = await prisma.voucher.findUnique({ where: { id: voucher.id } });
  assert.equal(latest?.usedCount, 0, "kuota hanya dilepas sekali");
});
