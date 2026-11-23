import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { withCrc } from "../src/lib/qris";
import {
  createCatalog,
  createOrderViaUi,
  loginCashier,
  openCashierOrder,
  prisma,
  uploadProof,
  type Catalog,
} from "./helpers";

function tlv(tag: string, value: string): string {
  return `${tag}${String(value.length).padStart(2, "0")}${value}`;
}

const STATIC_QRIS = withCrc(
  [
    tlv("00", "01"),
    tlv("01", "11"),
    tlv("53", "360"),
    tlv("58", "ID"),
    tlv("59", "Kopi E2E"),
    tlv("60", "Bandung"),
  ].join("")
);

let png: Buffer;
let happyCatalog: Catalog;
let rejectCatalog: Catalog;
let expireCatalog: Catalog;
let qrisCatalog: Catalog;
let qrisMethodId: string;
const realtimeEnabled = process.env.DISABLE_REALTIME !== "true";

test.beforeAll(async () => {
  // Katalog dibuat sebelum request menu pertama agar cache `unstable_cache`
  // di dev server sudah memuat ketiga produk.
  [happyCatalog, rejectCatalog, expireCatalog, qrisCatalog] = await Promise.all([
    createCatalog("happy"),
    createCatalog("reject"),
    createCatalog("expire"),
    createCatalog("qris"),
  ]);

  const qrisMethod = await prisma.paymentMethod.findFirstOrThrow({
    where: { kind: "QRIS" },
  });
  qrisMethodId = qrisMethod.id;
  await prisma.paymentMethod.update({
    where: { id: qrisMethodId },
    data: { qrisPayload: STATIC_QRIS, isActive: true },
  });

  png = await sharp({
    create: {
      width: 640,
      height: 960,
      channels: 3,
      background: { r: 240, g: 240, b: 245 },
    },
  })
    .png()
    .toBuffer();
});

test.afterAll(async () => {
  await prisma.paymentMethod.update({
    where: { id: qrisMethodId },
    data: { qrisPayload: null },
  });
  await prisma.$disconnect();
});

test("customer pesan, kasir setujui, cetak, status realtime", async ({
  browser,
}) => {
  const catalog = happyCatalog;
  const customerContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const cashierContext = await browser.newContext({
  });
  const customer = await customerContext.newPage();
  const cashier = await cashierContext.newPage();

  try {
    await loginCashier(cashier);
    const code = await createOrderViaUi(customer, catalog);
    await uploadProof(customer, png);

    await openCashierOrder(cashier, code);
    const popupPromise = cashierContext.waitForEvent("page");
    await cashier.getByRole("button", { name: "Setuju", exact: true }).click();

    const receipt = await popupPromise;
    await receipt.waitForLoadState("domcontentloaded");
    expect(receipt.url()).toContain("/print");
    await expect(receipt.locator("body")).toContainText(code);
    await expect(
      cashier.getByRole("main").getByText("Diterima", { exact: true })
    ).toBeVisible();

    // Pusher harus mengubah halaman customer tanpa refresh.
    if (!realtimeEnabled) await customer.reload();
    await expect(customer.getByText("Pembayaran terverifikasi")).toBeVisible({
      timeout: 25_000,
    });
    await expect(
      customer.getByText("Diterima", { exact: true }).first()
    ).toBeVisible();
  } finally {
    await customerContext.close();
    await cashierContext.close();
    await catalog.cleanup();
  }
});

