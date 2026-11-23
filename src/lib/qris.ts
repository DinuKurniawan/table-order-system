/**
 * Payload QRIS statis (EMVCo TLV) menjadi payload dinamis dengan nominal.
 * Dipakai untuk validasi input admin dan render QR di halaman bayar.
 */

export interface QrisField {
  tag: string;
  value: string;
}

function parseTlv(payload: string): QrisField[] {
  const fields: QrisField[] = [];
  let cursor = 0;

  while (cursor < payload.length) {
    const tag = payload.slice(cursor, cursor + 2);
    const length = Number(payload.slice(cursor + 2, cursor + 4));
    if (!/^\d{2}$/.test(tag) || !Number.isInteger(length)) {
      throw new Error("Struktur TLV QRIS tidak valid");
    }

    const start = cursor + 4;
    const value = payload.slice(start, start + length);
    if (value.length !== length) {
      throw new Error("Panjang nilai TLV QRIS tidak cocok");
    }

    fields.push({ tag, value });
    cursor = start + length;
  }

  return fields;
}

function serialize(fields: QrisField[]): string {
  return fields
    .map(({ tag, value }) => {
      if (value.length > 99) {
        throw new Error("Nilai TLV QRIS terlalu panjang");
      }
      return `${tag}${String(value.length).padStart(2, "0")}${value}`;
    })
    .join("");
}

/** CRC-16/CCITT-FALSE, vektor uji: "123456789" -> "29B1". */
export function crc16(input: string): string {
  let crc = 0xffff;
  for (let index = 0; index < input.length; index += 1) {
    crc ^= input.charCodeAt(index) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function withCrc(body: string): string {
  const data = `${body}6304`;
  return `${data}${crc16(data)}`;
}

/** Validasi payload statis: tag wajib, bukan payload dinamis, CRC cocok. */
export function parseStaticQris(payload: string): QrisField[] {
  const clean = payload.trim();
  if (!clean) {
    throw new Error("Payload QRIS kosong");
  }

  const fields = parseTlv(clean);
  const byTag = new Map(fields.map((field) => [field.tag, field.value]));

  if (byTag.get("00") !== "01") {
    throw new Error("Payload QRIS harus diawali tag 00 = 01");
  }
  if (byTag.get("01") !== "11") {
    throw new Error("Payload QRIS harus statis (tag 01 = 11)");
  }
  if (byTag.get("53") !== "360") {
    throw new Error("Mata uang QRIS harus IDR (tag 53 = 360)");
  }
  if (byTag.get("58") !== "ID") {
    throw new Error("Negara QRIS harus ID (tag 58 = ID)");
  }

  const crc = fields[fields.length - 1];
  if (!crc || crc.tag !== "63" || !/^[0-9A-Fa-f]{4}$/.test(crc.value)) {
    throw new Error("CRC QRIS tidak ditemukan");
  }
  if (crc16(clean.slice(0, -4)).toUpperCase() !== crc.value.toUpperCase()) {
    throw new Error("CRC QRIS tidak cocok");
  }

  return fields;
}

/** Sisipkan nominal ke payload statis dan hitung ulang CRC. */
export function buildDynamicQris(staticPayload: string, amount: number): string {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error("Nominal QRIS tidak valid");
  }

  const fields = parseStaticQris(staticPayload)
    .filter((field) => field.tag !== "54" && field.tag !== "63")
    .map((field) => (field.tag === "01" ? { tag: "01", value: "12" } : field));

  const currencyIndex = fields.findIndex((field) => field.tag === "58");
  fields.splice(currencyIndex === -1 ? fields.length : currencyIndex, 0, {
    tag: "54",
    value: String(amount),
  });

  return withCrc(serialize(fields));
}
