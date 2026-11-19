import Link from "next/link";
import { Coffee, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-app px-4 py-12">
      <div className="w-full max-w-md rounded-[20px] border border-border bg-surface p-8 text-center shadow-card">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-700">
          <Coffee className="size-7" />
        </div>
        <p className="text-xs font-semibold tracking-widest text-text-muted">
          404
        </p>
        <h1 className="mt-1 text-xl font-bold text-text-strong">
          Halaman tidak ditemukan
        </h1>
        <p className="mt-2 text-sm text-text-muted">
          Tautan yang Anda buka tidak tersedia, sudah dipindahkan, atau token
          meja tidak valid.
        </p>
        <Button asChild className="mt-6 gap-2">
          <Link href="/">
            <ArrowLeft className="size-4" />
            Kembali ke Beranda
          </Link>
        </Button>
      </div>
    </main>
  );
}
