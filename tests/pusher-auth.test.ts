import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { PrismaClient, Role } from "@prisma/client";
import { POST } from "../src/app/api/pusher/auth/route";
import { signSessionToken } from "../src/lib/session";
import { orderAccessCookieName } from "../src/lib/order-access";

const prisma = new PrismaClient();
const stamp = Date.now();

function authRequest(channel: string, cookies: Record<string, string> = {}): NextRequest {
  const cookie = Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");

  return new NextRequest("http://localhost:3000/api/pusher/auth", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify({ socket_id: "1234.5678", channel_name: channel }),
  });
}

test("T-04: otorisasi channel Pusher memeriksa sesi aktif", async (t) => {
  const active = await prisma.user.create({
    data: {
      name: `Kasir Aktif ${stamp}`,
      username: `t04-aktif-${stamp}`,
      passwordHash: "x",
      role: Role.CASHIER,
      isActive: true,
      tokenVersion: 3,
    },
  });

  const inactive = await prisma.user.create({
    data: {
      name: `Kasir Nonaktif ${stamp}`,
      username: `t04-nonaktif-${stamp}`,
      passwordHash: "x",
      role: Role.CASHIER,
      isActive: false,
      tokenVersion: 0,
    },
  });

  const stale = await prisma.user.create({
    data: {
      name: `Kasir Token Lama ${stamp}`,
      username: `t04-stale-${stamp}`,
      passwordHash: "x",
      role: Role.CASHIER,
      isActive: true,
      tokenVersion: 2,
    },
  });

  const admin = await prisma.user.create({
    data: {
      name: `Admin ${stamp}`,
      username: `t04-admin-${stamp}`,
      passwordHash: "x",
      role: Role.SUPER_ADMIN,
      isActive: true,
      tokenVersion: 0,
    },
  });

  const activeToken = await signSessionToken({
    sub: active.id,
    role: active.role,
    tokenVersion: active.tokenVersion,
  });
  const inactiveToken = await signSessionToken({
    sub: inactive.id,
    role: inactive.role,
    tokenVersion: inactive.tokenVersion,
  });
  const staleToken = await signSessionToken({
    sub: stale.id,
    role: stale.role,
    tokenVersion: stale.tokenVersion - 1,
  });
  const adminToken = await signSessionToken({
    sub: admin.id,
    role: admin.role,
    tokenVersion: admin.tokenVersion,
  });

  const activeTable = await prisma.table.create({
    data: { name: `T04 Aktif ${stamp}`, token: `t04-aktif-${stamp}` },
  });
  const inactiveTable = await prisma.table.create({
    data: {
      name: `T04 Nonaktif ${stamp}`,
      token: `t04-nonaktif-${stamp}`,
      isActive: false,
    },
  });

  const orderA = await prisma.order.create({
    data: {
      code: `T04-${stamp}-A`,
      accessToken: `access-a-${stamp}`,
      tableId: activeTable.id,
      subtotal: 10000,
      total: 10000,
      expiresAt: new Date(Date.now() + 60_000),
    },
  });
  const orderB = await prisma.order.create({
    data: {
      code: `T04-${stamp}-B`,
      accessToken: `access-b-${stamp}`,
      tableId: activeTable.id,
      subtotal: 10000,
      total: 10000,
      expiresAt: new Date(Date.now() + 60_000),
    },
  });

  t.after(async () => {
    await prisma.order.deleteMany({
      where: { id: { in: [orderA.id, orderB.id] } },
    });
    await prisma.table.deleteMany({
      where: { id: { in: [activeTable.id, inactiveTable.id] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [active.id, inactive.id, stale.id, admin.id] } },
    });
    await prisma.$disconnect();
  });

  await t.test("kasir aktif boleh private-cashier", async () => {
    const response = await POST(
      authRequest("private-cashier", { session_token: activeToken })
    );
    assert.equal(response.status, 200);
  });

  await t.test("kasir nonaktif ditolak 403", async () => {
    const response = await POST(
      authRequest("private-cashier", { session_token: inactiveToken })
    );
    assert.equal(response.status, 403);
    const body = (await response.json()) as {
      error: { code: string; message: string };
    };
    assert.equal(body.error.code, "FORBIDDEN");
    assert.equal(body.error.message, "Forbidden");
  });

  await t.test("tokenVersion lama ditolak 403", async () => {
    const response = await POST(
      authRequest("private-cashier", { session_token: staleToken })
    );
    assert.equal(response.status, 403);
  });

  await t.test("role tidak cukup ditolak 403", async () => {
    assert.equal(
      (await POST(authRequest("private-admin", { session_token: activeToken })))
        .status,
      403
    );
    assert.equal(
      (await POST(authRequest("private-admin", { session_token: adminToken })))
        .status,
      200
    );
  });

  await t.test("private-user hanya untuk id sendiri", async () => {
    assert.equal(
      (
        await POST(
          authRequest(`private-user-${active.id}`, {
            session_token: activeToken,
          })
        )
      ).status,
      200
    );
    assert.equal(
      (
        await POST(
          authRequest(`private-user-${admin.id}`, {
            session_token: activeToken,
          })
        )
      ).status,
      403
    );
  });

  await t.test("private-order wajib accessToken pesanan yang cocok", async () => {
    assert.equal(
      (
        await POST(
          authRequest(`private-order-${orderA.code}`, {
            [orderAccessCookieName(orderA.code)]: orderA.accessToken,
          })
        )
      ).status,
      200
    );
    assert.equal(
      (
        await POST(
          authRequest(`private-order-${orderA.code}`, {
            [orderAccessCookieName(orderA.code)]: "token-salah",
          })
        )
      ).status,
      403
    );
    assert.equal(
      (
        await POST(
          authRequest(`private-order-${orderA.code}`, {
            [orderAccessCookieName(orderA.code)]: orderB.accessToken,
          })
        )
      ).status,
      403
    );
  });

  await t.test("private-table hanya untuk meja aktif", async () => {
    assert.equal(
      (await POST(authRequest(`private-table-${activeTable.token}`))).status,
      200
    );
    assert.equal(
      (await POST(authRequest(`private-table-${inactiveTable.token}`))).status,
      403
    );
    assert.equal(
      (await POST(authRequest("private-table-tidak-ada"))).status,
      403
    );
  });

  await t.test("tanpa sesi ditolak 403", async () => {
    assert.equal((await POST(authRequest("private-cashier"))).status, 403);
  });
});
