import test from "node:test";
import assert from "node:assert/strict";
import { validateEnv } from "../src/lib/env";

function baseEnv(): NodeJS.ProcessEnv {
  return { ...process.env, SKIP_ENV_VALIDATION: "" };
}

test("SEC-10: bucket privat dan publik tidak boleh sama", () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    const base = baseEnv();
    assert.ok(base.R2_BUCKET_PUBLIC && base.R2_BUCKET_PRIVATE);

    assert.throws(
      () =>
        validateEnv({
          ...base,
          R2_BUCKET_PRIVATE: base.R2_BUCKET_PUBLIC,
        }),
      /R2_BUCKET_PRIVATE/
    );

    const valid = validateEnv(base);
    assert.notEqual(valid.R2_BUCKET_PRIVATE, valid.R2_BUCKET_PUBLIC);
  } finally {
    console.error = originalError;
  }
});
