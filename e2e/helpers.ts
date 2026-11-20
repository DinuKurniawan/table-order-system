import "dotenv/config";
import { expect, type Page } from "@playwright/test";
import { CategoryType, PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

export function uniqueName(prefix: string): string {
  return `${prefix} ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export interface Catalog {
  tableId: string;
  tableToken: string;
  productId: string;
  productName: string;
  cleanup: () => Promise<void>;
}

export async function createCatalog(prefix: string): Promise<Catalog> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const category = await prisma.category.create({
    data: { name: `E2E ${suffix}`, type: CategoryType.FOOD },
  });
  const product = await prisma.product.create({
    data: {
      name: `E2E Produk ${suffix}`,
      price: 18_000,
      categoryId: category.id,
      stock: 50,
      trackStock: true,
    },
  });
  const table = await prisma.table.create({
    data: { name: `Meja E2E ${suffix}`, token: `e2e-${prefix}-${suffix}` },
  });

  return {
    tableId: table.id,
    tableToken: table.token,
    productId: product.id,
    productName: product.name,
    cleanup: async () => {
      const orders = await prisma.order.findMany({
        where: { tableId: table.id },
        select: { id: true },
      });
      const orderIds = orders.map((order) => order.id);
      await prisma.auditLog.deleteMany({ where: { entityId: { in: orderIds } } });
      await prisma.stockMovement.deleteMany({
        where: { OR: [{ productId: product.id }, { note: { contains: table.name } }] },
      });
      await prisma.order.deleteMany({ where: { tableId: table.id } });
      await prisma.table.deleteMany({ where: { id: table.id } });
      await prisma.product.deleteMany({ where: { id: product.id } });
      await prisma.category.deleteMany({ where: { id: category.id } });
    },
  };
}

export async function createOrderViaUi(
  page: Page,
  catalog: Catalog,
  customerName = "Pelanggan E2E"
): Promise<string> {
  await page.goto(`/m/${catalog.tableToken}`);
  await page
    .locator(`a[href="/m/${catalog.tableToken}/item/${catalog.productId}"]`)
    .click();
  await expect(
    page.getByRole("heading", { name: catalog.productName })
  ).toBeVisible();
  await page.getByRole("button", { name: /^Tambah ke Keranjang/ }).click();
  await page.getByRole("link", { name: /^Keranjang/ }).click();
  await expect(page.getByRole("button", { name: "Pesan & Bayar" })).toBeVisible();
  await page.getByLabel("Nama Pelanggan").fill(customerName);
  await page.getByRole("button", { name: "Pesan & Bayar" }).click();
  await page.waitForURL(/\/order\/ORD-/);
  const code = decodeURIComponent(page.url().split("/order/")[1]);
  await expect(page.getByText("Ringkasan Pesanan")).toBeVisible();
  return code;
}

export async function uploadProof(page: Page, png: Buffer): Promise<void> {
  await page.locator('input[type="file"]').setInputFiles({
    name: "proof.png",
    mimeType: "image/png",
    buffer: png,
  });
  await expect(
    page.getByAltText("Pratinjau bukti pembayaran")
  ).toBeVisible();
  await page.getByRole("button", { name: "Kirim Bukti Pembayaran" }).click();
  await expect(
    page.getByText("Menunggu verifikasi kasir").first()
  ).toBeVisible({
    timeout: 30_000,
  });
}

export async function loginCashier(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Nama Pengguna", { exact: true }).fill(process.env.SEED_ADMIN_USERNAME ?? "admin");
  await page
    .getByLabel("Kata Sandi", { exact: true })
    .fill(process.env.SEED_ADMIN_PASSWORD ?? "Admin123456!");
  await page.getByRole("button", { name: "Masuk" }).click();
  await page.waitForURL(/\/(cashier|admin)/);
}

export async function openCashierOrder(page: Page, code: string): Promise<void> {
  await page.goto("/cashier");
  const card = page.locator('a[href^="/cashier/orders/"]').filter({ hasText: code });
  await expect(card).toBeVisible({ timeout: 30_000 });
  await card.click();
  await expect(page.getByRole("heading", { name: code })).toBeVisible();
}
