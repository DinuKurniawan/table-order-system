"use client";

import { CHANNELS, REALTIME_EVENTS } from "@/lib/realtime-events";

import { apiErrorMessage } from "@/lib/api-error";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Search, Minus, Plus, ShoppingBag, Coffee } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRealtimeEvent } from "@/lib/pusher-client";
import { SectionCard } from "@/components/admin/section-card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRupiah } from "@/lib/utils";
import { parseStoredCart, type CartItems } from "@/lib/cart";

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
}: {
  token: string;
  initialProducts: MenuProduct[] | null;
}) {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const cartKey = `cart-${token}`;

  const [cart, setCart] = useState<CartItems>({});
  const [cartReady, setCartReady] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(cartKey);
      // localStorage hanya tersedia setelah mount; init sinkron memicu hydration mismatch.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCart(parseStoredCart(saved));
    } catch {
      setCart({});
    }
    setCartReady(true);
  }, [cartKey]);

  const menuQuery = useQuery({
    queryKey: ["menu", token, searchQuery, categoryFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ token });
      if (searchQuery.trim()) params.set("search", searchQuery.trim());
      if (categoryFilter !== "all") params.set("category", categoryFilter);

      const res = await fetch(`/api/public/menu?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(apiErrorMessage(json, "Gagal memuat menu"));
      }
      return (await res.json()) as { products: MenuProduct[] };
    },
    staleTime: 60 * 1000,
    initialData:
      searchQuery === "" && categoryFilter === "all" && initialProducts
        ? { products: initialProducts }
        : undefined,
  });

  useRealtimeEvent(CHANNELS.table(token), REALTIME_EVENTS.stockChanged, () => {
    queryClient.invalidateQueries({ queryKey: ["menu", token] });
  });

  useEffect(() => {
    if (!cartReady) return;
    try {
      window.localStorage.setItem(cartKey, JSON.stringify({ items: cart }));
    } catch {
      // Kuota/privacy mode: keranjang tetap jalan di memori.
    }
  }, [cart, cartKey, cartReady]);

  const menus = menuQuery.data?.products ?? [];
  const cartItems = Object.values(cart);
  const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = cartItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  const setQuantity = (menu: MenuProduct, quantity: number) => {
    setCart((current) => {
      const next = { ...current };
      if (quantity <= 0) {
        delete next[menu.id];
      } else {
        next[menu.id] = {
          productId: menu.id,
          name: menu.name,
          price: menu.price,
          quantity,
        };
      }
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      <header className="sticky top-0 z-20 border-b border-border bg-white px-4 py-3 shadow-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <Link
            href={`/m/${token}`}
            className="text-base font-semibold text-text-strong"
          >
            Kedai Kopi Selaras
          </Link>
          <div className="relative w-40 sm:w-56">
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
                const quantity = cart[menu.id]?.quantity ?? 0;
                const soldOut = menu.trackStock && menu.stock <= 0;
                const image = menu.thumbUrl ?? menu.imageUrl;

                return (
                  <li
                    key={menu.id}
                    className="flex flex-col overflow-hidden rounded-xl border border-border bg-card"
                  >
                    <div className="relative h-44 w-full bg-surface-muted">
                      {image ? (
                        <Image
                          src={image}
                          alt={menu.name}
                          fill
                          sizes="(max-width: 640px) 100vw, 320px"
                          className="object-cover"
                          priority={index < 2}
                          loading={index < 2 ? undefined : "lazy"}
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

                      <div className="mt-auto flex items-center justify-between pt-3">
                        <span className="text-base font-bold text-primary-800">
                          {formatRupiah(menu.price)}
                        </span>
                        {soldOut ? (
                          <span className="text-xs font-semibold text-destructive">
                            Habis
                          </span>
                        ) : (
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="size-11 rounded-xl"
                              aria-label={`Kurangi ${menu.name}`}
                              disabled={quantity === 0}
                              onClick={() =>
                                setQuantity(menu, Math.max(0, quantity - 1))
                              }
                            >
                              <Minus className="size-4" />
                            </Button>
                            <span
                              className="w-7 text-center text-sm font-semibold tabular-nums"
                              aria-label={`Jumlah ${menu.name}: ${quantity}`}
                            >
                              {quantity}
                            </span>
                            <Button
                              type="button"
                              size="icon"
                              className="size-11 rounded-xl"
                              aria-label={`Tambah ${menu.name}`}
                              disabled={
                                menu.trackStock && quantity >= menu.stock
                              }
                              onClick={() => setQuantity(menu, quantity + 1)}
                            >
                              <Plus className="size-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
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
