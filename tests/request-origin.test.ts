import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { isAllowedOrigin } from "../src/lib/request-origin";
import { isSameOrigin, proxy } from "../src/proxy";

const ALLOWED = ["http://localhost:3000"];
const BASE = "http://localhost:3000/api/public/orders";

function request(
  headers: Record<string, string> = {},
  method = "POST",
  url = BASE
): NextRequest {
  return new NextRequest(url, { method, headers });
}

test("S-08: CSRF memakai origin tepercaya, bukan header Host", async (t) => {
  await t.test("Origin asing ditolak", () => {
    assert.equal(
      isAllowedOrigin(
        request({ origin: "https://evil.example", host: "localhost:3000" }),
        ALLOWED
      ),
      false
    );
  });

  await t.test("Origin sah diterima", () => {
    assert.equal(
      isAllowedOrigin(
        request({ origin: "http://localhost:3000", host: "evil.example" }),
        ALLOWED
      ),
      true
    );
  });

  await t.test("Referer dipakai bila Origin tidak ada", () => {
    assert.equal(
      isAllowedOrigin(
        request({ referer: "http://localhost:3000/admin/menu" }),
        ALLOWED
      ),
      true
    );
    assert.equal(
      isAllowedOrigin(
        request({ referer: "https://evil.example/admin/menu" }),
        ALLOWED
      ),
      false
    );
  });

  await t.test("Host palsu tidak mengubah keputusan proxy", async () => {
    const evil = await proxy(
      request({ origin: "https://evil.example", host: "localhost:3000" })
    );
    assert.equal(evil.status, 403);

    const good = await proxy(
      request({ origin: "http://localhost:3000", host: "evil.example" })
    );
    assert.notEqual(good.status, 403);
  });

  await t.test("mutasi tanpa Origin/Referer ditolak", async () => {
    const response = await proxy(
      request({ host: "localhost:3000", "sec-fetch-site": "same-origin" })
    );
    assert.equal(response.status, 403);
  });

  await t.test("cron tanpa Origin tetap diizinkan", async () => {
    const response = await proxy(
      request(
        { host: "localhost:3000" },
        "POST",
        "http://localhost:3000/api/cron/expire-orders"
      )
    );
    assert.notEqual(response.status, 403);
  });

  await t.test("Sec-Fetch-Site lintas situs ditolak", () => {
    assert.equal(
      isSameOrigin(
        request({
          origin: "http://localhost:3000",
          "sec-fetch-site": "cross-site",
        })
      ),
      false
    );
  });

  await t.test("metode aman tidak terkena aturan mutasi", async () => {
    const response = await proxy(
      request({ host: "localhost:3000" }, "GET")
    );
    assert.notEqual(response.status, 403);
  });
});
