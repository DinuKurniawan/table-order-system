import { expect, test } from "@playwright/test";
import sharp from "sharp";
import {
  createCatalog,
  createOrderViaUi,
  loginCashier,
  openCashierOrder,
  prisma,
  uploadProof,
} from "./helpers";

let png: Buffer;
const realtimeEnabled = process.env.DISABLE_REALTIME !== "true";

test.beforeAll(async () => {
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
  await prisma.$disconnect();
});

test("customer pesan, kasir setujui, cetak, status realtime", async ({
  browser,
}) => {
  const catalog = await createCatalog("happy");
  const customerContext = await browser.newContext({
    baseURL: "http://localhost:3000",
    viewport: { width: 390, height: 844 },
  });
  const cashierContext = await browser.newContext({
    baseURL: "http://localhost:3000",
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
    await expect(cashier.getByText("Pembayaran disetujui")).toBeVisible();

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
  const catalog = await createCatalog("reject");
  const customerContext = await browser.newContext({
    baseURL: "http://localhost:3000",
    viewport: { width: 390, height: 844 },
  });
  const cashierContext = await browser.newContext({
    baseURL: "http://localhost:3000",
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
    await expect(cashier.getByText("Pembayaran ditolak")).toBeVisible();
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
    await expect(cashier.getByText("Pembayaran disetujui")).toBeVisible();
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

test("pesanan kedaluwarsa dibatalkan dan stok dikembalikan", async ({
  browser,
  request,
}) => {
  const catalog = await createCatalog("expire");
  const customerContext = await browser.newContext({
    baseURL: "http://localhost:3000",
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
