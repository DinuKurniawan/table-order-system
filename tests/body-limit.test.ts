import test from "node:test";
import assert from "node:assert/strict";
import { readJson } from "../src/lib/api";
import { AppError } from "../src/lib/errors";

const encoder = new TextEncoder();

function streamRequest(body: string, declaredLength?: number): Request {
  return new Request("http://localhost:3000/api/uji", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(declaredLength === undefined
        ? {}
        : { "content-length": String(declaredLength) }),
    },
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(body));
        controller.close();
      },
    }),
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

test("SEC-15: readJson membatasi ukuran body", async (t) => {
  await t.test("body di bawah batas lolos", async () => {
    const body = await readJson(streamRequest('{"nama":"uji"}'));
    assert.deepEqual(body, { nama: "uji" });
  });

  await t.test("content-length besar ditolak 413", async () => {
    await assert.rejects(
      () => readJson(streamRequest("{}", 1024), { maxBytes: 100 }),
      (err: unknown) =>
        err instanceof AppError &&
        err.code === "PAYLOAD_TOO_LARGE" &&
        err.status === 413
    );
  });

  await t.test("content-length palsu tetap terblokir saat stream melebihi batas", async () => {
    const large = JSON.stringify({ data: "x".repeat(4096) });
    await assert.rejects(
      () => readJson(streamRequest(large, 2), { maxBytes: 1024 }),
      (err: unknown) =>
        err instanceof AppError &&
        err.code === "PAYLOAD_TOO_LARGE" &&
        err.status === 413
    );
  });

  await t.test("batas default 256 KB", async () => {
    const big = JSON.stringify({ data: "x".repeat(260 * 1024) });
    await assert.rejects(
      () => readJson(streamRequest(big)),
      (err: unknown) =>
        err instanceof AppError && err.code === "PAYLOAD_TOO_LARGE"
    );
  });

  await t.test("checkout publik memakai batas 64 KB", async () => {
    const over = JSON.stringify({ items: "x".repeat(65 * 1024) });
    await assert.rejects(
      () => readJson(streamRequest(over), { maxBytes: 64 * 1024 }),
      (err: unknown) =>
        err instanceof AppError && err.code === "PAYLOAD_TOO_LARGE"
    );
  });
});
