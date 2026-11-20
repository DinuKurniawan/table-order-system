import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  detectImageMagicBytes,
  MAX_IMAGE_SIZE_BYTES,
  toAvif,
} from "@/lib/image";
import { hashPassword, verifyPassword, authorizeRole } from "@/lib/auth";
import type { SafeUser } from "@/lib/auth";
import { Role } from "@prisma/client";

describe("pipeline AVIF", () => {
  it("mengonversi PNG ke AVIF dan mengecilkan lebar", async () => {
    const png = await sharp({
      create: {
        width: 2000,
        height: 1000,
        channels: 3,
        background: { r: 20, g: 120, b: 90 },
      },
    })
      .png()
      .toBuffer();

    expect(detectImageMagicBytes(png)).toBe(true);

    const { buffer, info } = await toAvif(png, {
      maxWidth: 800,
      quality: 55,
    });

    expect(info.format).toBe("heif");
    expect(info.width).toBe(800);
    expect(buffer.subarray(4, 8).toString("ascii")).toBe("ftyp");
    const meta = await sharp(buffer).metadata();
    expect(meta.format).toBe("heif");
    expect(meta.width).toBe(800);
    expect(buffer.length).toBeLessThan(png.length);
  });

  it("menolak buffer non-gambar", () => {
    expect(detectImageMagicBytes(Buffer.from("bukan gambar"))).toBe(false);
    expect(MAX_IMAGE_SIZE_BYTES).toBe(10 * 1024 * 1024);
  });
});

describe("auth", () => {
  it("hash argon2id memverifikasi password benar dan menolak yang salah", async () => {
    const hash = await hashPassword("Rahasia123!");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword("Rahasia123!", hash)).toBe(true);
    expect(await verifyPassword("salah", hash)).toBe(false);
    expect(await verifyPassword("Rahasia123!", "bukan-hash")).toBe(false);
  });

  it("otorisasi role menolak tamu dan role yang tidak diizinkan", () => {
    const user = {
      id: "u1",
      name: "Kasir",
      username: "kasir",
      role: "CASHIER",
      isActive: true,
      tokenVersion: 1,
      mustChangePassword: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as SafeUser;

    expect(() => authorizeRole(null, [Role.SUPER_ADMIN])).toThrowError(
      /Sesi Anda tidak valid/
    );
    expect(() => authorizeRole(user, [Role.SUPER_ADMIN])).toThrowError(
      /hak akses/
    );
    expect(authorizeRole(user, [Role.CASHIER])).toBe(user);
  });
});
