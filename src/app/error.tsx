"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Detail error tidak dikirim ke klien; cukup catat digest untuk korelasi log server.
    if (error.digest) {
      console.error("Client error digest:", error.digest);
    }
  }, [error.digest]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-app px-4 py-12">
      <div className="w-full max-w-md rounded-[20px] border border-border bg-surface p-8 text-center shadow-card">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-accent-red/10 text-accent-red">
          <AlertTriangle className="size-7" />
        </div>
        <h1 className="text-xl font-bold text-text-strong">
          Terjadi kesalahan
        </h1>
        <p className="mt-2 text-sm text-text-muted">
          Halaman gagal dimuat. Silakan coba lagi. Bila masalah berulang,
          hubungi admin dengan kode referensi{" "}
          <span className="font-mono text-xs">
            {error.digest ?? "tanpa-kode"}
          </span>
          .
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button onClick={reset} className="gap-2">
            <RotateCcw className="size-4" />
            Coba Lagi
          </Button>
          <Button asChild variant="outline">
            <Link href="/">Kembali ke Beranda</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
