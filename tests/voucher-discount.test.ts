import test from "node:test";
import assert from "node:assert/strict";
import { computeVoucherDiscount } from "../src/lib/voucher-discount";
import {
  generateVoucherCode,
  normalizeVoucherCode,
  voucherCodeSchema,
} from "../src/lib/voucher-code";

test("Voucher: diskon persen dibatasi maxDiscount dan subtotal", () => {
  assert.equal(
    computeVoucherDiscount(
      { type: "PERCENT", value: 20, maxDiscount: 10_000 },
      50_000
    ),
    10_000
  );
  assert.equal(
    computeVoucherDiscount(
      { type: "PERCENT", value: 20, maxDiscount: null },
      12_345
    ),
    2_469
  );
  assert.equal(
    computeVoucherDiscount(
      { type: "PERCENT", value: 100, maxDiscount: null },
      7_500
    ),
    7_500
  );
});

test("Voucher: diskon nominal tidak pernah negatif atau melebihi subtotal", () => {
  assert.equal(
    computeVoucherDiscount({ type: "FIXED", value: 25_000, maxDiscount: null }, 40_000),
    25_000
  );
  assert.equal(
    computeVoucherDiscount({ type: "FIXED", value: 25_000, maxDiscount: null }, 10_000),
    10_000
  );
  assert.equal(
    computeVoucherDiscount({ type: "FIXED", value: 1_000, maxDiscount: null }, 0),
    0
  );
});

test("Voucher: kode dinormalisasi dan hasil generate sesuai alfabet", () => {
  assert.equal(normalizeVoucherCode("  kopi20 "), "KOPI20");
  assert.equal(voucherCodeSchema.parse(" kopi20 "), "KOPI20");

  for (let index = 0; index < 50; index++) {
    const code = generateVoucherCode();
    assert.match(code, /^[A-HJ-NP-Z2-9]{8}$/);
    assert.doesNotMatch(code, /[IO01]/);
  }
});
