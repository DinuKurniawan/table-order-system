"use client";

import { apiErrorMessage } from "@/lib/api-error";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Coffee, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function ChangePasswordForm({ username }: { username: string }) {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (newPassword !== confirmPassword) {
      setErrorMessage("Konfirmasi password tidak cocok.");
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(
          apiErrorMessage(data, "Gagal mengubah password. Silakan coba lagi.")
        );
        setIsLoading(false);
        return;
      }

      setSuccessMessage(
        "Password berhasil diubah. Mengarahkan ke halaman login..."
      );
      setTimeout(() => {
        router.replace("/login");
        router.refresh();
      }, 1200);
    } catch {
      setErrorMessage("Koneksi gagal. Periksa jaringan Anda dan coba lagi.");
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-app">
      <div className="w-full max-w-md">
        <Card className="rounded-[20px] border-border bg-surface shadow-card overflow-hidden">
          <div className="bg-primary-800 p-6 text-center text-white">
            <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-white/10">
              <Coffee className="size-6 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">Ganti Password</h1>
            <p className="mt-1 text-xs text-primary-200">
              Wajib diganti sebelum memakai portal staf
            </p>
          </div>

          <CardHeader className="pt-6 pb-4">
            <CardTitle className="text-xl font-semibold text-text-strong">
              Password Baru
            </CardTitle>
            <CardDescription className="mt-1 text-xs text-text-muted">
              Akun <span className="font-medium">{username}</span> memakai
              password awal. Buat password unik minimal 12 karakter.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {errorMessage && (
              <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm font-medium text-destructive">
                {errorMessage}
              </div>
            )}
            {successMessage && (
              <div className="rounded-xl border border-primary-200 bg-primary-50 p-3 text-sm font-medium text-primary-800">
                {successMessage}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="currentPassword" className="text-xs font-semibold text-text">
                  Password Saat Ini
                </Label>
                <Input
                  id="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  required
                  disabled={isLoading}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="h-11 rounded-xl bg-surface-muted"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="newPassword" className="text-xs font-semibold text-text">
                  Password Baru
                </Label>
                <Input
                  id="newPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  disabled={isLoading}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="h-11 rounded-xl bg-surface-muted"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword" className="text-xs font-semibold text-text">
                  Ulangi Password Baru
                </Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  disabled={isLoading}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="h-11 rounded-xl bg-surface-muted"
                />
              </div>

              <Button
                type="submit"
                disabled={isLoading || Boolean(successMessage)}
                className="h-11 w-full rounded-xl text-sm font-medium"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Menyimpan...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="mr-2 size-4" />
                    Simpan Password Baru
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
