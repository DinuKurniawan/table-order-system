import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { proxy } from "../src/proxy";

const ENV_KEYS = [
  "NODE_ENV",
  "CSP_ENFORCE",
  "CSP_REPORT_ONLY",
  "R2_PUBLIC_BASE_URL",
  "R2_ACCOUNT_ID",
  "NEXT_PUBLIC_PUSHER_CLUSTER",
] as const;

function snapshotEnv(): Record<string, string | undefined> {
  return Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
}

function restoreEnv(saved: Record<string, string | undefined>): void {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else (process.env as Record<string, string>)[key] = saved[key];
  }
}

function pageRequest(path = "/m/uji"): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: { accept: "text/html" },
  });
}

function cspOf(response: Response): string {
  return (
    response.headers.get("content-security-policy-report-only") ??
    response.headers.get("content-security-policy") ??
    ""
  );
}

function scriptSrcOf(csp: string): string {
  return (
    csp
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("script-src")) ?? ""
  );
}

test("SEC-04: CSP ditegakkan dengan origin R2 spesifik", async (t) => {
  const saved = snapshotEnv();

  t.after(() => restoreEnv(saved));

  (process.env as Record<string, string>).NODE_ENV = "production";
  process.env.R2_PUBLIC_BASE_URL = "https://cdn.example.com/assets";
  process.env.R2_ACCOUNT_ID = "abc123";
  process.env.NEXT_PUBLIC_PUSHER_CLUSTER = "ap1";
  delete process.env.CSP_REPORT_ONLY;
  delete process.env.CSP_ENFORCE;

  await t.test("1. skrip hanya self + inline, tanpa wildcard R2", async () => {
    const response = await proxy(pageRequest());
    const csp = cspOf(response);

    assert.ok(csp.length > 0);
    const scriptSrc = scriptSrcOf(csp);
    assert.ok(scriptSrc, "script-src wajib ada");
    assert.ok(scriptSrc.includes("'self'"));
    assert.ok(scriptSrc.includes("'unsafe-inline'"));
    assert.ok(!scriptSrc.includes("'nonce-"));
    assert.ok(!scriptSrc.includes("'strict-dynamic'"));

    assert.ok(!csp.includes("*"), "CSP tidak boleh memuat wildcard");
    assert.ok(!csp.includes("*.r2.cloudflarestorage.com"));
    assert.ok(
      csp.includes("https://abc123.r2.cloudflarestorage.com"),
      "host R2 akun harus eksplisit"
    );
    assert.ok(csp.includes("https://cdn.example.com"));
    assert.ok(csp.includes("wss://ws-ap1.pusher.com"));
    assert.ok(csp.includes("object-src 'none'"));
    assert.ok(csp.includes("frame-ancestors 'none'"));
    assert.ok(csp.includes("base-uri 'self'"));
    assert.ok(csp.includes("form-action 'self'"));
  });

  await t.test("2. tidak ada nonce/x-nonce agar shell PPR tetap jalan", async () => {
    const response = await proxy(pageRequest());

    assert.ok(!cspOf(response).includes("'nonce-"));
    assert.equal(response.headers.get("x-nonce"), null);
  });

  await t.test("3. default enforce; CSP_ENFORCE=false memaksa Report-Only", async () => {
    const enforced = await proxy(pageRequest());
    assert.ok(enforced.headers.get("content-security-policy"));
    assert.equal(
      enforced.headers.get("content-security-policy-report-only"),
      null
    );
    assert.ok(cspOf(enforced).includes("upgrade-insecure-requests"));

    process.env.CSP_ENFORCE = "false";
    const reportOnly = await proxy(pageRequest());
    assert.ok(reportOnly.headers.get("content-security-policy-report-only"));
    assert.equal(reportOnly.headers.get("content-security-policy"), null);
    assert.ok(!cspOf(reportOnly).includes("upgrade-insecure-requests"));

    delete process.env.CSP_ENFORCE;
    process.env.CSP_REPORT_ONLY = "true";
    const forcedReport = await proxy(pageRequest());
    assert.ok(forcedReport.headers.get("content-security-policy-report-only"));
    assert.equal(forcedReport.headers.get("content-security-policy"), null);
  });

  await t.test("4. development menambah unsafe-eval", async () => {
    (process.env as Record<string, string>).NODE_ENV = "development";
    delete process.env.CSP_REPORT_ONLY;
    delete process.env.CSP_ENFORCE;
    const response = await proxy(pageRequest());
    const scriptSrc = scriptSrcOf(cspOf(response));
    assert.ok(scriptSrc.includes("'unsafe-eval'"));
    assert.ok(scriptSrc.includes("'unsafe-inline'"));
  });
});
