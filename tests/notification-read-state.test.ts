import test from "node:test";
import assert from "node:assert/strict";
import {
  isAlertUnread,
  unreadNotificationTotal,
} from "../src/lib/notification-read-state";

const T1 = "2026-11-21T04:00:00.000Z";
const T2 = "2026-11-21T05:00:00.000Z";

test("S-notif: status baca notifikasi admin", async (t) => {
  await t.test("alert baru tanpa status baca dihitung belum dibaca", () => {
    assert.equal(
      unreadNotificationTotal([
        { id: "awaiting-verification", count: 3, latestAt: T1 },
        { id: "low-stock", count: 2, latestAt: T1, seenAt: null },
      ]),
      5
    );
  });

  await t.test("alert yang sudah dibaca tidak dihitung", () => {
    assert.equal(
      unreadNotificationTotal([
        { id: "awaiting-verification", count: 3, latestAt: T1, seenAt: T1 },
        { id: "low-stock", count: 2, latestAt: T1, seenAt: T2 },
      ]),
      0
    );
  });

  await t.test("aktivitas baru membuka status belum dibaca lagi", () => {
    assert.equal(
      isAlertUnread({
        id: "awaiting-verification",
        count: 4,
        latestAt: T2,
        seenAt: T1,
      }),
      true
    );
    assert.equal(
      unreadNotificationTotal([
        { id: "awaiting-verification", count: 4, latestAt: T2, seenAt: T1 },
        { id: "low-stock", count: 2, latestAt: T1, seenAt: T1 },
      ]),
      4
    );
  });

  await t.test("hitungan turun tanpa aktivitas baru tetap terbaca", () => {
    assert.equal(
      isAlertUnread({
        id: "awaiting-verification",
        count: 1,
        latestAt: T1,
        seenAt: T1,
      }),
      false
    );
  });

  await t.test("menerima Date maupun string ISO", () => {
    assert.equal(
      isAlertUnread({
        id: "low-stock",
        count: 2,
        latestAt: new Date(T2),
        seenAt: new Date(T1),
      }),
      true
    );
  });
});
