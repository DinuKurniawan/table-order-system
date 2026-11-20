"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  Coffee,
  Flame,
  Minus,
  Plus,
  ShoppingBag,
  Snowflake,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useCart, useCartHydrated, hydrateCart } from "@/lib/cart-store";
import { formatRupiah } from "@/lib/utils";
import type { CupSize, IceLevel, SugarLevel, Temperature } from "@/lib/cart";
import { priceForSize, type SizePrices } from "@/lib/size-pricing";

interface ItemProduct {
  id: string;
  name: string;
  description: string | null;
  price: number;
  sizePrices: SizePrices | null;
  stock: number;
  trackStock: boolean;
  imageUrl: string | null;
  thumbUrl: string | null;
  category: { name: string; type: string; subtype: string | null } | null;
}

export function ItemDetailClient({
  token,
  product,
}: {
  token: string;
  product: ItemProduct;
}) {
  const [cart, setCart] = useCart(token);
  const cartHydrated = useCartHydrated(token);

  useEffect(() => {
    hydrateCart(token);
  }, [token]);

  const isDrink = product.category?.type === "DRINK";
  const maxQty = product.trackStock ? Math.max(0, product.stock) : 99;
  const soldOut = maxQty <= 0;
  const currentQty = cart[product.id]?.quantity ?? 0;
  const remaining = Math.max(0, maxQty - currentQty);
  const totalItems = Object.values(cart).reduce(
    (sum, item) => sum + item.quantity,
    0
  );

  const [qty, setQty] = useState(1);
  const [sugar, setSugar] = useState<SugarLevel>("REGULER");
  const [ice, setIce] = useState<IceLevel>("REGULER");
  const [temperature, setTemperature] = useState<Temperature>("ICE");
  const [cupSize, setCupSize] = useState<CupSize>("REGULER");
  const unitPrice = priceForSize(product.price, product.sizePrices, cupSize);

  const addToCart = () => {
    const addQty = Math.min(qty, remaining);
    if (addQty <= 0) {
      toast.error("Stok tidak mencukupi");
      return;
    }

    // Varian size/suhu dipisah agar tiap baris memakai harga sendiri.
    const cartKey = isDrink
      ? `${product.id}:${cupSize}:${temperature}`
      : product.id;
    setCart((prev) => ({
      ...prev,
      [cartKey]: {
        productId: product.id,
        name: product.name,
        productImage: product.thumbUrl ?? product.imageUrl ?? undefined,
        drink: isDrink,
        sugar: isDrink ? sugar : undefined,
        ice: isDrink && temperature === "ICE" ? ice : undefined,
        temperature: isDrink ? temperature : undefined,
        size: isDrink ? cupSize : undefined,
        price: unitPrice,
        quantity: (prev[cartKey]?.quantity ?? 0) + addQty,
      },
    }));
    toast.success(`${addQty} × ${product.name} ditambahkan`);
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      <header className="sticky top-0 z-20 border-b border-border bg-white px-4 py-3 shadow-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <Link
            href={`/m/${token}`}
            className="flex items-center gap-2 text-sm font-semibold text-text-strong"
          >
            <ArrowLeft className="size-5" aria-hidden="true" />
            Kembali
          </Link>
          <Link
            href={`/m/${token}/cart`}
            className="flex items-center gap-1.5 text-sm font-semibold text-primary-700"
          >
            <ShoppingBag className="size-4" aria-hidden="true" />
            Keranjang ({totalItems})
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-4">
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="relative h-64 w-full bg-surface-muted">
            {product.thumbUrl ?? product.imageUrl ? (
              <Image
                src={(product.thumbUrl ?? product.imageUrl)!}
                alt={product.name}
                fill
                sizes="(max-width: 672px) 100vw, 672px"
                className="object-cover"
                priority
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <Coffee
                  aria-hidden="true"
                  className="size-12 text-text-muted/60"
                />
              </div>
            )}
          </div>

          <div className="flex flex-col gap-4 p-4">
            {product.category && (
              <span className="w-fit rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium text-text-muted">
                {product.category.name}
              </span>
            )}

            <div>
              <h1 className="text-xl font-bold text-text-strong">
                {product.name}
              </h1>
              <p className="mt-1 text-sm text-text-muted">
                {product.description || "-"}
              </p>
            </div>

            <p className="text-lg font-bold text-primary-800">
              {formatRupiah(unitPrice)}
            </p>

            {isDrink && (
              <div className="space-y-4 border-t border-border pt-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-text-muted">
                      Temprature
                    </span>
                    <span className="text-[11px] text-text-muted/70">
                      select 1
                    </span>
                  </div>
                  <div
                    role="radiogroup"
                    aria-label="Temprature"
                    className="mt-2 grid grid-cols-2 gap-2"
                  >
                    <Button
                      type="button"
                      variant={temperature === "ICE" ? "default" : "outline"}
                      aria-pressed={temperature === "ICE"}
                      onClick={() => setTemperature("ICE")}
                      className="h-11 rounded-lg"
                    >
                      <Snowflake className="size-4" aria-hidden="true" />
                      Ice
                    </Button>
                    <Button
                      type="button"
                      variant={temperature === "HOT" ? "default" : "outline"}
                      aria-pressed={temperature === "HOT"}
                      onClick={() => setTemperature("HOT")}
                      className="h-11 rounded-lg"
                    >
                      <Flame className="size-4" aria-hidden="true" />
                      Hot
                    </Button>
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-text-muted">
                      Size Cup
                    </span>
                    <span className="text-[11px] text-text-muted/70">
                      select 1
                    </span>
                  </div>
                  <div
                    role="radiogroup"
                    aria-label="Size Cup"
                    className="mt-2 grid grid-cols-3 gap-2"
                  >
                    {(["REGULER", "LARGE", "JUMBO"] as const).map((size) => (
                      <Button
                        key={size}
                        type="button"
                        variant={cupSize === size ? "default" : "outline"}
                        aria-pressed={cupSize === size}
                        onClick={() => setCupSize(size)}
                        className="h-11 rounded-lg"
                      >
                        {size === "REGULER"
                          ? "Reguler"
                          : size === "LARGE"
                            ? "Large"
                            : "Jumbo"}
                      </Button>
                    ))}
                  </div>
                </div>

                <div
                  className={
                    temperature === "ICE"
                      ? "grid grid-cols-2 gap-3"
                      : "grid grid-cols-1 gap-3"
                  }
                >
                  <div>
                    <label
                      htmlFor="sugar-level"
                      className="text-xs font-medium text-text-muted"
                    >
                      Gula
                    </label>
                    <select
                      id="sugar-level"
                      value={sugar}
                      onChange={(event) =>
                        setSugar(event.target.value as SugarLevel)
                      }
                      className="mt-1 h-11 w-full rounded-lg border border-input bg-transparent px-2 text-sm text-text-strong outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                    >
                      <option value="REGULER">Reguler</option>
                      <option value="SEDIKIT">Sedikit</option>
                      <option value="NO_SUGAR">No Sugar</option>
                    </select>
                  </div>
                  {temperature === "ICE" && (
                    <div>
                      <label
                        htmlFor="ice-level"
                        className="text-xs font-medium text-text-muted"
                      >
                        Es batu
                      </label>
                      <select
                        id="ice-level"
                        value={ice}
                        onChange={(event) =>
                          setIce(event.target.value as IceLevel)
                        }
                        className="mt-1 h-11 w-full rounded-lg border border-input bg-transparent px-2 text-sm text-text-strong outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                      >
                        <option value="REGULER">Reguler</option>
                        <option value="SEDIKIT">Sedikit</option>
                      </select>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between border-t border-border pt-4">
              <span className="text-sm font-medium">Jumlah</span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-11 rounded-xl"
                  aria-label="Kurangi jumlah"
                  disabled={qty <= 1 || soldOut}
                  onClick={() => setQty((value) => Math.max(1, value - 1))}
                >
                  <Minus className="size-4" />
                </Button>
                <span className="w-8 text-center text-base font-semibold tabular-nums">
                  {qty}
                </span>
                <Button
                  type="button"
                  size="icon"
                  className="size-11 rounded-xl"
                  aria-label="Tambah jumlah"
                  disabled={qty >= maxQty || soldOut}
                  onClick={() =>
                    setQty((value) => Math.min(maxQty, value + 1))
                  }
                >
                  <Plus className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </main>

      <div className="fixed inset-x-4 bottom-4 z-30 sm:inset-x-auto sm:right-6 sm:w-80">
        <Button
          type="button"
          onClick={addToCart}
          disabled={soldOut || remaining <= 0 || !cartHydrated}
          className="min-h-14 w-full rounded-xl bg-primary-600 py-3 text-base font-semibold text-white shadow-lg hover:bg-primary-700"
        >
          {soldOut
            ? "Habis"
            : `Tambah ke Keranjang · ${formatRupiah(unitPrice * qty)}`}
        </Button>
      </div>
    </div>
  );
}
