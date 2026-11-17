"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Coffee, Eye, EyeOff, Loader2, Lock, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data.error || "Gagal masuk ke sistem. Silakan coba lagi.");
        setIsLoading(false);
        return;
      }

      // Berhasil login: arahkan sesuai role dari respons API
      router.push(data.redirectUrl || "/admin");
      router.refresh();
    } catch {
      setErrorMessage("Koneksi gagal. Periksa jaringan Anda dan coba lagi.");
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-app">
      <div className="w-full max-w-md">
        <Card className="rounded-[20px] border-border bg-surface shadow-card overflow-hidden">
          <div className="bg-primary-800 p-6 text-white text-center">
            <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-white/10 text-white backdrop-blur-sm">
              <Coffee className="size-6 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">Kedai Kopi Selaras</h1>
            <p className="text-xs text-primary-200 mt-1">
              Portal Staf — Super Admin & Kasir
            </p>
          </div>

          <CardHeader className="pt-6 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl font-semibold text-text-strong">
                  Masuk ke Akun
                </CardTitle>
                <CardDescription className="text-xs text-text-muted mt-1">
                  Masukkan nama pengguna dan kata sandi Anda
                </CardDescription>
              </div>
              <Badge variant="secondary" className="bg-primary-50 text-primary-800 text-[11px] font-medium border-none">
                Akses Terproteksi
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {errorMessage && (
              <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive font-medium flex items-center gap-2">
                <span className="text-base leading-none">⚠️</span>
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="username" className="text-xs font-semibold text-text">
                  Nama Pengguna
                </Label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-text-muted pointer-events-none" />
                  <Input
                    id="username"
                    type="text"
                    required
                    disabled={isLoading}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Masukkan username"
                    className="pl-9 rounded-xl border-border bg-surface-muted focus-visible:ring-primary-600 h-10 text-sm"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-xs font-semibold text-text">
                    Kata Sandi
                  </Label>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-text-muted pointer-events-none" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    disabled={isLoading}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Masukkan kata sandi"
                    className="pl-9 pr-10 rounded-xl border-border bg-surface-muted focus-visible:ring-primary-600 h-10 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-strong transition-colors"
                  >
                    {showPassword ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-10 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-medium text-sm transition-colors shadow-sm"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Memeriksa Kredensial...
                  </>
                ) : (
                  "Masuk"
                )}
              </Button>
            </form>

            <div className="pt-2 text-center text-xs text-text-muted">
              Lupa kata sandi? Hubungi Super Admin kafe.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
