import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import nextConfig from "../next.config";

type HeaderRule = { source: string; headers: { key: string; value: string }[] };

function routeFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(full);
    return entry.name === "route.ts" ? [full] : [];
  });
}

function routePath(file: string): string {
  return (
    "/" +
    path
      .relative("src/app", file)
      .replace(/\\/g, "/")
      .replace(/\/route\.ts$/, "")
  );
}

function matches(source: string, route: string): boolean {
  if (source.endsWith("/:path*")) {
    const base = source.slice(0, -"/:path*".length);
    return route === base || route.startsWith(`${base}/`);
  }
  return route === source;
}

test("SEC-16: Cache-Control no-store pada route sensitif", async () => {
  const rules = (await nextConfig.headers?.()) as HeaderRule[];
  assert.ok(rules?.length);

  const cacheControl = (source: string) =>
    new Map(
      rules
        .filter((rule) => rule.source === source)
        .flatMap((rule) => rule.headers)
        .map((header) => [header.key, header.value])
    ).get("Cache-Control");

  for (const source of [
    "/api/admin/:path*",
    "/api/cashier/:path*",
    "/api/public/orders/:path*",
    "/api/auth/:path*",
    "/api/pusher/auth",
  ]) {
    assert.equal(
      cacheControl(source),
      "private, no-store",
      `Cache-Control hilang untuk ${source}`
    );
  }
  assert.equal(cacheControl("/api/public/menu"), "no-store");

  // Setiap route handler pada kelompok sensitif harus tercakup aturan.
  const sensitiveDirs = [
    "src/app/api/admin",
    "src/app/api/cashier",
    "src/app/api/public/orders",
    "src/app/api/auth",
    "src/app/api/pusher",
  ];
  const sensitiveSources = new Set(
    rules
      .filter((rule) => rule.headers.some((h) => h.key === "Cache-Control"))
      .map((rule) => rule.source)
  );

  for (const dir of sensitiveDirs) {
    for (const file of routeFiles(dir)) {
      const route = routePath(file);
      if (route === "/api/pusher/auth") {
        assert.ok(sensitiveSources.has(route), `${route} tanpa Cache-Control`);
      } else if (route === "/api/public/menu") {
        continue;
      } else {
        assert.ok(
          [...sensitiveSources].some((source) => matches(source, route)),
          `${route} tidak tercakup aturan Cache-Control`
        );
      }
    }
  }
});
