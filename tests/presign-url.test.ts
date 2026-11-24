import test from "node:test";
import assert from "node:assert/strict";
import { getSignedPutUrl } from "../src/lib/r2";

// Presigned PUT dipakai browser apa adanya. SDK baru menyisipkan checksum
// body kosong (AAAAAA==) yang membuat unggahan asli ditolak R2.
test("Presigned PUT: tidak menyisipkan checksum body kosong", async () => {
  const url = await getSignedPutUrl(
    "coffeeshop-test-public",
    "products/uji.webp",
    "image/webp"
  );
  const params = new URL(url).searchParams;

  assert.equal(params.get("x-amz-checksum-crc32"), null);
  assert.equal(params.get("x-amz-sdk-checksum-algorithm"), null);
  assert.equal(params.get("X-Amz-SignedHeaders"), "host");
  assert.ok(params.get("X-Amz-Signature"));
});
