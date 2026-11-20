import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  validateImage,
  toAvif,
  detectImageMagicBytes,
  IMAGE_PRESETS,
} from "../src/lib/image";
import { getPublicUrl, deleteObject } from "../src/lib/r2";
import { processAndStore } from "../src/server/services/upload";
import { AppError } from "../src/lib/errors";

test("Image Validation & AVIF Processing Suite", async (t) => {
  // Buat sampel gambar PNG uji coba (1600 x 900)
  const validPngBuffer = await sharp({
    create: {
      width: 1600,
      height: 900,
      channels: 3,
      background: { r: 120, g: 80, b: 220 },
    },
  })
    .png()
    .toBuffer();

  // Buat sampel gambar JPEG uji coba (800 x 600)
  const validJpgBuffer = await sharp({
    create: {
      width: 800,
      height: 600,
      channels: 3,
      background: { r: 240, g: 100, b: 50 },
    },
  })
    .jpeg({ quality: 80 })
    .toBuffer();

  await t.test("1. Magic Bytes & Validasi Gambar Sah", async () => {
    // Validasi PNG
    assert.equal(detectImageMagicBytes(validPngBuffer), true);
    const pngMeta = await validateImage(validPngBuffer);
    assert.equal(pngMeta.format, "png");
    assert.equal(pngMeta.width, 1600);
    assert.equal(pngMeta.height, 900);

    // Validasi JPEG
    assert.equal(detectImageMagicBytes(validJpgBuffer), true);
    const jpgMeta = await validateImage(validJpgBuffer);
    assert.equal(jpgMeta.format, "jpeg");
    assert.equal(jpgMeta.width, 800);
    assert.equal(jpgMeta.height, 600);
  });

  await t.test("2. Penolakan Berkas Palsu & Non-Image (Security)", async () => {
    // A. Berkas teks palsu berekstensi .jpg
    const fakeTextFile = Buffer.from("Ini berkas teks rahasia yang berpura-pura menjadi .jpg");
    assert.equal(detectImageMagicBytes(fakeTextFile), false);
    await assert.rejects(
      async () => {
        await validateImage(fakeTextFile);
      },
      (err: Error) => {
        return (
          err instanceof AppError &&
          err.code === "VALIDATION_ERROR" &&
          err.message.includes("Format berkas tidak didukung")
        );
      },
      "Berkas teks palsu harus ditolak"
    );

    // B. Berkas executable biner (MZ header) berpura-pura .png
    const fakeExeFile = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
    assert.equal(detectImageMagicBytes(fakeExeFile), false);
    await assert.rejects(
      async () => {
        await validateImage(fakeExeFile);
      },
      (err: Error) => {
        return (
          err instanceof AppError &&
          err.code === "VALIDATION_ERROR" &&
          err.message.includes("Format berkas tidak didukung")
        );
      },
      "Berkas .exe biner harus ditolak"
    );
  });

  await t.test("3. Penolakan Dimensi Berlebih (> 4096px)", async () => {
    // Buat gambar dengan dimensi lebar 4200px
    const oversizedBuffer = await sharp({
      create: {
        width: 4200,
        height: 100,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .png()
      .toBuffer();

    await assert.rejects(
      async () => {
        await validateImage(oversizedBuffer);
      },
      (err: Error) => {
        return (
          err instanceof AppError &&
          err.code === "VALIDATION_ERROR" &&
          err.message.includes("melebihi batas maksimal 4096x4096px")
        );
      },
      "Dimensi > 4096px wajib ditolak"
    );
  });

  await t.test("4. Konversi toAvif (Output AVIF & Resize Sesuai Batas)", async () => {
    // Uji resize dari lebar 1600px ke batas preset 'product' (1200px)
    const result = await toAvif(validPngBuffer, {
      maxWidth: IMAGE_PRESETS.product.maxWidth,
      quality: IMAGE_PRESETS.product.quality,
    });

    assert.ok(result.buffer.length > 0, "Buffer AVIF harus terbentuk");
    assert.equal(result.info.format, "heif"); // sharp mendeteksi AVIF container sebagai heif
    assert.equal(result.info.width, 1200, "Lebar harus di-resize ke maksimal 1200px");
    assert.equal(
      result.info.height,
      Math.round((900 * 1200) / 1600),
      "Rasio aspek harus dipertahankan secara proporsional"
    );

    // Uji thumbnail (320px)
    const thumbResult = await toAvif(validPngBuffer, {
      maxWidth: IMAGE_PRESETS.product.thumb.maxWidth,
      quality: IMAGE_PRESETS.product.thumb.quality,
    });

    assert.equal(thumbResult.info.width, 320, "Lebar thumbnail harus 320px");
    assert.ok(
      thumbResult.info.size < result.info.size,
      "Ukuran thumbnail harus lebih kecil dari gambar utama"
    );
  });

  await t.test("5. Helper getPublicUrl R2", () => {
    const key = "products/sample123.avif";
    const publicUrl = getPublicUrl(key);
    assert.ok(publicUrl.startsWith(process.env.R2_PUBLIC_BASE_URL!.replace(/\/+$/, "")));
    assert.ok(publicUrl.endsWith(key));
    assert.equal(publicUrl.includes("//products"), false, "Tidak boleh ada double slash");
  });

  await t.test("6. Integrasi Penyimpanan Cloudflare R2 (processAndStore)", async () => {
    const uploadResult = await processAndStore({
      file: validJpgBuffer,
      preset: "product",
      bucket: "public",
      prefix: "test-products",
    });

    assert.ok(uploadResult.key.startsWith("test-products/"));
    assert.ok(uploadResult.key.endsWith(".avif"));
    assert.ok(uploadResult.thumbKey?.endsWith("-thumb.avif"));
    const publicBase = process.env.R2_PUBLIC_BASE_URL!.replace(/\/+$/, "");
    assert.ok(uploadResult.url.startsWith(publicBase));
    assert.ok(uploadResult.thumbUrl?.startsWith(publicBase));
    assert.equal(uploadResult.format, "avif");
    assert.ok(uploadResult.size > 0);

    // Bersihkan objek uji coba di Cloudflare R2
    await deleteObject(process.env.R2_BUCKET_PUBLIC || "scanorder-public", uploadResult.key);
    if (uploadResult.thumbKey) {
      await deleteObject(process.env.R2_BUCKET_PUBLIC || "scanorder-public", uploadResult.thumbKey);
    }
  });

  await t.test("7. Route Handler POST /api/upload/image Proteksi Role", async () => {
    const { POST: uploadHandler } = await import("../src/app/api/upload/image/route");
    const { NextRequest } = await import("next/server");

    // Akses tanpa sesi Super Admin wajib ditolak dengan 401
    const unauthReq = new NextRequest("http://localhost:3000/api/upload/image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preset: "product", contentType: "image/webp", size: 1024 }),
    });

    const res = await uploadHandler(unauthReq);
    assert.equal(res.status, 401, "Pengguna tanpa autentikasi Super Admin harus ditolak 401");
  });
});
