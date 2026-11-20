import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { prisma } from "../src/lib/db";
import { GET } from "../src/app/api/public/orders/[code]/route";
import { POST as cancel } from "../src/app/api/public/orders/[code]/cancel/route";

const stamp = Date.now();
const ipBlock = (stamp % 250) + 1;
const ipGet = `192.0.${ipBlock}.10`;
const ipCancel = `192.0.${ipBlock}.11`;
const ipCancelOk = `192.0.${ipBlock}.12`;

test("SEC-08: rate limit endpoint pesanan publik", async (t) => {
  const table = await prisma.table.create({
    data: { name: `Rate Limit ${stamp}`, token: `rate-limit-${stamp}` },
  });
  const code = `RATE-${stamp}`;
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

  t.after(async () => {
    await prisma.rateLimit.deleteMany({
      where: {
        OR: [
          { key: { contains: ipGet } },
          { key: { contains: ipCancel } },
          { key: { contains: ipCancelOk } },
        ],
      },
    });
    await prisma.order.deleteMany({ where: { id: order.id } });
    await prisma.table.deleteMany({ where: { id: table.id } });
    await prisma.$disconnect();
  });

  const get = (ip: string, token: string | null = accessToken) =>
    GET(
      new NextRequest(`http://localhost:3000/api/public/orders/${code}`, {
        headers: {
          "x-forwarded-for": ip,
          ...(token ? { "x-order-token": token } : {}),
        },
      }),
      { params: Promise.resolve({ code }) }
    );

  const cancelReq = (
    ip: string,
    token: string | null = accessToken
  ) =>
    cancel(
      new NextRequest(`http://localhost:3000/api/public/orders/${code}/cancel`, {
        method: "POST",
        headers: {
          "x-forwarded-for": ip,
          ...(token ? { "x-order-token": token } : {}),
        },
      }),
      { params: Promise.resolve({ code }) }
    );

  await t.test("1. GET di bawah batas berperilaku lama", async () => {
    const response = await get(ipGet);
    assert.equal(response.status, 200);
  });

  await t.test("2. GET agregat per IP dibatasi 60/menit", async () => {
    let allowed = 1;
    let limitedStatus = 0;
    for (let i = 1; i < 60; i += 1) {
      const response = await get(ipGet);
      if (response.status === 200) allowed += 1;
      else {
        limitedStatus = response.status;
        const body = (await response.json()) as { error: { code: string } };
        assert.equal(body.error.code, "RATE_LIMITED");
        break;
      }
    }
    assert.equal(limitedStatus, 429);
    assert.ok(allowed < 60, `Terlalu banyak request lolos: ${allowed}`);
  });

  await t.test("3. cancel dibatasi sebelum verifikasi token", async () => {
    for (let i = 0; i < 9; i += 1) {
      const response = await cancelReq(ipCancel, null);
      assert.equal(response.status, 401, `Percobaan ${i + 1} harus 401`);
    }

    const limited = await cancelReq(ipCancel, null);
    assert.equal(limited.status, 429);
    const body = (await limited.json()) as {
      error: { code: string; message: string };
    };
    assert.equal(body.error.code, "RATE_LIMITED");
  });

  await t.test("4. cancel di bawah batas tetap berhasil", async () => {
    const response = await cancelReq(ipCancelOk);
    assert.equal(response.status, 200);
    const body = (await response.json()) as { status: string };
    assert.equal(body.status, "CANCELLED");
  });
});
