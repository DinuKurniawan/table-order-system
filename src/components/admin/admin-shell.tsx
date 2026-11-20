"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Boxes,
  Coffee,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Menu,
  QrCode,
  Search,
  Settings,
  ScrollText,
  Users,
  UtensilsCrossed,
  Wallet,
  Loader2,
  LucideIcon,
} from "lucide-react";
import { SafeUser } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ConnectionIndicator } from "@/components/admin/connection-indicator";
import { NotificationBell } from "@/components/admin/notification-bell";

interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
}

const navItems: NavItem[] = [
  {
    title: "Ringkasan",
    href: "/admin",
    icon: LayoutDashboard,
  },
  {
    title: "Menu",
    href: "/admin/menu",
    icon: UtensilsCrossed,
  },
  {
    title: "Kasir",
    href: "/admin/cashiers",
    icon: Users,
  },
  {
    title: "Stok",
    href: "/admin/stock",
    icon: Boxes,
  },
  {
    title: "Keuangan",
    href: "/admin/finance",
    icon: Wallet,
  },
  {
    title: "Meja & Barcode",
    href: "/admin/tables",
    icon: QrCode,
  },
  {
    title: "Pengaturan",
    href: "/admin/settings",
    icon: Settings,
  },
  {
    title: "Log Audit",
    href: "/admin/settings/audit",
    icon: ScrollText,
  },
];

const pageTitles: Record<string, string> = {
  "/admin": "Ringkasan",
  "/admin/menu": "Menu & Produk",
  "/admin/cashiers": "Kelola Kasir",
  "/admin/stock": "Manajemen Stok",
  "/admin/finance": "Laporan Keuangan",
  "/admin/tables": "Meja & QR Code",
  "/admin/settings": "Pengaturan Kafe",
  "/admin/settings/audit": "Log Audit",
};

interface AdminShellProps {
  user: SafeUser;
  children: React.ReactNode;
}

