import test from "node:test";
import assert from "node:assert/strict";
import { PrismaClient, Role, CategoryType, DrinkSubtype } from "@prisma/client";
import crypto from "node:crypto";
import { AppError } from "../src/lib/errors";
import { authorizeRole, type SafeUser } from "../src/lib/auth";
import { validateImage } from "../src/lib/image";

const prisma = new PrismaClient();
const stamp = Date.now();
const testIp = `198.51.100.${(stamp % 200) + 1}`;

test("Keamanan: IDOR, token palsu, replay checkout, upload berbahaya, rate limit, header", async (t) => {
  const category = await prisma.category.create({
    data: {
      name: `Security Kategori ${stamp}`,
      type: CategoryType.DRINK,
      subtype: DrinkSubtype.COFFEE,
    },
  });

  const table = await prisma.table.create({
    data: { name: `Security Meja ${stamp}`, token: `security-table-${stamp}` },
  });

  const product = await prisma.product.create({
    data: {
      name: `Security Produk ${stamp}`,
      price: 15000,
      categoryId: category.id,
      stock: 10,
      trackStock: true,
      lowStockThreshold: 2,
      isActive: true,
    },
  });

  const orderIds: string[] = [];
  const rateLimitKeys = [
    `order:${testIp}`,
    `order:table:${table.token}`,
    `order:table:palsu-${stamp}`,
    `login:${testIp}:security-${stamp}`,
    `login-ip:${testIp}`,
    "order-get:unknown",
    `menu:${testIp}`,
  ];

  try {
    await t.test("1. IDOR /api/public/orders/[code] wajib accessToken", async () => {
      const code = `SEC-${stamp}`;
      const accessToken = crypto.randomBytes(16).toString("hex");
      const order = await prisma.order.create({
        data: {
          code,
          accessToken,
          tableId: table.id,
          subtotal: 15000,
          total: 15000,
          status: "AWAITING_PAYMENT",
          expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        },
      });
      orderIds.push(order.id);

      const { GET } = await import(
        "../src/app/api/public/orders/[code]/route"
      );
      const { NextRequest } = await import("next/server");
      const url = `http://localhost:3000/api/public/orders/${code}`;
      const ctx = { params: Promise.resolve({ code }) };

      const noToken = await GET(new NextRequest(url), ctx);
      assert.equal(noToken.status, 404, "Tanpa token harus 404 seragam");

      const wrongToken = await GET(
        new NextRequest(url, { headers: { "x-order-token": "token-salah" } }),
        ctx
      );
      assert.equal(wrongToken.status, 404, "Token salah harus 404 seragam");

      const ok = await GET(
        new NextRequest(url, { headers: { "x-order-token": accessToken } }),
        ctx
      );
      assert.equal(ok.status, 200, "Token benar harus 200");
      const payload = await ok.json();
      assert.equal(payload.code, code);
      const serialized = JSON.stringify(payload);
      assert.ok(!serialized.includes(accessToken), "accessToken tidak boleh bocor");
      assert.ok(!serialized.includes("proofKey"), "proofKey tidak boleh bocor");
      assert.ok(!serialized.includes("passwordHash"), "passwordHash tidak boleh bocor");
    });

    await t.test("2. Token meja palsu ditolak dan tidak membuat order", async () => {
      const { POST } = await import("../src/app/api/public/orders/route");
      const { NextRequest } = await import("next/server");
      const fakeKey = `security-fake-${stamp}-aaaaaaaa`;

      const res = await POST(
        new NextRequest("http://localhost:3000/api/public/orders", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": fakeKey,
            "x-forwarded-for": testIp,
          },
          body: JSON.stringify({
            tableToken: `palsu-${stamp}`,
            items: [{ productId: product.id, quantity: 1 }],
          }),
        })
      );

      assert.equal(res.status, 400, "Token meja palsu harus 400");
      assert.equal(
        await prisma.order.count({ where: { idempotencyKey: fakeKey } }),
        0,
        "Tidak boleh ada order terbentuk"
      );
    });

    await t.test("3. Replay checkout tidak menggandakan order/stok", async () => {
      const { POST } = await import("../src/app/api/public/orders/route");
      const { NextRequest } = await import("next/server");
      const key = `security-replay-${stamp}-aaaaaaaa`;
      const body = JSON.stringify({
        tableToken: table.token,
        customerName: "Uji Replay",
        items: [{ productId: product.id, quantity: 2 }],
      });

      const makeRequest = () =>
        new NextRequest("http://localhost:3000/api/public/orders", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": key,
            "x-forwarded-for": testIp,
          },
          body,
        });

      const first = await POST(makeRequest());
      assert.equal(first.status, 201, "Request pertama membuat order");
      const firstJson = await first.json();

      const second = await POST(makeRequest());
      assert.equal(second.status, 200, "Replay harus mengembalikan order lama");
      const secondJson = await second.json();
      assert.equal(secondJson.code, firstJson.code, "Kode order harus sama");

      const orders = await prisma.order.findMany({
        where: { idempotencyKey: key },
        select: { id: true, items: { select: { quantity: true } } },
      });
      assert.equal(orders.length, 1, "Replay tidak boleh membuat order kedua");
      assert.equal(orders[0].items[0].quantity, 2);
      orderIds.push(orders[0].id);

      const savedProduct = await prisma.product.findUnique({
        where: { id: product.id },
        select: { stock: true },
      });
      assert.equal(savedProduct?.stock, 8, "Stok hanya berkurang sekali");

      const audit = await prisma.auditLog.findFirst({
        where: { action: "order.created", entityId: orders[0].id },
      });
      assert.ok(audit, "Pembuatan order harus masuk AuditLog");

      const missingKey = await POST(
        new NextRequest("http://localhost:3000/api/public/orders", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": testIp,
          },
          body,
        })
      );
      assert.equal(missingKey.status, 400, "Tanpa Idempotency-Key harus 400");
    });

    await t.test("4. Upload file berbahaya ditolak sebelum menyentuh R2", async () => {
      const php = Buffer.from("<?php system($_GET['cmd']); ?>" + "\0".repeat(32));
      await assert.rejects(
        () => validateImage(php),
        (err: unknown) =>
          err instanceof AppError &&
          err.code === "VALIDATION_ERROR" &&
          err.status === 400
      );

      const order = await prisma.order.findFirst({
        where: { idempotencyKey: { startsWith: `security-replay-${stamp}` } },
        select: { code: true, accessToken: true },
      });
      assert.ok(order);

      const { submitPaymentProof } = await import("../src/server/services/orders");
      await assert.rejects(
        () => submitPaymentProof(order.code, order.accessToken!, php),
        (err: unknown) => err instanceof AppError && err.code === "VALIDATION_ERROR"
      );

      const payments = await prisma.payment.count({
        where: { order: { code: order.code } },
      });
      assert.equal(payments, 0, "Tidak boleh ada Payment tersimpan");
    });

    await t.test("5. Rate limit login terdistribusi mengembalikan 429", async () => {
      const { POST } = await import("../src/app/api/auth/login/route");
      const { NextRequest } = await import("next/server");
      const username = `security-${stamp}`;

      const statuses: number[] = [];
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const res = await POST(
          new NextRequest("http://localhost:3000/api/auth/login", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-forwarded-for": testIp,
            },
            body: JSON.stringify({ username, password: "salah-terus" }),
          })
        );
        statuses.push(res.status);
      }

      assert.deepEqual(
        statuses.slice(0, 5),
        [401, 401, 401, 401, 401],
        "Lima percobaan pertama harus 401"
      );
      assert.equal(statuses[5], 429, "Percobaan keenam harus 429");
    });

    await t.test("6. Kasir tidak boleh lolos guard SUPER_ADMIN", async () => {
      const cashier = {
        id: "test-cashier",
        name: "Kasir",
        username: "kasir",
        role: Role.CASHIER,
        isActive: true,
        tokenVersion: 0,
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as SafeUser;

      assert.throws(
        () => authorizeRole(cashier, [Role.SUPER_ADMIN]),
        (err: unknown) =>
          err instanceof AppError && err.code === "FORBIDDEN" && err.status === 403
      );
      assert.throws(
        () => authorizeRole(null, [Role.SUPER_ADMIN]),
        (err: unknown) =>
          err instanceof AppError && err.code === "UNAUTHENTICATED" && err.status === 401
      );
    });

    await t.test("7. Menu publik menolak token palsu dan menyaring field internal", async () => {
      const { GET } = await import("../src/app/api/public/menu/route");
      const { NextRequest } = await import("next/server");

      const fake = await GET(
        new NextRequest(
          `http://localhost:3000/api/public/menu?token=palsu-${stamp}`,
          { headers: { "x-forwarded-for": testIp } }
        )
      );
      assert.equal(fake.status, 404, "Token meja palsu harus 404");

      const ok = await GET(
        new NextRequest(
          `http://localhost:3000/api/public/menu?token=${table.token}`,
          { headers: { "x-forwarded-for": testIp } }
        )
      );
      assert.equal(ok.status, 200);
      const payload = await ok.json();
      assert.ok(
        payload.products.some((item: { id: string }) => item.id === product.id),
        "Produk aktif harus muncul"
      );
      const sample = payload.products[0];
      assert.ok(sample);
      assert.ok(!("deletedAt" in sample), "deletedAt tidak boleh diekspos");
      assert.ok(!("lowStockThreshold" in sample), "lowStockThreshold tidak perlu diekspos");
    });

    await t.test("8. Header keamanan & CSP terpasang", async () => {
      const nextConfig = (await import("../next.config")).default;
      const rules = await nextConfig.headers?.();
      assert.ok(rules && rules.length > 0, "Harus ada aturan header");

      const headers = new Map(
        rules[0].headers.map((header) => [header.key, header.value])
      );
      const csp = headers.get("Content-Security-Policy") ?? "";
      assert.ok(csp.includes("default-src 'self'"));
      assert.ok(csp.includes("frame-ancestors 'none'"));
      assert.ok(csp.includes("*.pusher.com"));
      assert.equal(headers.get("X-Content-Type-Options"), "nosniff");
      assert.equal(headers.get("X-Frame-Options"), "DENY");
      assert.ok(headers.get("Permissions-Policy")?.includes("camera=()"));
    });

    await t.test("9. Log audit bisa difilter dan tidak membocorkan hash", async () => {
      const { listAuditLogs } = await import("../src/server/services/audit");
      const result = await listAuditLogs({
        page: 1,
        pageSize: 10,
        action: "order.created",
      });

      assert.ok(result.items.length > 0, "Harus ada log order.created");
      assert.ok(
        result.items.every((item) => item.action === "order.created"),
        "Filter aksi harus bekerja"
      );
      assert.ok(
        !JSON.stringify(result).includes("passwordHash"),
        "Respons audit tidak boleh memuat passwordHash"
      );
    });
  } finally {
    await prisma.auditLog.deleteMany({
      where: { entityId: { in: orderIds } },
    });
    await prisma.order.deleteMany({ where: { tableId: table.id } });
    await prisma.stockMovement.deleteMany({ where: { productId: product.id } });
    await prisma.rateLimit.deleteMany({
      where: { key: { in: rateLimitKeys } },
    });
    await prisma.rateLimit.deleteMany({
      where: { key: { contains: testIp } },
    });
    await prisma.product.deleteMany({ where: { id: product.id } });
    await prisma.category.deleteMany({ where: { id: category.id } });
    await prisma.table.deleteMany({ where: { id: table.id } });
    await prisma.$disconnect();
  }
});
