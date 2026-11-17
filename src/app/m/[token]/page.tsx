"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ShieldAlert, ShieldCheck, Search, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQueryClient } from "@tanstack/react-query";
import { usePusherChannel, useRealtimeEvent, RealTimeEvent } from "@/lib/pusher-client";
import { useQuery } from "@tanstack/react-query";
import { SectionCard } from "@/components/admin/section-card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRupiah } from "@/lib/utils";
import { useParams } from "next/navigation";

export default function MejaPage() {
  const { token } = useParams() as { token: string };
  const router = useRouter();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  // ============================================================
  // Fetch menu items from DB
  // ============================================================
  const menuQuery = useQuery({
    queryKey: ["menu", token, searchQuery, categoryFilter],
    queryFn: async () => {
      const res = await fetch(`/api/public/menu?token=${token}&search=${searchQuery}&category=${categoryFilter}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Gagal memuat menu");
      return res.json();
    },
    staleTime: 60 * 1000,
  });

  // ============================================================
  // Real-time: subscribe stock changes for this table's channel
  // ============================================================
  useEffect(() => {
    if (!token) return;

    // Subscribe to private-table-{token} for stock.changed events
    const unsubscribe = useRealtimeEvent(
      `private-table-${token}`,
      "stock.changed",
      (payload: any) => {
        // Reload menu data ketika ada perubahan stok
        queryClient.invalidateQueries({ queryKey: ["menu", token] });
      }
    );

    return () => {
      unsubscribe();
    };
  }, [token, queryClient]);

  // ============================================================
  // Header
  // ============================================================
  const restoranName = "Kafe Sehat";

  // ============================================================
  // Render Menu Cards
  // ============================================================
  if (menuQuery.isLoading) {
    return (
      <div className="min-h-screen p-4">
        <SectionCard title="Menu Kafe">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Skeleton className="h-48 col-span-2" />
            <Skeleton className="h-32 col-span-1" />
            <Skeleton className="h-40 col-span-2" />
            <Skeleton className="h-36 col-span-1" />
            <Skeleton className="h-44 col-span-2" />
            <Skeleton className="h-42 col-span-1" />
          </div>
        </SectionCard>
      </div>
    );
  }

  const menus = menuQuery.data?.menus ?? [];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header - sticky */}
      <header className="sticky top-0 z-20 bg-white border-b border-border px-4 py-3 shadow-sm">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href={`/m/${token}`} className="text-lg font-semibold text-text-strong">
              {restoranName}
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <Input
              placeholder="Cari makanan/minuman..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-48 rounded-xl border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 rounded-xl flex items-center justify-center"
            >
              <Search className="size-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Kategori sticky tabs */}
      <div className="sticky top-64 bg-white border-b border-border px-4 shadow-sm">
        <div className="max-w-2xl mx-auto">
          <div className="flex gap-1">
            <Button
              variant={categoryFilter === "all" ? "default" : "outline"}
              onClick={() => setCategoryFilter("all")}
              className="rounded-lg px-3 py-1.5 text-xs font-medium"
            >
              Semua
            </Button>
            <Button
              variant={categoryFilter === "food" ? "default" : "outline"}
              onClick={() => setCategoryFilter("food")}
              className="rounded-lg px-3 py-1.5 text-xs font-medium"
            >
              Makanan
            </Button>
            <Button
              variant={categoryFilter === "coffee" ? "default" : "outline"}
              onClick={() => setCategoryFilter("coffee")}
              className="rounded-lg px-3 py-1.5 text-xs font-medium"
            >
              Kopi
            </Button>
            <Button
              variant={categoryFilter === "non-coffee" ? "default" : "outline"}
              onClick={() => setCategoryFilter("non-coffee")}
              className="rounded-lg px-3 py-1.5 text-xs font-medium"
            >
              Non Kopi
            </Button>
          </div>
        </div>
      </div>

      {/* Daftar menu */}
      <main className="p-4 pt-64">
        <SectionCard title="Menu Kafe">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {menus.map((menu: any) => {
              const isLowStock = menu.stock <= 0;
              const category = menu.category || "makanan";

              // Filter by category
              if (
                categoryFilter !== "all" &&
                category !== categoryFilter
              ) {
                return null;
              }

              return (
                <div
                  key={menu.id}
                  className="group rounded-xl bg-card p-4 hover:border-primary transition-colors"
                >
                  {/* Gambar produk dengan next/image */}
                  <div className="rounded-t-xl h-48 overflow-hidden group-hover:opacity-90">
                    {menu.imageKey ? (
                      <img
                        src={`/placeholder.svg?height=200&width=300`}
                        alt={menu.name}
                        className="w-full h-full object-cover transition-opacity"
                      />
                    ) : (
                      <div
                        className="w-full h-full bg-muted/50 flex items-center justify-center text-muted-foreground"
                      >
                        <Skeleton className="h-24 w-40" />
                      </div>
                    )}
                  </div>

                  <div className="p-3">
                    <h3 className="font-medium text-sm line-clamp-2">{menu.name}</h3>
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {menu.description || "-"}
                    </p>
                  </div>

                  <div className="p-3 border-t border-border">
                    <div className="flex justify-between items-start">
                      <span className="text-lg font-bold text-primary">
                        {formatRupiah(menu.price)}
                      </span>
                      {/* Label "Habis" jika stok 0 */}
                      {isLowStock && (
                        <span className="text-xs font-medium text-destructive">
                          Habis
                        </span>
                      )}
                    </div>

                    {/* Tombol + / stepper qty */}
                    <div className="mt-2 flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="rounded-lg p-1"
                        disabled={menu.stock <= 0}
                      >
                        <Minus className="size-4" />
                      </Button>
                      <span className="text-sm font-medium">
                        0
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="rounded-lg p-1"
                      >
                        <Plus className="size-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>
      </main>

      {/* Floating cart button */}
      <div className="fixed bottom-4 right-4 left-4 sm:right-6 sm:left-6">
        <Button
          asChild
          variant="default"
          className="w-full rounded-xl bg-primary-600 hover:bg-primary-700 text-white py-3 text-lg font-medium shadow-lg"
        >
          <span className="flex items-center justify-between">
            <span>
              Keranjang (0 item)
              {0 > 0 && <span className="font-medium">Rp 0</span>}
            </span>
            <svg
              className="size-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M5 12hM19 12" />
            </svg>
          </span>
        </Button>
      </div>
    </div>
  );
}