export function AdminShell({ user, children }: AdminShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [isLoggingOut, setIsLoggingOut] = React.useState(false);

  const getPageTitle = () => {
    if (pageTitles[pathname]) return pageTitles[pathname];
    for (const [path, title] of Object.entries(pageTitles)) {
      if (path !== "/admin" && pathname.startsWith(path)) {
        return title;
      }
    }
    return "Panel Admin";
  };

  const isNavActive = (href: string) => {
    if (href === "/admin") return pathname === "/admin";
    if (href === "/admin/settings") return pathname === "/admin/settings";
    return pathname.startsWith(href);
  };

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

  const userInitial = user.name ? user.name.charAt(0).toUpperCase() : "A";

  const renderNavList = (onItemClick?: () => void) => (
    <nav className="flex-1 space-y-1.5 py-4">
      {navItems.map((item) => {
        const active = isNavActive(item.href);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onItemClick}
            className={cn(
              "group relative flex items-center gap-3.5 text-sm font-medium transition-all duration-150",
              active
                ? "bg-white text-primary-800 font-semibold shadow-xs rounded-l-full ml-3 pl-4 py-3 mr-0 pr-2"
                : "text-white/80 hover:text-white hover:bg-white/10 rounded-full mx-3 px-4 py-3"
            )}
          >
            <Icon
              className={cn(
                "size-5 shrink-0 transition-transform duration-150 group-hover:scale-105",
                active ? "text-primary-800" : "text-white/80 group-hover:text-white"
              )}
            />
            <span className="truncate">{item.title}</span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-app flex">
      {/* Desktop Sidebar (Jobie indigo, 215px, rounded-tr-40px) */}
      <aside className="hidden lg:flex w-[215px] shrink-0 flex-col bg-primary-800 text-white rounded-tr-[40px] shadow-lg sticky top-0 h-screen z-20">
        {/* Logo Brand */}
        <div className="flex items-center gap-3 px-5 pt-7 pb-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white backdrop-blur-xs shadow-xs">
            <Coffee className="size-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold tracking-tight text-white leading-tight">
              Selaras
            </h2>
            <p className="text-[10px] text-primary-200 tracking-wider uppercase font-medium">
              F&B Order
            </p>
          </div>
        </div>

        {/* Navigation list */}
        <div className="flex-1 overflow-y-auto no-scrollbar">
          {renderNavList()}
        </div>

        {/* Footer brand */}
        <div className="p-4 border-t border-white/10 text-center">
          <p className="text-[10px] text-primary-200/80 leading-relaxed">
            Kedai Kopi Selaras
          </p>
          <p className="text-[9px] text-primary-300/60 mt-0.5">
            © 2026 Super Admin
          </p>
        </div>
      </aside>

      {/* Mobile Drawer (Sheet) */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="w-[240px] bg-primary-800 text-white p-0 border-none flex flex-col rounded-r-[32px]"
          showCloseButton={false}
        >
          <SheetHeader className="px-5 pt-6 pb-2 text-left">
            <SheetTitle className="sr-only">Navigasi Admin</SheetTitle>
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white">
                <Coffee className="size-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white leading-tight">
                  Selaras
                </h2>
                <p className="text-[10px] text-primary-200 uppercase font-medium">
                  F&B Order
                </p>
              </div>
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto py-2">
            {renderNavList(() => setMobileOpen(false))}
          </div>

          <div className="p-4 border-t border-white/10 text-center">
            <p className="text-[10px] text-primary-200/80">
              Kedai Kopi Selaras · © 2026
            </p>
          </div>
        </SheetContent>
      </Sheet>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar (Jobie style) */}
        <header className="h-[72px] shrink-0 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4 bg-transparent sticky top-0 z-10">
          {/* Left: Hamburger & Dynamic page title */}
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden rounded-xl text-text-strong hover:bg-surface size-10 bg-surface shadow-xs border border-border"
              aria-label="Buka menu navigasi"
            >
              <Menu className="size-5" />
            </Button>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-text-strong truncate">
              {getPageTitle()}
            </h1>
          </div>

          {/* Center: Search pill (Jobie gray search bar) */}
          <div className="relative hidden md:block max-w-xs w-full">
            <Input
              type="text"
              placeholder="Cari sesuatu di sini…"
              className="h-11 rounded-full bg-search-bg border-none pl-5 pr-10 text-xs text-text placeholder:text-text-muted focus-visible:ring-2 focus-visible:ring-primary-600 shadow-xs"
            />
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 size-4 text-text-muted pointer-events-none" />
          </div>

          {/* Right: Realtime status, Notifications, Profile dropdown */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div className="hidden sm:block mr-1">
              <ConnectionIndicator showLabel />
            </div>

            {/* Notifications dropdown (dynamic alerts) */}
            <NotificationBell />

            {/* User Profile Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger
                className="flex items-center gap-2 sm:gap-3 rounded-full py-1 pl-1 pr-2 sm:pr-3 hover:bg-surface transition-colors outline-none cursor-pointer"
              >
                <div className="relative rounded-full p-[2px] bg-gradient-to-tr from-primary-600 to-[#8A3FD1]">
                  <Avatar className="size-9 bg-surface">
                    <AvatarFallback className="bg-primary-50 text-primary-800 font-bold text-sm">
                      {userInitial}
                    </AvatarFallback>
                  </Avatar>
                </div>
                <div className="hidden sm:block text-left">
                  <div className="text-xs font-semibold text-text-strong leading-tight truncate max-w-[120px]">
                    {user.name}
                  </div>
                  <div className="text-[10px] text-text-muted font-medium">
                    Super Admin
                  </div>
                </div>
                <ChevronDown className="size-3.5 text-text-muted hidden sm:block" />
              </DropdownMenuTrigger>

              <DropdownMenuContent
                align="end"
                className="w-56 rounded-2xl border-border bg-surface p-2 shadow-pop"
              >
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="px-2 py-1.5">
                    <div className="text-xs font-bold text-text-strong">
                      {user.name}
                    </div>
                    <div className="text-[11px] text-text-muted">
                      @{user.username}
                    </div>
                    <Badge className="mt-1.5 bg-primary-50 text-primary-800 border-none text-[10px] font-medium">
                      Super Admin
                    </Badge>
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator className="my-1.5" />

                <DropdownMenuItem
                  onClick={() => router.push("/admin/settings")}
                  className="rounded-xl px-2.5 py-2 text-xs font-medium cursor-pointer"
                >
                  <Settings className="mr-2 size-4 text-text-muted" />
                  Pengaturan Kafe
                </DropdownMenuItem>

                <DropdownMenuSeparator className="my-1.5" />

                <DropdownMenuItem
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  variant="destructive"
                  className="rounded-xl px-2.5 py-2 text-xs font-medium cursor-pointer text-destructive focus:bg-destructive/10"
                >
                  {isLoggingOut ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <LogOut className="mr-2 size-4" />
                  )}
                  Keluar dari Sistem
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page Body */}
        <main className="flex-1 px-4 sm:px-6 lg:px-8 pb-8 w-full">
          {children}
        </main>
      </div>
    </div>
  );
}
