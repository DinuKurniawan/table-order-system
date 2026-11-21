"use client";

import { apiErrorMessage } from "@/lib/api-error";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionCard } from "@/components/admin/section-card";
import { formatRupiah } from "@/lib/utils";
import { toast } from "sonner";
import { Minus, Plus, Trash2, ArrowLeft, Coffee } from "lucide-react";
import { hydrateCart, useCart, useCartHydrated } from "@/lib/cart-store";
import type { CartItem, IceLevel, SugarLevel } from "@/lib/cart";

export default function CartPage({ token }: { token: string }) {
  return <CartContent token={token} />;
}

function CartContent({ token }: { token: string }) {
  const router = useRouter();

  // ============================================================
  // Cart state: sesi tab; refresh di halaman ini TIDAK mereset item.
  // Reset hanya terjadi saat halaman menu dimuat ulang.
  // ============================================================
  const [items, setItems] = useCart(token);
  const cartHydrated = useCartHydrated(token);

  useEffect(() => {
    hydrateCart(token);
  }, [token]);

  // ============================================================
  // Fetch order summary - items from cart
  // ============================================================
  const itemEntries = Object.entries(items).map(([cartKey, item]) => ({
    cartKey,
    ...item,
  }));

  // Calculate totals from items directly
  const totalItems = itemEntries.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = itemEntries.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  // ============================================================
  // Form: ubah qty, catatan, nama customer
  // ============================================================
  const [isSaving, setIsSaving] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [nameError, setNameError] = useState("");
  const [generalNote, setGeneralNote] = useState("");
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{
    cartKey: string;
    name: string;
  } | null>(null);
  const swipeRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    dx: number;
  } | null>(null);
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());
  const cartSignature = JSON.stringify(items);

  // Kunci idempotensi berubah saat isi keranjang berubah, sehingga klik ganda
  // pada checkout yang sama tidak membuat pesanan/ reservasi stok ganda.
  useEffect(() => {
    idempotencyKeyRef.current = crypto.randomUUID();
  }, [cartSignature]);

  // ============================================================
  // Submit order (POST /api/public/orders)
  // ============================================================
  const handleSubmit = async () => {
    const name = customerName.trim();
    if (!name) {
      setNameError("Nama pelanggan wajib diisi");
      return;
    }
    setNameError("");
    setIsSaving(true);

    const itemsForOrder = itemEntries.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      size: item.drink === true ? item.size : undefined,
      note:
        item.drink === true
          ? [
              `Temperature: ${item.temperature === "HOT" ? "Hot" : "Ice"}`,
              `Size: ${
                item.size === "LARGE"
                  ? "Large"
                  : item.size === "JUMBO"
                    ? "Jumbo"
                    : "Reguler"
              }`,
              `Gula: ${
                item.sugar === "NO_SUGAR"
                  ? "No Sugar"
                  : item.sugar === "SEDIKIT"
                    ? "Sedikit"
                    : "Reguler"
              }`,
              ...(item.temperature === "HOT"
                ? []
                : [
                    `Es: ${item.ice === "SEDIKIT" ? "Sedikit" : "Reguler"}`,
                  ]),
              item.note,
            ]
              .filter(Boolean)
              .join(" · ")
          : item.note?.trim() || undefined,
    }));

    const note = generalNote.trim();

    try {
      const res = await fetch("/api/public/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key":
            idempotencyKeyRef.current || crypto.randomUUID(),
        },
        body: JSON.stringify({
          tableToken: token,
          customerName: name,
          note,
          items: itemsForOrder,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        // Success: redirect ke halaman order
        router.push(`/order/${data.code}`);
      } else {
        toast.error(apiErrorMessage(data, "Gagal memesan"));
      }
    } catch {
      toast.error("Gagal terhubung ke server");
    } finally {
      setIsSaving(false);
    }
  };

  // ============================================================
  // Hapus item (konfirmasi overlay penuh)
  // ============================================================
  const removeItem = (key: string) => {
    setItems((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setPendingDelete(null);
    setOpenItemId(null);
  };

  const setItemOption = (
    key: string,
    patch: Partial<Pick<CartItem, "sugar" | "ice">>
  ) => {
    setItems((prev) => {
      const item = prev[key];
      if (!item) return prev;
      return { ...prev, [key]: { ...item, ...patch } };
    });
  };

  const setItemNote = (key: string, note: string) => {
    setItems((prev) => {
      const item = prev[key];
      if (!item) return prev;
      return { ...prev, [key]: { ...item, note: note || undefined } };
    });
  };

  useEffect(() => {
    if (!pendingDelete) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPendingDelete(null);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [pendingDelete]);

  if (!cartHydrated) {
    return (
      <main className="min-h-screen p-8 text-center">
        <h1 className="text-2xl font-bold text-text-strong">Keranjang</h1>
        <p className="mx-auto mt-2 max-w-md text-lg leading-relaxed text-text-muted">
          Periksa kembali pesanan Anda sebelum checkout. Pastikan jumlah dan
          catatan sudah sesuai. Keranjang tersimpan di perangkat ini.
        </p>
        <p className="mt-6 text-text-muted">Memuat keranjang...</p>
      </main>
    );
  }

  if (totalItems === 0) {
    return (
      <main className="min-h-screen p-8 text-center">
        <h1 className="text-2xl font-bold mb-4">Keranjang Kosong</h1>
        <p className="text-text-muted mb-6">
          Belum ada item di keranjang. Scan QR meja dan mulai memilih menu.
        </p>
        <Button
          onClick={() => router.push("/m/" + token)}
          className="bg-primary-600 hover:bg-primary-700 text-white"
        >
          Lihat Menu
        </Button>
      </main>
    );
  }

  return (
    <main>
      <SectionCard
        title={
          <span className="flex items-center gap-3">
            <Image
              src="/logo-selaras.svg"
              alt=""
              width={48}
              height={48}
              unoptimized
              className="size-12 shrink-0"
            />
            Ringkasan Keranjang
          </span>
        }
      >
        <div className="p-4">
          <div className="mb-4">
            <Button
              asChild
              variant="outline"
              className="h-10 gap-1.5 rounded-xl px-3"
            >
              <Link href={`/m/${token}`}>
                <ArrowLeft className="size-4" />
                Kembali ke Menu
              </Link>
            </Button>
          </div>
          {/* Form ubah qty dan catatan */}
          <div className="space-y-4">
            <div>
              <label
                htmlFor="customer-name"
                className="mb-2 block text-sm font-medium"
              >
                Nama Pelanggan <span className="text-destructive">*</span>
              </label>
              <Input
                id="customer-name"
                value={customerName}
                onChange={(e) => {
                  setCustomerName(e.target.value);
                  if (nameError) setNameError("");
                }}
                placeholder="Nama pelanggan"
                required
                maxLength={80}
                aria-invalid={nameError ? true : undefined}
                aria-describedby={nameError ? "customer-name-error" : undefined}
                className="h-11 w-full rounded-xl"
              />
              {nameError && (
                <p
                  id="customer-name-error"
                  role="alert"
                  className="mt-1 text-xs text-destructive"
                >
                  {nameError}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="general-note"
                className="mb-2 block text-sm font-medium"
              >
                Catatan umum
              </label>
              <Input
                id="general-note"
                value={generalNote}
                onChange={(e) => setGeneralNote(e.target.value)}
                placeholder="Contoh: tambahan es sedikit"
                maxLength={280}
                className="h-11 w-full rounded-xl"
              />
            </div>
          </div>

          {/* Daftar item keranjang: geser ke kiri untuk tombol hapus */}
          <p className="mt-6 text-xs text-text-muted">Geser item ke kiri untuk menghapus.</p>
          <div className="mt-2 space-y-3">
            {itemEntries.map((item) => {
              const label = item.name ?? item.productName ?? "Produk";
              const variant =
                item.drink === true
                  ? [
                      item.size === "LARGE"
                        ? "Large"
                        : item.size === "JUMBO"
                          ? "Jumbo"
                          : "Reguler",
                      item.temperature === "HOT" ? "Hot" : "Ice",
                    ].join(" · ")
                  : null;
              const isOpen = openItemId === item.cartKey;
              return (
                <div
                  key={item.cartKey}
                  className="relative overflow-hidden rounded border"
                >
                  <button
                    type="button"
                    aria-label={`Hapus ${label}`}
                    onFocus={() => setOpenItemId(item.cartKey)}
                    onClick={() =>
                      setPendingDelete({ cartKey: item.cartKey, name: label })
                    }
                    className="absolute inset-y-0 right-0 flex w-16 items-center justify-center bg-destructive text-white transition-colors hover:bg-destructive/90"
                  >
                    <Trash2 className="size-5" />
                  </button>
                  <div
                    className="relative flex touch-pan-y select-none flex-col gap-2 border-border bg-surface p-3 transition-transform duration-200 ease-out"
                    style={{
                      transform: isOpen ? "translateX(-4rem)" : "translateX(0)",
                    }}
                    onPointerDown={(event) => {
                      swipeRef.current = {
                        id: item.cartKey,
                        startX: event.clientX,
                        startY: event.clientY,
                        dx: 0,
                      };
                    }}
                    onPointerMove={(event) => {
                      const swipe = swipeRef.current;
                      if (!swipe || swipe.id !== item.cartKey) return;
                      const dx = event.clientX - swipe.startX;
                      const dy = event.clientY - swipe.startY;
                      // Gerakan vertikal = scroll halaman, bukan geser item.
                      swipe.dx = Math.abs(dy) > Math.abs(dx) ? 0 : dx;
                    }}
                    onPointerUp={() => {
                      const swipe = swipeRef.current;
                      if (!swipe || swipe.id !== item.cartKey) return;
                      swipeRef.current = null;
                      if (swipe.dx <= -40) setOpenItemId(item.cartKey);
                      else if (swipe.dx >= 40)
                        setOpenItemId((current) =>
                          current === item.cartKey ? null : current
                        );
                      else if (isOpen) setOpenItemId(null);
                    }}
                    onPointerCancel={() => {
                      swipeRef.current = null;
                    }}
                  >
                    <div className="flex w-full items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        {item.productImage ? (
                          <Image
                            src={item.productImage}
                            alt=""
                            width={40}
                            height={40}
                            className="size-10 shrink-0 rounded-lg object-cover"
                          />
                        ) : (
                          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface-muted">
                            <Coffee aria-hidden="true" className="size-5 text-text-muted/60" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <span className="block truncate font-medium">{label}</span>
                          {variant && (
                            <span className="block text-xs text-text-muted">
                              {variant}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          aria-label={`Kurangi ${label}`}
                          onClick={() => setItems((prev) => {
                            const newItems = { ...prev };
                            if (newItems[item.cartKey].quantity > 1) {
                              newItems[item.cartKey].quantity -= 1;
                            }
                            return newItems;
                          })}
                          disabled={item.quantity <= 1}
                          className="size-11 rounded-xl"
                        >
                          <Minus className="size-4" />
                        </Button>
                        <span className="w-6 text-center text-sm font-medium tabular-nums">
                          {item.quantity}
                        </span>
                        <Button
                          type="button"
                          size="icon"
                          aria-label={`Tambah ${label}`}
                          onClick={() => setItems((prev) => {
                            const newItems = { ...prev };
                            newItems[item.cartKey] = {
                              ...newItems[item.cartKey],
                              quantity: newItems[item.cartKey].quantity + 1,
                            };
                            return newItems;
                          })}
                          className="size-11 rounded-xl"
                        >
                          <Plus className="size-4" />
                        </Button>
                      </div>
                    </div>

                    {item.drink === true && (
                      <div
                        onPointerDown={(event) => event.stopPropagation()}
                        className={
                          item.temperature === "HOT"
                            ? "grid w-full grid-cols-1 gap-2 border-t border-border pt-2"
                            : "grid w-full grid-cols-2 gap-2 border-t border-border pt-2"
                        }
                      >
                        <div>
                          <label
                            htmlFor={`sugar-${item.cartKey}`}
                            className="text-xs font-medium text-text-muted"
                          >
                            Gula
                          </label>
                          <select
                            id={`sugar-${item.cartKey}`}
                            value={item.sugar ?? "REGULER"}
                            onChange={(event) =>
                              setItemOption(item.cartKey, {
                                sugar: event.target.value as SugarLevel,
                              })
                            }
                            className="mt-1 h-10 w-full rounded-lg border border-input bg-transparent px-2 text-sm text-text-strong outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                          >
                            <option value="REGULER">Reguler</option>
                            <option value="SEDIKIT">Sedikit</option>
                            <option value="NO_SUGAR">No Sugar</option>
                          </select>
                        </div>
                        {item.temperature !== "HOT" && (
                          <div>
                            <label
                              htmlFor={`ice-${item.cartKey}`}
                              className="text-xs font-medium text-text-muted"
                            >
                              Es batu
                            </label>
                            <select
                              id={`ice-${item.cartKey}`}
                              value={item.ice ?? "REGULER"}
                              onChange={(event) =>
                                setItemOption(item.cartKey, {
                                  ice: event.target.value as IceLevel,
                                })
                              }
                              className="mt-1 h-10 w-full rounded-lg border border-input bg-transparent px-2 text-sm text-text-strong outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                            >
                              <option value="REGULER">Reguler</option>
                              <option value="SEDIKIT">Sedikit</option>
                            </select>
                          </div>
                        )}
                      </div>
                    )}

                    {!item.drink && (
                      <div
                        onPointerDown={(event) => event.stopPropagation()}
                        className="w-full border-t border-border pt-2"
                      >
                        <label
                          htmlFor={`note-${item.cartKey}`}
                          className="text-xs font-medium text-text-muted"
                        >
                          Catatan
                        </label>
                        <Input
                          id={`note-${item.cartKey}`}
                          value={item.note ?? ""}
                          onChange={(event) =>
                            setItemNote(item.cartKey, event.target.value)
                          }
                          placeholder="Contoh: tidak pedas, tanpa sayur"
                          maxLength={200}
                          className="mt-1 h-10 w-full rounded-lg"
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Ringkasan harga */}
          <div className="mt-6 pt-6 border-t border-border">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Total item</span>
              <span>{totalItems}</span>
            </div>
            <div className="flex justify-between text-sm font-medium">
              <span>Total harga</span>
              <span className="text-primary">{formatRupiah(totalPrice)}</span>
            </div>
          </div>

          {/* Tombol Pesan & Bayar */}
          <Button
            disabled={isSaving}
            onClick={handleSubmit}
            className="w-full rounded-xl bg-primary-600 hover:bg-primary-700 text-white py-3 text-lg font-medium shadow-lg mt-4"
          >
            {isSaving && <span className="mr-2 size-4 animate-spin" />}
            Pesan & Bayar
          </Button>
        </div>

        {/* Overlay konfirmasi hapus, penuh satu halaman */}
        {pendingDelete && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-item-title"
            onClick={() => setPendingDelete(null)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          >
            <div
              onClick={(event) => event.stopPropagation()}
              className="w-full max-w-sm rounded-2xl bg-surface p-6 shadow-2xl"
            >
              <h2
                id="delete-item-title"
                className="text-lg font-bold text-text-strong"
              >
                Hapus produk?
              </h2>
              <p className="mt-2 text-sm text-text-muted">
                Yakin hapus produk{" "}
                <span className="font-semibold text-text-strong">
                  &quot;{pendingDelete.name}&quot;
                </span>
                ?
              </p>
              <div className="mt-6 flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  autoFocus
                  onClick={() => setPendingDelete(null)}
                  className="h-11 flex-1 rounded-xl"
                >
                  Batal
                </Button>
                <Button
                  type="button"
                  onClick={() => removeItem(pendingDelete.cartKey)}
                  className="h-11 flex-1 rounded-xl bg-destructive text-white hover:bg-destructive/90"
                >
                  Hapus
                </Button>
              </div>
            </div>
          </div>
        )}
      </SectionCard>
    </main>
  );
}