test("customer tolak bukti, unggah ulang, lalu disetujui", async ({
  browser,
}) => {
  const catalog = rejectCatalog;
  const customerContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const cashierContext = await browser.newContext({
  });
  const customer = await customerContext.newPage();
  const cashier = await cashierContext.newPage();

  try {
    await loginCashier(cashier);
    const code = await createOrderViaUi(customer, catalog);
    await uploadProof(customer, png);

    await openCashierOrder(cashier, code);
    await cashier.getByRole("button", { name: "Tolak", exact: true }).click();
    await cashier
      .getByRole("button", { name: "Bukti tidak jelas/buram" })
      .click();
    await cashier
      .getByRole("button", { name: "Tolak Pembayaran" })
      .click();
    await expect(
      cashier.getByRole("main").getByText("Pembayaran ditolak", { exact: true })
    ).toBeVisible();
    if (!realtimeEnabled) await customer.reload();

    await expect(
      customer.getByText("Bukti Pembayaran Ditolak").first()
    ).toBeVisible({ timeout: 25_000 });
    await expect(
      customer.getByText(/Sisa kesempatan unggah ulang/)
    ).toBeVisible();

    await uploadProof(customer, png);

    await openCashierOrder(cashier, code);
    await cashier.getByRole("button", { name: "Setuju", exact: true }).click();
    await expect(
      cashier.getByRole("main").getByText("Diterima", { exact: true })
    ).toBeVisible();
    if (!realtimeEnabled) await customer.reload();
    await expect(customer.getByText("Pembayaran terverifikasi")).toBeVisible({
      timeout: 25_000,
    });
  } finally {
    await customerContext.close();
    await cashierContext.close();
    await catalog.cleanup();
  }
});

test("customer klaim QRIS tanpa bukti, kasir setujui", async ({ browser }) => {
  const catalog = qrisCatalog;
  const customerContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const cashierContext = await browser.newContext({
  });
  const customer = await customerContext.newPage();
  const cashier = await cashierContext.newPage();

  try {
    await loginCashier(cashier);
    const code = await createOrderViaUi(customer, catalog);

    await expect(
      customer.getByAltText(/QRIS .* untuk Rp/)
    ).toBeVisible();

    await customer.getByRole("button", { name: "Saya sudah bayar" }).click();
    const confirmDialog = customer.getByRole("dialog");
    await expect(confirmDialog).toContainText("Konfirmasi Pembayaran QRIS");
    await confirmDialog
      .getByRole("button", { name: "Ya, sudah bayar" })
      .click();

    await expect(confirmDialog).toContainText("Pembayaran terkirim", {
      timeout: 30_000,
    });
    await expect(confirmDialog).toContainText(
      "Tidak perlu unggah bukti"
    );
    await confirmDialog.getByRole("button", { name: "Tutup" }).click();

    await expect(customer.getByText("Menunggu verifikasi kasir").first()).toBeVisible();

    await openCashierOrder(cashier, code);
    await expect(cashier.getByText("Klaim Pembayaran QRIS")).toBeVisible();
    await cashier.getByRole("button", { name: "Setuju", exact: true }).click();
    await expect(
      cashier.getByRole("main").getByText("Diterima", { exact: true })
    ).toBeVisible();
  } finally {
    await customerContext.close();
    await cashierContext.close();
    await catalog.cleanup();
  }
});

test("pesanan kedaluwarsa dibatalkan dan stok dikembalikan", async ({
  browser,
  request,
}) => {
  const catalog = expireCatalog;
  const customerContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const customer = await customerContext.newPage();

  try {
    const code = await createOrderViaUi(customer, catalog);

    const reserved = await prisma.product.findUniqueOrThrow({
      where: { id: catalog.productId },
    });
    expect(reserved.stock).toBe(49);

    await prisma.order.update({
      where: { code },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const cron = await request.get("/api/cron/expire-orders", {
      headers: {
        Authorization: `Bearer ${process.env.CRON_SECRET ?? ""}`,
      },
    });
    expect(cron.ok()).toBeTruthy();

    const order = await prisma.order.findUniqueOrThrow({ where: { code } });
    expect(order.status).toBe("CANCELLED");
    const restored = await prisma.product.findUniqueOrThrow({
      where: { id: catalog.productId },
    });
    expect(restored.stock).toBe(50);

    await customer.reload();
    await expect(customer.getByText("Dibatalkan").first()).toBeVisible();
    await expect(customer.getByText("Pesanan dibatalkan")).toBeVisible();
  } finally {
    await customerContext.close();
    await catalog.cleanup();
  }
});
