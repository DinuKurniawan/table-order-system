import test from "node:test";
import assert from "node:assert/strict";
import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { createSession } from "../src/lib/session";
import {
  SESSION_COOKIE_BASE_NAME,
  sessionCookieName,
} from "../src/lib/session-cookie";

test("SEC-14: cookie sesi __Host- di production", async (t) => {
  const saved = process.env.NODE_ENV;
  t.after(() => {
    (process.env as Record<string, string>).NODE_ENV = saved ?? "test";
  });

  (process.env as Record<string, string>).NODE_ENV = "production";
  assert.equal(sessionCookieName(), `__Host-${SESSION_COOKIE_BASE_NAME}`);

  const response = NextResponse.json({ ok: true });
  await createSession(
    { sub: "uji-sec14", role: Role.SUPER_ADMIN, tokenVersion: 1 },
    response
  );

  const setCookie = response.headers.get("set-cookie") ?? "";
  assert.match(setCookie, /^__Host-session_token=/);
  assert.match(setCookie, /Secure/i);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /Path=\//i);
  assert.match(setCookie, /SameSite=lax/i);
  assert.ok(!/Domain=/i.test(setCookie), "cookie __Host- tidak boleh punya Domain");

  (process.env as Record<string, string>).NODE_ENV = "test";
  assert.equal(sessionCookieName(), SESSION_COOKIE_BASE_NAME);
});
