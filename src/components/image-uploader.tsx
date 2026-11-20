"use client";

import { apiErrorMessage } from "@/lib/api-error";
import * as React from "react";
import { UploadCloud, X, Loader2, Sparkles, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { prepareImageUpload, putToPresignedUrl } from "@/lib/client-image";

interface PresignResponse {
  data: {
    key: string;
    url: string;
    thumbKey?: string;
    uploads: Array<{ kind: "main" | "thumb"; key: string; uploadUrl: string }>;
  };
}

export interface ImageUploaderProps {
  value?: string | null;
  onChange: (url: string, key?: string, thumbKey?: string) => void;
  preset?: "product" | "qris" | "attachment";
  className?: string;
  label?: string;
  disabled?: boolean;
}

export function ImageUploader({
  value,
  onChange,
  preset = "product",
  className,
  label,
  disabled = false,
}: ImageUploaderProps) {
  const [localPreview, setLocalPreview] = React.useState<string | null>(null);
  const [isUploading, setIsUploading] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState<string | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const previewUrl = localPreview ?? value ?? null;

  const validateAndUpload = async (file: File) => {
    setErrorMessage(null);

    // Validasi tipe berkas
    if (!file.type.startsWith("image/")) {
      setErrorMessage("Berkas harus berupa gambar (JPEG, PNG, WEBP, GIF, dll).");
      return;
    }

    // Validasi batas ukuran maksimum 10 MB
    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage("Ukuran gambar melebihi batas maksimal 10 MB.");
      return;
    }

    // Buat pratinjau lokal instan
    const previewBlobUrl = URL.createObjectURL(file);
    setLocalPreview(previewBlobUrl);
    setIsUploading(true);

    try {
      setUploadProgress("Mengoptimasi gambar...");
      const prepared = await prepareImageUpload(file, preset);

      setUploadProgress("Menyiapkan tautan unggah...");
      const body: Record<string, unknown> = {
        preset,
        contentType: prepared.blob.type,
        size: prepared.blob.size,
      };
      if (prepared.thumb) {
        body.thumb = {
          contentType: prepared.thumb.type,
          size: prepared.thumb.size,
        };
      }

      const res = await fetch("/api/upload/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = (await res.json()) as PresignResponse & {
        error?: { message?: string };
      };

      if (!res.ok) {
        throw new Error(apiErrorMessage(json, "Gagal menyiapkan unggahan gambar"));
      }

      setUploadProgress("Mengunggah ke Cloudflare R2...");
      const main = json.data.uploads.find((upload) => upload.kind === "main");
      const thumb = json.data.uploads.find((upload) => upload.kind === "thumb");
      if (!main) throw new Error("Tautan unggah tidak tersedia");

      await putToPresignedUrl(main.uploadUrl, prepared.blob);
      if (thumb && prepared.thumb) {
        await putToPresignedUrl(thumb.uploadUrl, prepared.thumb);
      }

      setLocalPreview(null);
      onChange(json.data.url, json.data.key, json.data.thumbKey);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat mengunggah";
      setErrorMessage(msg);
      setLocalPreview(null);
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      validateAndUpload(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled || isUploading) return;

    const file = e.dataTransfer.files?.[0];
    if (file) {
      validateAndUpload(file);
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    setLocalPreview(null);
    onChange("", "", "");
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className={cn("space-y-2", className)}>
      {label && (
        <label className="block text-xs font-semibold text-text-strong">
          {label}
        </label>
      )}

      <div
        onClick={() => !disabled && !isUploading && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled && !isUploading) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "group relative flex min-h-[170px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-4 text-center transition-all duration-200 overflow-hidden",
          isDragging
            ? "border-primary-600 bg-primary-50/60"
            : "border-border bg-surface-muted/60 hover:bg-surface-muted hover:border-primary-400/70",
          disabled && "cursor-not-allowed opacity-60",
          previewUrl && "p-2 border-solid border-border bg-surface"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
          disabled={disabled || isUploading}
        />

        {previewUrl ? (
          <div className="relative size-full min-h-[160px] flex items-center justify-center">
            {/* Pratinjau gambar */}
            <div className="relative size-40 overflow-hidden rounded-xl border border-border shadow-xs">
              {/* eslint-disable-next-line @next/next/no-img-element -- pratinjau bisa berupa blob: URL lokal */}
              <img
                src={previewUrl}
                alt="Pratinjau gambar"
                className="size-full object-cover"
              />
            </div>

            {/* Tombol hapus */}
            {!disabled && !isUploading && (
              <Button
                type="button"
                variant="destructive"
                size="icon"
                onClick={handleRemove}
                className="absolute top-1 right-1 size-7 rounded-full shadow-md"
                title="Hapus gambar"
              >
                <X className="size-4" />
              </Button>
            )}

            {/* Overlay saat sedang upload */}
            {isUploading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl bg-black/60 text-white backdrop-blur-xs p-3">
                <Loader2 className="size-6 animate-spin text-primary-200 mb-2" />
                <span className="text-xs font-medium text-center">
                  {uploadProgress || "Mengunggah..."}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-4 px-2">
            <div
              className={cn(
                "flex size-12 items-center justify-center rounded-2xl bg-primary-50 text-primary-700 mb-3 transition-transform group-hover:scale-105",
                isUploading && "animate-pulse"
              )}
            >
              {isUploading ? (
                <Loader2 className="size-6 animate-spin" />
              ) : (
                <UploadCloud className="size-6" />
              )}
            </div>

            <div className="text-xs font-semibold text-text-strong">
              {isUploading
                ? uploadProgress || "Memproses berkas..."
                : "Klik atau seret gambar ke sini"}
            </div>

            <p className="text-[11px] text-text-muted mt-1 max-w-xs">
              Mendukung JPEG, PNG, WEBP, GIF (Maks. 10 MB)
            </p>

            <div className="mt-3 flex items-center gap-1.5">
              <Badge
                variant="outline"
                className="bg-primary-50 text-primary-800 border-primary-200/50 text-[10px] font-medium gap-1 py-0.5"
              >
                <Sparkles className="size-3 text-primary-600" />
                Dioptimalkan otomatis (WebP)
              </Badge>
            </div>
          </div>
        )}
      </div>

      {/* Tampilan pesan error */}
      {errorMessage && (
        <div className="flex items-center gap-1.5 text-xs text-destructive font-medium mt-1.5">
          <AlertCircle className="size-3.5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
}
