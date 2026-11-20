import test from "node:test";
import assert from "node:assert/strict";
import argon2 from "argon2";
import { mock } from "node:test";
import { NextRequest } from "next/server";
import { prisma } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth";
import { POST as loginHandler } from "../src/app/api/auth/login/route";
import { Role } from "@prisma/client";

const stamp = Date.now();
const activeUsername = `enum-active-${stamp}`;
const inactiveUsername = `enum-inactive-${stamp}`;
const missingUsername = `enum-missing-${stamp}`;
const password = "KopiEnum12345!";
const auditStart = new Date();
const ipBase = `203.0.${(stamp % 200) + 1}`;
const ip = (suffix: number) => `${ipBase}.${suffix}`;

function loginRequest(
  username: string,
  candidatePassword: string,
  ip: string
): NextRequest {
  return new NextRequest("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify({ username, password: candidatePassword }),
  });
}

test("SEC-03: login membayar biaya hash yang sama untuk semua kegagalan", async (t) => {
  const active = await prisma.user.create({
    data: {
      name: "Enum Aktif",
      username: activeUsername,
      passwordHash: await hashPassword(password),
      role: Role.CASHIER,
      isActive: true,
      tokenVersion: 0,
    },
  });

  const inactive = await prisma.user.create({
    data: {
      name: "Enum Nonaktif",
      username: inactiveUsername,
      passwordHash: await hashPassword(password),
      role: Role.CASHIER,
      isActive: false,
      tokenVersion: 0,
    },
  });

  t.after(async () => {
    await prisma.rateLimit.deleteMany({
      where: { key: { contains: ipBase } },
    });
    await prisma.auditLog.deleteMany({
      where: {
        action: "auth.login_failed",
        createdAt: { gte: auditStart },
        OR: [activeUsername, inactiveUsername, missingUsername].map((username) => ({
          meta: { path: ["username"], equals: username },
        })),
      },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [active.id, inactive.id] } },
    });
    await prisma.$disconnect();
  });

  await t.test("1. verify terhadap hash dummy dipanggil saat user tidak ada", async () => {
    const spy = mock.method(argon2, "verify", async () => false);
    try {
      const response = await loginHandler(
        loginRequest(missingUsername, password, ip(201))
      );
      assert.equal(response.status, 401);
      assert.equal(
        spy.mock.callCount(),
        1,
        "argon2.verify harus tetap dipanggil pada jalur user-tidak-ada"
      );
    } finally {
      spy.mock.restore();
    }
  });

  await t.test("2. input terlalu panjang ditolak sebelum hashing", async () => {
    const spy = mock.method(argon2, "verify", async () => false);
    try {
      const longUsername = await loginHandler(
        loginRequest("a".repeat(65), password, ip(202))
      );
      const longPassword = await loginHandler(
        loginRequest(activeUsername, "b".repeat(129), ip(203))
      );
      assert.equal(longUsername.status, 400);
      assert.equal(longPassword.status, 400);
      assert.equal(spy.mock.callCount(), 0, "Validasi harus menolak sebelum Argon2");
    } finally {
      spy.mock.restore();
    }
  });

  await t.test("3. respons tiga jalur kegagalan identik", async () => {
    const missing = await loginHandler(
      loginRequest(missingUsername, password, ip(211))
    );
    const nonaktif = await loginHandler(
      loginRequest(inactiveUsername, password, ip(212))
    );
    const salah = await loginHandler(
      loginRequest(activeUsername, "PasswordSalah123!", ip(213))
    );

    const bodies = await Promise.all(
      [missing, nonaktif, salah].map(async (response) => ({
        status: response.status,
        body: await response.json(),
        contentType: response.headers.get("content-type"),
        setCookie: response.headers.get("set-cookie"),
      }))
    );

    assert.deepEqual(bodies[0], bodies[1]);
    assert.deepEqual(bodies[1], bodies[2]);
    assert.equal(bodies[0].status, 401);
    assert.equal(bodies[0].setCookie, null);
  });

  await t.test("4. waktu respons user tidak ada tidak jauh berbeda", async () => {
    const time = async (username: string, candidate: string, ip: string) => {
      const started = performance.now();
      const response = await loginHandler(loginRequest(username, candidate, ip));
      assert.equal(response.status, 401);
      await response.json();
      return performance.now() - started;
    };

    const median = (values: number[]) => {
      const sorted = [...values].sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length / 2)];
    };

    const missingTimes = [
      await time(missingUsername, password, ip(221)),
      await time(missingUsername, password, ip(222)),
      await time(missingUsername, password, ip(223)),
    ];
    const wrongTimes = [
      await time(activeUsername, "PasswordSalah123!", ip(224)),
      await time(activeUsername, "PasswordSalah123!", ip(225)),
      await time(activeUsername, "PasswordSalah123!", ip(226)),
    ];

    const missingMedian = median(missingTimes);
    const wrongMedian = median(wrongTimes);

    assert.ok(missingMedian > 10, "Jalur user tidak ada wajib menjalankan Argon2");
    assert.ok(
      missingMedian < wrongMedian * 5,
      `Selisih waktu terlalu besar: missing=${missingMedian.toFixed(1)}ms wrong=${wrongMedian.toFixed(1)}ms`
    );
  });
});
