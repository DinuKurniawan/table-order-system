import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateSecretPolicy,
  requireSessionSecret,
  KNOWN_EXAMPLE_SECRETS,
} from "../src/lib/secret-policy";

const EXAMPLE_SESSION = "at-least-32-character-random-secret-key-change-this";
const EXAMPLE_CRON = "cron-secret-for-scheduled-worker";
const STRONG = "q3Nf7Zp2Lx9Wc4Vb8Hm1Kd6Ts0Ry5Ua7Ee2Io4Pg";

test("SEC-02: nilai contoh secret ditolak di production", async (t) => {
  await t.test("1. Nilai contoh .env.example lama gagal di production", () => {
    assert.ok(KNOWN_EXAMPLE_SECRETS.has(EXAMPLE_SESSION));
    assert.ok(KNOWN_EXAMPLE_SECRETS.has(EXAMPLE_CRON));

    const result = evaluateSecretPolicy({
      SESSION_SECRET: EXAMPLE_SESSION,
      CRON_SECRET: EXAMPLE_CRON,
      NODE_ENV: "production",
    });

    assert.equal(result.warnings.length, 0);
    assert.equal(result.errors.length, 2);
    assert.ok(result.errors.every((message) => /nilai contoh/.test(message)));
  });

  await t.test("2. Nilai contoh hanya diperingatkan di development/test", () => {
    const result = evaluateSecretPolicy({
      SESSION_SECRET: EXAMPLE_SESSION,
      CRON_SECRET: EXAMPLE_CRON,
      NODE_ENV: "development",
    });

    assert.equal(result.errors.length, 0);
    assert.equal(result.warnings.length, 2);
  });

  await t.test("3. Placeholder .env.example baru ditolak di production", () => {
    const result = evaluateSecretPolicy({
      SESSION_SECRET: "GANTI_DENGAN_HASIL_PERINTAH_DI_README",
      CRON_SECRET: "GANTI_DENGAN_HASIL_PERINTAH_DI_README",
      NODE_ENV: "production",
    });
    assert.equal(result.errors.length, 2);
  });

  await t.test("4. Secret acak kuat diterima tanpa peringatan", () => {
    const result = evaluateSecretPolicy({
      SESSION_SECRET: STRONG,
      CRON_SECRET: `${STRONG}x`,
      NODE_ENV: "production",
    });
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.warnings, []);
  });

  await t.test("5. Entropi rendah ditolak di production", () => {
    const result = evaluateSecretPolicy({
      SESSION_SECRET: "a".repeat(48),
      CRON_SECRET: "abcdabcdabcdabcdabcdabcdabcdabcd",
      NODE_ENV: "production",
    });
    assert.equal(result.errors.length, 2);
    assert.ok(result.errors.every((message) => /terlalu lemah/.test(message)));
  });

  await t.test("6. Proxy fail-closed bila SESSION_SECRET tidak ada", () => {
    const saved = process.env.SESSION_SECRET;
    delete process.env.SESSION_SECRET;
    try {
      assert.throws(
        () => requireSessionSecret(),
        /SESSION_SECRET wajib diisi/
      );
    } finally {
      process.env.SESSION_SECRET = saved;
    }
    assert.equal(requireSessionSecret(STRONG).length, STRONG.length);
  });
});
