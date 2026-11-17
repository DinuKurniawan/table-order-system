"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Loader2, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface AuthHeaderProps {
  userName: string;
  role: "SUPER_ADMIN" | "CASHIER";
  title: string;
}

export function AuthHeader({ userName, role, title }: AuthHeaderProps) {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch {
      setIsLoggingOut(false);
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-border bg-surface px-6 shadow-sm">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold text-text-strong">{title}</h1>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-full bg-primary-50 text-primary-700">
            <UserIcon className="size-4" />
          </div>
          <div className="hidden sm:block text-left">
            <div className="text-xs font-semibold text-text-strong leading-tight">
              {userName}
            </div>
            <Badge
              variant="outline"
              className="mt-0.5 border-none px-1.5 py-0 text-[10px] font-medium bg-primary-50 text-primary-800"
            >
              {role === "SUPER_ADMIN" ? "Super Admin" : "Kasir"}
            </Badge>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="rounded-xl border-border hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 text-xs gap-1.5 h-8"
        >
          {isLoggingOut ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <LogOut className="size-3.5" />
          )}
          Keluar
        </Button>
      </div>
    </header>
  );
}
