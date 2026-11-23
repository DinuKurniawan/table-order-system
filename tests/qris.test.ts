import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDynamicQris,
  crc16,
  parseStaticQris,
  withCrc,
} from "../src/lib/qris";

function tlv(tag: string, value: string): string {
  return `${tag}${String(value.length).padStart(2, "0")}${value}`;
}

const STATIC_BODY = [
  tlv("00", "01"),
  tlv("01", "11"),
  tlv("26", "ID.CO.QRIS.WWW"),
  tlv("52", "5812"),
  tlv("53", "360"),
  tlv("58", "ID"),
  tlv("59", "Kopi Uji"),
  tlv("60", "Bandung"),
  tlv("61", "40111"),
].join("");
const STATIC_QRIS = withCrc(STATIC_BODY);

test("QRIS: CRC16-CCITT-FALSE cocok dengan vektor uji", () => {
  assert.equal(crc16("123456789"), "29B1");
});

test("QRIS: payload statis valid terbaca dan CRC terakhir terverifikasi", () => {
  const fields = parseStaticQris(STATIC_QRIS);
  assert.equal(fields.at(-1)?.tag, "63");
  assert.equal(fields.find((field) => field.tag === "01")?.value, "11");
});

test("QRIS: payload dinamis menyisipkan nominal dan mengubah tag 01", () => {
  const dynamic = buildDynamicQris(STATIC_QRIS, 15000);

  assert.ok(dynamic.includes("010212"), "tag 01 harus menjadi 12 (dinamis)");
  assert.ok(dynamic.includes("540515000"), "tag 54 harus berisi nominal");
  assert.equal(
    crc16(dynamic.slice(0, -4)),
    dynamic.slice(-4).toUpperCase(),
    "CRC harus dihitung ulang"
  );
  assert.throws(() => parseStaticQris(dynamic), /statis/);
});

test("QRIS: CRC salah, payload kosong, dan nominal tidak valid ditolak", () => {
  const tampered = `${STATIC_QRIS.slice(0, -4)}0000`;
  assert.throws(() => parseStaticQris(tampered), /CRC/);
  assert.throws(() => parseStaticQris(""), /kosong/);
  assert.throws(() => buildDynamicQris(STATIC_QRIS, 0), /Nominal/);
  assert.throws(() => buildDynamicQris(STATIC_QRIS, 10.5), /Nominal/);
});
