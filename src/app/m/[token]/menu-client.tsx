"use client";

import { CHANNELS, REALTIME_EVENTS } from "@/lib/realtime-events";

import { apiErrorMessage } from "@/lib/api-error";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Search, ShoppingBag, Coffee } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRealtimeEvent } from "@/lib/pusher-client";
import { SectionCard } from "@/components/admin/section-card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRupiah } from "@/lib/utils";
import { resetCartOnMenu, useCart } from "@/lib/cart-store";

interface MenuProduct {
  id: string;
  name: string;
  description: string | null;
  price: number;
  stock: number;
  trackStock: boolean;
  imageUrl: string | null;
  thumbUrl: string | null;
  category: { name: string; type: string; subtype: string | null } | null;
}

const CATEGORY_TABS = [
  { value: "all", label: "Semua" },
  { value: "food", label: "Makanan" },
  { value: "coffee", label: "Kopi" },
  { value: "non-coffee", label: "Non Kopi" },
];

export function MenuClient({
  token,
  initialProducts,
  cafeName,
  logoUrl,
}: {
  token: string;
  initialProducts: MenuProduct[] | null;
  cafeName: string;
  logoUrl: string | null;
}) {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  // Ketikan tidak boleh memicu satu request per karakter.
  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  const [cart] = useCart(token);

  // Muat pertama kali di halaman menu = mulai keranjang baru.
  useEffect(() => {
    resetCartOnMenu(token);
  }, [token]);

  const menuQuery = useQuery({
    queryKey: ["menu", token, debouncedSearch, categoryFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ token });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (categoryFilter !== "all") params.set("category", categoryFilter);

      const res = await fetch(`/api/public/menu?${params.toString()}`);
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(apiErrorMessage(json, "Gagal memuat menu"));
      }
      return (await res.json()) as { products: MenuProduct[] };
    },
    staleTime: 60 * 1000,
    // Jangan kosongkan daftar saat query baru sedang dimuat.
    placeholderData: (previous) => previous,
    initialData:
      debouncedSearch === "" && categoryFilter === "all" && initialProducts
        ? { products: initialProducts }
        : undefined,
  });

  useRealtimeEvent(CHANNELS.table(token), REALTIME_EVENTS.stockChanged, () => {
    queryClient.invalidateQueries({ queryKey: ["menu", token] });
  });

  const menus = menuQuery.data?.products ?? [];
  const cartItems = Object.values(cart);
  const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = cartItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      <header className="sticky top-0 z-20 border-b border-border bg-white px-4 py-3 shadow-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <Link
            href={`/m/${token}`}
            className="flex min-w-0 items-center gap-2 text-base font-semibold text-text-strong"
          >
            <Image
              src={logoUrl ?? "/logo-selaras.svg"}
              alt=""
              width={32}
              height={32}
              unoptimized
              className="size-8 shrink-0 object-contain"
            />
            <span className="truncate">{cafeName}</span>
          </Link>
          <div className="relative w-36 sm:w-56">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted"
            />
            <Input
              aria-label="Cari menu"
              placeholder="Cari menu..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="h-11 rounded-xl pl-9"
            />
          </div>
        </div>
      </header>

      <nav
        aria-label="Kategori menu"
        className="sticky top-[68px] z-10 border-b border-border bg-white px-4 shadow-sm"
      >
        <div className="mx-auto flex max-w-2xl gap-1 overflow-x-auto py-2">
          {CATEGORY_TABS.map((tab) => {
            const active = categoryFilter === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                aria-pressed={active}
                onClick={() => setCategoryFilter(tab.value)}
                className={`min-h-11 shrink-0 rounded-xl px-3 text-xs font-semibold transition-colors ${
                  active
                    ? "bg-primary-600 text-white"
                    : "border border-border bg-surface text-text-muted"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </nav>

      <main className="mx-auto max-w-2xl p-4">
        {menuQuery.isLoading ? (
          <SectionCard title="Menu Kafe">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-64 rounded-xl" />
              ))}
            </div>
          </SectionCard>
        ) : menuQuery.isError ? (
          <SectionCard title="Menu tidak tersedia">
            <div className="space-y-3 text-center">
              <p className="text-sm text-text-muted">
                Meja tidak aktif atau menu gagal dimuat. Pindai ulang QR di meja
                Anda.
              </p>
              <Button onClick={() => menuQuery.refetch()}>Coba Lagi</Button>
            </div>
          </SectionCard>
        ) : menus.length === 0 ? (
          <SectionCard title="Menu Kafe">
            <div className="py-10 text-center">
              <Coffee className="mx-auto size-8 text-text-muted" />
              <p className="mt-3 text-sm font-semibold text-text-strong">
                Menu tidak ditemukan
              </p>
              <p className="mt-1 text-xs text-text-muted">
                Coba kata kunci atau kategori lain.
              </p>
            </div>
          </SectionCard>
        ) : (
          <SectionCard title="Menu Kafe">
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {menus.map((menu, index) => {
                const soldOut = menu.trackStock && menu.stock <= 0;
                // Thumbnail sudah 320px dari proses upload; optimizer Next
                // hanya meng-upscale dan menambah satu hop server.
                const image = menu.thumbUrl ?? menu.imageUrl;

                return (
                  <li
                    key={menu.id}
                    className="overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary-300"
                  >
                    <Link
                      href={`/m/${token}/item/${menu.id}`}
                      prefetch={false}
                      className="flex h-full flex-col"
                    >
                    <div className="relative h-44 w-full bg-surface-muted">
                      {image ? (
                        <Image
                          src={image}
                          alt={menu.name}
                          fill
                          unoptimized
                          sizes="(max-width: 640px) 100vw, 320px"
                          className="object-cover"
                          preload={index === 0}
                          fetchPriority={index < 2 ? "high" : "auto"}
                          loading={index < 2 ? "eager" : "lazy"}
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <Coffee
                            aria-hidden="true"
                            className="size-10 text-text-muted/60"
                          />
                        </div>
                      )}
                    </div>

                    <div className="flex flex-1 flex-col p-3">
                      <h2 className="line-clamp-2 text-sm font-semibold text-text-strong">
                        {menu.name}
                      </h2>
                      <p className="mt-1 line-clamp-1 text-xs text-text-muted">
                        {menu.description || "-"}
                      </p>

                      {soldOut && (
                        <p className="mt-auto pt-3 text-right text-xs font-semibold text-destructive">
                          Habis
                        </p>
                      )}
                    </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </SectionCard>
        )}
      </main>

      <div className="fixed inset-x-4 bottom-4 z-30 sm:inset-x-auto sm:right-6 sm:w-80">
        <Button
          asChild
          className="min-h-14 w-full rounded-xl bg-primary-600 py-3 text-base font-semibold text-white shadow-lg hover:bg-primary-700"
        >
          <Link href={`/m/${token}/cart`}>
            <span className="flex w-full items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                <ShoppingBag className="size-5" aria-hidden="true" />
                Keranjang ({totalItems})
              </span>
              <span>{formatRupiah(totalPrice)}</span>
            </span>
          </Link>
        </Button>
      </div>
    </div>
  );
}
