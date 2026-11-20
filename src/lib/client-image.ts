"use client";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export type ClientUploadPreset = "product" | "proof" | "qris" | "attachment";

const PRESET_MAX_WIDTH: Record<ClientUploadPreset, number> = {
  product: 1200,
  qris: 1000,
  proof: 1600,
  attachment: 1600,
};

const THUMB_MAX_WIDTH = 320;

type ImageSource = ImageBitmap | HTMLImageElement;

async function loadImage(file: File): Promise<ImageSource> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      // jatuh ke jalur <img> untuk format yang tidak didukung createImageBitmap
    }
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Gambar tidak dapat dibaca browser"));
    };
    img.src = url;
  });
}

function drawScaled(source: ImageSource, maxWidth: number): HTMLCanvasElement {
  const width = source.width;
  const height = source.height;
  const scale = maxWidth > 0 && width > maxWidth ? maxWidth / width : 1;

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas tidak tersedia di browser ini");
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function canvasToBlob(
  canvas: HTMLCanvasElement,
  quality: number
): Promise<Blob> {
  const webp = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", quality)
  );
  if (webp && webp.type === "image/webp") return webp;

  const jpeg = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality)
  );
  if (!jpeg) throw new Error("Gagal mengompres gambar");
  return jpeg;
}

export interface PreparedImage {
  blob: Blob;
  thumb?: Blob;
}

/**
 * Kompresi di browser sebelum direct upload. Hasilnya WebP (fallback JPEG),
 * maksimal 10 MB, dengan thumbnail 320px untuk produk.
 */
export async function prepareImageUpload(
  file: File,
  preset: ClientUploadPreset
): Promise<PreparedImage> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Berkas harus berupa gambar");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("Ukuran gambar melebihi batas maksimal 10 MB");
  }

  const source = await loadImage(file);
  const blob = await canvasToBlob(
    drawScaled(source, PRESET_MAX_WIDTH[preset]),
    0.78
  );

  const thumb =
    preset === "product"
      ? await canvasToBlob(drawScaled(source, THUMB_MAX_WIDTH), 0.7)
      : undefined;

  if ("close" in source) source.close();
  return { blob, thumb };
}

/** PUT berkas ke presigned URL R2. Content-Type wajib sama dengan saat ditandatangani. */
export async function putToPresignedUrl(
  uploadUrl: string,
  blob: Blob
): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": blob.type },
    body: blob,
  });

  if (!res.ok) {
    throw new Error(`Unggah ke penyimpanan gagal (${res.status})`);
  }
}
