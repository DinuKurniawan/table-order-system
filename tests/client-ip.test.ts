import test from "node:test";
import assert from "node:assert/strict";
import { getClientIp } from "../src/lib/client-ip";

function request(headers: Record<string, string>): Request {
  return new Request("http://localhost:3000/api/test", { headers });
}

test("T-07: IP klien hanya dari proxy tepercaya", async (t) => {
  await t.test("vercel: x-forwarded-for palsu diabaikan", () => {
    const a = getClientIp(
      request({
        "x-forwarded-for": "1.1.1.1",
        "x-real-ip": "203.0.113.10",
      }),
      "vercel"
    );
    const b = getClientIp(
      request({
        "x-forwarded-for": "9.9.9.9",
        "x-real-ip": "203.0.113.10",
      }),
      "vercel"
    );

    assert.equal(a, "203.0.113.10");
    assert.equal(a, b, "X-Forwarded-For palsu tidak boleh mengubah kunci");
  });

  await t.test("vercel: x-vercel-forwarded-for diprioritaskan", () => {
    assert.equal(
      getClientIp(
        request({
          "x-vercel-forwarded-for": "198.51.100.7",
          "x-real-ip": "203.0.113.10",
        }),
        "vercel"
      ),
      "198.51.100.7"
    );
  });

  await t.test("none: semua header forwarded diabaikan", () => {
    const a = getClientIp(
      request({ "x-forwarded-for": "1.1.1.1", "x-real-ip": "2.2.2.2" }),
      "none"
    );
    const b = getClientIp(
      request({ "x-forwarded-for": "3.3.3.3" }),
      "none"
    );

    assert.equal(a, "unknown");
    assert.equal(a, b, "mode none tidak boleh membedakan bucket dari header klien");
  });

  await t.test("none: memakai ip koneksi bila adapter menyediakannya", () => {
    const req = Object.assign(request({ "x-forwarded-for": "1.1.1.1" }), {
      ip: "192.0.2.55",
    });
    assert.equal(getClientIp(req, "none"), "192.0.2.55");
  });

  await t.test("cloudflare: cf-connecting-ip hanya dengan cf-ray", () => {
    assert.equal(
      getClientIp(
        request({ "cf-connecting-ip": "198.51.100.9" }),
        "cloudflare"
      ),
      "unknown"
    );
    assert.equal(
      getClientIp(
        request({
          "cf-ray": "abc123",
          "cf-connecting-ip": "198.51.100.9",
        }),
        "cloudflare"
      ),
      "198.51.100.9"
    );
  });

  await t.test("jumlah hop mengambil entri dari kanan", () => {
    assert.equal(
      getClientIp(
        request({ "x-forwarded-for": "1.1.1.1, 203.0.113.5, 10.0.0.1" }),
        "2"
      ),
      "203.0.113.5"
    );
  });

  await t.test("format IP tidak valid jatuh ke fallback", () => {
    assert.equal(
      getClientIp(
        request({ "x-forwarded-for": "1.1.1.1, bukan-ip" }),
        "1"
      ),
      "unknown"
    );
    assert.equal(
      getClientIp(request({ "x-real-ip": "999.999.999.999" }), "vercel"),
      "unknown"
    );
  });
});
