import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { prisma } from "../src/lib/db";
import { hashPassword, verifyPassword, authorizeRole, type SafeUser } from "../src/lib/auth";
import { Role } from "@prisma/client";

function runSeed(overrides: Record<string, string>) {
  return spawnSync(
    process.execPath,
    ["--import", "tsx", "prisma/seed.ts"],
    {
      cwd: process.cwd(),
      env: { ...process.env, ...overrides },
      encoding: "utf8",
      timeout: 120_000,
    }
  );
}

test("SEC-01: seed wajib kredensial eksplisit dan password changer", async (t) => {
  await t.test("1. Seed tanpa SEED_ADMIN_* gagal", () => {
    const result = runSeed({
      NODE_ENV: "production",
      SEED_ADMIN_USERNAME: "",
      SEED_ADMIN_PASSWORD: "",
    });
    assert.equal(result.status, 1, "Seed tanpa kredensial harus exit 1");
    assert.match(
      `${result.stderr}${result.stdout}`,
      /SEED_ADMIN_USERNAME dan SEED_ADMIN_PASSWORD wajib diisi/
    );
  });

  await t.test("2. Seed dengan password placeholder di production gagal", () => {
    const result = runSeed({
      NODE_ENV: "production",
      SEED_ADMIN_USERNAME: "admin_seed_test",
      SEED_ADMIN_PASSWORD: "Admin123456!",
    });
    assert.equal(result.status, 1, "Placeholder harus ditolak di production");
    assert.match(`${result.stderr}${result.stdout}`, /SEED_ADMIN_PASSWORD ditolak/);
  });

  const username = `pwchange_${Date.now()}`;
  const oldPassword = "KopiLama12345!";
  const newPassword = "SelarasKopi#2026Baru";
  const ip = `198.51.100.${(Date.now() % 200) + 1}`;
  const auditStart = new Date();

  const user = await prisma.user.create({
    data: {
      name: "Uji Ganti Password",
      username,
      passwordHash: await hashPassword(oldPassword),
      role: Role.CASHIER,
      isActive: true,
      tokenVersion: 0,
      mustChangePassword: true,
    },
  });

  t.after(async () => {
    await prisma.auditLog.deleteMany({
      where: { createdAt: { gte: auditStart }, entityId: user.id },
    });
    await prisma.rateLimit.deleteMany({
      where: {
        OR: [{ key: { contains: ip } }, { key: { contains: user.id } }],
      },
    });
    await prisma.user.deleteMany({ where: { id: user.id } });
    await prisma.$disconnect();
  });

  await t.test("3. requireRole menolak PASSWORD_CHANGE_REQUIRED", () => {
    const { passwordHash: _hash, ...safeUser } = user;
    void _hash;
    assert.throws(
      () => authorizeRole(safeUser as SafeUser, [Role.CASHIER, Role.SUPER_ADMIN]),
      (err: Error & { code?: string }) =>
        err.code === "PASSWORD_CHANGE_REQUIRED"
    );
  });

  await t.test("4. Login mengarahkan ke /change-password, ganti, dan password lama mati", async () => {
    const { NextRequest } = await import("next/server");
    const { POST: loginHandler } = await import("../src/app/api/auth/login/route");
    const { POST: changeHandler } = await import(
      "../src/app/api/auth/change-password/route"
    );

    const login = async (password: string) =>
      loginHandler(
        new NextRequest("http://localhost:3000/api/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json", "x-forwarded-for": ip },
          body: JSON.stringify({ username, password }),
        })
      );

    const first = await login(oldPassword);
    assert.equal(first.status, 200);
    const firstJson = (await first.json()) as {
      redirectUrl: string;
      mustChangePassword: boolean;
    };
    assert.equal(firstJson.mustChangePassword, true);
    assert.equal(firstJson.redirectUrl, "/change-password");

    const cookie = /session_token=([^;]+)/.exec(
      first.headers.get("set-cookie") ?? ""
    )?.[1];
    assert.ok(cookie, "Login harus memasang cookie sesi");

    const change = (body: Record<string, string>) =>
      changeHandler(
        new NextRequest("http://localhost:3000/api/auth/change-password", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": ip,
            cookie: `session_token=${cookie}`,
          },
          body: JSON.stringify(body),
        })
      );

    const wrong = await change({
      currentPassword: "SalahLama12345!",
      newPassword,
    });
    assert.equal(wrong.status, 401);

    const placeholder = await change({
      currentPassword: oldPassword,
      newPassword: "Admin123456!",
    });
    assert.equal(placeholder.status, 400, "Placeholder harus ditolak");

    const same = await change({
      currentPassword: oldPassword,
      newPassword: oldPassword,
    });
    assert.equal(same.status, 400, "Password baru tidak boleh sama dengan lama");

    const ok = await change({ currentPassword: oldPassword, newPassword });
    assert.equal(ok.status, 200);
    const okJson = (await ok.json()) as { success: boolean };
    assert.equal(okJson.success, true);

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.equal(updated.mustChangePassword, false);
    assert.equal(updated.tokenVersion, 1, "tokenVersion wajib naik");
    assert.equal(await verifyPassword(oldPassword, updated.passwordHash), false);
    assert.equal(await verifyPassword(newPassword, updated.passwordHash), true);

    const audit = await prisma.auditLog.findFirst({
      where: { userId: user.id, action: "auth.password_changed" },
    });
    assert.ok(audit, "Perubahan password wajib tercatat di AuditLog");

    const oldLogin = await login(oldPassword);
    assert.equal(oldLogin.status, 401, "Password lama tidak boleh dipakai");

    const newLogin = await login(newPassword);
    assert.equal(newLogin.status, 200);
    const newJson = (await newLogin.json()) as {
      redirectUrl: string;
      mustChangePassword: boolean;
    };
    assert.equal(newJson.mustChangePassword, false);
    assert.equal(newJson.redirectUrl, "/cashier");
  });
});
