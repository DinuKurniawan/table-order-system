import test from "node:test";
import assert from "node:assert/strict";
import { readFormData } from "../src/lib/api";
import { AppError } from "../src/lib/errors";

const BOUNDARY = "batas-uji";
const encoder = new TextEncoder();

function multipartBody(fileContent: string): string {
  return [
    `--${BOUNDARY}`,
    'Content-Disposition: form-data; name="file"; filename="bukti.txt"',
    "Content-Type: text/plain",
    "",
    fileContent,
    `--${BOUNDARY}--`,
    "",
  ].join("\r\n");
}

function multipartRequest(
  body: string,
  declaredLength?: number,
  contentType = `multipart/form-data; boundary=${BOUNDARY}`
): Request {
  return new Request("http://localhost:3000/api/uji", {
    method: "POST",
    headers: {
      "content-type": contentType,
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

test("N-01: readFormData membatasi body multipart", async (t) => {
  await t.test("multipart valid di bawah batas lolos", async () => {
    const form = await readFormData(multipartRequest(multipartBody("halo")));
    const file = form.get("file");
    assert.ok(file instanceof File);
    assert.equal(await file.text(), "halo");
  });

  await t.test("content-length besar ditolak 413", async () => {
    await assert.rejects(
      () => readFormData(multipartRequest(multipartBody("x"), 2048), { maxBytes: 512 }),
      (err: unknown) =>
        err instanceof AppError &&
        err.code === "PAYLOAD_TOO_LARGE" &&
        err.status === 413
    );
  });

  await t.test("content-length palsu tetap terblokir saat stream melebihi batas", async () => {
    await assert.rejects(
      () => readFormData(multipartRequest(multipartBody("x".repeat(2048)), 2), {
        maxBytes: 512,
      }),
      (err: unknown) =>
        err instanceof AppError && err.code === "PAYLOAD_TOO_LARGE"
    );
  });

  await t.test("content-type bukan multipart ditolak 400", async () => {
    await assert.rejects(
      () =>
        readFormData(
          multipartRequest(multipartBody("x"), undefined, "application/json")
        ),
      (err: unknown) =>
        err instanceof AppError &&
        err.code === "VALIDATION_ERROR" &&
        err.status === 400
    );
  });
});
