import test from "node:test";
import assert from "node:assert/strict";
import { PrismaClient, CategoryType } from "@prisma/client";
import { getDashboard } from "../src/server/services/dashboard";
import { approvePayment } from "../src/server/services/cashier-orders";

const prisma = new PrismaClient();

test("Ringkasan: persetujuan pembayaran menambah KPI, grafik, dan aktivitas", async (t) => {
  const stamp = Date.now();
  const user = await prisma.user.findFirst({
    where: { role: "SUPER_ADMIN" },
  });
  assert.ok(user, "Super admin hasil seed harus ada");

  const category = await prisma.category.create({
    data: { name: `Ringkasan ${stamp}`, type: CategoryType.FOOD },
  });
  const product = await prisma.product.create({
    data: {
      name: `Ringkasan Produk ${stamp}`,
      price: 30_000,
      categoryId: category.id,
      stock: 10,
    },
  });
  const table = await prisma.table.create({
    data: { name: `Ringkasan Meja ${stamp}`, token: `ringkasan-token-${stamp}` },
  });

  let orderId: string | null = null;

  t.after(async () => {
    if (orderId) {
      await prisma.transaction.deleteMany({ where: { orderId } });
      await prisma.auditLog.deleteMany({ where: { entityId: orderId } });
      await prisma.order.delete({ where: { id: orderId } });
    }
    await prisma.product.delete({ where: { id: product.id } });
    await prisma.table.delete({ where: { id: table.id } });
    await prisma.category.delete({ where: { id: category.id } });
    await prisma.$disconnect();
  });

  await t.test("Struktur semua bagian tersedia", async () => {
    const data = await getDashboard("today", {
      name: user.name,
      role: "SUPER_ADMIN",
    });

    assert.ok(data.kpi, "KPI harus ada");
    assert.ok(data.series, "Series harus ada");
    assert.ok(data.komposisi, "Komposisi harus ada");
    assert.ok(data.kasirAktif, "Kasir harus ada");
    assert.ok(data.mejaAktif, "Meja harus ada");
    assert.ok(data.aktivitasTerbaru, "Aktivitas harus ada");
    assert.equal(data.profile.role, "Super Admin");
    assert.equal(data.series.length, 1, "Rentang hari ini = 1 bucket");
    assert.equal(data.errors.kpi, undefined);

    const week = await getDashboard("week", {
      name: user.name,
      role: "SUPER_ADMIN",
    });
    assert.equal(week.series?.length, 7, "Rentang 7 hari = 7 bucket");
  });

  await t.test("Pembayaran disetujui langsung terlihat di ringkasan", async () => {
    const before = await getDashboard("today", {
      name: user.name,
      role: "SUPER_ADMIN",
    });

    const order = await prisma.order.create({
      data: {
        code: `DASH-${stamp}`,
        accessToken: `dash-token-${stamp}`,
        tableId: table.id,
        customerName: "Pelanggan Uji",
        subtotal: 60_000,
        total: 60_000,
        status: "AWAITING_VERIFICATION",
        expiresAt: new Date(Date.now() + 10 * 60_000),
        items: {
          create: [
            {
              productId: product.id,
              nameSnapshot: product.name,
              priceSnapshot: product.price,
              quantity: 2,
            },
          ],
        },
        payments: {
          create: [
            {
              attempt: 1,
              proofKey: `proofs/${stamp}.avif`,
              status: "PENDING",
            },
          ],
        },
      },
    });
    orderId = order.id;

    await approvePayment(order.id, user.id);
    await assert.rejects(() => approvePayment(order.id, user.id));

    const after = await getDashboard("today", {
      name: user.name,
      role: "SUPER_ADMIN",
    });

    assert.ok(after.kpi);
    assert.ok(before.kpi);
    assert.ok(
      after.kpi.pendapatanHariIni >= before.kpi.pendapatanHariIni + 60_000,
      "Pendapatan hari ini bertambah sebesar total pesanan"
    );
    assert.ok(
      after.kpi.pesananHariIni >= before.kpi.pesananHariIni + 1,
      "Pesanan hari ini bertambah satu"
    );

    const todayPoint = after.series?.at(-1);
    assert.ok(todayPoint);
    assert.ok(todayPoint.pemasukan >= 60_000);
    assert.ok(todayPoint.pesanan >= 1);

    const bestSeller = after.menuTerlaris?.find(
      (row) => row.productId === product.id
    );
    assert.ok(bestSeller, "Produk harus muncul di menu terlaris");
    assert.equal(bestSeller.qty, 2);
    assert.equal(bestSeller.omzet, 60_000);

    assert.ok(
      (after.aktivitasTerbaru ?? []).some(
        (row) => row.action === "order.created" && row.entityId === order.id
      ),
      "Pesanan baru muncul di aktivitas"
    );
    assert.ok(
      (after.aktivitasTerbaru ?? []).some(
        (row) => row.action === "payment.approve" && row.entityId === order.id
      ),
      "Persetujuan pembayaran muncul di aktivitas"
    );

    const income = await prisma.transaction.count({
      where: { orderId: order.id, category: "Penjualan" },
    });
    assert.equal(income, 1, "Transaksi penjualan idempoten");
  });
});
