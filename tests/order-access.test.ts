import test from "node:test";
import assert from "node:assert/strict";
import { timingSafeEqualString } from "../src/lib/order-access";
import {
  evaluateSecretPolicy,
  MIN_CRON_SECRET_LENGTH,
} from "../src/lib/secret-policy";

const STRONG_CRON = "v9Qm2Xr7Lk4Tz8Nb1Wc6Hd3Sf5Ja0Pe7Uy2Ig4Oo";

test("SEC-07: perbandingan constant-time dan CRON_SECRET kuat", async (t) => {
  await t.test("1. Nilai sama, isi beda, dan panjang beda", () => {
    assert.equal(timingSafeEqualString("token-rahasia-128bit", "token-rahasia-128bit"), true);
    assert.equal(timingSafeEqualString("token-rahasia-128bit", "token-rahasia-128biT"), false);
    assert.equal(timingSafeEqualString("pendek", "jauh-lebih-panjang-dari-pendek"), false);
    assert.equal(timingSafeEqualString("", ""), true);
    assert.equal(timingSafeEqualString("", "x"), false);
  });

  await t.test("2. CRON_SECRET di bawah 32 karakter ditolak di production", () => {
    const short = "x".repeat(MIN_CRON_SECRET_LENGTH - 1);
    const production = evaluateSecretPolicy({
      SESSION_SECRET: "q3Nf7Zp2Lx9Wc4Vb8Hm1Kd6Ts0Ry5Ua7Ee2Io4Pg",
      CRON_SECRET: short,
      NODE_ENV: "production",
    });
    assert.equal(production.errors.length, 1);
    assert.match(production.errors[0], /CRON_SECRET wajib minimal 32 karakter/);

    const development = evaluateSecretPolicy({
      SESSION_SECRET: "q3Nf7Zp2Lx9Wc4Vb8Hm1Kd6Ts0Ry5Ua7Ee2Io4Pg",
      CRON_SECRET: short,
      NODE_ENV: "test",
    });
    assert.equal(development.errors.length, 0);
    assert.equal(development.warnings.length, 1);
  });

  await t.test("3. CRON_SECRET 32 karakter acak diterima", () => {
    assert.ok(STRONG_CRON.length >= MIN_CRON_SECRET_LENGTH);
    const result = evaluateSecretPolicy({
      SESSION_SECRET: "q3Nf7Zp2Lx9Wc4Vb8Hm1Kd6Ts0Ry5Ua7Ee2Io4Pg",
      CRON_SECRET: STRONG_CRON,
      NODE_ENV: "production",
    });
    assert.deepEqual(result.errors, []);
  });
});
