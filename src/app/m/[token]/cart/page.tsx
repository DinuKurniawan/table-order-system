"use client";

import { apiErrorMessage } from "@/lib/api-error";
import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionCard } from "@/components/admin/section-card";
import { formatRupiah } from "@/lib/utils";
import { toast } from "sonner";
import { Minus, Plus, Trash2 } from "lucide-react";
import { parseStoredCart, type CartItems } from "@/lib/cart";

export default function CartPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen p-8 text-center text-text-muted">
          Memuat keranjang...
        </div>
      }
    >
      <CartContent />
    </Suspense>
  );
}

function CartContent() {
  const { token } = useParams() as { token: string };
  const router = useRouter();

  // ============================================================
  // Cart state persisted to localStorage
  // ============================================================
  const CART_KEY = `cart-${token || "default"}`;

  const [items, setItems] = useState<CartItems>({});
  const [cartReady, setCartReady] = useState(false);

  useEffect(() => {
    try {
      const data = window.localStorage.getItem(CART_KEY);
      // localStorage hanya tersedia setelah mount; init sinkron memicu hydration mismatch.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setItems(parseStoredCart(data));
    } catch {
      setItems({});
    }
    setCartReady(true);
  }, [CART_KEY]);

  // ============================================================
  // Fetch order summary - items from cart
  // ============================================================
  const itemEntries = Object.values(items) || [];

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
  const [sugarLevel, setSugarLevel] = useState<"REGULER" | "NO_SUGAR">("REGULER");
  const [generalNote, setGeneralNote] = useState("");
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{
    productId: string;
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
  // Simpan keranjang ke localStorage
  // ============================================================
  useEffect(() => {
    if (!cartReady) return;
    try {
      localStorage.setItem(CART_KEY, JSON.stringify({ items }));
    } catch {
      // Kuota/privacy mode: keranjang tetap jalan di memori.
    }
  }, [items, cartReady, CART_KEY]);

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

    const itemsForOrder = itemEntries.map(
      (item) => ({
        productId: item.productId,
        quantity: item.quantity,
        note: item.note,
      })
    );

    // Gula disimpan di kolom `note` (sudah tercetak di dapur/kasir).
    // ponytail: field terstruktur baru jika perlu laporan per level gula.
    const note = [
      `Gula: ${sugarLevel === "NO_SUGAR" ? "No Sugar" : "Reguler"}`,
      generalNote.trim(),
    ]
      .filter(Boolean)
      .join(" · ");

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
  const removeItem = (productId: string) => {
    setItems((prev) => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
    setPendingDelete(null);
    setOpenItemId(null);
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

  if (totalItems === 0) {
    return (
      <div className="min-h-screen p-8 text-center">
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
      </div>
    );
  }

  return (
    <SectionCard title="Ringkasan Keranjang">
      <div className="p-4">
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
              htmlFor="sugar-level"
              className="mb-2 block text-sm font-medium"
            >
              Gula
            </label>
            <select
              id="sugar-level"
              value={sugarLevel}
              onChange={(e) =>
                setSugarLevel(e.target.value as "REGULER" | "NO_SUGAR")
              }
              className="h-11 w-full rounded-xl border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
            >
              <option value="REGULER">Reguler</option>
              <option value="NO_SUGAR">No Sugar</option>
            </select>
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
            const isOpen = openItemId === item.productId;
            return (
              <div
                key={item.productId}
                className="relative overflow-hidden rounded border"
              >
                <button
                  type="button"
                  aria-label={`Hapus ${label}`}
                  onFocus={() => setOpenItemId(item.productId)}
                  onClick={() =>
                    setPendingDelete({ productId: item.productId, name: label })
                  }
                  className="absolute inset-y-0 right-0 flex w-16 items-center justify-center bg-destructive text-white transition-colors hover:bg-destructive/90"
                >
                  <Trash2 className="size-5" />
                </button>
                <div
                  className="relative flex touch-pan-y select-none items-center justify-between gap-3 border-border bg-surface p-3 transition-transform duration-200 ease-out"
                  style={{
                    transform: isOpen ? "translateX(-4rem)" : "translateX(0)",
                  }}
                  onPointerDown={(event) => {
                    swipeRef.current = {
                      id: item.productId,
                      startX: event.clientX,
                      startY: event.clientY,
                      dx: 0,
                    };
                  }}
                  onPointerMove={(event) => {
                    const swipe = swipeRef.current;
                    if (!swipe || swipe.id !== item.productId) return;
                    const dx = event.clientX - swipe.startX;
                    const dy = event.clientY - swipe.startY;
                    // Gerakan vertikal = scroll halaman, bukan geser item.
                    swipe.dx = Math.abs(dy) > Math.abs(dx) ? 0 : dx;
                  }}
                  onPointerUp={() => {
                    const swipe = swipeRef.current;
                    if (!swipe || swipe.id !== item.productId) return;
                    swipeRef.current = null;
                    if (swipe.dx <= -40) setOpenItemId(item.productId);
                    else if (swipe.dx >= 40)
                      setOpenItemId((current) =>
                        current === item.productId ? null : current
                      );
                    else if (isOpen) setOpenItemId(null);
                  }}
                  onPointerCancel={() => {
                    swipeRef.current = null;
                  }}
                >
                  <span className="font-medium">{label}</span>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label={`Kurangi ${label}`}
                      onClick={() => setItems((prev) => {
                        const newItems = { ...prev };
                        if (newItems[item.productId].quantity > 1) {
                          newItems[item.productId].quantity -= 1;
                        }
                        return newItems;
                      })}
                      disabled={item.quantity <= 1}
                      className="size-11 rounded-xl"
                    >
                      <Minus className="size-4" />
                    </Button>
                    <span className="w-7 text-center text-sm font-medium tabular-nums">
                      {item.quantity}
                    </span>
                    <Button
                      type="button"
                      size="icon"
                      aria-label={`Tambah ${label}`}
                      onClick={() => setItems((prev) => {
                        const newItems = { ...prev };
                        newItems[item.productId] = {
                          ...newItems[item.productId],
                          quantity: newItems[item.productId].quantity + 1,
                        };
                        return newItems;
                      })}
                      className="size-11 rounded-xl"
                    >
                      <Plus className="size-4" />
                    </Button>
                  </div>
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
                onClick={() => removeItem(pendingDelete.productId)}
                className="h-11 flex-1 rounded-xl bg-destructive text-white hover:bg-destructive/90"
              >
                Hapus
              </Button>
            </div>
          </div>
        </div>
      )}
    </SectionCard>
  );
}