import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword, authenticateSession, authorizeRole } from "../src/lib/auth";
import { verifySessionToken } from "../src/lib/session";
import { env } from "../src/lib/env";
import { prisma } from "../src/lib/db";
import { Role } from "@prisma/client";
import { SignJWT } from "jose";

test("Auth & RBAC Test Suite", async (t) => {
  // Setup user tes sementara
  const testUsername = `test_cashier_${Date.now()}`;
  // IP unik per run: rate limit login tersimpan di DB dan bisa tersisa
  // dari run sebelumnya, membuat tes berikutnya menerima 429.
  const testIp = `203.0.113.${(Date.now() % 200) + 1}`;
  const auditStart = new Date();
  const ghostUsername = `ghost_${Date.now()}`;
  const rawPassword = "KasirPassword123!";
  const passwordHash = await hashPassword(rawPassword);

  const testUser = await prisma.user.create({
    data: {
      name: "Kasir Uji Coba",
      username: testUsername,
      passwordHash,
      role: Role.CASHIER,
      isActive: true,
      tokenVersion: 1,
    },
  });

  t.after(async () => {
    await prisma.auditLog.deleteMany({
      where: {
        action: { in: ["auth.login", "auth.login_failed"] },
        createdAt: { gte: auditStart },
      },
    });
    await prisma.rateLimit.deleteMany({
      where: { key: { contains: testIp } },
    });
    await prisma.user.deleteMany({
      where: { username: testUsername },
    });
    await prisma.$disconnect();
  });

  await t.test("1. Hash dan Verifikasi Password (argon2id)", async () => {
    const isCorrect = await verifyPassword(rawPassword, testUser.passwordHash);
    assert.equal(isCorrect, true, "Password benar harus menghasilkan true");

    const isWrong = await verifyPassword("SalahPassword123!", testUser.passwordHash);
    assert.equal(isWrong, false, "Password salah harus menghasilkan false");
  });

  await t.test("2. Verifikasi Token JWT Sesi (jose)", async () => {
    const secret = new TextEncoder().encode(env.SESSION_SECRET);

    const validToken = await new SignJWT({
      role: testUser.role,
      tokenVersion: testUser.tokenVersion,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(testUser.id)
      .setExpirationTime("1h")
      .sign(secret);

    const verified = await verifySessionToken(validToken);
    assert.ok(verified, "Token valid harus berhasil diverifikasi");
    assert.equal(verified?.sub, testUser.id);
    assert.equal(verified?.role, Role.CASHIER);
    assert.equal(verified?.tokenVersion, 1);

    const invalidToken = "token.palsu.yang.rusak";
    const verifiedInvalid = await verifySessionToken(invalidToken);
    assert.equal(verifiedInvalid, null, "Token rusak harus mengembalikan null");
  });

  await t.test("3. Authenticate Session Berhasil saat tokenVersion Cocok", async () => {
    const payload = {
      sub: testUser.id,
      role: testUser.role,
      tokenVersion: 1,
    };

    const sessionUser = await authenticateSession(payload);
    assert.ok(sessionUser, "User aktif dengan tokenVersion cocok harus terautentikasi");
    assert.equal(sessionUser?.id, testUser.id);
    assert.equal(sessionUser?.isActive, true);
  });

  await t.test("4. Invalidation saat tokenVersion Mismatch (Reset Password / Kick Sesi)", async () => {
    // Naikkan tokenVersion user di database menjadi 2
    await prisma.user.update({
      where: { id: testUser.id },
      data: { tokenVersion: 2 },
    });

    // Coba autentikasi menggunakan token lama yang masih membawa tokenVersion = 1
    const oldPayload = {
      sub: testUser.id,
      role: testUser.role,
      tokenVersion: 1,
    };

    const sessionUser = await authenticateSession(oldPayload);
    assert.equal(
      sessionUser,
      null,
      "Sesi lama dengan tokenVersion lama wajib ditolak setelah tokenVersion dinaikkan"
    );

    // Dengan tokenVersion = 2 yang baru, autentikasi kembali berhasil
    const newPayload = {
      sub: testUser.id,
      role: testUser.role,
      tokenVersion: 2,
    };

    const reauth = await authenticateSession(newPayload);
    assert.ok(reauth, "Autentikasi dengan tokenVersion baru harus berhasil");
  });

  await t.test("5. Penolakan Sesi saat User Dinonaktifkan (isActive = false)", async () => {
    // Nonaktifkan user di DB
    await prisma.user.update({
      where: { id: testUser.id },
      data: { isActive: false },
    });

    const payload = {
      sub: testUser.id,
      role: testUser.role,
      tokenVersion: 2,
    };

    const sessionUser = await authenticateSession(payload);
    assert.equal(sessionUser, null, "User non-aktif wajib ditolak oleh authenticateSession");
  });

  await t.test("6. Otorisasi Role (requireRole / authorizeRole)", async () => {
    const mockCashier = {
      id: "u-cashier-1",
      name: "Kasir A",
      username: "kasir_a",
      role: Role.CASHIER,
      isActive: true,
      tokenVersion: 1,
      mustChangePassword: false,
      lastLoginAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Role CASHIER diizinkan pada endpoint yang mengizinkan CASHIER
    const authorized = authorizeRole(mockCashier, [Role.CASHIER, Role.SUPER_ADMIN]);
    assert.equal(authorized.id, mockCashier.id);

    // Role CASHIER ditolak jika endpoint hanya mengizinkan SUPER_ADMIN
    assert.throws(
      () => {
        authorizeRole(mockCashier, [Role.SUPER_ADMIN]);
      },
      (err: Error & { code?: string; status?: number }) => {
        return err.code === "FORBIDDEN" && err.status === 403;
      },
      "Kasir yang mengakses endpoint SUPER_ADMIN wajib ditolak dengan 403 FORBIDDEN"
    );

    // Akses tanpa login ditolak dengan 401 UNAUTHORIZED
    assert.throws(
      () => {
        authorizeRole(null, [Role.CASHIER]);
      },
      (err: Error & { code?: string; status?: number }) => {
        return err.code === "UNAUTHENTICATED" && err.status === 401;
      },
      "Permintaan tanpa sesi wajib ditolak dengan 401 UNAUTHORIZED"
    );
  });

  await t.test("7. Route Handler Login & Logout API", async () => {
    const { POST: loginHandler } = await import("../src/app/api/auth/login/route");
    const { POST: logoutHandler } = await import("../src/app/api/auth/logout/route");
    const { NextRequest } = await import("next/server");

    // 1. Login salah
    const badReq = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": testIp,
      },
      body: JSON.stringify({
        username: ghostUsername,
        password: "random_password",
      }),
    });
    const badRes = await loginHandler(badReq);
    assert.equal(badRes.status, 401);
    const badJson = (await badRes.json()) as {
      error: { code: string; message: string };
    };
    assert.equal(badJson.error.code, "UNAUTHENTICATED");
    assert.equal(badJson.error.message, "Username atau password salah");

    const failedAudit = await prisma.auditLog.findFirst({
      where: {
        action: "auth.login_failed",
        meta: { path: ["username"], equals: ghostUsername },
      },
    });
    assert.ok(failedAudit, "Login gagal harus tercatat di AuditLog");
    assert.ok(
      !JSON.stringify(failedAudit).includes("random_password"),
      "Audit login tidak boleh memuat password"
    );

    // 2. Login benar (user uji, bukan kredensial seed)
    await prisma.user.update({
      where: { id: testUser.id },
      data: { isActive: true },
    });

    const goodReq = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": testIp,
      },
      body: JSON.stringify({
        username: testUsername,
        password: rawPassword,
      }),
    });
    const goodRes = await loginHandler(goodReq);
    assert.equal(goodRes.status, 200);
    const goodJson = await goodRes.json();
    assert.equal(goodJson.success, true);
    assert.equal(goodJson.role, Role.CASHIER);
    assert.equal(goodJson.redirectUrl, "/cashier");

    const loginAudit = await prisma.auditLog.findFirst({
      where: {
        action: "auth.login",
        meta: { path: ["username"], equals: testUsername },
      },
    });
    assert.ok(loginAudit, "Login sukses harus tercatat di AuditLog");

    // 3. Logout
    const logoutRes = await logoutHandler();
    assert.equal(logoutRes.status, 200);
    const logoutJson = await logoutRes.json();
    assert.equal(logoutJson.success, true);
  });
});
