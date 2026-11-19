"use client";

import { apiErrorMessage } from "@/lib/api-error";
import * as React from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AccessForm({
  code,
  invalid = false,
}: {
  code: string;
  invalid?: boolean;
}) {
  const router = useRouter();
  const [token, setToken] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(
    invalid ? "Kode akses tidak valid. Silakan masukkan ulang." : null
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!token.trim()) {
      setError("Kode akses wajib diisi.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/public/orders/${code}/access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim() }),
      });
      const json = await res.json();

      if (!res.ok) {
        setError(apiErrorMessage(json, "Kode akses salah."));
        return;
      }

      router.refresh();
    } catch {
      setError("Terjadi kesalahan. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-[20px] border border-border bg-surface p-6 shadow-card sm:p-8">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-primary-50 text-primary-700">
        <KeyRound className="size-6" />
      </div>

      <h1 className="mt-4 text-xl font-bold text-text-strong">
        Masukkan kode akses
      </h1>
      <p className="mt-1 text-sm text-text-muted">
        Halaman pesanan <span className="font-mono font-semibold">{code}</span>{" "}
        dilindungi. Masukkan kode akses yang Anda terima saat memesan.
      </p>

      <form onSubmit={submit} className="mt-5 space-y-3">
        <Input
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder="Kode akses pesanan"
          autoComplete="off"
          autoFocus
          disabled={loading}
        />

        {error && (
          <p className="flex items-center gap-1.5 text-xs font-medium text-destructive">
            <AlertCircle className="size-3.5 shrink-0" /> {error}
          </p>
        )}

        <Button type="submit" className="h-11 w-full" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Memeriksa...
            </>
          ) : (
            "Buka Pesanan"
          )}
        </Button>
      </form>
    </div>
  );
}
