import test from "node:test";
import assert from "node:assert/strict";
import { parseSizePrices, priceForSize } from "../src/lib/size-pricing";

test("harga size memakai data admin dengan fallback harga dasar", () => {
  const prices = parseSizePrices({ LARGE: 34000, JUMBO: 40000 });

  assert.equal(priceForSize(28000, prices, "REGULER"), 28000);
  assert.equal(priceForSize(28000, prices, "LARGE"), 34000);
  assert.equal(priceForSize(28000, prices, "JUMBO"), 40000);
  assert.equal(priceForSize(28000, null, "LARGE"), 28000, "tanpa data admin = harga dasar");
  assert.equal(priceForSize(28000, { LARGE: 30000 }, "JUMBO"), 28000);
});

test("sizePrices invalid diabaikan", () => {
  assert.equal(parseSizePrices({ LARGE: -1 }), null);
  assert.equal(parseSizePrices({}), null);
  assert.equal(parseSizePrices("bukan objek"), null);
});
