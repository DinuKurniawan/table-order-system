"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Ditampilkan saat cookie sesi masih ada tetapi ditolak database
 * (akun dinonaktifkan atau password direset).
 */
export function SessionEnded() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function handleLogout() {
    setPending(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace("/login");
    }
  }

  return (
    <div className="min-h-screen bg-app flex items-center justify-center p-6">
      <div className="max-w-sm space-y-4 text-center">
        <div className="mx-auto size-12 rounded-2xl bg-accent-red/10 text-accent-red flex items-center justify-center">
          <ShieldAlert className="size-6" />
        </div>
        <h1 className="text-lg font-bold text-text-strong">Sesi Anda telah berakhir</h1>
        <p className="text-sm text-text-muted">
          Akun ini dinonaktifkan atau password-nya telah direset. Silakan login kembali dengan
          kredensial terbaru.
        </p>
        <Button onClick={handleLogout} disabled={pending} className="rounded-xl">
          {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
          Keluar dan Login Ulang
        </Button>
      </div>
    </div>
  );
}
