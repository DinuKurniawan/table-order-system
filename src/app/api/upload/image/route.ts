import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { processAndStore } from "@/server/services/upload";
import { ImagePresetKey } from "@/lib/image";

const ALLOWED_ADMIN_PRESETS: ImagePresetKey[] = [
  "product",
  "qris",
  "attachment",
];

export async function POST(req: NextRequest) {
  try {
    // 1. Otorisasi: hanya Super Admin yang diizinkan mengunggah via rute ini
    await requireRole(["SUPER_ADMIN"]);

    // 2. Baca multipart/form-data
    const formData = await req.formData();
    const file = formData.get("file");
    const presetParam = formData.get("preset");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Berkas gambar ('file') wajib dilampirkan" },
        { status: 400 }
      );
    }

    const preset = (presetParam as ImagePresetKey) || "product";

    if (!ALLOWED_ADMIN_PRESETS.includes(preset)) {
      return NextResponse.json(
        {
          error: `Preset tidak valid. Preset yang diizinkan: ${ALLOWED_ADMIN_PRESETS.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // 3. Konversi file ke Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 4. Proses dan simpan ke Cloudflare R2
    const result = await processAndStore({
      file: buffer,
      preset,
      bucket: "public",
    });

    return NextResponse.json({
      success: true,
      message: "Gambar berhasil diproses dan disimpan ke format AVIF",
      data: result,
    });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status }
      );
    }

    console.error("API Upload Image Error:", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan pada server saat memproses gambar" },
      { status: 500 }
    );
  }
}
