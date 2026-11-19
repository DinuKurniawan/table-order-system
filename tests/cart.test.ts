import test from "node:test";
import assert from "node:assert/strict";
import { parseStoredCart } from "../src/lib/cart";

test("R-04: keranjang localStorage divalidasi sebelum dipakai", () => {
  assert.deepEqual(parseStoredCart(null), {});
  assert.deepEqual(parseStoredCart("bukan json"), {});
  assert.deepEqual(parseStoredCart(JSON.stringify({ items: null })), {});
  assert.deepEqual(
    parseStoredCart(
      JSON.stringify({
        items: { p1: { productId: "p1", price: 1000, quantity: -2 } },
      })
    ),
    {},
    "quantity negatif harus ditolak"
  );

  const valid = {
    p1: { productId: "p1", name: "Kopi", price: 15000, quantity: 2 },
  };
  assert.deepEqual(parseStoredCart(JSON.stringify({ items: valid })), valid);

  // Field berlebih dari localStorage lama tidak ikut disimpan.
  const cleaned = parseStoredCart(
    JSON.stringify({
      items: {
        p1: {
          productId: "p1",
          name: "Kopi",
          price: 15000,
          quantity: 2,
          injected: "<script>",
        },
      },
    })
  );
  assert.deepEqual(cleaned, valid);
});
