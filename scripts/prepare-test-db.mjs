import { spawnSync } from "node:child_process";

const host = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? "").hostname;
  } catch {
    return "";
  }
})();

if (host !== "localhost" && host !== "127.0.0.1") {
  console.error(
    "DATABASE_URL di .env.test harus menunjuk ke PostgreSQL lokal (bukan produksi)."
  );
  process.exit(1);
}

for (const args of [
  ["migrate", "deploy"],
  ["db", "seed"],
]) {
  const result = spawnSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["prisma", ...args],
    { env: process.env, stdio: "inherit" }
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}
