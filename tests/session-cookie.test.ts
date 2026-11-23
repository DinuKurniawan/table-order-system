import test from "node:test";
import assert from "node:assert/strict";
import { NextResponse } from "next/server";
import { destroySession } from "../src/lib/session";

test("logout menghapus cookie __Host- dengan atribut Secure yang valid", async () => {
  const previous = process.env.NODE_ENV;
  try {
    // NODE_ENV hanya bisa dibaca; cookie sesi produksi memakai prefix __Host-.
    Object.assign(process.env, { NODE_ENV: "production" });
    const response = NextResponse.json({ ok: true });
    await destroySession(response);

    const cookies = response.headers.getSetCookie();
    const sessionCookie = cookies.find((cookie) =>
      cookie.startsWith("__Host-session_token=")
    );
    assert.ok(sessionCookie, "cookie sesi harus dihapus");
    assert.match(sessionCookie, /Secure/);
    assert.match(sessionCookie, /Max-Age=0/);
    assert.match(sessionCookie, /Path=\//);
    assert.doesNotMatch(sessionCookie, /Domain=/);
  } finally {
    Object.assign(process.env, { NODE_ENV: previous });
  }
});
