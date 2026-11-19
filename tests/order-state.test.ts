import test from "node:test";
import assert from "node:assert/strict";
import {
  CANCELLABLE_BY_ADMIN,
  CANCELLABLE_BY_CUSTOMER,
  HISTORY_STATUSES,
  PROCESSING_STATUSES,
  canAdvance,
  isProgressStatus,
} from "../src/server/domain/order-state";

test("S-06: state machine pesanan satu sumber kebenaran", () => {
  assert.equal(canAdvance("ACCEPTED", "PREPARING"), true);
  assert.equal(canAdvance("PREPARING", "READY"), true);
  assert.equal(canAdvance("READY", "COMPLETED"), true);

  assert.equal(canAdvance("ACCEPTED", "READY"), false, "lompat status ditolak");
  assert.equal(canAdvance("PREPARING", "ACCEPTED"), false, "mundur ditolak");
  assert.equal(canAdvance("COMPLETED", "PREPARING"), false);

  assert.equal(isProgressStatus("READY"), true);
  assert.equal(isProgressStatus("AWAITING_VERIFICATION"), false);

  assert.deepEqual(PROCESSING_STATUSES, ["ACCEPTED", "PREPARING"]);
  assert.deepEqual(HISTORY_STATUSES, [
    "COMPLETED",
    "PAYMENT_REJECTED",
    "CANCELLED",
  ]);
  assert.ok(CANCELLABLE_BY_CUSTOMER.includes("AWAITING_PAYMENT"));
  assert.ok(!CANCELLABLE_BY_CUSTOMER.includes("ACCEPTED"));
  assert.ok(CANCELLABLE_BY_ADMIN.includes("COMPLETED"));
  assert.ok(!CANCELLABLE_BY_ADMIN.includes("AWAITING_PAYMENT"));
});
